package centrality

import (
	"math"
	"sort"
)

// Node represents a node in the graph
type Node struct {
	ASN         uint32
	Degree      float64
	Betweenness float64
	Closeness   float64
	Index       uint32
	Ranking     uint32
}

// Graph represents the entire graph
type Graph struct {
	Nodes []*Node
	Links []struct {
		Source uint32
		Target uint32
	}
}

// NewGraph creates a new graph
func NewGraph() *Graph {
	return &Graph{
		Nodes: make([]*Node, 0),
		Links: make([]struct {
			Source uint32
			Target uint32
		}, 0),
	}
}

// AddNode adds a node
func (g *Graph) AddNode(asn uint32) {
	g.Nodes = append(g.Nodes, &Node{ASN: asn})
}

// AddLink adds a link
func (g *Graph) AddLink(source, target uint32) {
	g.Links = append(g.Links, struct {
		Source uint32
		Target uint32
	}{source, target})
}

// CalculateCentrality calculates all centrality metrics
func (g *Graph) CalculateCentrality() {
	g.calculateDegree()
	g.calculateBetweenness()
	g.calculateCloseness()
	g.calculateIndex()
}

// calculateDegree calculates degree centrality
func (g *Graph) calculateDegree() {
	// Count the number of outgoing and incoming links for each node
	degreeMap := make(map[uint32]float64)
	for _, link := range g.Links {
		degreeMap[link.Source]++
		degreeMap[link.Target]++
	}

	// Update the degree centrality for each node
	for _, node := range g.Nodes {
		node.Degree = degreeMap[node.ASN]
	}
}

// calculateBetweenness calculates betweenness centrality
func (g *Graph) calculateBetweenness() {
	// Use the Floyd-Warshall algorithm to calculate the shortest paths
	n := len(g.Nodes)
	dist := make([][]float64, n)
	next := make([][]uint32, n)
	for i := range dist {
		dist[i] = make([]float64, n)
		next[i] = make([]uint32, n)
		for j := range dist[i] {
			dist[i][j] = math.Inf(1)
		}
		dist[i][i] = 0
	}

	// Build the adjacency matrix
	nodeMap := make(map[uint32]int)
	for i, node := range g.Nodes {
		nodeMap[node.ASN] = i
	}

	for _, link := range g.Links {
		i := nodeMap[link.Source]
		j := nodeMap[link.Target]
		dist[i][j] = 1
		dist[j][i] = 1
		next[i][j] = uint32(j) // Store the index of the target node
		next[j][i] = uint32(i) // Store the index of the target node
	}

	// Floyd-Warshall algorithm
	for k := range n {
		for i := range n {
			for j := range n {
				if dist[i][k]+dist[k][j] < dist[i][j] {
					dist[i][j] = dist[i][k] + dist[k][j]
					next[i][j] = next[i][k]
				}
			}
		}
	}

	// Calculate betweenness centrality
	betweenness := make(map[uint32]float64)
	for s := range n {
		for t := range n {
			if s == t {
				continue
			}
			path := reconstructPath(next, uint32(s), uint32(t))
			for _, nodeIdx := range path {
				betweenness[g.Nodes[nodeIdx].ASN]++
			}
		}
	}

	// Update the betweenness centrality for each node
	for _, node := range g.Nodes {
		node.Betweenness = betweenness[node.ASN]
	}
}

// calculateCloseness calculates closeness centrality
func (g *Graph) calculateCloseness() {
	// Use the Floyd-Warshall algorithm results to calculate closeness centrality
	n := len(g.Nodes)
	dist := make([][]float64, n)
	for i := range dist {
		dist[i] = make([]float64, n)
		for j := range dist[i] {
			dist[i][j] = math.Inf(1)
		}
		dist[i][i] = 0
	}

	// Build the adjacency matrix
	nodeMap := make(map[uint32]int)
	for i, node := range g.Nodes {
		nodeMap[node.ASN] = i
	}

	for _, link := range g.Links {
		i := nodeMap[link.Source]
		j := nodeMap[link.Target]
		dist[i][j] = 1
		dist[j][i] = 1
	}

	// Floyd-Warshall algorithm
	for k := range n {
		for i := range n {
			for j := range n {
				if dist[i][k]+dist[k][j] < dist[i][j] {
					dist[i][j] = dist[i][k] + dist[k][j]
				}
			}
		}
	}

	// Calculate closeness centrality
	for i, node := range g.Nodes {
		sum := 0.0
		for j := range n {
			if i != j && dist[i][j] != math.Inf(1) {
				sum += 1.0 / dist[i][j]
			}
		}
		node.Closeness = sum / float64(n-1)
	}
}

// calculateIndex calculates the dn42Index
func (g *Graph) calculateIndex() {
	// Find the maximum value for normalization
	maxDegree := 0.0
	maxBetweenness := 0.0
	maxCloseness := 0.0

	for _, node := range g.Nodes {
		if node.Degree > maxDegree {
			maxDegree = node.Degree
		}
		if node.Betweenness > maxBetweenness {
			maxBetweenness = node.Betweenness
		}
		if node.Closeness > maxCloseness {
			maxCloseness = node.Closeness
		}
	}

	// Calculate the dn42Index for each node
	const (
		indexAlpha = 0.5
		indexBeta  = 0.3
		indexGamma = 0.2
	)

	for _, node := range g.Nodes {
		normDegree := node.Degree / maxDegree
		normBetweenness := node.Betweenness / maxBetweenness
		normCloseness := node.Closeness / maxCloseness

		index := (indexAlpha * normBetweenness) +
			(indexBeta * normCloseness) +
			(indexGamma * normDegree)

		node.Index = uint32(math.Round(index * 10000))
	}

	// Sort by Index and assign rankings
	sort.Slice(g.Nodes, func(i, j int) bool {
		return g.Nodes[i].Index > g.Nodes[j].Index
	})

	for i, node := range g.Nodes {
		node.Ranking = uint32(i + 1)
	}
}

// reconstructPath reconstructs the shortest path from s to t
func reconstructPath(next [][]uint32, s, t uint32) []uint32 {
	// s and t are the indices of nodes in g.Nodes, not ASNs
	if s >= uint32(len(next)) || t >= uint32(len(next)) {
		return nil
	}
	if next[s][t] == 0 {
		return nil
	}

	path := []uint32{s}
	current := s
	for current != t {
		current = next[current][t]
		if current == 0 {
			break
		}
		path = append(path, current)
	}
	return path
}

// GetNode gets the node for a given ASN
func (g *Graph) GetNode(asn uint32) *Node {
	for _, node := range g.Nodes {
		if node.ASN == asn {
			return node
		}
	}
	return nil
}
