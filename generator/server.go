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
	ASN             uint32   `json:"asn"`
	Desc            string   `json:"desc"`
	Routes          []string `json:"routes"`
	RoutesMulticast []string `json:"routesMulticast"`
	Centrality      struct {
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

// MRTDownload represents a downloaded MRT file with its source metadata
type MRTDownload struct {
	Data        []byte
	IsMulticast bool
}

func downloadMRTFiles(ctx context.Context, config *Config) ([]MRTDownload, error) {
	type urlEntry struct {
		URL         string
		IsMulticast bool
	}
	entries := []urlEntry{
		{URL: config.MRTCollector.IPv4MRTDumpURL, IsMulticast: false},
		{URL: config.MRTCollector.IPv6MRTDumpURL, IsMulticast: false},
	}
	if config.MRTCollector.IPv4MulticastMRTDumpURL != "" {
		entries = append(entries, urlEntry{URL: config.MRTCollector.IPv4MulticastMRTDumpURL, IsMulticast: true})
	}
	if config.MRTCollector.IPv6MulticastMRTDumpURL != "" {
		entries = append(entries, urlEntry{URL: config.MRTCollector.IPv6MulticastMRTDumpURL, IsMulticast: true})
	}
	results := make([]MRTDownload, 0, len(entries))
	errCh := make(chan error, len(entries))
	dataCh := make(chan MRTDownload, len(entries))

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
	for _, entry := range entries {
		wg.Add(1)
		go func(entry urlEntry) {
			defer wg.Done()

			req, err := http.NewRequestWithContext(ctx, "GET", entry.URL, nil)
			if err != nil {
				errCh <- fmt.Errorf("failed to create request for %s: %v", entry.URL, err)
				return
			}

			if config.MRTCollector.Username != "" && config.MRTCollector.Password != "" {
				req.SetBasicAuth(config.MRTCollector.Username, config.MRTCollector.Password)
			}

			resp, err := client.Do(req)
			if err != nil {
				errCh <- fmt.Errorf("failed to download %s: %v", entry.URL, err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				errCh <- fmt.Errorf("unexpected status code %d for %s", resp.StatusCode, entry.URL)
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
					errCh <- fmt.Errorf("failed to decompress %s: %v", entry.URL, err)
					return
				}
			}

			// Send the decompressed data with source tag
			dataCh <- MRTDownload{Data: buffer.Bytes(), IsMulticast: entry.IsMulticast}

			// Clear the buffer to help GC
			buffer.Reset()
		}(entry)
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
	results := make(chan *mrt.Result, len(mrtData))
	var wg sync.WaitGroup

	for _, dl := range mrtData {
		wg.Add(1)
		go func(dl MRTDownload) {
			defer wg.Done()
			result, err := processor.Process(dl.Data, dl.IsMulticast)
			if err != nil {
				log.Printf("Error processing MRT data: %v\n", err)
				return
			}
			results <- result
		}(dl)
	}

	// Wait for all processing to complete and close the channel
	go func() {
		wg.Wait()
		close(results)
	}()

	// Merge results
	merged := mrt.MergeResults(results)

	// Check if we should skip generation on empty data
	if s.config.DoNotGenerateOnEmpty && len(merged.ASPaths) == 0 && len(merged.Advertises) == 0 {
		log.Println("No paths or routes found in MRT data and do_not_generate_on_empty is enabled. Skipping generation.")
		return
	}

	// Concurrent get ASN descriptions
	reg := registry.NewRegistry(s.config.RegistryPath)
	uniqueASNs := make(map[uint32]struct{})
	for _, asp := range merged.ASPaths {
		for _, asn := range asp.Path {
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

// sendJSONResponse sends the graph data as JSON using streaming encoder
func (s *Server) sendJSONResponse(w http.ResponseWriter) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)

	// Opening object
	if _, err := w.Write([]byte{'{'}); err != nil {
		return err
	}

	// Metadata
	if _, err := w.Write([]byte(`"metadata":`)); err != nil {
		return err
	}

	metadata := struct {
		Vendor             string `json:"vendor"`
		GeneratedTimestamp uint64 `json:"generated_timestamp"`
		DataTimestamp      uint64 `json:"data_timestamp"`
		Version            uint32 `json:"version"`
	}{
		Vendor:             s.graph.Metadata.Vendor,
		GeneratedTimestamp: s.graph.Metadata.GeneratedTimestamp,
		DataTimestamp:      s.graph.Metadata.DataTimestamp,
		Version:            s.graph.Metadata.Version,
	}
	if err := enc.Encode(metadata); err != nil {
		return err
	}

	// Nodes array
	if _, err := w.Write([]byte(`,"nodes":[`)); err != nil {
		return err
	}

	for i, node := range s.graph.Nodes {
		if i > 0 {
			if _, err := w.Write([]byte{','}); err != nil {
				return err
			}
		}
		if err := enc.Encode(s.convertNodeToJSON(node, false)); err != nil {
			return err
		}
	}

	// Links array
	if _, err := w.Write([]byte(`],"links":[`)); err != nil {
		return err
	}

	for i, link := range s.graph.Links {
		if i > 0 {
			if _, err := w.Write([]byte{','}); err != nil {
				return err
			}
		}
		if err := enc.Encode(struct {
			Source uint32 `json:"source"`
			Target uint32 `json:"target"`
			Af     uint32 `json:"af"`
		}{
			Source: link.Source,
			Target: link.Target,
			Af:     link.Af,
		}); err != nil {
			return err
		}
	}

	// Closing object
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

// formatRoute converts a protobuf Route to a string representation
func formatRoute(route *pb.Route) string {
	switch ip := route.Ip.(type) {
	case *pb.Route_Ipv4:
		return fmt.Sprintf("%d.%d.%d.%d/%d",
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
		return fmt.Sprintf("%s/%d", ipv6.String(), route.Length)
	}
	return ""
}

// convertNodeToJSON converts a protobuf Node to JSONNode
func (s *Server) convertNodeToJSON(node *pb.Node, includeWhois bool) JSONNode {
	jsonNode := JSONNode{
		ASN:             node.Asn,
		Desc:            node.Desc,
		Routes:          make([]string, len(node.Routes)),
		RoutesMulticast: make([]string, len(node.RoutesMulticast)),
	}

	for j, route := range node.Routes {
		jsonNode.Routes[j] = formatRoute(route)
	}

	for j, route := range node.RoutesMulticast {
		jsonNode.RoutesMulticast[j] = formatRoute(route)
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
