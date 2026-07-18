package main

import (
	"bufio"
	"compress/bzip2"
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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

	// Generation control: genMu guards genCancel and genEpoch. genCancel cancels
	// the currently running generation; genEpoch identifies the latest run so a
	// preempted-but-still-finishing run knows to discard its stale result.
	genMu     sync.Mutex
	genCancel context.CancelFunc
	genEpoch  uint64
}

// NewServer creates a new HTTP server
func NewServer(config *Config) *Server {
	return &Server{
		config:       config,
		lastModified: time.Now(),
	}
}

// mrtSource identifies an MRT dump URL and the channel that classifies it.
type mrtSource struct {
	URL         string
	IsMulticast bool
}

// mrtResult is one source's complete contribution to a collection run.
// Each worker owns its Aggregate until it sends this result.
type mrtResult struct {
	source    mrtSource
	aggregate *mrt.Aggregate
	err       error
}

// mrtSources expands every configured channel into individual stream sources.
// The configured channel, rather than an MRT subtype encountered in the dump,
// is authoritative for unicast versus multicast classification.
func mrtSources(collector Collector) ([]mrtSource, error) {
	channels := []struct {
		name        string
		urls        []string
		isMulticast bool
	}{
		{name: "ipv4_mrt_dump_url", urls: collector.IPv4MRTDumpURLs},
		{name: "ipv6_mrt_dump_url", urls: collector.IPv6MRTDumpURLs},
		{name: "ipv4_multicast_mrt_dump_url", urls: collector.IPv4MulticastMRTDumpURLs, isMulticast: true},
		{name: "ipv6_multicast_mrt_dump_url", urls: collector.IPv6MulticastMRTDumpURLs, isMulticast: true},
	}

	sources := make([]mrtSource, 0,
		len(collector.IPv4MRTDumpURLs)+len(collector.IPv6MRTDumpURLs)+
			len(collector.IPv4MulticastMRTDumpURLs)+len(collector.IPv6MulticastMRTDumpURLs))
	for _, channel := range channels {
		for index, url := range channel.urls {
			url = strings.TrimSpace(url)
			if url == "" {
				return nil, fmt.Errorf("mrt_collector.%s[%d] is empty", channel.name, index)
			}
			sources = append(sources, mrtSource{URL: url, IsMulticast: channel.isMulticast})
		}
	}
	return sources, nil
}

// newMRTClient builds the HTTP client used to stream MRT dumps, honoring the
// TLS-skip and custom-DNS collector settings.
func newMRTClient(config *Config) *http.Client {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.MRTCollector.InsecureSkipVerify,
		},
	}

	if config.MRTCollector.CustomDNSServer != "" {
		tr.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
			resolver := &net.Resolver{
				PreferGo: true,
				Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
					d := net.Dialer{Timeout: 10 * time.Second}
					return d.DialContext(ctx, network, config.MRTCollector.CustomDNSServer)
				},
			}
			dialer := &net.Dialer{Timeout: 10 * time.Second, Resolver: resolver}
			return dialer.DialContext(ctx, network, address)
		}
	}

	// No overall client timeout: dumps are parsed while streaming, so the whole
	// request can legitimately outlive a fixed deadline. The transport's dial
	// timeout and the request context bound how long we can stall.
	return &http.Client{Transport: tr}
}

// collectAggregate streams every configured MRT dump concurrently, parsing each
// on the fly into its own Aggregate, and merges successful results. A failed
// source does not prevent map generation while at least one source succeeds.
// Peak memory stays proportional to the resulting graph rather than the
// (decompressed) dumps.
func collectAggregate(ctx context.Context, config *Config) (*mrt.Aggregate, error) {
	sources, err := mrtSources(config.MRTCollector)
	if err != nil {
		return nil, err
	}
	if len(sources) == 0 {
		return nil, errors.New("no MRT sources configured")
	}

	client := newMRTClient(config)
	results := make(chan mrtResult, len(sources))

	var wg sync.WaitGroup
	for _, src := range sources {
		wg.Add(1)
		go func(src mrtSource) {
			defer wg.Done()
			agg := mrt.NewAggregate()
			if err := streamMRT(ctx, client, config, src, agg); err != nil {
				results <- mrtResult{source: src, err: err}
				return
			}
			results <- mrtResult{source: src, aggregate: agg}
		}(src)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	// Merge sequentially in this goroutine, so each per-source Aggregate is freed
	// right after folding and no lock is needed on the shared result.
	merged := mrt.NewAggregate()
	succeeded := 0
	failed := make([]error, 0)
	for result := range results {
		if result.err != nil {
			err := fmt.Errorf("%s: %w", result.source.URL, result.err)
			failed = append(failed, err)
			log.Printf("MRT source failed; continuing with other sources: %v", err)
			continue
		}
		merged.Merge(result.aggregate)
		succeeded++
	}

	if succeeded == 0 {
		return nil, fmt.Errorf("all %d configured MRT sources failed: %w", len(sources), errors.Join(failed...))
	}
	if len(failed) > 0 {
		log.Printf("MRT collection completed with partial data: %d/%d sources succeeded", succeeded, len(sources))
	}

	return merged, nil
}

// streamMRT downloads a single MRT dump and parses it on the fly into agg,
// transparently decompressing bzip2 streams.
func streamMRT(ctx context.Context, client *http.Client, config *Config, src mrtSource, agg *mrt.Aggregate) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.URL, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if config.MRTCollector.Username != "" && config.MRTCollector.Password != "" {
		req.SetBasicAuth(config.MRTCollector.Username, config.MRTCollector.Password)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	br := bufio.NewReader(resp.Body)
	var reader io.Reader = br
	if header, err := br.Peek(3); err == nil && string(header) == "BZh" {
		reader = bzip2.NewReader(br)
	}

	return mrt.Parse(reader, src.IsMulticast, agg)
}

// triggerGeneration starts a new map generation, forcibly cancelling any run
// still in progress (e.g. one stalled on a slow network) so the newest request
// always wins. It blocks until this run finishes, so callers that must not block
// should invoke it in a goroutine.
func (s *Server) triggerGeneration() {
	s.genMu.Lock()
	if s.genCancel != nil {
		s.genCancel() // preempt the still-running previous generation
	}
	s.genEpoch++
	epoch := s.genEpoch
	ctx, cancel := context.WithCancel(context.Background())
	s.genCancel = cancel
	s.genMu.Unlock()

	defer cancel() // release the context once this run returns
	s.generateMap(ctx, epoch)
}

// generateMap generates map data for the given generation epoch. The result is
// only committed if epoch is still the most recent when generation completes.
func (s *Server) generateMap(ctx context.Context, epoch uint64) {
	log.Printf("Map generation started at %s\n", time.Now().UTC().Format(http.TimeFormat))

	start := time.Now()

	// Stream and parse all MRT dumps on the fly into a single aggregate.
	merged, err := collectAggregate(ctx, s.config)
	if err != nil {
		if ctx.Err() != nil {
			log.Println("Map generation cancelled (superseded by a newer run)")
		} else {
			log.Printf("failed to collect MRT data: %v\n", err)
		}
		return
	}

	// Check if we should skip generation on empty data
	if s.config.DoNotGenerateOnEmpty && len(merged.Nodes) == 0 {
		log.Println("No paths or routes found in MRT data and do_not_generate_on_empty is enabled. Skipping generation.")
		return
	}

	// Bail out before the CPU-heavy build if a newer run has already preempted us.
	if ctx.Err() != nil {
		log.Println("Map generation cancelled (superseded by a newer run)")
		return
	}

	// Concurrent get ASN descriptions for every ASN seen in the graph.
	reg := registry.NewRegistry(s.config.RegistryPath)
	asnDescriptions := reg.GetDescriptions(merged.Nodes)

	// Build Graph protobuf
	graphPb := graph.BuildGraph(merged, asnDescriptions)

	// Serialize
	data, err := proto.Marshal(graphPb)
	if err != nil {
		log.Printf("failed to marshal graph: %v\n", err)
		return
	}

	// Commit under genMu so a superseding run cannot interleave file writes, and
	// so a run that was preempted mid-build discards its now-stale result.
	s.genMu.Lock()
	if epoch != s.genEpoch {
		s.genMu.Unlock()
		log.Println("Map generation superseded by a newer run; discarding result")
		return
	}
	if err := os.WriteFile(s.config.OutputFile, data, 0644); err != nil {
		s.genMu.Unlock()
		log.Printf("failed to write output file: %v\n", err)
		return
	}
	s.graphMutex.Lock()
	s.graph = graphPb
	s.lastModified = time.Now()
	s.graphMutex.Unlock()
	s.genMu.Unlock()

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
