# DN42 Map Generator for Map.dn42

This is a DN42 network topology map generator written in Go. It reads data from MRT-format routing table dump files and generates a Protocol Buffers format graph data file, which can be used by the frontend `src` to display the network topology.

## Features

- Concurrent downloading and processing of MRT files
- Efficient MRT parsing
- Data serialization using Protocol Buffers
- Supports both IPv4 and IPv6 addresses
- Caches ASN description information to improve performance

## Dependencies

- Go 1.23 or later
- Protocol Buffers compiler (`protoc`)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/iedon/dn42_map.git
   cd dn42_map/generator
   ```

2. Install dependencies:

   ```bash
   go mod download
   ```

3. Compile the Protocol Buffers file:
   ```bash
   cd proto
   protoc --go_out=. --go_opt=paths=source_relative ./graph.proto
   ```

4. Build the project:

   ```bash
   go build -o mapdn42
   ```

## Usage

```bash
./mapdn42 [flags]
```

Authentication information can be set via environment variables:

- `MRT_BASIC_AUTH_USER`: Basic authentication username for the MRT server
- `MRT_BASIC_AUTH_PASSWORD`: Basic authentication password for the MRT server

## Performance Optimization

1. **Concurrent Processing using Goroutines**

   - Concurrently download MRT files
   - Concurrently process MRT data
   - Concurrently retrieve ASN descriptions

2. **Memory Optimization**

   - Use `sync.Map` to cache ASN descriptions
   - Efficient memory allocation and reuse
   - Use `bytes.Reader` for efficient binary data reading

3. **Performance Enhancements**
   - Use `bufio.Scanner` for efficient file reading
   - Use maps for fast lookups and deduplication
   - Optimized data structure design
