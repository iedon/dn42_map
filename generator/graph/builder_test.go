package graph

import (
	"testing"

	"github.com/iedon/dn42_map_go/mrt"
	"google.golang.org/protobuf/proto"
)

// TestBuildGraph exercises the full aggregate -> protobuf pipeline, including
// deterministic ordering, route conversion and centrality population.
func TestBuildGraph(t *testing.T) {
	agg := mrt.NewAggregate()
	for _, asn := range []uint32{64512, 64513, 64514} {
		agg.Nodes[asn] = struct{}{}
	}
	agg.Links[mrt.LinkKey{Src: 64512, Dst: 64513}] = mrt.AFIPv4Unicast | mrt.AFIPv6Unicast
	agg.Links[mrt.LinkKey{Src: 64513, Dst: 64514}] = mrt.AFIPv6Unicast
	agg.Advertises[64514] = map[mrt.Route]struct{}{
		{Length: 48, IsV6: true, V6: [4]uint32{0x20010db8, 0x00010000, 0, 0}}: {},
	}
	agg.Advertises[64513] = map[mrt.Route]struct{}{
		{Length: 24, V4: 0xAC140000}: {},
	}
	agg.DataTimestamp = 1_700_000_000

	desc := map[uint32]string{64512: "A", 64513: "B", 64514: "C"}
	g := BuildGraph(agg, desc)

	if g.Metadata.DataTimestamp != 1_700_000_000 {
		t.Errorf("DataTimestamp = %d", g.Metadata.DataTimestamp)
	}
	if g.Metadata.Version != MapVersion {
		t.Errorf("Version = %d, want %d", g.Metadata.Version, MapVersion)
	}

	// Nodes sorted ascending by ASN.
	if len(g.Nodes) != 3 {
		t.Fatalf("len(Nodes) = %d, want 3", len(g.Nodes))
	}
	wantASN := []uint32{64512, 64513, 64514}
	for i, n := range g.Nodes {
		if n.Asn != wantASN[i] {
			t.Errorf("Nodes[%d].Asn = %d, want %d", i, n.Asn, wantASN[i])
		}
		if n.Centrality == nil {
			t.Errorf("Nodes[%d] has nil Centrality", i)
		}
		if n.Centrality.Ranking == 0 {
			t.Errorf("Nodes[%d] ranking not assigned", i)
		}
	}

	// Route on 64513 is the IPv4 /24.
	node := g.Nodes[1]
	if len(node.Routes) != 1 {
		t.Fatalf("Nodes[1].Routes len = %d, want 1", len(node.Routes))
	}
	if node.Routes[0].GetIpv4() != 0xAC140000 || node.Routes[0].Length != 24 {
		t.Errorf("Nodes[1].Routes[0] = %+v", node.Routes[0])
	}

	// Links: sorted by (Source, Target); AF preserved.
	if len(g.Links) != 2 {
		t.Fatalf("len(Links) = %d, want 2", len(g.Links))
	}
	if g.Links[0].Source != 0 || g.Links[0].Target != 1 {
		t.Errorf("Links[0] = %d->%d, want 0->1", g.Links[0].Source, g.Links[0].Target)
	}
	if g.Links[0].Af != (mrt.AFIPv4Unicast | mrt.AFIPv6Unicast) {
		t.Errorf("Links[0].Af = %d", g.Links[0].Af)
	}

	// Output must be serializable and deterministic across builds.
	b1, err := proto.Marshal(g)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	b2, _ := proto.Marshal(BuildGraph(agg, desc))
	if len(b1) == 0 {
		t.Error("empty serialized graph")
	}
	// Same node/link/route ordering => identical byte length at minimum.
	if len(b1) != len(b2) {
		t.Errorf("non-deterministic output size: %d vs %d", len(b1), len(b2))
	}
}
