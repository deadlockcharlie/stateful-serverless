#!/bin/bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <input-file>"
    echo "Example: $0 ../testing/lipsum1000.txt"
    exit 1
fi

input_file="$1"

# Check if input file exists
if [ ! -f "$input_file" ]; then
    echo "Error: Input file '$input_file' not found"
    exit 1
fi

echo "Starting y-websocket-server..."
HOST=0.0.0.0 PORT=1234 node ./node_modules/y-websocket-server-pncounter/src/server.js > provider.log 2>&1 &
provider_pid=$!

# Function to clean up background processes
cleanup() {
    echo "Cleaning up..."
    if kill -0 "$provider_pid" 2>/dev/null; then
        echo "Stopping y-websocket-server (PID: $provider_pid)"
        kill "$provider_pid"
        wait "$provider_pid" 2>/dev/null || true
    fi
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Wait for provider to start
echo "Waiting for provider to start..."
sleep 3

# Check if provider is still running
if ! kill -0 "$provider_pid" 2>/dev/null; then
    echo "Error: Provider failed to start. Check provider.log"
    cat provider.log
    exit 1
fi

echo "Provider started successfully. Running orchestrator..."
echo "Input file: $input_file"

# Run the orchestrator
python3 orchestrator.py "$input_file"

echo "Word count completed successfully!"
