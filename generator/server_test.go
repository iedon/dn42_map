package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// TestTriggerGenerationPreempts verifies that a second generation forcibly
// cancels the in-flight requests of a previous, still-running generation.
func TestTriggerGenerationPreempts(t *testing.T) {
	entered := make(chan struct{}, 16)
	cancelled := make(chan struct{}, 16)
	release := make(chan struct{})

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entered <- struct{}{}
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush() // let the client return from Do and start streaming the body
		}
		// Hang so the generation stays in-flight until preempted (request context
		// cancelled) or explicitly released at the end of the test.
		select {
		case <-r.Context().Done():
			cancelled <- struct{}{}
		case <-release:
		}
	}))
	defer ts.Close()
	defer close(release)

	cfg := &Config{OutputFile: filepath.Join(t.TempDir(), "map.bin"), DoNotGenerateOnEmpty: true}
	cfg.MRTCollector.IPv4MRTDumpURLs = []string{ts.URL}
	cfg.MRTCollector.IPv6MRTDumpURLs = []string{ts.URL}
	s := NewServer(cfg)

	recv := func(ch <-chan struct{}, what string) {
		t.Helper()
		select {
		case <-ch:
		case <-time.After(10 * time.Second):
			t.Fatalf("timeout waiting for %s", what)
		}
	}

	go s.triggerGeneration() // run 1: both requests will hang
	recv(entered, "run 1 IPv4 request")
	recv(entered, "run 1 IPv6 request")

	go s.triggerGeneration() // run 2 must preempt run 1

	// Run 1's two in-flight requests must be cancelled by the preemption.
	recv(cancelled, "run 1 IPv4 cancellation")
	recv(cancelled, "run 1 IPv6 cancellation")
}

func TestMRTSourcesExpandsEveryChannel(t *testing.T) {
	collector := Collector{
		IPv4MRTDumpURLs:          []string{"https://mrt.example/v4-a", " https://mrt.example/v4-b "},
		IPv6MRTDumpURLs:          []string{"https://mrt.example/v6"},
		IPv4MulticastMRTDumpURLs: []string{"https://mrt.example/m4"},
		IPv6MulticastMRTDumpURLs: []string{"https://mrt.example/m6-a", "https://mrt.example/m6-b"},
	}

	sources, err := mrtSources(collector)
	if err != nil {
		t.Fatalf("mrtSources: %v", err)
	}

	want := []mrtSource{
		{URL: "https://mrt.example/v4-a"},
		{URL: "https://mrt.example/v4-b"},
		{URL: "https://mrt.example/v6"},
		{URL: "https://mrt.example/m4", IsMulticast: true},
		{URL: "https://mrt.example/m6-a", IsMulticast: true},
		{URL: "https://mrt.example/m6-b", IsMulticast: true},
	}
	if len(sources) != len(want) {
		t.Fatalf("source count = %d, want %d", len(sources), len(want))
	}
	for i := range want {
		if sources[i] != want[i] {
			t.Errorf("sources[%d] = %+v, want %+v", i, sources[i], want[i])
		}
	}
}

func TestMRTSourcesRejectsEmptyURL(t *testing.T) {
	_, err := mrtSources(Collector{IPv4MRTDumpURLs: []string{""}})
	if err == nil {
		t.Fatal("mrtSources accepted an empty URL")
	}
}

func TestCollectAggregateReadsEveryConfiguredSource(t *testing.T) {
	var mu sync.Mutex
	requests := make(map[string]int)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests[r.URL.Path]++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	config := &Config{MRTCollector: Collector{
		IPv4MRTDumpURLs:          []string{ts.URL + "/v4-a", ts.URL + "/v4-b"},
		IPv6MRTDumpURLs:          []string{ts.URL + "/v6"},
		IPv4MulticastMRTDumpURLs: []string{ts.URL + "/m4"},
		IPv6MulticastMRTDumpURLs: []string{ts.URL + "/m6-a", ts.URL + "/m6-b"},
	}}

	agg, err := collectAggregate(context.Background(), config)
	if err != nil {
		t.Fatalf("collectAggregate: %v", err)
	}
	if len(agg.Nodes) != 0 || len(agg.Links) != 0 {
		t.Fatalf("empty MRT streams produced graph data: %+v", agg)
	}

	want := map[string]int{
		"/v4-a": 1,
		"/v4-b": 1,
		"/v6":   1,
		"/m4":   1,
		"/m6-a": 1,
		"/m6-b": 1,
	}
	mu.Lock()
	defer mu.Unlock()
	for path, count := range want {
		if requests[path] != count {
			t.Errorf("requests[%q] = %d, want %d", path, requests[path], count)
		}
	}
}
