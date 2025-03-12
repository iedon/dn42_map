package main

import (
	"compress/bzip2"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/iedon/dn42_map_go/graph"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
	"github.com/iedon/dn42_map_go/registry"

	"google.golang.org/protobuf/proto"
)

// Server HTTP server
type Server struct {
	config       *Config
	graphData    []byte
	graph        *pb.Graph
	graphMutex   sync.RWMutex
	lastModified time.Time
}

// NewServer creates a new HTTP server
func NewServer(config *Config) *Server {
	return &Server{
		config:       config,
		lastModified: time.Now(),
	}
}

func downloadMRTFiles(ctx context.Context, config *Config) ([][]byte, error) {
	urls := []string{config.MRTCollector.Master4URL, config.MRTCollector.Master6URL}
	results := make([][]byte, 0, len(urls))
	errCh := make(chan error, len(urls))
	dataCh := make(chan []byte, len(urls))

	// Create a custom HTTP client
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.MRTCollector.InsecureSkipVerify,
		},
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   5 * time.Minute,
	}

	var wg sync.WaitGroup
	for _, url := range urls {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()

			req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
			if err != nil {
				errCh <- fmt.Errorf("failed to create request for %s: %v", url, err)
				return
			}

			if config.MRTCollector.Username != "" && config.MRTCollector.Password != "" {
				req.SetBasicAuth(config.MRTCollector.Username, config.MRTCollector.Password)
			}

			resp, err := client.Do(req)
			if err != nil {
				errCh <- fmt.Errorf("failed to download %s: %v", url, err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				errCh <- fmt.Errorf("unexpected status code %d for %s", resp.StatusCode, url)
				return
			}

			// Decompress using bzip2
			bzReader := bzip2.NewReader(resp.Body)
			data, err := io.ReadAll(bzReader)
			if err != nil {
				errCh <- fmt.Errorf("failed to decompress %s: %v", url, err)
				return
			}

			dataCh <- data
		}(url)
	}

	// Wait for all downloads to complete
	go func() {
		wg.Wait()
		close(dataCh)
		close(errCh)
	}()

	// Collect results and errors
	for data := range dataCh {
		results = append(results, data)
	}

	for err := range errCh {
		if err != nil {
			return nil, err
		}
	}

	return results, nil
}

// generateMap generates map data
func (s *Server) generateMap() error {
	ctx := context.Background()
	start := time.Now()

	// Concurrent download MRT files
	mrtData, err := downloadMRTFiles(ctx, s.config)
	if err != nil {
		return fmt.Errorf("failed to download MRT files: %v", err)
	}

	// Concurrent process MRT data
	processor := mrt.NewProcessor()
	results := make(chan *mrt.Result, 2)
	var wg sync.WaitGroup

	for _, data := range mrtData {
		wg.Add(1)
		go func(data []byte) {
			defer wg.Done()
			result, err := processor.Process(data)
			if err != nil {
				log.Printf("Error processing MRT data: %v", err)
				return
			}
			results <- result
		}(data)
	}

	// Wait for all processing to complete and close the channel
	go func() {
		wg.Wait()
		close(results)
	}()

	// Merge results
	merged := mrt.MergeResults(results)

	// Concurrent get ASN descriptions
	reg := registry.NewRegistry(s.config.RegistryPath)
	uniqueASNs := make(map[uint32]struct{})
	for _, path := range merged.ASPaths {
		for _, asn := range path {
			uniqueASNs[asn] = struct{}{}
		}
	}
	asnDescriptions := reg.GetDescriptions(uniqueASNs)

	// Build Graph protobuf
	graphPb := graph.BuildGraph(merged, asnDescriptions)

	// Serialize
	data, err := proto.Marshal(graphPb)
	if err != nil {
		return fmt.Errorf("failed to marshal graph: %v", err)
	}

	// Save to file
	if err := os.WriteFile(s.config.OutputFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write output file: %v", err)
	}

	// Update in-memory data
	s.graphMutex.Lock()
	s.graph = graphPb
	s.graphData = data
	s.lastModified = time.Now()
	s.graphMutex.Unlock()

	log.Printf("Map generation completed in %v", time.Since(start))
	return nil
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
	w.WriteHeader(http.StatusNoContent)
}

// handleMap handles /map requests
func (s *Server) handleMap(w http.ResponseWriter, r *http.Request) {
	s.graphMutex.RLock()
	defer s.graphMutex.RUnlock()

	if s.graphData == nil {
		http.Error(w, "Map data not available", http.StatusServiceUnavailable)
		return
	}

	// Check If-Modified-Since
	if ifModifiedSince := r.Header.Get("If-Modified-Since"); ifModifiedSince != "" {
		ifModifiedTime, err := time.Parse(http.TimeFormat, ifModifiedSince)
		if err == nil && !s.lastModified.After(ifModifiedTime) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}

	outputType := r.URL.Query().Get("type")

	// Set response headers
	if outputType == "json" {
		w.Header().Set("Content-Type", "application/json")
	} else {
		w.Header().Set("Content-Type", "application/x-protobuf")
		w.Header().Set("Content-Disposition", "attachment; filename=\"map.bin\"")
	}

	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Last-Modified", s.lastModified.UTC().Format(http.TimeFormat))

	// Send data
	if outputType == "json" {
		json.NewEncoder(w).Encode(s.graph)
	} else {
		w.Write(s.graphData)
	}
}

// handleRanking handles /ranking requests
func (s *Server) handleRanking(w http.ResponseWriter, r *http.Request) {
	s.graphMutex.RLock()
	defer s.graphMutex.RUnlock()

	if s.graphData == nil {
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

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Last-Modified", s.lastModified.UTC().Format(http.TimeFormat))

	fmt.Fprintf(w, "MAP.DN42 Global Rank\n")
	fmt.Fprintf(w, "Last update: %s\n", s.lastModified.UTC().Format(http.TimeFormat))
	fmt.Fprintf(w, "Rank   ASN         Desc                            Index\n")
	for _, node := range nodes {
		fmt.Fprintf(w, "%-5d  %-10d  %-30s  %d\n",
			node.Centrality.Ranking, node.Asn, node.Desc, node.Centrality.Index)
	}
}
