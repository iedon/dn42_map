#!/bin/bash

# DN42 Map Index Generator
# Generates a JSON index file of all map files in the specified directory
# Output format: {"2025":{"07":["map_2025_07_30.bin"]}}

# Function to display usage
usage() {
    echo "Usage: $0 <directory> [output_file]"
    echo "  directory:    Directory containing map files (e.g., /var/www/mrt/map)"
    echo "  output_file:  Output JSON file (default: map_index.json)"
    echo ""
    echo "Example: $0 /var/www/mrt/map map_index.json"
    exit 1
}

# Check if directory argument is provided
if [ $# -lt 1 ]; then
    usage
fi

MAP_DIR="$1"
OUTPUT_FILE="${2:-map_index.json}"

# Check if directory exists
if [ ! -d "$MAP_DIR" ]; then
    echo "Error: Directory '$MAP_DIR' does not exist"
    exit 1
fi

# Create temporary file for building JSON
TEMP_FILE=$(mktemp)

echo "Scanning directory: $MAP_DIR"
echo "Output file: $OUTPUT_FILE"

# Start JSON structure
echo "{" > "$TEMP_FILE"

# Track if we need commas
first_year=true

# Process each year directory
for year_dir in "$MAP_DIR"/*; do
    if [ -d "$year_dir" ]; then
        year=$(basename "$year_dir")
        
        # Check if year is a valid 4-digit number
        if [[ "$year" =~ ^[0-9]{4}$ ]]; then
            # Add comma if not first year
            if [ "$first_year" = false ]; then
                echo "," >> "$TEMP_FILE"
            fi
            first_year=false
            
            # Start year object
            echo -n "  \"$year\": {" >> "$TEMP_FILE"
            
            first_month=true
            
            # Process each month directory within the year
            for month_dir in "$year_dir"/*; do
                if [ -d "$month_dir" ]; then
                    month=$(basename "$month_dir")
                    
                    # Check if month is a valid 2-digit number
                    if [[ "$month" =~ ^[0-9]{2}$ ]]; then
                        # Add comma if not first month
                        if [ "$first_month" = false ]; then
                            echo "," >> "$TEMP_FILE"
                        fi
                        first_month=false
                        
                        # Start month array
                        echo -n "\"$month\": [" >> "$TEMP_FILE"
                        
                        first_file=true
                        
                        # Find map files directly in the month directory
                        for map_file in "$month_dir"/map_*.bin; do
                            if [ -f "$map_file" ]; then
                                filename=$(basename "$map_file")
                                
                                # Add comma if not first file
                                if [ "$first_file" = false ]; then
                                    echo -n ", " >> "$TEMP_FILE"
                                fi
                                first_file=false
                                
                                # Add filename to array
                                echo -n "\"$filename\"" >> "$TEMP_FILE"
                            fi
                        done
                        
                        # Close month array
                        echo -n "]" >> "$TEMP_FILE"
                    fi
                fi
            done
            
            # Close year object
            echo -n "}" >> "$TEMP_FILE"
        fi
    fi
done

# Close JSON structure
echo "" >> "$TEMP_FILE"
echo "}" >> "$TEMP_FILE"

# Minify JSON (if jq is available, use it for minification)
if command -v jq >/dev/null 2>&1; then
    echo "Minifying JSON with jq..."
    jq -c . "$TEMP_FILE" > "$OUTPUT_FILE"
else
    echo "jq not available, creating unformatted JSON..."
    cp "$TEMP_FILE" "$OUTPUT_FILE"
fi

# Clean up
rm "$TEMP_FILE"

# Display results
if [ -f "$OUTPUT_FILE" ]; then
    echo "Successfully generated index file: $OUTPUT_FILE"
    
    # Count total files
    if command -v jq >/dev/null 2>&1; then
        total_files=$(jq '[.. | arrays | select(length > 0)] | add | length' "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
        echo "Total map files indexed: $total_files"
    fi
    
    echo "Done"
else
    echo "Error: Failed to create output file"
    exit 1
fi
