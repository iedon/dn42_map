package mrt

import (
	"bytes"
	"encoding/binary"
	"testing"
)

// --- synthetic MRT builders -------------------------------------------------

func mrtRecord(timestamp uint32, msgType, subType uint16, body []byte) []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.BigEndian, timestamp)
	binary.Write(buf, binary.BigEndian, msgType)
	binary.Write(buf, binary.BigEndian, subType)
	binary.Write(buf, binary.BigEndian, uint32(len(body)))
	buf.Write(body)
	return buf.Bytes()
}

// asPathAttr builds a single AS_SEQUENCE AS_PATH path attribute.
func asPathAttr(asns ...uint32) []byte {
	seg := new(bytes.Buffer)
	seg.WriteByte(2) // AS_SEQUENCE
	seg.WriteByte(byte(len(asns)))
	for _, a := range asns {
		binary.Write(seg, binary.BigEndian, a)
	}
	attr := new(bytes.Buffer)
	attr.WriteByte(0x40) // transitive, non-extended length
	attr.WriteByte(attrTypeASPath)
	attr.WriteByte(byte(seg.Len()))
	attr.Write(seg.Bytes())
	return attr.Bytes()
}

// ribBody builds a TABLE_DUMP_V2 RIB message body with entryCount identical
// entries all carrying attrs.
func ribBody(seq uint32, prefixLen uint8, prefix []byte, entryCount uint16, attrs []byte) []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.BigEndian, seq)
	buf.WriteByte(prefixLen)
	buf.Write(prefix)
	binary.Write(buf, binary.BigEndian, entryCount)
	for i := uint16(0); i < entryCount; i++ {
		binary.Write(buf, binary.BigEndian, uint16(0)) // peer index
		binary.Write(buf, binary.BigEndian, uint32(0)) // originated time
		binary.Write(buf, binary.BigEndian, uint16(len(attrs)))
		buf.Write(attrs)
	}
	return buf.Bytes()
}

// --- tests ------------------------------------------------------------------

func TestParseStream(t *testing.T) {
	const dumpTime = 1_700_000_000

	stream := new(bytes.Buffer)
	// PEER_INDEX_TABLE first (only its header timestamp is consumed).
	stream.Write(mrtRecord(dumpTime, mrtTypeTableDumpV2, subPeerIndexTable, []byte{0, 0, 0, 0}))
	// IPv6 unicast /48 2001:db8:1::, path 64512 64513 64514, twice to exercise
	// buffer reuse across records and route/link deduplication.
	v6 := ribBody(1, 48, []byte{0x20, 0x01, 0x0d, 0xb8, 0x00, 0x01}, 2,
		asPathAttr(64512, 64513, 64514))
	stream.Write(mrtRecord(dumpTime+1, mrtTypeTableDumpV2, subRIBIPv6Unicast, v6))
	stream.Write(mrtRecord(dumpTime+2, mrtTypeTableDumpV2, subRIBIPv6Unicast, v6))
	// IPv4 unicast /24 172.20.0.0, path 64512 64513 — shares the 64512->64513
	// edge so its AF bitmask must OR with IPv6.
	v4 := ribBody(2, 24, []byte{172, 20, 0}, 1, asPathAttr(64512, 64513))
	stream.Write(mrtRecord(dumpTime+3, mrtTypeTableDumpV2, subRIBIPv4Unicast, v4))

	agg := NewAggregate()
	if err := Parse(bytes.NewReader(stream.Bytes()), false, agg); err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if agg.DataTimestamp != dumpTime {
		t.Errorf("DataTimestamp = %d, want %d", agg.DataTimestamp, dumpTime)
	}

	for _, asn := range []uint32{64512, 64513, 64514} {
		if _, ok := agg.Nodes[asn]; !ok {
			t.Errorf("node %d missing", asn)
		}
	}
	if len(agg.Nodes) != 3 {
		t.Errorf("len(Nodes) = %d, want 3", len(agg.Nodes))
	}

	wantLinks := map[LinkKey]uint32{
		{Src: 64512, Dst: 64513}: AFIPv6Unicast | AFIPv4Unicast,
		{Src: 64513, Dst: 64514}: AFIPv6Unicast,
	}
	if len(agg.Links) != len(wantLinks) {
		t.Errorf("len(Links) = %d, want %d", len(agg.Links), len(wantLinks))
	}
	for key, af := range wantLinks {
		if got := agg.Links[key]; got != af {
			t.Errorf("link %v af = %d, want %d", key, got, af)
		}
	}

	// Origin routes: v6 /48 under 64514, v4 /24 under 64513, deduped.
	v6Route := Route{Length: 48, IsV6: true, V6: [4]uint32{0x20010db8, 0x00010000, 0, 0}}
	if routes := agg.Advertises[64514]; len(routes) != 1 {
		t.Errorf("Advertises[64514] len = %d, want 1", len(routes))
	} else if _, ok := routes[v6Route]; !ok {
		t.Errorf("Advertises[64514] missing %+v", v6Route)
	}

	v4Route := Route{Length: 24, IsV6: false, V4: 0xAC140000}
	if routes := agg.Advertises[64513]; len(routes) != 1 {
		t.Errorf("Advertises[64513] len = %d, want 1", len(routes))
	} else if _, ok := routes[v4Route]; !ok {
		t.Errorf("Advertises[64513] missing %+v", v4Route)
	}

	if len(agg.AdvertisesMulticast) != 0 {
		t.Errorf("AdvertisesMulticast should be empty, got %d", len(agg.AdvertisesMulticast))
	}
}

func TestParseMulticastCollectorFlag(t *testing.T) {
	// An IPv4 unicast subtype delivered from a multicast collector must be
	// classified as multicast via the stream flag.
	body := ribBody(1, 24, []byte{172, 20, 0}, 1, asPathAttr(64512, 64513))
	stream := mrtRecord(1, mrtTypeTableDumpV2, subRIBIPv4Unicast, body)

	agg := NewAggregate()
	if err := Parse(bytes.NewReader(stream), true, agg); err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if got := agg.Links[LinkKey{Src: 64512, Dst: 64513}]; got != AFIPv4Multicast {
		t.Errorf("link af = %d, want %d (multicast)", got, AFIPv4Multicast)
	}
	if len(agg.Advertises) != 0 {
		t.Errorf("Advertises should be empty for multicast stream")
	}
	if _, ok := agg.AdvertisesMulticast[64513]; !ok {
		t.Errorf("AdvertisesMulticast[64513] missing")
	}
}

func TestMergeAggregates(t *testing.T) {
	a := NewAggregate()
	a.Nodes[1] = struct{}{}
	a.Links[LinkKey{Src: 1, Dst: 2}] = AFIPv4Unicast
	a.addRoute(1, Route{Length: 24, V4: 0x0A000000}, false)
	a.DataTimestamp = 100

	b := NewAggregate()
	b.Nodes[2] = struct{}{}
	b.Links[LinkKey{Src: 1, Dst: 2}] = AFIPv6Unicast
	b.addRoute(1, Route{Length: 24, V4: 0x0A000000}, false) // duplicate
	b.addRoute(1, Route{Length: 25, V4: 0x0B000000}, false) // new
	b.DataTimestamp = 200

	a.Merge(b)

	if len(a.Nodes) != 2 {
		t.Errorf("len(Nodes) = %d, want 2", len(a.Nodes))
	}
	if got := a.Links[LinkKey{Src: 1, Dst: 2}]; got != (AFIPv4Unicast | AFIPv6Unicast) {
		t.Errorf("merged link af = %d, want %d", got, AFIPv4Unicast|AFIPv6Unicast)
	}
	if got := len(a.Advertises[1]); got != 2 {
		t.Errorf("Advertises[1] len = %d, want 2", got)
	}
	if a.DataTimestamp != 100 {
		t.Errorf("DataTimestamp = %d, want 100 (first wins)", a.DataTimestamp)
	}
}
