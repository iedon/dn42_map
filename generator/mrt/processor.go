package mrt

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"log"
)

// Address-family bitmask values carried on links.
const (
	AFIPv4Unicast   uint32 = 1 // 0001
	AFIPv6Unicast   uint32 = 2 // 0010
	AFIPv4Multicast uint32 = 4 // 0100
	AFIPv6Multicast uint32 = 8 // 1000
)

// MRT message and TABLE_DUMP_V2 subtype constants (RFC 6396 / RFC 8050).
const (
	mrtTypeTableDumpV2 uint16 = 13

	subPeerIndexTable      uint16 = 1
	subRIBIPv4Unicast      uint16 = 2
	subRIBIPv4Multicast    uint16 = 3
	subRIBIPv6Unicast      uint16 = 4
	subRIBIPv6Multicast    uint16 = 5
	subRIBIPv4UnicastAdd   uint16 = 8
	subRIBIPv4MulticastAdd uint16 = 9
	subRIBIPv6UnicastAdd   uint16 = 10
	subRIBIPv6MulticastAdd uint16 = 11

	attrTypeASPath uint8 = 2
)

// Route is an advertised prefix. It is a comparable value so it can be used
// directly as a deduplication map key without boxing.
type Route struct {
	Length uint32
	IsV6   bool
	V4     uint32    // valid when !IsV6
	V6     [4]uint32 // valid when IsV6
}

// LinkKey identifies a directed edge between two ASNs.
type LinkKey struct {
	Src uint32
	Dst uint32
}

// Aggregate is the graph data accumulated on the fly while streaming MRT dumps.
// It stores only the deduplicated graph — the node set, directed edges (with an
// address-family bitmask) and each origin AS's advertised prefixes — instead of
// every AS path, keeping memory proportional to the graph rather than the dump.
type Aggregate struct {
	Nodes               map[uint32]struct{}
	Links               map[LinkKey]uint32
	Advertises          map[uint32]map[Route]struct{}
	AdvertisesMulticast map[uint32]map[Route]struct{}
	DataTimestamp       uint64
}

// NewAggregate returns an empty Aggregate ready for use.
func NewAggregate() *Aggregate {
	return &Aggregate{
		Nodes:               make(map[uint32]struct{}),
		Links:               make(map[LinkKey]uint32),
		Advertises:          make(map[uint32]map[Route]struct{}),
		AdvertisesMulticast: make(map[uint32]map[Route]struct{}),
	}
}

// addRoute records an origin AS's advertised prefix, deduplicating in O(1).
func (a *Aggregate) addRoute(originAS uint32, route Route, multicast bool) {
	table := a.Advertises
	if multicast {
		table = a.AdvertisesMulticast
	}
	set := table[originAS]
	if set == nil {
		set = make(map[Route]struct{})
		table[originAS] = set
	}
	set[route] = struct{}{}
}

// Merge folds another Aggregate into this one.
func (a *Aggregate) Merge(b *Aggregate) {
	for asn := range b.Nodes {
		a.Nodes[asn] = struct{}{}
	}
	for key, af := range b.Links {
		a.Links[key] |= af
	}
	mergeRoutes(a.Advertises, b.Advertises)
	mergeRoutes(a.AdvertisesMulticast, b.AdvertisesMulticast)
	if a.DataTimestamp == 0 {
		a.DataTimestamp = b.DataTimestamp
	}
}

func mergeRoutes(dst, src map[uint32]map[Route]struct{}) {
	for asn, routes := range src {
		if existing := dst[asn]; existing != nil {
			for r := range routes {
				existing[r] = struct{}{}
			}
		} else {
			// Adopt the source set directly when absent to avoid re-hashing.
			dst[asn] = routes
		}
	}
}

// Parse consumes an MRT stream, folding each RIB entry into agg on the fly.
// It reads one message at a time, so peak memory is a single MRT record rather
// than the whole (decompressed) dump. isMulticast marks the entire stream as
// originating from a multicast collector.
func Parse(r io.Reader, isMulticast bool, agg *Aggregate) error {
	br := bufio.NewReaderSize(r, 1<<20)
	var header [12]byte
	var body []byte

	for {
		if _, err := io.ReadFull(br, header[:]); err != nil {
			if err == io.EOF {
				return nil // clean end at a record boundary
			}
			return fmt.Errorf("read MRT header: %w", err)
		}

		timestamp := binary.BigEndian.Uint32(header[0:4])
		msgType := binary.BigEndian.Uint16(header[4:6])
		subType := binary.BigEndian.Uint16(header[6:8])
		length := binary.BigEndian.Uint32(header[8:12])

		// Reuse the body buffer across messages; parsing never retains it.
		if cap(body) < int(length) {
			body = make([]byte, length)
		} else {
			body = body[:length]
		}
		if _, err := io.ReadFull(br, body); err != nil {
			return fmt.Errorf("read MRT body (len %d): %w", length, err)
		}

		if agg.DataTimestamp == 0 {
			agg.DataTimestamp = uint64(timestamp)
		}

		if msgType == mrtTypeTableDumpV2 {
			if err := parseTableDumpV2(subType, body, isMulticast, agg); err != nil {
				return err
			}
		}
	}
}

func parseTableDumpV2(subType uint16, data []byte, streamMulticast bool, agg *Aggregate) error {
	switch subType {
	case subRIBIPv4Unicast, subRIBIPv4Multicast, subRIBIPv6Unicast, subRIBIPv6Multicast,
		subRIBIPv4UnicastAdd, subRIBIPv4MulticastAdd, subRIBIPv6UnicastAdd, subRIBIPv6MulticastAdd:
		return parseRIBEntry(subType, data, streamMulticast, agg)
	default:
		// PEER_INDEX_TABLE and any other subtype carry no route we consume.
		return nil
	}
}

func parseRIBEntry(subType uint16, data []byte, streamMulticast bool, agg *Aggregate) error {
	c := cursor{b: data}

	seq, ok := c.u32()
	if !ok {
		return fmt.Errorf("EOF at seqNum")
	}
	prefixLen, ok := c.u8()
	if !ok {
		return fmt.Errorf("EOF at prefixLen")
	}
	prefixRaw, ok := c.take(int((prefixLen + 7) / 8))
	if !ok {
		return fmt.Errorf("prefix length %d bits exceeds remaining %d bytes", prefixLen, c.remaining())
	}

	isV6 := !isIPv4Subtype(subType)
	multicast := streamMulticast || isMulticastSubtype(subType)
	af := addressFamily(isV6, multicast)
	route := decodePrefix(prefixRaw, uint32(prefixLen), isV6)

	entryCount, ok := c.u16()
	if !ok {
		return fmt.Errorf("EOF at entryCount (seq %d)", seq)
	}

	addPath := isAddPathSubtype(subType)
	for i := uint16(0); i < entryCount; i++ {
		if err := parseRIBDescriptor(&c, route, af, multicast, addPath, agg); err != nil {
			return fmt.Errorf("entry %d/%d: %w", i+1, entryCount, err)
		}
	}
	return nil
}

func parseRIBDescriptor(c *cursor, route Route, af uint32, multicast, addPath bool, agg *Aggregate) error {
	if !c.skip(2) { // peer index
		return fmt.Errorf("EOF at peerIndex")
	}
	if !c.skip(4) { // originated time
		return fmt.Errorf("EOF at originatedTime")
	}
	if addPath && !c.skip(4) { // path identifier, RFC 8050 section 4
		return fmt.Errorf("EOF at pathID")
	}
	attrLen, ok := c.u16()
	if !ok {
		return fmt.Errorf("EOF at attrLength")
	}
	if attrLen == 0 {
		log.Printf("[WARN] RIB entry with 0 attribute length (prefix /%d), skipping", route.Length)
		return nil
	}
	attrs, ok := c.take(int(attrLen))
	if !ok {
		return fmt.Errorf("attribute length %d exceeds remaining %d bytes", attrLen, c.remaining())
	}

	foldAttributes(attrs, route, af, multicast, agg)
	return nil
}

// foldAttributes scans path attributes for AS_PATH and folds its adjacency,
// nodes and the advertised origin route straight into agg, without ever
// materializing the full AS path.
func foldAttributes(attrs []byte, route Route, af uint32, multicast bool, agg *Aggregate) {
	c := cursor{b: attrs}
	for c.remaining() >= 2 {
		flags, _ := c.u8()
		typeCode, _ := c.u8()

		var length int
		if flags&0x10 != 0 { // extended length
			l, ok := c.u16()
			if !ok {
				return
			}
			length = int(l)
		} else {
			l, ok := c.u8()
			if !ok {
				return
			}
			length = int(l)
		}

		value, ok := c.take(length)
		if !ok {
			return
		}
		if typeCode == attrTypeASPath {
			foldASPath(value, route, af, multicast, agg)
			return // only AS_PATH is consumed; a route carries at most one
		}
	}
}

func foldASPath(data []byte, route Route, af uint32, multicast bool, agg *Aggregate) {
	c := cursor{b: data}
	var prev, last uint32
	havePrev := false

	// AS_PATH is a sequence of segments; ASNs are flattened in wire order and
	// consecutive ASNs form directed edges (matching the collector's view).
	for c.remaining() >= 2 {
		c.skip(1) // segment type (AS_SET / AS_SEQUENCE): treated uniformly
		segLen, _ := c.u8()
		if c.remaining() < int(segLen)*4 {
			break
		}
		for i := uint8(0); i < segLen; i++ {
			asn, _ := c.u32()
			agg.Nodes[asn] = struct{}{}
			if havePrev && prev != asn { // skip self-loops (AS prepending)
				agg.Links[LinkKey{Src: prev, Dst: asn}] |= af
			}
			prev, last, havePrev = asn, asn, true
		}
	}

	if havePrev {
		agg.addRoute(last, route, multicast)
	}
}

func decodePrefix(raw []byte, prefixLen uint32, isV6 bool) Route {
	route := Route{Length: prefixLen, IsV6: isV6}
	if isV6 {
		var buf [16]byte
		copy(buf[:], raw)
		route.V6 = [4]uint32{
			binary.BigEndian.Uint32(buf[0:4]),
			binary.BigEndian.Uint32(buf[4:8]),
			binary.BigEndian.Uint32(buf[8:12]),
			binary.BigEndian.Uint32(buf[12:16]),
		}
	} else {
		var buf [4]byte
		copy(buf[:], raw)
		route.V4 = binary.BigEndian.Uint32(buf[:])
	}
	return route
}

func addressFamily(isV6, multicast bool) uint32 {
	switch {
	case multicast && isV6:
		return AFIPv6Multicast
	case multicast:
		return AFIPv4Multicast
	case isV6:
		return AFIPv6Unicast
	default:
		return AFIPv4Unicast
	}
}

func isIPv4Subtype(s uint16) bool {
	return s == subRIBIPv4Unicast || s == subRIBIPv4Multicast ||
		s == subRIBIPv4UnicastAdd || s == subRIBIPv4MulticastAdd
}

func isMulticastSubtype(s uint16) bool {
	return s == subRIBIPv4Multicast || s == subRIBIPv6Multicast ||
		s == subRIBIPv4MulticastAdd || s == subRIBIPv6MulticastAdd
}

func isAddPathSubtype(s uint16) bool {
	return s == subRIBIPv4UnicastAdd || s == subRIBIPv4MulticastAdd ||
		s == subRIBIPv6UnicastAdd || s == subRIBIPv6MulticastAdd
}

// cursor is a bounds-checked big-endian reader over a byte slice, avoiding the
// per-field allocations of bytes.Reader + binary.Read in the hot parse loop.
type cursor struct {
	b   []byte
	off int
}

func (c *cursor) remaining() int { return len(c.b) - c.off }

func (c *cursor) u8() (uint8, bool) {
	if c.off >= len(c.b) {
		return 0, false
	}
	v := c.b[c.off]
	c.off++
	return v, true
}

func (c *cursor) u16() (uint16, bool) {
	if c.off+2 > len(c.b) {
		return 0, false
	}
	v := binary.BigEndian.Uint16(c.b[c.off:])
	c.off += 2
	return v, true
}

func (c *cursor) u32() (uint32, bool) {
	if c.off+4 > len(c.b) {
		return 0, false
	}
	v := binary.BigEndian.Uint32(c.b[c.off:])
	c.off += 4
	return v, true
}

func (c *cursor) take(n int) ([]byte, bool) {
	if n < 0 || c.off+n > len(c.b) {
		return nil, false
	}
	s := c.b[c.off : c.off+n]
	c.off += n
	return s, true
}

func (c *cursor) skip(n int) bool {
	if n < 0 || c.off+n > len(c.b) {
		return false
	}
	c.off += n
	return true
}
