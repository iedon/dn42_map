package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/likexian/whois"
)

type Config struct {
	Webroot          string   `json:"webroot"`
	Listen4          string   `json:"listen4"`
	Listen6          string   `json:"listen6"`
	NodeID           string   `json:"node_id"`
	NodeASN          string   `json:"node_asn"`
	NodeLocation     string   `json:"node_location"`
	NodeLocationFull string   `json:"node_location_full"`
	TrustedProxies   []string `json:"trusted_proxies"`
	WhoisServer      string   `json:"whois_server"`
}

type ApiResponse struct {
	IP       string `json:"ip"`
	NodeID   string `json:"node_id"`
	NodeASN  string `json:"node_asn"`
	Location string `json:"node_location"`
	Version  string `json:"version"`
	Origin   string `json:"origin"`
	Netname  string `json:"netname"`
	Country  string `json:"country"`
}

func loadConfig(filename string) (*Config, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	var config Config
	err = json.Unmarshal(data, &config)
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func getClientIP(r *http.Request, trustedProxies []string) string {
	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		ips := strings.Split(xForwardedFor, ",")
		clientIP := strings.TrimSpace(ips[0])
		remoteIP, _, _ := net.SplitHostPort(r.RemoteAddr)

		for _, proxy := range trustedProxies {
			if remoteIP == proxy {
				return clientIP
			}
		}
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "Failed to retrieve your IP address"
	}
	return ip
}

func parseWhoisData(data string) (origin, netname, country string) {
	originPattern := regexp.MustCompile(`origin:\s+(AS\d+)`)
	netnamePattern := regexp.MustCompile(`netname:\s+(\S+)`)
	countryPattern := regexp.MustCompile(`country:\s+(\S+)`)

	origins := originPattern.FindAllStringSubmatch(data, -1)
	netnames := netnamePattern.FindAllStringSubmatch(data, -1)
	countries := countryPattern.FindAllStringSubmatch(data, -1)

	if len(origins) > 0 {
		origin = origins[len(origins)-1][1] // Last occurrence
	} else {
		origin = ""
	}

	if len(netnames) > 0 {
		netname = netnames[len(netnames)-1][1] // Last occurrence
	} else {
		netname = ""
	}

	if len(countries) > 0 {
		country = countries[len(countries)-1][1] // Last occurrence
	} else {
		country = ""
	}

	return
}

func getWhoisInfo(ip string, server string) (string, string, string) {
	result, err := whois.Whois(ip, server)
	if err != nil {
		return "", "", ""
	}
	return parseWhoisData(result)
}

func indexHandler(config *Config, tmpl *template.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r, config.TrustedProxies)
		tmpl.Execute(w, struct {
			IP               string
			NodeID           string
			NodeASN          string
			NodeLocation     string
			NodeLocationFull string
		}{
			IP:               ip,
			NodeID:           config.NodeID,
			NodeASN:          config.NodeASN,
			NodeLocation:     config.NodeLocation,
			NodeLocationFull: config.NodeLocationFull,
		})
	}
}

func rawHandler(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r, config.TrustedProxies)
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Cache-Control, Pragma")
		w.Write([]byte(ip))
	}
}

func apiHandler(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r, config.TrustedProxies)
		origin, netname, country := getWhoisInfo(ip, config.WhoisServer)
		res := ApiResponse{
			IP:       ip,
			NodeID:   config.NodeID,
			NodeASN:  config.NodeASN,
			Location: config.NodeLocation,
			Version:  "1.0",
			Origin:   origin,
			Netname:  netname,
			Country:  country,
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Cache-Control, Pragma")
		json.NewEncoder(w).Encode(res)
	}
}

func main() {
	config, err := loadConfig("config.json")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		log.Fatalf("Failed to parse template: %v", err)
	}

	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(config.Webroot))))
	http.HandleFunc("/", indexHandler(config, tmpl))
	http.HandleFunc("/raw", rawHandler(config))
	http.HandleFunc("/api", apiHandler(config))

	log.Printf("Starting server on %s and %s", config.Listen4, config.Listen6)
	go log.Fatal(http.ListenAndServe(config.Listen4, nil))
	log.Fatal(http.ListenAndServe(config.Listen6, nil))
}
