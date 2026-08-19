#!/usr/bin/env python3
"""Regenerate the frontend's OpenAPI client and cached spec.

Picks a free port, starts the backend, waits for the OpenAPI spec endpoint to
be reachable, runs `pnpm generate:api` in the frontend, and stops the backend
cleanly on exit. The frontend's `scripts/fetch-openapi.js` reads PORT and
writes `frontend/openapi-cache/openapi.json`, which is committed so that
`pnpm build` (which runs `generate:api:build --cache-only`) needs no backend.

We poll `/api/docs/openapi.json` directly rather than `/health/readyz`: the
readiness probe can sit at HTTP 503 when a non-critical dependency is degraded
locally, even though the OpenAPI endpoint itself is perfectly usable. What we
actually care about is whether the downstream `generate:api` fetch will
succeed, so that's what we poll.

Usage:
    scripts/regenerate-openapi.py
"""

from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
LOG_DIR = ROOT / "logs"

READY_TIMEOUT_S = 120


def pick_free_port() -> int:
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def wait_for_ready(port: int, dev_proc: subprocess.Popen[bytes], timeout_s: int) -> None:
    """Poll the OpenAPI spec endpoint until it returns 200 or the deadline expires.

    Fails fast if the backend process has exited.
    """
    url = f"http://localhost:{port}/api/docs/openapi.json"
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        rc = dev_proc.poll()
        if rc is not None:
            raise RuntimeError(
                f"Backend exited before becoming ready (exit code {rc}). "
                f"See {LOG_DIR / 'regenerate-openapi-backend.log'}"
            )
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            pass
        time.sleep(1)
    raise RuntimeError(
        f"Backend did not become ready on port {port} within {timeout_s}s "
        f"(polled {url}). See {LOG_DIR / 'regenerate-openapi-backend.log'}"
    )


def stop_backend(dev_proc: subprocess.Popen[bytes]) -> None:
    if dev_proc.poll() is not None:
        return
    try:
        os.killpg(dev_proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        dev_proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(dev_proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        dev_proc.wait(timeout=5)


def start_backend(port: int, log_path: Path) -> subprocess.Popen[bytes]:
    env = {**os.environ, "PORT": str(port)}
    log_file = open(log_path, "wb")
    try:
        return subprocess.Popen(
            ["poetry", "run", "dev"],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except Exception:
        log_file.close()
        raise


def regenerate(port: int) -> int:
    env = {**os.environ, "PORT": str(port)}
    print("[frontend] pnpm generate:api", flush=True)
    result = subprocess.run(
        ["pnpm", "generate:api"],
        cwd=FRONTEND_DIR,
        env=env,
    )
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--timeout",
        type=int,
        default=READY_TIMEOUT_S,
        help="Seconds to wait for backend readiness (default: %(default)s)",
    )
    args = parser.parse_args()

    LOG_DIR.mkdir(exist_ok=True)
    backend_log = LOG_DIR / "regenerate-openapi-backend.log"

    port = pick_free_port()
    print(f"Starting backend on port {port} (log: {backend_log})", flush=True)
    dev_proc = start_backend(port, backend_log)

    try:
        wait_for_ready(port, dev_proc, args.timeout)
        print(f"Backend ready on port {port}", flush=True)
        rc = regenerate(port)
        if rc != 0:
            print("generate:api failed", file=sys.stderr)
            return rc
    finally:
        stop_backend(dev_proc)

    return 0


if __name__ == "__main__":
    sys.exit(main())
