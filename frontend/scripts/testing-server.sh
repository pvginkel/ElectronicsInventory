#!/bin/bash

# Frontend testing server script for Playwright integration
# Runs Vite in foreground with test mode enabled

set -e

echo "Starting frontend testing server..." >&2
echo "Setting VITE_TEST_MODE=true" >&2

# Set test mode environment variable and start dev server
export VITE_TEST_MODE=true
export VITE_API_BASE_URL=http://localhost:5100
exec pnpm dev --port 3100