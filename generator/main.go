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
	RegistryPath string    `json:"registry_path"`
	OutputFile   string    `json:"output_file"`
	MRTCollector Collector `json:"mrt_collector"`
	API          API       `json:"api"`
}

// Collector configuration for MRT
type Collector struct {
	Master4URL         string `json:"master4_url"`
	Master6URL         string `json:"master6_url"`
	Username           string `json:"username"`
	Password           string `json:"password"`
	InsecureSkipVerify bool   `json:"insecure_skip_verify"`
}

// API service configuration
type API struct {
	Enabled    bool   `json:"enabled"`
	ListenAddr string `json:"listen_addr"`
	AuthToken  string `json:"auth_token"`
}

var (
	configFile = flag.String("config", "config.json", "Path to config file")
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
		log.Panicf("Warning: Failed to load config file: %v", err)
	}

	// Override with environment variables, higher priority than config file
	if envUser := os.Getenv("MRT_BASIC_AUTH_USER"); envUser != "" {
		config.MRTCollector.Username = envUser
	}
	if envPass := os.Getenv("MRT_BASIC_AUTH_PASSWORD"); envPass != "" {
		config.MRTCollector.Password = envPass
	}

	server := NewServer(config)

	// Register routes
	http.HandleFunc("/generate", server.handleGenerate)
	http.HandleFunc("/map", server.handleMap)
	http.HandleFunc("/ranking", server.handleRanking)

	if config.API.Enabled {
		// Generate map on startup
		go server.generateMap()

		// Start the HTTP server
		log.Printf("Starting HTTP server on %s", config.API.ListenAddr)
		if err := http.ListenAndServe(config.API.ListenAddr, nil); err != nil {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	} else {
		log.Println("API server mode is disabled. Generating map...")
		server.generateMap()
	}
}
