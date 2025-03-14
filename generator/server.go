package main

import (
	"bytes"
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

	// Create a custom HTTP client with custom DNS if specified
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.MRTCollector.InsecureSkipVerify,
		},
	}

	// Set up custom DNS resolver if specified
	if config.MRTCollector.CustomDNSServer != "" {
		tr.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
			resolver := &net.Resolver{
				PreferGo: true,
				Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
					d := net.Dialer{
						Timeout: time.Millisecond * time.Duration(10000),
					}
					return d.DialContext(ctx, network, config.MRTCollector.CustomDNSServer)
				},
			}
			dialer := &net.Dialer{
				Timeout:  10 * time.Second,
				Resolver: resolver,
			}
			return dialer.DialContext(ctx, network, address)
		}
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

			// Decompress using bzip2 with streaming
			bzReader := bzip2.NewReader(resp.Body)

			// Use a buffer to read data in chunks
			var buffer bytes.Buffer
			chunk := make([]byte, 32*1024) // 32KB chunks

			for {
				n, err := bzReader.Read(chunk)
				if n > 0 {
					buffer.Write(chunk[:n])
				}
				if err == io.EOF {
					break
				}
				if err != nil {
					errCh <- fmt.Errorf("failed to decompress %s: %v", url, err)
					return
				}
			}

			// Send the decompressed data
			dataCh <- buffer.Bytes()

			// Clear the buffer to help GC
			buffer.Reset()
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
func (s *Server) generateMap() {
	log.Printf("Map generation started at %s\n", time.Now().UTC().Format(http.TimeFormat))

	ctx := context.Background()
	start := time.Now()

	// Concurrent download MRT files
	mrtData, err := downloadMRTFiles(ctx, s.config)
	if err != nil {
		log.Printf("failed to download MRT files: %v\n", err)
		return
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
				log.Printf("Error processing MRT data: %v\n", err)
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
		log.Printf("failed to marshal graph: %v\n", err)
		return
	}

	// Save to file
	if err := os.WriteFile(s.config.OutputFile, data, 0644); err != nil {
		log.Printf("failed to write output file: %v\n", err)
		return
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
			log.Printf("Error starting post generation command: %v\n", err)
		} else {
			go func() {
				if err := cmd.Wait(); err != nil {
					log.Printf("Post generation command exited with error: %v\n", err)
				}
			}()
		}
	}

	log.Printf("Map generation completed in %v\n", time.Since(start))
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
	// Start JSON encoding
	encoder := json.NewEncoder(w)

	// Write opening brace
	if _, err := w.Write([]byte("{")); err != nil {
		return err
	}

	// Write metadata
	if _, err := w.Write([]byte(`"metadata":{`)); err != nil {
		return err
	}

	if _, err := w.Write(fmt.Appendf(nil, `"vendor":"%s","generated_timestamp":%d,"data_timestamp":%d},`,
		s.graph.Metadata.Vendor,
		s.graph.Metadata.GeneratedTimestamp,
		s.graph.Metadata.DataTimestamp)); err != nil {
		return err
	}

	// Start nodes array
	if _, err := w.Write([]byte(`"nodes":[`)); err != nil {
		return err
	}

	// Write nodes one by one to avoid building a large array in memory
	for i, node := range s.graph.Nodes {
		if i > 0 {
			if _, err := w.Write([]byte(",")); err != nil {
				return err
			}
		}

		jsonNode := s.convertNodeToJSON(node, false)
		if err := encoder.Encode(jsonNode); err != nil {
			return err
		}
	}

	// End nodes array and start links array
	if _, err := w.Write([]byte(`],"links":[`)); err != nil {
		return err
	}

	// Write links one by one
	for i, link := range s.graph.Links {
		if i > 0 {
			if _, err := w.Write([]byte(",")); err != nil {
				return err
			}
		}

		linkJSON := struct {
			Source uint32 `json:"source"`
			Target uint32 `json:"target"`
		}{
			Source: link.Source,
			Target: link.Target,
		}

		if err := encoder.Encode(linkJSON); err != nil {
			return err
		}
	}

	// End links array and close the JSON object
	if _, err := w.Write([]byte("]}")); err != nil {
		return err
	}

	return nil
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
