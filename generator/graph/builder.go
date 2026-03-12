package graph

import (
	"fmt"
	"time"

	"slices"

	"github.com/iedon/dn42_map_go/centrality"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
)

// MapVersion is the current map binary format version.
// Version 0: legacy (no version field, no AF on links)
// Version 2: added address family (af) bitmask on links
const MapVersion = 2

// BuildGraph builds a Graph protobuf message from MRT processing results
func BuildGraph(result *mrt.Result, asnDescriptions map[uint32]string) *pb.Graph {
	graph := &pb.Graph{
		Metadata: &pb.Metadata{
			Vendor:             "IEDON.NET",
			GeneratedTimestamp: uint64(time.Now().Unix()),
			Version:            MapVersion,
		},
	}

	if result.Metadata != nil {
		graph.Metadata.DataTimestamp = result.Metadata.Timestamp
	}

	// Create centrality calculation graph
	centralityGraph := centrality.NewGraph()

	// Collect all nodes
	nodes := make(map[uint32]struct{})
	for _, asp := range result.ASPaths {
		for _, asn := range asp.Path {
			nodes[asn] = struct{}{}
		}
	}

	// Create a sorted list of nodes
	nodeList := make([]uint32, 0, len(nodes))
	for asn := range nodes {
		nodeList = append(nodeList, asn)
	}
	slices.Sort(nodeList)

	// Create a mapping of ASNs to indices
	asnToIndex := make(map[uint32]uint32)
	for i, asn := range nodeList {
		asnToIndex[asn] = uint32(i)
	}

	// Add nodes
	for _, asn := range nodeList {
		node := &pb.Node{
			Asn:  asn,
			Desc: asnDescriptions[asn],
		}

		// Add routes
		if routes, ok := result.Advertises[asn]; ok {
			for _, route := range routes {
				pbRoute := &pb.Route{
					Length: route.Length,
				}

				switch route.IPType {
				case "ipv4":
					if ipv4, ok := route.IPValue.(uint32); ok {
						pbRoute.Ip = &pb.Route_Ipv4{Ipv4: ipv4}
					}
				case "ipv6":
					if ipv6Array, ok := route.IPValue.([4]uint32); ok {
						pbRoute.Ip = &pb.Route_Ipv6{
							Ipv6: &pb.IPv6{
								HighH32: ipv6Array[0],
								HighL32: ipv6Array[1],
								LowH32:  ipv6Array[2],
								LowL32:  ipv6Array[3],
							},
						}
					}
				}

				node.Routes = append(node.Routes, pbRoute)
			}
		}

		graph.Nodes = append(graph.Nodes, node)
		centralityGraph.AddNode(asn)
	}

	// Add links
	links := make(map[string]*pb.Link)
	for _, asp := range result.ASPaths {
		for i := range len(asp.Path) - 1 {
			src := asp.Path[i]
			dst := asp.Path[i+1]

			// Skip self-loops (this case happens when AS prepends itself multiple times)
			if src == dst {
				continue
			}

			if srcIdx, ok := asnToIndex[src]; ok {
				if dstIdx, ok := asnToIndex[dst]; ok {
					linkKey := getLinkKey(srcIdx, dstIdx)
					if existing, exists := links[linkKey]; !exists {
						link := &pb.Link{
							Source: srcIdx,
							Target: dstIdx,
							Af:     asp.AF,
						}
						graph.Links = append(graph.Links, link)
						centralityGraph.AddLink(src, dst)
						links[linkKey] = link
					} else {
						existing.Af |= asp.AF
					}
				}
			}
		}
	}

	// Calculate centrality metrics
	centralityGraph.CalculateCentrality()

	// Update node centrality data
	for _, node := range graph.Nodes {
		centralityNode := centralityGraph.GetNode(node.Asn)
		if centralityNode != nil {
			node.Centrality = &pb.Centrality{
				Degree:      centralityNode.Degree,
				Betweenness: centralityNode.Betweenness,
				Closeness:   centralityNode.Closeness,
				Index:       centralityNode.Index,
				Ranking:     centralityNode.Ranking,
			}
		}
	}

	return graph
}

// getLinkKey generates a unique link key, note that it is a bidirectional graph
func getLinkKey(src, dst uint32) string {
	return fmt.Sprintf("%d-%d", src, dst)
}
