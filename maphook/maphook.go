package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type Config struct {
	WebHook struct {
		Port      string `json:"port"`
		Secret    string `json:"secret"`
		EventType string `json:"event_type"`
		ShellCmd  string `json:"shell_command"`
	} `json:"webhook"`

	MRT struct {
		URL              string `json:"url"`
		CheckInterval    int    `json:"check_interval"`
		IgnoreCertVerify bool   `json:"ignore_cert_verify"`
		CustomDNSServer  string `json:"custom_dns_server"`
	} `json:"mrt"`

	GitHub struct {
		WorkflowAPI string `json:"workflow_api"`
		StatusFile  string `json:"status_file"`
		Token       string `json:"token"`
	} `json:"github"`
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

// ========= WebHook =========

func handleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}

	if !validateSignature(r, body) {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	event := r.Header.Get("X-GitHub-Event")
	if event == config.WebHook.EventType {
		executeShellCommand()
	}
	w.WriteHeader(http.StatusOK)
}

func validateSignature(r *http.Request, body []byte) bool {
	signature := r.Header.Get("X-Hub-Signature-256")
	h := hmac.New(sha256.New, []byte(config.WebHook.Secret))
	h.Write(body)
	computedSignature := "sha256=" + hex.EncodeToString(h.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(computedSignature))
}

func executeShellCommand() {
	cmd := exec.Command("/bin/bash", "-c", config.WebHook.ShellCmd)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Shell command failed: %v", err)
	}
	log.Printf("Shell command output: %s", output)
}

// ========= GRC MRT Active Check =========

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

func triggerGitHubWorkflow() error {
	payload := `{"ref":"main","inputs":{}}`
	req, err := http.NewRequest("POST", config.GitHub.WorkflowAPI, strings.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+config.GitHub.Token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	httpClient := &http.Client{}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Unexpected HTTP Status code: %d, %s", resp.StatusCode, data)
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

	if !checkFileExists(config.GitHub.StatusFile) {
		err := os.WriteFile(config.GitHub.StatusFile, []byte{}, 0644)
		if err != nil {
			log.Fatalf("Failed to create file \"%s\": %v", config.GitHub.StatusFile, err)
		}
	}

	go func() {
		http.HandleFunc("/webhook", handleWebhook)
		log.Printf("Listening for webhook on port %s", config.WebHook.Port)
		http.ListenAndServe(":"+config.WebHook.Port, nil)
	}()

	for {
		master4Date, master6Date, err := fetchMRTDates()
		if err != nil {
			log.Printf("Failed to fetch MRT dates: %v", err)
			time.Sleep(time.Duration(config.MRT.CheckInterval) * time.Second)
			continue
		}

		status, _ := loadStatus(config.GitHub.StatusFile)
		if master4Date != status.Master4Date || master6Date != status.Master6Date {
			log.Println("MRT Update detected, triggering workflow...")
			if err := triggerGitHubWorkflow(); err == nil {
				newStatus := MRTStatus{Master4Date: master4Date, Master6Date: master6Date}
				saveStatus(config.GitHub.StatusFile, newStatus)
			} else {
				log.Printf("Trigger GitHub workflow failed: %v", err)
			}
		}
		time.Sleep(time.Duration(config.MRT.CheckInterval) * time.Second)
	}
}
