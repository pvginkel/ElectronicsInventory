#!/bin/bash

# Testing daemon control script for Playwright integration
# Usage: ./testing-daemon-ctl.sh start|stop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
TMP_DIR="$BACKEND_DIR/tmp"
PID_FILE="$TMP_DIR/inventory-backend.pid"
LOG_FILE="$TMP_DIR/inventory-backend.log"

start_daemon() {
    echo "Starting Electronics Inventory backend in testing mode..."

    # Ensure tmp directory exists
    mkdir -p "$TMP_DIR"

    # Check if already running
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Backend already running with PID $PID"
            exit 1
        else
            # Stale PID file, remove it
            rm -f "$PID_FILE"
        fi
    fi

    # Start the Flask dev server in background using the testing-server.sh script
    echo "Starting Flask development server..."
    "$SCRIPT_DIR/testing-server.sh" > "$LOG_FILE" 2>&1 &

    # Get the PID of the background process
    FLASK_PID=$!

    # Store PID for later shutdown
    echo "$FLASK_PID" > "$PID_FILE"

    echo "Backend started with PID $FLASK_PID"
    echo "Logs available at: $LOG_FILE"
    echo "Use /api/health/readyz to check when ready"

    # Give it a moment to start
    sleep 2

    # Check if process is still running
    if ! kill -0 "$FLASK_PID" 2>/dev/null; then
        echo "Error: Backend process failed to start"
        rm -f "$PID_FILE"
        echo "Check logs at: $LOG_FILE"
        exit 1
    fi

    echo "Backend daemon started successfully"
}

stop_daemon() {
    echo "Stopping Electronics Inventory backend..."

    if [ ! -f "$PID_FILE" ]; then
        echo "PID file not found. Backend may not be running."
        exit 1
    fi

    PID=$(cat "$PID_FILE")

    # Check if process is running
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Process with PID $PID not found"
        rm -f "$PID_FILE"
        exit 1
    fi

    # Send SIGTERM for graceful shutdown
    echo "Sending SIGTERM to PID $PID..."
    kill -TERM "$PID"

    # Wait for graceful shutdown
    TIMEOUT=30
    COUNT=0
    while kill -0 "$PID" 2>/dev/null && [ $COUNT -lt $TIMEOUT ]; do
        sleep 1
        COUNT=$((COUNT + 1))
        echo -n "."
    done
    echo

    # Check if process is still running
    if kill -0 "$PID" 2>/dev/null; then
        echo "Process still running after ${TIMEOUT}s, sending SIGKILL..."
        kill -KILL "$PID"
        sleep 2
    fi

    # Verify process stopped
    if kill -0 "$PID" 2>/dev/null; then
        echo "Error: Could not stop backend process"
        exit 1
    fi

    # Clean up PID file
    rm -f "$PID_FILE"

    echo "Backend stopped successfully"
}

status_daemon() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Backend is not running (no PID file)"
        exit 1
    fi

    PID=$(cat "$PID_FILE")

    if kill -0 "$PID" 2>/dev/null; then
        echo "Backend is running with PID $PID"
        if [ -f "$LOG_FILE" ]; then
            echo "Logs available at: $LOG_FILE"
        fi
        exit 0
    else
        echo "Backend is not running (stale PID file)"
        rm -f "$PID_FILE"
        exit 1
    fi
}

# Main script logic
case "${1:-}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    status)
        status_daemon
        ;;
    restart)
        if [ -f "$PID_FILE" ]; then
            stop_daemon
        fi
        sleep 1
        start_daemon
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        echo
        echo "Commands:"
        echo "  start   - Start the backend in testing mode"
        echo "  stop    - Stop the running backend"
        echo "  status  - Check if backend is running"
        echo "  restart - Stop and start the backend"
        echo
        echo "Environment:"
        echo "  FLASK_ENV=testing is set automatically"
        echo "  Backend runs on http://0.0.0.0:5100"
        echo "  Use /api/health/readyz to check readiness"
        exit 1
        ;;
esac