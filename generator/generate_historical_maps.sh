#!/bin/bash

# Script to download and generate all historical DN42 map data
# Usage: ./generate_historical_maps.sh

set -e

BASE_URL="https://mrt.collector.dn42"
BINARY_NAME="./mapdn42"
LOG_FILE="historical_generation.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to fetch directory listing and extract years
fetch_available_years() {
    local base_url="$1"
    
    # Fetch the main directory listing and extract year directories
    curl -k -s "$base_url/" | grep -oE 'href="[0-9]{4}/"' | sed 's/href="//;s/\///;s/"//g' | sort -u
}

# Function to fetch months for a specific year
fetch_available_months() {
    local base_url="$1"
    local year="$2"
    
    # Fetch the year directory listing and extract month directories
    curl -k -s "$base_url/$year/" | grep -oE 'href="[0-9]{2}/"' | sed 's/href="//;s/\///;s/"//g' | sort -u
}

# Function to fetch files for a specific year/month
fetch_monthly_files() {
    local year_month="$1"
    local url="$BASE_URL/$year_month/"
    
    # Get all MRT files for the month
    curl -k -s "$url" | grep -oE 'href="master[46]_[0-9]{4}-[0-9]{2}-[0-9]{2}\.mrt\.bz2"' | sed 's/href="//;s/"//' | sort -u
}

# Function to extract date from filename
extract_date_from_filename() {
    local filename="$1"
    echo "$filename" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}'
}

# Function to check if binary exists
check_binary() {
    if [[ ! -f "$BINARY_NAME" ]]; then
        log_error "Binary $BINARY_NAME not found. Please build the project first."
        exit 1
    fi
    
    if [[ ! -x "$BINARY_NAME" ]]; then
        log_error "Binary $BINARY_NAME is not executable. Please check permissions."
        exit 1
    fi
}

# Function to generate map for a specific date
generate_map() {
    local date="$1"
    local year_month="$2"
    local ipv4_file="$3"
    local ipv6_file="$4"
    
    # Create output directory
    local year=$(echo "$date" | cut -d'-' -f1)
    local month=$(echo "$date" | cut -d'-' -f2)
    local output_dir="./output/$year/$month"
    local output_file="$output_dir/map_$date.bin"
    
    mkdir -p "$output_dir"
    
    # Check if output file already exists
    if [[ -f "$output_file" ]]; then
        log_warning "Output file $output_file already exists. Skipping..."
        return 0
    fi
    
    # Build URLs
    local ipv4_url="$BASE_URL/$year_month/$ipv4_file"
    local ipv6_url="$BASE_URL/$year_month/$ipv6_file"
    
    log_info "Generating map for $date"
    log_info "IPv4 URL: $ipv4_url"
    log_info "IPv6 URL: $ipv6_url"
    log_info "Output: $output_file"
    
    # Run the generator
    if "$BINARY_NAME" \
        -output_file "$output_file" \
        -ipv4_mrt_dump_url "$ipv4_url" \
        -ipv6_mrt_dump_url "$ipv6_url" \
        -disable_api; then
        log_success "Successfully generated map for $date"
        return 0
    else
        log_error "Failed to generate map for $date"
        return 1
    fi
}

# Function to process a year/month combination
process_year_month() {
    local year_month="$1"
    local year=$(echo "$year_month" | cut -d'/' -f1)
    local month=$(echo "$year_month" | cut -d'/' -f2)
    
    log_info "Processing $year_month"
    
    # Get all files for this month
    log_info "Fetching files for $year_month"
    local files=$(fetch_monthly_files "$year_month")
    
    if [[ -z "$files" ]]; then
        log_warning "No files found for $year_month"
        return 0
    fi
    
    log_info "Found $(echo "$files" | wc -l) files for $year_month"
    
    # Group files by date
    local dates=$(echo "$files" | while read -r file; do
        extract_date_from_filename "$file"
    done | sort -u)
    
    # Process each date
    while read -r date; do
        if [[ -z "$date" ]]; then
            continue
        fi
        
        # Find IPv4 and IPv6 files for this date
        local ipv4_file=$(echo "$files" | grep "master4_$date\.mrt\.bz2" | head -1)
        local ipv6_file=$(echo "$files" | grep "master6_$date\.mrt\.bz2" | head -1)
        
        if [[ -n "$ipv4_file" && -n "$ipv6_file" ]]; then
            generate_map "$date" "$year_month" "$ipv4_file" "$ipv6_file"
        else
            log_warning "Missing IPv4 or IPv6 file for $date (IPv4: $ipv4_file, IPv6: $ipv6_file)"
        fi
        
        # Small delay to be nice to the server
        sleep 1
        
    done <<< "$dates"
}

# Main execution
main() {
    log_info "Starting historical map generation"
    log_info "Base URL: $BASE_URL"
    log_info "Binary: $BINARY_NAME"
    
    # Check if binary exists
    check_binary
    
    # Get all available years first
    log_info "Discovering available years..."
    local available_years=$(fetch_available_years "$BASE_URL")
    
    if [[ -z "$available_years" ]]; then
        log_error "No years found on the MRT collector"
        exit 1
    fi
    
    log_info "Found the following years:"
    echo "$available_years" | while read -r year; do
        if [[ -n "$year" ]]; then
            log_info "  - $year"
        fi
    done
    
    # Now get all year/month combinations
    local available_dates=""
    while read -r year; do
        if [[ -z "$year" ]]; then
            continue
        fi
        
        log_info "Fetching months for year $year..."
        local months=$(fetch_available_months "$BASE_URL" "$year")
        
        if [[ -n "$months" ]]; then
            log_info "Found months for $year: $(echo "$months" | tr '\n' ' ')"
        else
            log_warning "No months found for year $year"
        fi
        
        while read -r month; do
            if [[ -z "$month" ]]; then
                continue
            fi
            
            if [[ -n "$available_dates" ]]; then
                available_dates="$available_dates"$'\n'"$year/$month"
            else
                available_dates="$year/$month"
            fi
        done <<< "$months"
        
    done <<< "$available_years"
    
    # Remove empty lines and check if we have any dates
    available_dates=$(echo "$available_dates" | grep -v '^$')
    
    if [[ -z "$available_dates" ]]; then
        log_error "No valid year/month combinations found"
        exit 1
    fi
    
    # Process each year/month
    local total_processed=0
    local total_success=0
    local total_failed=0
    
    while read -r year_month; do
        if [[ -z "$year_month" ]]; then
            continue
        fi
        
        process_year_month "$year_month"
        ((total_processed++))
        
    done <<< "$available_dates"
    
    log_success "Historical map generation completed"
    log_info "Total months processed: $total_processed"
    log_info "Check individual map files in their respective year/month directories"
}

# Handle interruption
trap 'log_error "Script interrupted by user"; exit 1' INT TERM

# Run main function
main "$@"
