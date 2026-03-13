package graph

import (
	"fmt"
	"time"

	"slices"

	"github.com/iedon/dn42_map_go/centrality"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
)

const MapVendor = "IEDON.NET"

// MapVersion is the current map binary format version.
// Version 0: legacy (no version field, no AF on links)
// Version 2: added address family (af) bitmask on links
const MapVersion = 2

// BuildGraph builds a Graph protobuf message from MRT processing results
func BuildGraph(result *mrt.Result, asnDescriptions map[uint32]string) *pb.Graph {
	graph := &pb.Graph{
		Metadata: buildMetadata(result),
	}

	nodeList, asnToIndex := collectSortedNodes(result)
	centralityGraph := centrality.NewGraph()

	graph.Nodes = buildNodes(nodeList, result, asnDescriptions, centralityGraph)
	graph.Links = buildLinks(result, asnToIndex, centralityGraph)

	centralityGraph.CalculateCentrality()
	applyCentrality(graph.Nodes, centralityGraph)

	return graph
}

func buildMetadata(result *mrt.Result) *pb.Metadata {
	meta := &pb.Metadata{
		Vendor:             MapVendor,
		GeneratedTimestamp: uint64(time.Now().Unix()),
		Version:            MapVersion,
	}
	if result.Metadata != nil {
		meta.DataTimestamp = result.Metadata.Timestamp
	}
	return meta
}

// collectSortedNodes extracts all unique ASNs from AS paths, returns a sorted
// list and an ASN-to-index mapping for link referencing.
func collectSortedNodes(result *mrt.Result) ([]uint32, map[uint32]uint32) {
	seen := make(map[uint32]struct{})
	for _, asp := range result.ASPaths {
		for _, asn := range asp.Path {
			seen[asn] = struct{}{}
		}
	}

	nodeList := make([]uint32, 0, len(seen))
	for asn := range seen {
		nodeList = append(nodeList, asn)
	}
	slices.Sort(nodeList)

	asnToIndex := make(map[uint32]uint32, len(nodeList))
	for i, asn := range nodeList {
		asnToIndex[asn] = uint32(i)
	}

	return nodeList, asnToIndex
}

func buildNodes(nodeList []uint32, result *mrt.Result, descriptions map[uint32]string, cg *centrality.Graph) []*pb.Node {
	nodes := make([]*pb.Node, 0, len(nodeList))
	for _, asn := range nodeList {
		node := &pb.Node{
			Asn:             asn,
			Desc:            descriptions[asn],
			Routes:          convertRoutes(result.Advertises[asn]),
			RoutesMulticast: convertRoutes(result.AdvertisesMulticast[asn]),
		}
		nodes = append(nodes, node)
		cg.AddNode(asn)
	}
	return nodes
}

// convertRoutes converts MRT route entries into protobuf Route messages.
func convertRoutes(routes []mrt.Route) []*pb.Route {
	if len(routes) == 0 {
		return nil
	}

	pbRoutes := make([]*pb.Route, 0, len(routes))
	for _, route := range routes {
		if pbRoute := convertRoute(route); pbRoute != nil {
			pbRoutes = append(pbRoutes, pbRoute)
		}
	}
	return pbRoutes
}

func convertRoute(route mrt.Route) *pb.Route {
	pbRoute := &pb.Route{Length: route.Length}

	switch route.IPType {
	case "ipv4":
		if ipv4, ok := route.IPValue.(uint32); ok {
			pbRoute.Ip = &pb.Route_Ipv4{Ipv4: ipv4}
		}
	case "ipv6":
		if ipv6, ok := route.IPValue.([4]uint32); ok {
			pbRoute.Ip = &pb.Route_Ipv6{
				Ipv6: &pb.IPv6{
					HighH32: ipv6[0],
					HighL32: ipv6[1],
					LowH32:  ipv6[2],
					LowL32:  ipv6[3],
				},
			}
		}
	default:
		return nil
	}

	return pbRoute
}

func buildLinks(result *mrt.Result, asnToIndex map[uint32]uint32, cg *centrality.Graph) []*pb.Link {
	links := make(map[string]*pb.Link)
	var pbLinks []*pb.Link

	for _, asp := range result.ASPaths {
		for i := range len(asp.Path) - 1 {
			src, dst := asp.Path[i], asp.Path[i+1]

			// Skip self-loops (AS prepending)
			if src == dst {
				continue
			}

			srcIdx, srcOk := asnToIndex[src]
			dstIdx, dstOk := asnToIndex[dst]
			if !srcOk || !dstOk {
				continue
			}

			key := getLinkKey(srcIdx, dstIdx)
			if existing, exists := links[key]; exists {
				// If the link already exists, combine AF bitmasks (e.g. if one path is IPv4 and another is IPv6, unicast and/or multicast)
				existing.Af |= asp.AF
			} else {
				link := &pb.Link{
					Source: srcIdx,
					Target: dstIdx,
					Af:     asp.AF,
				}
				links[key] = link
				pbLinks = append(pbLinks, link)
				cg.AddLink(src, dst)
			}
		}
	}

	return pbLinks
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

// linkKey generates a unique key for a bidirectional link.
func getLinkKey(src, dst uint32) string {
	return fmt.Sprintf("%d-%d", src, dst)
}
