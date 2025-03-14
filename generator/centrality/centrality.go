package centrality

import (
	"math"
	"sort"
)

// Node represents a node in the graph
type Node struct {
	ASN            uint32
	Degree         float64
	InDegree       float64
	OutDegree      float64
	Betweenness    float64
	InBetweenness  float64
	OutBetweenness float64
	Closeness      float64
	Index          uint32
	Ranking        uint32
}

// Graph represents the entire graph
type Graph struct {
	Nodes []*Node
	Links []struct {
		Source uint32
		Target uint32
	}
	// Adjacency list representation
	adjList map[uint32][]uint32
}

// NewGraph creates a new graph
func NewGraph() *Graph {
	return &Graph{
		Nodes: make([]*Node, 0),
		Links: make([]struct {
			Source uint32
			Target uint32
		}, 0),
		adjList: make(map[uint32][]uint32),
	}
}

// AddNode adds a node
func (g *Graph) AddNode(asn uint32) {
	g.Nodes = append(g.Nodes, &Node{ASN: asn})
	g.adjList[asn] = make([]uint32, 0)
}

// AddLink adds a link
func (g *Graph) AddLink(source, target uint32) {
	g.Links = append(g.Links, struct {
		Source uint32
		Target uint32
	}{source, target})
	// For directed graph, only add the outgoing edge
	g.adjList[source] = append(g.adjList[source], target)
	// Don't add the reverse edge for directed graph
}

// CalculateCentrality calculates all centrality metrics
func (g *Graph) CalculateCentrality() {
	g.calculateDegree()
	g.calculateBetweennessAndCloseness()
	g.calculateIndex()
}

// calculateDegree calculates degree centrality
func (g *Graph) calculateDegree() {
	// Count the number of outgoing and incoming links for each node
	inDegreeMap := make(map[uint32]float64)
	outDegreeMap := make(map[uint32]float64)

	for _, link := range g.Links {
		outDegreeMap[link.Source]++
		inDegreeMap[link.Target]++
	}

	// Update the degree centrality for each node
	for _, node := range g.Nodes {
		node.InDegree = inDegreeMap[node.ASN]
		node.OutDegree = outDegreeMap[node.ASN]
		node.Degree = node.InDegree + node.OutDegree
	}
}

// calculateBetweennessAndCloseness calculates betweenness and closeness centrality
// based on the Brandes algorithm (similar to the Python implementation)
func (g *Graph) calculateBetweennessAndCloseness() {
	// Create a bidirectional graph for centrality calculations
	// This is similar to the fullasmap in the Python code
	bidirectionalGraph := make(map[uint32]map[uint32]struct{})

	// Initialize the bidirectional graph
	for _, node := range g.Nodes {
		bidirectionalGraph[node.ASN] = make(map[uint32]struct{})
	}

	// Fill the bidirectional graph
	for _, link := range g.Links {
		bidirectionalGraph[link.Source][link.Target] = struct{}{}
		bidirectionalGraph[link.Target][link.Source] = struct{}{}
	}

	// Initialize betweenness values
	betweenness := make(map[uint32]float64)
	for _, node := range g.Nodes {
		betweenness[node.ASN] = 0.0
	}

	// Initialize closeness values and all distances
	allDistances := make(map[uint32]map[uint32]float64)

	// For each node as a source
	for _, sourceNode := range g.Nodes {
		source := sourceNode.ASN

		// Initialize distances for this source
		distances := make(map[uint32]float64)
		allDistances[source] = distances

		// Initialize data structures for Brandes algorithm
		pathVia := make(map[uint32][]uint32)
		sigma := make(map[uint32]int)
		delta := make(map[uint32]float64)
		searchOrder := make([]uint32, 0)

		// Initialize for all nodes
		for _, node := range g.Nodes {
			asn := node.ASN
			distances[asn] = math.Inf(1)
			pathVia[asn] = make([]uint32, 0)
			sigma[asn] = 0
			delta[asn] = 0.0
		}

		// BFS initialization
		distances[source] = 0
		sigma[source] = 1
		queue := []uint32{source}

		// BFS to find shortest paths
		for len(queue) > 0 {
			// Dequeue
			current := queue[0]
			queue = queue[1:]
			searchOrder = append(searchOrder, current)

			// For each neighbor
			for neighbor := range bidirectionalGraph[current] {
				// If this is the first time we see this node
				if math.IsInf(distances[neighbor], 1) {
					distances[neighbor] = distances[current] + 1
					queue = append(queue, neighbor)
				}

				// If this is a shortest path to neighbor
				if distances[neighbor] == distances[current]+1 {
					sigma[neighbor] += sigma[current]
					pathVia[neighbor] = append(pathVia[neighbor], current)
				}
			}
		}

		// Backward pass to accumulate betweenness
		for i := len(searchOrder) - 1; i >= 0; i-- {
			current := searchOrder[i]
			coeff := (1.0 + delta[current]) / float64(sigma[current])

			for _, upstream := range pathVia[current] {
				delta[upstream] += float64(sigma[upstream]) * coeff
			}

			if current != source {
				betweenness[current] += delta[current]
			}
		}
	}

	// Scale betweenness values
	n := float64(len(g.Nodes))
	scale := 1.0 / ((n - 1) * (n - 2))

	// Calculate closeness centrality
	closeness := make(map[uint32]float64)
	for source, distances := range allDistances {
		sum := 0.0
		count := 0

		for target, distance := range distances {
			if source != target && !math.IsInf(distance, 1) {
				sum += distance
				count++
			}
		}

		if count > 0 {
			closeness[source] = float64(count) / sum
		} else {
			closeness[source] = 0.0
		}
	}

	// Update node values
	for _, node := range g.Nodes {
		node.Betweenness = betweenness[node.ASN] * scale
		node.Closeness = closeness[node.ASN]
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

// GetNode gets the node for a given ASN
func (g *Graph) GetNode(asn uint32) *Node {
	for _, node := range g.Nodes {
		if node.ASN == asn {
			return node
		}
	}
	return nil
}
