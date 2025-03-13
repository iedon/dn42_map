package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"regexp"
	"time"
)

type Config struct {
	MRT struct {
		URL              string `json:"url"`
		CheckInterval    int    `json:"check_interval"`
		IgnoreCertVerify bool   `json:"ignore_cert_verify"`
		CustomDNSServer  string `json:"custom_dns_server"`
	} `json:"mrt"`

	Generator struct {
		APIURL     string `json:"api_url"`
		AuthToken  string `json:"auth_token"`
		StatusFile string `json:"status_file"`
	} `json:"generator"`
}

type MRTStatus struct {
	Master4Date string `json:"master4_date"`
	Master6Date string `json:"master6_date"`
}

var config Config

func loadConfig(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &config)
}

// ========= MRT Active Check =========

func fetchMRTDates() (string, string, error) {
	resolver := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{
				Timeout: time.Millisecond * time.Duration(10000),
			}
			return d.DialContext(ctx, network, config.MRT.CustomDNSServer)
		},
	}

	dialer := &net.Dialer{
		Timeout:  10 * time.Second,
		Resolver: resolver,
	}

	httpClient := &http.Client{
		Transport: &http.Transport{
			DialContext:     dialer.DialContext,
			TLSClientConfig: &tls.Config{InsecureSkipVerify: config.MRT.IgnoreCertVerify},
		},
	}

	resp, err := httpClient.Get(config.MRT.URL)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	content := string(body)

	regex := regexp.MustCompile(`master[46]_latest\.mrt\.bz2.*?(\d{2}-\w{3}-\d{4} \d{2}:\d{2})`)
	matches := regex.FindAllStringSubmatch(content, -1)

	var master4Date, master6Date string
	for _, match := range matches {
		if len(match) > 1 && master4Date == "" {
			if match[1] != "" {
				master4Date = match[1]
			}
		} else if len(match) > 1 && master6Date == "" {
			if match[1] != "" {
				master6Date = match[1]
			}
		} else if master4Date != "" && master6Date != "" {
			return "", "", fmt.Errorf("Failed to parse mrt dump date.")
		}
	}
	return master4Date, master6Date, nil
}

func loadStatus(path string) (MRTStatus, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return MRTStatus{}, nil // Default empty
	}
	var status MRTStatus
	json.Unmarshal(data, &status)
	return status, nil
}

func saveStatus(path string, status MRTStatus) error {
	data, err := json.Marshal(status)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func triggerMapGeneration() error {
	req, err := http.NewRequest("POST", config.Generator.APIURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+config.Generator.AuthToken)

	httpClient := &http.Client{
		Timeout: 10 * time.Second,
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status code: %d, body: %s", resp.StatusCode, string(body))
	}
	return nil
}

func checkFileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return !errors.Is(err, os.ErrNotExist)
}

// ========= Main =========

func main() {
	if err := loadConfig("config.json"); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if !checkFileExists(config.Generator.StatusFile) {
		err := os.WriteFile(config.Generator.StatusFile, []byte{}, 0644)
		if err != nil {
			log.Fatalf("Failed to create file \"%s\": %v", config.Generator.StatusFile, err)
		}
	}

	for {
		master4Date, master6Date, err := fetchMRTDates()
		if err != nil {
			log.Printf("Failed to fetch MRT dates: %v", err)
			time.Sleep(time.Duration(config.MRT.CheckInterval) * time.Second)
			continue
		}

		status, _ := loadStatus(config.Generator.StatusFile)
		if master4Date != status.Master4Date || master6Date != status.Master6Date {
			log.Println("MRT Update detected, triggering map generation...")
			if err := triggerMapGeneration(); err == nil {
				newStatus := MRTStatus{Master4Date: master4Date, Master6Date: master6Date}
				saveStatus(config.Generator.StatusFile, newStatus)
				log.Println("Map generation triggered successfully")
			} else {
				log.Printf("Failed to trigger map generation: %v", err)
			}
		}
		time.Sleep(time.Duration(config.MRT.CheckInterval) * time.Second)
	}
}
