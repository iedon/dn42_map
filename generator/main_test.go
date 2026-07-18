package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigAcceptsURLArraysAndRejectsLegacyStrings(t *testing.T) {
	dir := t.TempDir()
	arrayConfig := filepath.Join(dir, "array-config.json")
	if err := os.WriteFile(arrayConfig, []byte(`{
  "mrt_collector": {
    "ipv4_mrt_dump_url": ["https://mrt-a.example/master4.mrt", "https://mrt-b.example/master4.mrt"]
  }
}`), 0o600); err != nil {
		t.Fatalf("write array config: %v", err)
	}

	config, err := loadConfig(arrayConfig)
	if err != nil {
		t.Fatalf("load array config: %v", err)
	}
	if got := config.MRTCollector.IPv4MRTDumpURLs; len(got) != 2 || got[1] != "https://mrt-b.example/master4.mrt" {
		t.Errorf("IPv4MRTDumpURLs = %#v, want both configured sources", got)
	}

	legacyConfig := filepath.Join(dir, "legacy-config.json")
	if err := os.WriteFile(legacyConfig, []byte(`{
  "mrt_collector": {
    "ipv4_mrt_dump_url": "https://mrt.example/master4.mrt"
  }
}`), 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}
	if _, err := loadConfig(legacyConfig); err == nil {
		t.Fatal("loadConfig accepted the legacy scalar URL field")
	}
}

func TestURLListFlag(t *testing.T) {
	var urls urlListFlag
	if err := urls.Set(" https://mrt-a.example/master4.mrt "); err != nil {
		t.Fatalf("Set valid URL: %v", err)
	}
	if err := urls.Set("https://mrt-b.example/master4.mrt"); err != nil {
		t.Fatalf("Set second URL: %v", err)
	}
	if got, want := urls.String(), "https://mrt-a.example/master4.mrt,https://mrt-b.example/master4.mrt"; got != want {
		t.Errorf("String() = %q, want %q", got, want)
	}
	if err := urls.Set(" \t "); err == nil {
		t.Fatal("Set accepted an empty URL")
	}
}
