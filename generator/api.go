package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	pb "github.com/iedon/dn42_map_go/proto"
)

// setHeaders sets HTTP headers for responses
func setHeaders(w http.ResponseWriter, contentType string, lastModified *time.Time) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.Header().Set("Access-Control-Allow-Headers", "X-Requested-With, Cache-Control, Pragma")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Pragma", "no-cache")
	if lastModified != nil {
		w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	}
}

// handleGenerate handles /generate requests
func (s *Server) handleGenerate(w http.ResponseWriter, r *http.Request) {
	// Validate authentication token
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || len(authHeader) < 7 || authHeader[:7] != "Bearer " {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	token := authHeader[7:]
	if token != s.config.API.AuthToken {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Generate map
	go s.generateMap()

	w.WriteHeader(http.StatusAccepted)
	setHeaders(w, "text/plain", nil)
	w.Write([]byte("Map generation requested at: " + time.Now().UTC().Format(http.TimeFormat)))
}

// handleMap handles /map requests
func (s *Server) handleMap(w http.ResponseWriter, r *http.Request) {
	s.graphMutex.RLock()
	defer s.graphMutex.RUnlock()

	if s.graph == nil {
		http.Error(w, "Map data not available", http.StatusServiceUnavailable)
		return
	}

	if !checkIfModified(r, s.lastModified) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	outputType := r.URL.Query().Get("type")
	contentType := "application/x-protobuf"
	if outputType == "json" {
		contentType = "application/json"
	}
	setHeaders(w, contentType, &s.lastModified)

	if outputType == "json" {
		if err := s.sendJSONResponse(w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	} else {
		if err := s.sendProtobufResponse(w); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

// handleRanking handles /ranking requests
func (s *Server) handleRanking(w http.ResponseWriter, r *http.Request) {
	s.graphMutex.RLock()
	defer s.graphMutex.RUnlock()

	if s.graph == nil {
		http.Error(w, "Map data not available", http.StatusServiceUnavailable)
		return
	}

	//  Create a copy of nodes to avoid polluting original data
	nodes := make([]*pb.Node, len(s.graph.Nodes))
	copy(nodes, s.graph.Nodes)

	// Sort by Centrality.Ranking
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].Centrality.Ranking < nodes[j].Centrality.Ranking
	})

	setHeaders(w, "text/plain", &s.lastModified)

	fmt.Fprintf(w, "MAP.DN42 Global Rank\n")
	fmt.Fprintf(w, "Last update: %s\n", s.lastModified.UTC().Format(http.TimeFormat))
	fmt.Fprintf(w, "Rank   ASN         Desc                            Index\n")
	for _, node := range nodes {
		fmt.Fprintf(w, "%-5d  %-10d  %-30s  %d\n",
			node.Centrality.Ranking, node.Asn, node.Desc, node.Centrality.Index)
	}
}

// handleASN handles /asn/{uint32} requests
func (s *Server) handleASN(w http.ResponseWriter, r *http.Request) {
	s.graphMutex.RLock()
	defer s.graphMutex.RUnlock()

	if s.graph == nil {
		http.Error(w, "Map data not available", http.StatusServiceUnavailable)
		return
	}

	asn, err := s.parseASNFromURL(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	targetNode := s.findNodeByASN(asn)
	if targetNode == nil {
		http.Error(w, "ASN not found", http.StatusNotFound)
		return
	}

	setHeaders(w, "application/json", nil)
	if err := json.NewEncoder(w).Encode(s.convertNodeToJSON(targetNode, true)); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}
