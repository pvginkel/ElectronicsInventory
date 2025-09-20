#!/bin/bash

# Run the testing server directly (no daemonization)
# This script is used by both testing-daemon-ctl.sh and can be run directly

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Change to backend directory
cd "$BACKEND_DIR" || {
    echo "Error: Could not change to backend directory: $BACKEND_DIR" >&2
    exit 1
}

# Set testing environment
export FLASK_ENV=testing
export FLASK_DEBUG=false
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/electronics_inventory_test
export CORS_ORIGINS='["http://localhost:3100", "http://wrkdev:3100"]'

# Run the Flask server
echo "Starting Electronics Inventory backend in testing mode..."
echo "Server will run on http://0.0.0.0:5100"
echo "Press Ctrl+C to stop"

poetry run python -m flask run --host=0.0.0.0 --port=5100