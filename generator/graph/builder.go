package graph

import (
	"fmt"
	"time"

	"slices"

	"github.com/iedon/dn42_map_go/centrality"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
)

// BuildGraph builds a Graph protobuf message from MRT processing results
func BuildGraph(result *mrt.Result, asnDescriptions map[uint32]string) *pb.Graph {
	graph := &pb.Graph{
		Metadata: &pb.Metadata{
			Vendor:             "IEDON.NET",
			GeneratedTimestamp: uint64(time.Now().Unix()),
		},
	}

	if result.Metadata != nil {
		graph.Metadata.DataTimestamp = result.Metadata.Timestamp
	}

	// Create centrality calculation graph
	centralityGraph := centrality.NewGraph()

	// Collect all nodes
	nodes := make(map[uint32]struct{})
	for _, path := range result.ASPaths {
		for _, asn := range path {
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
	links := make(map[string]struct{})
	for _, path := range result.ASPaths {
		for i := range len(path) - 1 {
			src := path[i]
			dst := path[i+1]

			// Skip self-loops (this case happens when AS prepends itself multiple times)
			if src == dst {
				continue
			}

			if srcIdx, ok := asnToIndex[src]; ok {
				if dstIdx, ok := asnToIndex[dst]; ok {
					linkKey := getLinkKey(srcIdx, dstIdx)
					if _, exists := links[linkKey]; !exists {
						graph.Links = append(graph.Links, &pb.Link{
							Source: srcIdx,
							Target: dstIdx,
						})
						centralityGraph.AddLink(src, dst)
						links[linkKey] = struct{}{}
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
