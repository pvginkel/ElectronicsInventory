#!/usr/bin/env bash
# Start the SSE gateway sidecar for local development.
#
# The gateway comes from the `ssegateway` npm package (a frontend
# devDependency, git+https://github.com/pvginkel/SSEGateway.git#stable) — the
# same way the Playwright harness and the production sidecar consume it. There
# is no sibling SSEGateway checkout.
#
# Ports mirror the dev defaults: the backend serves on 3001, the gateway on
# 3002, and the gateway posts events back to the backend's SSE callback.
export PORT="${SSE_GATEWAY_PORT:-3002}"
export CALLBACK_URL="${CALLBACK_URL:-http://localhost:3001/api/sse/callback}"

cd "$(dirname "$0")/../frontend"

exec node -e "require(require.resolve('ssegateway'))"
