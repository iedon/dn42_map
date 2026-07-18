package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

// Config structure
type Config struct {
	RegistryPath          string    `json:"registry_path"`
	OutputFile            string    `json:"output_file"`
	PostGenerationCommand string    `json:"post_generation_command"`
	DoNotGenerateOnEmpty  bool      `json:"do_not_generate_on_empty"`
	MRTCollector          Collector `json:"mrt_collector"`
	API                   API       `json:"api"`
}

// Collector configuration for MRT
type Collector struct {
	IPv4MRTDumpURLs          []string `json:"ipv4_mrt_dump_url"`
	IPv6MRTDumpURLs          []string `json:"ipv6_mrt_dump_url"`
	IPv4MulticastMRTDumpURLs []string `json:"ipv4_multicast_mrt_dump_url"`
	IPv6MulticastMRTDumpURLs []string `json:"ipv6_multicast_mrt_dump_url"`
	Username                 string   `json:"username"`
	Password                 string   `json:"password"`
	InsecureSkipVerify       bool     `json:"insecure_skip_verify"`
	CustomDNSServer          string   `json:"custom_dns_server"`
}

// urlListFlag collects repeated command-line source overrides for one MRT
// channel. Supplying a flag replaces that channel's configured source list.
type urlListFlag []string

func (urls *urlListFlag) String() string {
	return strings.Join(*urls, ",")
}

func (urls *urlListFlag) Set(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return fmt.Errorf("MRT source URL cannot be empty")
	}
	*urls = append(*urls, value)
	return nil
}

// API service configuration
type API struct {
	Enabled    bool   `json:"enabled"`
	ListenAddr string `json:"listen_addr"`
	AuthToken  string `json:"auth_token"`
}

var (
	configFile               = flag.String("config", "config.json", "Path to config file")
	outputFile               = flag.String("output_file", "", "Force output file path")
	ipv4MRTDumpURLs          urlListFlag
	ipv6MRTDumpURLs          urlListFlag
	ipv4MulticastMRTDumpURLs urlListFlag
	ipv6MulticastMRTDumpURLs urlListFlag
	disableAPI               = flag.Bool("disable_api", false, "Disable API server mode (only generate map without serving API)")
)

func init() {
	flag.Var(&ipv4MRTDumpURLs, "ipv4_mrt_dump_url", "Override IPv4 unicast MRT sources (repeatable)")
	flag.Var(&ipv6MRTDumpURLs, "ipv6_mrt_dump_url", "Override IPv6 unicast MRT sources (repeatable)")
	flag.Var(&ipv4MulticastMRTDumpURLs, "ipv4_multicast_mrt_dump_url", "Override IPv4 multicast MRT sources (repeatable)")
	flag.Var(&ipv6MulticastMRTDumpURLs, "ipv6_multicast_mrt_dump_url", "Override IPv6 multicast MRT sources (repeatable)")
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %v", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %v", err)
	}

	return &config, nil
}

func main() {
	flag.Parse()

	// Load config file
	config, err := loadConfig(*configFile)
	if err != nil {
		log.Fatalf("Warning: Failed to load config file: %v\n", err)
	}

	// Overwrite with environment variables, higher priority than config file
	if envUser := os.Getenv("MRT_BASIC_AUTH_USER"); envUser != "" {
		config.MRTCollector.Username = envUser
	}
	if envPass := os.Getenv("MRT_BASIC_AUTH_PASSWORD"); envPass != "" {
		config.MRTCollector.Password = envPass
	}

	if *outputFile != "" {
		log.Printf("Overriding output file path with: %s\n", *outputFile)
		config.OutputFile = *outputFile
	}
	if len(ipv4MRTDumpURLs) > 0 {
		log.Printf("Overriding IPv4 unicast MRT sources with %d URL(s)\n", len(ipv4MRTDumpURLs))
		config.MRTCollector.IPv4MRTDumpURLs = ipv4MRTDumpURLs
	}
	if len(ipv6MRTDumpURLs) > 0 {
		log.Printf("Overriding IPv6 unicast MRT sources with %d URL(s)\n", len(ipv6MRTDumpURLs))
		config.MRTCollector.IPv6MRTDumpURLs = ipv6MRTDumpURLs
	}
	if len(ipv4MulticastMRTDumpURLs) > 0 {
		log.Printf("Overriding IPv4 multicast MRT sources with %d URL(s)\n", len(ipv4MulticastMRTDumpURLs))
		config.MRTCollector.IPv4MulticastMRTDumpURLs = ipv4MulticastMRTDumpURLs
	}
	if len(ipv6MulticastMRTDumpURLs) > 0 {
		log.Printf("Overriding IPv6 multicast MRT sources with %d URL(s)\n", len(ipv6MulticastMRTDumpURLs))
		config.MRTCollector.IPv6MulticastMRTDumpURLs = ipv6MulticastMRTDumpURLs
	}
	if *disableAPI {
		log.Println("API server mode disabled via command line flag")
		config.API.Enabled = false
	}

	server := NewServer(config)

	// Register routes
	http.HandleFunc("/asn/", server.handleASN)
	http.HandleFunc("/generate", server.handleGenerate)
	http.HandleFunc("/map", server.handleMap)
	http.HandleFunc("/ranking", server.handleRanking)

	if config.API.Enabled {
		// Generate map on startup
		go server.triggerGeneration()

		// Start the HTTP server
		log.Printf("Starting HTTP server on %s\n", config.API.ListenAddr)
		if err := http.ListenAndServe(config.API.ListenAddr, nil); err != nil {
			log.Fatalf("Failed to start HTTP server: %v\n", err)
		}
	} else {
		log.Println("API server mode is disabled. Generating map...")
		server.triggerGeneration()
	}
}
