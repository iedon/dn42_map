package mrt

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"sync"
)

// Result stores the results of MRT processing
type Result struct {
	ASPaths    [][]uint32         // AS path list
	Advertises map[uint32][]Route // ASN to route mapping
	Metadata   *Metadata
}

// Route represents a route entry
type Route struct {
	Length  uint32
	IPType  string // "ipv4" or "ipv6"
	IPValue any
}

// Metadata stores metadata for MRT data
type Metadata struct {
	Timestamp uint64
}

// Processor processes MRT data
type Processor struct {
	sync.Mutex
}

// NewProcessor creates a new MRT processor
func NewProcessor() *Processor {
	return &Processor{}
}

// Process processes MRT data and returns the result
func (p *Processor) Process(data []byte) (*Result, error) {
	result := &Result{
		ASPaths:    make([][]uint32, 0),
		Advertises: make(map[uint32][]Route),
	}

	reader := bytes.NewReader(data)
	for reader.Len() > 0 {
		// Read MRT header
		header := make([]byte, 12)
		if _, err := reader.Read(header); err != nil {
			return nil, fmt.Errorf("failed to read MRT header: %v", err)
		}

		timestamp := binary.BigEndian.Uint32(header[0:4])
		msgType := binary.BigEndian.Uint16(header[4:6])
		subType := binary.BigEndian.Uint16(header[6:8])
		length := binary.BigEndian.Uint32(header[8:12])

		// Read message body
		body := make([]byte, length)
		if _, err := reader.Read(body); err != nil {
			return nil, fmt.Errorf("failed to read MRT body: %v", err)
		}

		// Process different types of messages
		switch msgType {
		case 13: // TABLE_DUMP_V2
			if err := p.processTableDumpV2(subType, body, result); err != nil {
				return nil, err
			}
		}

		// Set metadata
		if result.Metadata == nil {
			result.Metadata = &Metadata{
				Timestamp: uint64(timestamp),
			}
		}
	}

	return result, nil
}

// processTableDumpV2 processes TABLE_DUMP_V2 type messages
func (p *Processor) processTableDumpV2(subType uint16, data []byte, result *Result) error {
	reader := bytes.NewReader(data)

	switch subType {
	case 1: // PEER_INDEX_TABLE
		// Skip peer index table
		return nil
	case 2: // RIB_IPV4_UNICAST
		fallthrough
	case 4: // RIB_IPV6_UNICAST
		fallthrough
	case 8: // RIB_IPV4_UNICAST_ADDPATH
		fallthrough
	case 10: // RIB_IPV6_UNICAST_ADDPATH
		return p.processRIBEntry(subType, reader, result)
	}

	return nil
}

// processRIBEntry processes RIB entries
func (p *Processor) processRIBEntry(subType uint16, reader *bytes.Reader, result *Result) error {
	// Read sequence number (skip)
	var seqNum uint32
	if err := binary.Read(reader, binary.BigEndian, &seqNum); err != nil {
		return err
	}

	// Read prefix length
	var prefixLen uint8
	if err := binary.Read(reader, binary.BigEndian, &prefixLen); err != nil {
		return err
	}

	// Calculate prefix bytes
	prefixBytes := (prefixLen + 7) / 8
	prefix := make([]byte, prefixBytes)
	if _, err := reader.Read(prefix); err != nil {
		return err
	}

	// Parse IP address
	var ipStr string
	if subType == 2 || subType == 8 { // IPv4
		if prefixBytes < 4 {
			prefix = append(prefix, make([]byte, 4-prefixBytes)...)
		}
		ip := net.IPv4(prefix[0], prefix[1], prefix[2], prefix[3])
		ipStr = ip.String()
	} else { // IPv6 (type 4, 10)
		if prefixBytes < 16 {
			prefix = append(prefix, make([]byte, 16-prefixBytes)...)
		}
		ip := net.IP(prefix)
		ipStr = ip.String()
	}

	// Read entry count
	var entryCount uint16
	if err := binary.Read(reader, binary.BigEndian, &entryCount); err != nil {
		return err
	}

	// Process each entry
	for i := uint16(0); i < entryCount; i++ {
		// If ADDPATH type, read path identifier
		if subType == 8 || subType == 10 {
			var pathID uint32
			if err := binary.Read(reader, binary.BigEndian, &pathID); err != nil {
				return err
			}
		}

		if err := p.processRIBEntryDescriptor(reader, result, ipStr, uint32(prefixLen), subType); err != nil {
			return err
		}
	}

	return nil
}

// processRIBEntryDescriptor processes RIB entry descriptors
func (p *Processor) processRIBEntryDescriptor(reader *bytes.Reader, result *Result, prefix string, prefixLen uint32, subType uint16) error {
	// Skip peer index
	var peerIndex uint16
	if err := binary.Read(reader, binary.BigEndian, &peerIndex); err != nil {
		return err
	}

	// Skip timestamp
	var originatedTime uint32
	if err := binary.Read(reader, binary.BigEndian, &originatedTime); err != nil {
		return err
	}

	// Read attribute length
	var attrLength uint16
	if err := binary.Read(reader, binary.BigEndian, &attrLength); err != nil {
		return err
	}

	// Read attributes
	attributes := make([]byte, attrLength)
	if _, err := reader.Read(attributes); err != nil {
		return err
	}

	// Process attributes
	attrReader := bytes.NewReader(attributes)
	var asPath []uint32
	var lastAS uint32

	for attrReader.Len() > 0 {
		var flags uint8
		var typeCode uint8
		if err := binary.Read(attrReader, binary.BigEndian, &flags); err != nil {
			return err
		}
		if err := binary.Read(attrReader, binary.BigEndian, &typeCode); err != nil {
			return err
		}

		// Read length
		var length uint16
		if (flags & 0x10) != 0 {
			// Extended length
			if err := binary.Read(attrReader, binary.BigEndian, &length); err != nil {
				return err
			}
		} else {
			var l uint8
			if err := binary.Read(attrReader, binary.BigEndian, &l); err != nil {
				return err
			}
			length = uint16(l)
		}

		// Process AS_PATH attribute
		if typeCode == 2 {
			asPath = make([]uint32, 0)
			asPathData := make([]byte, length)
			if _, err := attrReader.Read(asPathData); err != nil {
				return err
			}

			asPathReader := bytes.NewReader(asPathData)
			for asPathReader.Len() > 0 {
				var segType uint8
				var segLength uint8
				if err := binary.Read(asPathReader, binary.BigEndian, &segType); err != nil {
					break
				}
				if err := binary.Read(asPathReader, binary.BigEndian, &segLength); err != nil {
					break
				}

				// Read AS number
				for i := uint8(0); i < segLength; i++ {
					var asn uint32
					if err := binary.Read(asPathReader, binary.BigEndian, &asn); err != nil {
						break
					}
					asPath = append(asPath, asn)
				}
			}

			if len(asPath) > 0 {
				lastAS = asPath[len(asPath)-1]
			}
		} else {
			// Skip other attributes
			if _, err := attrReader.Seek(int64(length), 1); err != nil {
				return err
			}
		}
	}

	// If AS path is found, add to result
	if len(asPath) > 0 {
		p.Lock()
		result.ASPaths = append(result.ASPaths, asPath)

		// Create route entry
		route := Route{
			Length: prefixLen,
		}

		if subType == 2 || subType == 8 { // IPv4
			route.IPType = "ipv4"
			ip := net.ParseIP(prefix).To4()
			if ip != nil {
				route.IPValue = binary.BigEndian.Uint32(ip)
			}
		} else { // IPv6 (type 4, 10)
			route.IPType = "ipv6"
			ip := net.ParseIP(prefix).To16()
			if ip != nil {
				high := binary.BigEndian.Uint64(ip[:8])
				low := binary.BigEndian.Uint64(ip[8:])
				route.IPValue = [4]uint32{
					uint32(high >> 32),
					uint32(high),
					uint32(low >> 32),
					uint32(low),
				}
			}
		}

		isDuplicate := false
		for _, r := range result.Advertises[lastAS] {
			if r.Length == route.Length && r.IPType == route.IPType && r.IPValue == route.IPValue {
				isDuplicate = true
				break
			}
		}

		// Only append if it's a new route
		if !isDuplicate {
			result.Advertises[lastAS] = append(result.Advertises[lastAS], route)
		}
		p.Unlock()
	}

	return nil
}

// MergeResults merges multiple processing results
func MergeResults(results chan *Result) *Result {
	merged := &Result{
		ASPaths:    make([][]uint32, 0),
		Advertises: make(map[uint32][]Route),
	}

	for result := range results {
		if result == nil {
			continue
		}

		merged.ASPaths = append(merged.ASPaths, result.ASPaths...)
		for asn, routes := range result.Advertises {
			merged.Advertises[asn] = append(merged.Advertises[asn], routes...)
		}

		if merged.Metadata == nil && result.Metadata != nil {
			merged.Metadata = result.Metadata
		}
	}

	return merged
}
