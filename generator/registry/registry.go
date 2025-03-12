package registry

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Registry struct {
	basePath string
	cache    sync.Map
}

// NewRegistry creates a new registry processor
func NewRegistry(basePath string) *Registry {
	return &Registry{
		basePath: basePath,
	}
}

// GetDescriptions concurrently gets descriptions for multiple ASNs
func (r *Registry) GetDescriptions(asns map[uint32]struct{}) map[uint32]string {
	results := make(map[uint32]string)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for asn := range asns {
		wg.Add(1)
		go func(asn uint32) {
			defer wg.Done()
			desc := r.getDescByASN(asn)
			mu.Lock()
			results[asn] = desc
			mu.Unlock()
		}(asn)
	}

	wg.Wait()
	return results
}

// getDescByASN gets the description for a single ASN
func (r *Registry) getDescByASN(asn uint32) string {
	// Check cache
	if desc, ok := r.cache.Load(asn); ok {
		return desc.(string)
	}

	filePath := filepath.Join(r.basePath, "data", "aut-num", fmt.Sprintf("AS%d", asn))
	file, err := os.Open(filePath)
	if err != nil {
		defaultDesc := fmt.Sprintf("AS%d", asn)
		r.cache.Store(asn, defaultDesc)
		return defaultDesc
	}
	defer file.Close()

	var (
		adminC string
		mntr   string
		asName string
		descr  string
	)

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "admin-c:") {
			adminC = strings.TrimSpace(strings.TrimPrefix(line, "admin-c:"))
		} else if strings.HasPrefix(line, "mnt-by:") {
			mntr = strings.TrimSpace(strings.TrimPrefix(line, "mnt-by:"))
		} else if strings.HasPrefix(line, "as-name:") {
			asName = strings.TrimSpace(strings.TrimPrefix(line, "as-name:"))
		} else if strings.HasPrefix(line, "descr:") {
			descr = strings.TrimSpace(strings.TrimPrefix(line, "descr:"))
		}
	}

	var result string
	switch {
	case adminC != "" && adminC == mntr:
		result = adminC
	case adminC != "":
		result = adminC
	case asName != "":
		result = asName
	case descr != "":
		result = descr
	default:
		result = fmt.Sprintf("AS%d", asn)
	}

	r.cache.Store(asn, result)
	return result
}
