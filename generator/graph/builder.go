package graph

import (
	"cmp"
	"slices"
	"time"

	"github.com/iedon/dn42_map_go/centrality"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
)

const MapVendor = "IEDON.NET"

// MapVersion is the current map binary format version.
// Version 0: legacy (no version field, no AF on links)
// Version 2: added address family (af) bitmask on links
const MapVersion = 2

// BuildGraph builds a Graph protobuf message from aggregated MRT data.
func BuildGraph(agg *mrt.Aggregate, asnDescriptions map[uint32]string) *pb.Graph {
	graph := &pb.Graph{
		Metadata: buildMetadata(agg),
	}

	nodeList, asnToIndex := collectSortedNodes(agg)
	centralityGraph := centrality.NewGraph()

	graph.Nodes = buildNodes(nodeList, agg, asnDescriptions, centralityGraph)
	graph.Links = buildLinks(agg, asnToIndex, centralityGraph)

	centralityGraph.CalculateCentrality()
	applyCentrality(graph.Nodes, centralityGraph)

	return graph
}

func buildMetadata(agg *mrt.Aggregate) *pb.Metadata {
	return &pb.Metadata{
		Vendor:             MapVendor,
		GeneratedTimestamp: uint64(time.Now().Unix()),
		DataTimestamp:      agg.DataTimestamp,
		Version:            MapVersion,
	}
}

// collectSortedNodes returns the ASNs sorted ascending and an ASN-to-index
// mapping used to reference nodes from links.
func collectSortedNodes(agg *mrt.Aggregate) ([]uint32, map[uint32]uint32) {
	nodeList := make([]uint32, 0, len(agg.Nodes))
	for asn := range agg.Nodes {
		nodeList = append(nodeList, asn)
	}
	slices.Sort(nodeList)

	asnToIndex := make(map[uint32]uint32, len(nodeList))
	for i, asn := range nodeList {
		asnToIndex[asn] = uint32(i)
	}

	return nodeList, asnToIndex
}

func buildNodes(nodeList []uint32, agg *mrt.Aggregate, descriptions map[uint32]string, cg *centrality.Graph) []*pb.Node {
	nodes := make([]*pb.Node, 0, len(nodeList))
	for _, asn := range nodeList {
		node := &pb.Node{
			Asn:             asn,
			Desc:            descriptions[asn],
			Routes:          convertRoutes(agg.Advertises[asn]),
			RoutesMulticast: convertRoutes(agg.AdvertisesMulticast[asn]),
		}
		nodes = append(nodes, node)
		cg.AddNode(asn)
	}
	return nodes
}

// convertRoutes converts a set of MRT routes into protobuf Route messages,
// sorted deterministically so identical input yields identical output.
func convertRoutes(routes map[mrt.Route]struct{}) []*pb.Route {
	if len(routes) == 0 {
		return nil
	}

	sorted := make([]mrt.Route, 0, len(routes))
	for route := range routes {
		sorted = append(sorted, route)
	}
	slices.SortFunc(sorted, compareRoute)

	pbRoutes := make([]*pb.Route, len(sorted))
	for i, route := range sorted {
		pbRoutes[i] = convertRoute(route)
	}
	return pbRoutes
}

func convertRoute(route mrt.Route) *pb.Route {
	pbRoute := &pb.Route{Length: route.Length}
	if route.IsV6 {
		pbRoute.Ip = &pb.Route_Ipv6{
			Ipv6: &pb.IPv6{
				HighH32: route.V6[0],
				HighL32: route.V6[1],
				LowH32:  route.V6[2],
				LowL32:  route.V6[3],
			},
		}
	} else {
		pbRoute.Ip = &pb.Route_Ipv4{Ipv4: route.V4}
	}
	return pbRoute
}

func compareRoute(a, b mrt.Route) int {
	if a.IsV6 != b.IsV6 {
		if a.IsV6 {
			return 1
		}
		return -1
	}
	if a.IsV6 {
		if c := slices.Compare(a.V6[:], b.V6[:]); c != 0 {
			return c
		}
	} else if c := cmp.Compare(a.V4, b.V4); c != 0 {
		return c
	}
	return cmp.Compare(a.Length, b.Length)
}

// buildLinks emits protobuf links from the deduplicated edge set, sorted
// deterministically, and feeds the adjacency into the centrality graph.
func buildLinks(agg *mrt.Aggregate, asnToIndex map[uint32]uint32, cg *centrality.Graph) []*pb.Link {
	keys := make([]mrt.LinkKey, 0, len(agg.Links))
	for key := range agg.Links {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, func(a, b mrt.LinkKey) int {
		if c := cmp.Compare(a.Src, b.Src); c != 0 {
			return c
		}
		return cmp.Compare(a.Dst, b.Dst)
	})

	links := make([]*pb.Link, 0, len(keys))
	for _, key := range keys {
		srcIdx, srcOk := asnToIndex[key.Src]
		dstIdx, dstOk := asnToIndex[key.Dst]
		if !srcOk || !dstOk {
			continue
		}
		links = append(links, &pb.Link{
			Source: srcIdx,
			Target: dstIdx,
			Af:     agg.Links[key],
		})
		cg.AddLink(key.Src, key.Dst)
	}
	return links
}

func applyCentrality(nodes []*pb.Node, cg *centrality.Graph) {
	for _, node := range nodes {
		cn := cg.GetNode(node.Asn)
		if cn == nil {
			continue
		}
		node.Centrality = &pb.Centrality{
			Degree:      cn.Degree,
			Betweenness: cn.Betweenness,
			Closeness:   cn.Closeness,
			Index:       cn.Index,
			Ranking:     cn.Ranking,
		}
	}
}
