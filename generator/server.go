package main

import (
	"compress/bzip2"
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"time"

	"github.com/iedon/dn42_map_go/graph"
	"github.com/iedon/dn42_map_go/mrt"
	pb "github.com/iedon/dn42_map_go/proto"
	"github.com/iedon/dn42_map_go/registry"

	"google.golang.org/protobuf/proto"
)

// JSONNode represents a node in JSON format
type JSONNode struct {
	ASN        uint32   `json:"asn"`
	Desc       string   `json:"desc"`
	Routes     []string `json:"routes"`
	Centrality struct {
		Degree      float64 `json:"degree"`
		Betweenness float64 `json:"betweenness"`
		Closeness   float64 `json:"closeness"`
		Index       uint32  `json:"index"`
		Ranking     uint32  `json:"ranking"`
	} `json:"centrality"`
	Whois string `json:"whois,omitempty"`
}

// JSONGraph represents the entire graph in JSON format
type JSONGraph struct {
	Metadata struct {
		Vendor        string `json:"vendor"`
		GeneratedTime uint64 `json:"generated_timestamp"`
		DataTime      uint64 `json:"data_timestamp"`
	} `json:"metadata"`
	Nodes []JSONNode `json:"nodes"`
	Links []struct {
		Source uint32 `json:"source"`
		Target uint32 `json:"target"`
	} `json:"links"`
}

// Server
type Server struct {
	config       *Config
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
	s.lastModified = time.Now()
	s.graphMutex.Unlock()

	// Execute post-generation command if specified
	if s.config.PostGenerationCommand != "" {
		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.Command("cmd", "/c", s.config.PostGenerationCommand)
		} else {
			cmd = exec.Command("sh", "-c", s.config.PostGenerationCommand)
		}

		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		if err := cmd.Start(); err != nil {
			log.Printf("Error starting post generation command: %v", err)
		} else {
			go func() {
				if err := cmd.Wait(); err != nil {
					log.Printf("Post generation command exited with error: %v", err)
				}
			}()
		}
	}

	log.Printf("Map generation completed in %v", time.Since(start))
	return nil
}

// checkIfModified checks if the response should be modified based on If-Modified-Since header
func checkIfModified(r *http.Request, lastModified time.Time) bool {
	if ifModifiedSince := r.Header.Get("If-Modified-Since"); ifModifiedSince != "" {
		ifModifiedTime, err := time.Parse(http.TimeFormat, ifModifiedSince)
		if err == nil && !lastModified.After(ifModifiedTime) {
			return false
		}
	}
	return true
}

// sendJSONResponse sends the graph data as JSON
func (s *Server) sendJSONResponse(w http.ResponseWriter) error {
	jsonGraph := JSONGraph{
		Metadata: struct {
			Vendor        string `json:"vendor"`
			GeneratedTime uint64 `json:"generated_timestamp"`
			DataTime      uint64 `json:"data_timestamp"`
		}{
			Vendor:        s.graph.Metadata.Vendor,
			GeneratedTime: s.graph.Metadata.GeneratedTimestamp,
			DataTime:      s.graph.Metadata.DataTimestamp,
		},
		Nodes: make([]JSONNode, len(s.graph.Nodes)),
		Links: make([]struct {
			Source uint32 `json:"source"`
			Target uint32 `json:"target"`
		}, len(s.graph.Links)),
	}

	// Pre-allocate slices for better performance
	for i := range s.graph.Nodes {
		jsonGraph.Nodes[i] = s.convertNodeToJSON(s.graph.Nodes[i], false)
	}

	for i := range s.graph.Links {
		jsonGraph.Links[i].Source = s.graph.Links[i].Source
		jsonGraph.Links[i].Target = s.graph.Links[i].Target
	}

	return json.NewEncoder(w).Encode(jsonGraph)
}

// sendProtobufResponse sends the graph data as protobuf
func (s *Server) sendProtobufResponse(w http.ResponseWriter) error {
	w.Header().Set("Content-Disposition", "attachment; filename=\"map.bin\"")
	data, err := proto.Marshal(s.graph)
	if err != nil {
		return fmt.Errorf("unable to marshal map data: %w", err)
	}
	_, err = w.Write(data)
	return err
}

// readWhois reads the whois information for a given ASN
func readWhois(registryPath string, asn uint32) string {
	whoisPath := filepath.Join(registryPath, "data", "aut-num", fmt.Sprintf("AS%d", asn))
	data, err := os.ReadFile(whoisPath)
	if err != nil {
		return ""
	}
	return string(data)
}

// convertNodeToJSON converts a protobuf Node to JSONNode
func (s *Server) convertNodeToJSON(node *pb.Node, includeWhois bool) JSONNode {
	jsonNode := JSONNode{
		ASN:    node.Asn,
		Desc:   node.Desc,
		Routes: make([]string, len(node.Routes)),
	}

	for j, route := range node.Routes {
		var ipStr string
		switch ip := route.Ip.(type) {
		case *pb.Route_Ipv4:
			ipStr = fmt.Sprintf("%d.%d.%d.%d/%d",
				(ip.Ipv4>>24)&0xFF,
				(ip.Ipv4>>16)&0xFF,
				(ip.Ipv4>>8)&0xFF,
				ip.Ipv4&0xFF,
				route.Length)
		case *pb.Route_Ipv6:
			ipv6 := make(net.IP, 16)
			binary.BigEndian.PutUint32(ipv6[0:4], ip.Ipv6.HighH32)
			binary.BigEndian.PutUint32(ipv6[4:8], ip.Ipv6.HighL32)
			binary.BigEndian.PutUint32(ipv6[8:12], ip.Ipv6.LowH32)
			binary.BigEndian.PutUint32(ipv6[12:16], ip.Ipv6.LowL32)
			ipStr = fmt.Sprintf("%s/%d", ipv6.String(), route.Length)
		}
		jsonNode.Routes[j] = ipStr
	}

	jsonNode.Centrality.Degree = node.Centrality.Degree
	jsonNode.Centrality.Betweenness = node.Centrality.Betweenness
	jsonNode.Centrality.Closeness = node.Centrality.Closeness
	jsonNode.Centrality.Index = node.Centrality.Index
	jsonNode.Centrality.Ranking = node.Centrality.Ranking

	if includeWhois {
		jsonNode.Whois = readWhois(s.config.RegistryPath, node.Asn)
	}

	return jsonNode
}

// parseASNFromURL extracts and parses ASN from URL
func (s *Server) parseASNFromURL(path string) (uint32, error) {
	asnStr := path[len("/asn/"):]
	asn, err := strconv.ParseUint(asnStr, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("invalid ASN format")
	}
	return uint32(asn), nil
}

// findNodeByASN finds a node by ASN
func (s *Server) findNodeByASN(asn uint32) *pb.Node {
	for _, node := range s.graph.Nodes {
		if node.Asn == asn {
			return node
		}
	}
	return nil
}
