package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
)

// Config structure
type Config struct {
	RegistryPath          string    `json:"registry_path"`
	OutputFile            string    `json:"output_file"`
	PostGenerationCommand string    `json:"post_generation_command"`
	MRTCollector          Collector `json:"mrt_collector"`
	API                   API       `json:"api"`
}

// Collector configuration for MRT
type Collector struct {
	IPv4MRTDumpURL     string `json:"ipv4_mrt_dump_url"`
	IPv6MRTDumpURL     string `json:"ipv6_mrt_dump_url"`
	Username           string `json:"username"`
	Password           string `json:"password"`
	InsecureSkipVerify bool   `json:"insecure_skip_verify"`
	CustomDNSServer    string `json:"custom_dns_server"`
}

// API service configuration
type API struct {
	Enabled    bool   `json:"enabled"`
	ListenAddr string `json:"listen_addr"`
	AuthToken  string `json:"auth_token"`
}

var (
	configFile     = flag.String("config", "config.json", "Path to config file")
	outputFile     = flag.String("output_file", "", "Force output file path")
	ipv4MRTDumpURL = flag.String("ipv4_mrt_dump_url", "", "Force MRT Dump IPv4 URL")
	ipv6MRTDumpURL = flag.String("ipv6_mrt_dump_url", "", "Force MRT Dump IPv6 URL")
	disableAPI     = flag.Bool("disable_api", false, "Disable API server mode (only generate map without serving API)")
)

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
	if *ipv4MRTDumpURL != "" {
		log.Printf("Overriding IPv4 MRT Dump URL with: %s\n", *ipv4MRTDumpURL)
		config.MRTCollector.IPv4MRTDumpURL = *ipv4MRTDumpURL
	}
	if *ipv6MRTDumpURL != "" {
		log.Printf("Overriding IPv6 MRT Dump URL with: %s\n", *ipv6MRTDumpURL)
		config.MRTCollector.IPv6MRTDumpURL = *ipv6MRTDumpURL
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
		go server.generateMap()

		// Start the HTTP server
		log.Printf("Starting HTTP server on %s\n", config.API.ListenAddr)
		if err := http.ListenAndServe(config.API.ListenAddr, nil); err != nil {
			log.Fatalf("Failed to start HTTP server: %v\n", err)
		}
	} else {
		log.Println("API server mode is disabled. Generating map...")
		server.generateMap()
	}
}
