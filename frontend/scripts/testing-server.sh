#!/bin/bash

# Frontend testing server script for Playwright integration
# Runs Vite in foreground with test mode enabled

set -e

echo "Starting frontend testing server..." >&2
echo "Setting VITE_TEST_MODE=true" >&2

# Ensure the dev server proxies API calls to the Playwright backend
if [ -z "${BACKEND_URL:-}" ]; then
  export BACKEND_URL=http://localhost:5100
  echo "Using default BACKEND_URL=${BACKEND_URL}" >&2
else
  echo "Using BACKEND_URL=${BACKEND_URL}" >&2
fi

# Set test mode environment variable and start dev server
export VITE_TEST_MODE=true
exec pnpm dev --port 3100
