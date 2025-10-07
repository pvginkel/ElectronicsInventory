#!/bin/bash

set -euo pipefail

# Run the testing server directly (no daemonization)
# This script is used by both testing-daemon-ctl.sh and can be run directly

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo $BACKEND_DIR

# Change to backend directory
cd "$BACKEND_DIR" || {
    echo "Error: Could not change to backend directory: $BACKEND_DIR" >&2
    exit 1
}

# Default server configuration
HOST="0.0.0.0"
PORT="5100"
USE_TEMP_SQLITE_DB=false

print_usage() {
    cat <<'EOF'
Usage: testing-server.sh [--temp-sqlite-db] [--host HOST] [--port PORT]
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --temp-sqlite-db)
            USE_TEMP_SQLITE_DB=true
            shift
            ;;
        --host)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --host requires a value." >&2
                print_usage
                exit 1
            fi
            HOST="$2"
            shift 2
            ;;
        --port)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --port requires a value." >&2
                print_usage
                exit 1
            fi
            PORT="$2"
            shift 2
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo "Error: Unknown argument: $1" >&2
            print_usage
            exit 1
            ;;
    esac
done

if $USE_TEMP_SQLITE_DB; then
    if ! command -v mktemp >/dev/null 2>&1; then
        echo "Error: --temp-sqlite-db requires the mktemp command to be available." >&2
        exit 1
    fi

    TEMP_DB_PATH="$(mktemp)"
    if [[ -z "$TEMP_DB_PATH" ]]; then
        echo "Error: Failed to create temporary SQLite database file." >&2
        exit 1
    fi

    SQLITE_DB_PATH="$TEMP_DB_PATH"
    SQLITE_DB_URL="sqlite:////${SQLITE_DB_PATH}"

    export DATABASE_URL="$SQLITE_DB_URL"
    trap 'rm -f "$SQLITE_DB_PATH"' EXIT

    echo "Using temporary SQLite database at $SQLITE_DB_PATH"
    echo
fi

# Mark the process as running in testing mode
export FLASK_ENV=testing

# Ensure the test database is clean and migrated
echo "Migrating the test database..."
echo

poetry run inventory-cli load-test-data --yes-i-am-sure

# Run the Flask server
echo
echo "Starting Electronics Inventory backend in testing mode..."
echo "Server will run on http://$HOST:$PORT"
echo "Press Ctrl+C to stop"
echo

poetry run python -m flask run --host="$HOST" --port="$PORT"
