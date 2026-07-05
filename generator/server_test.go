package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
	cfg.MRTCollector.IPv4MRTDumpURL = ts.URL
	cfg.MRTCollector.IPv6MRTDumpURL = ts.URL
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
