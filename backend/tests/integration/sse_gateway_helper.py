"""SSE Gateway subprocess management for integration tests.

This module provides helper functions for starting and stopping the SSE Gateway
subprocess during integration tests. The gateway runs in a separate process and
is health-checked before tests begin.
"""

import logging
import signal
import subprocess
import tempfile
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)


class SSEGatewayProcess:
    """Manages SSE Gateway subprocess lifecycle for integration tests.

    Handles:
    - Starting gateway with proper environment variables
    - Health check polling with timeout
    - Graceful shutdown (SIGTERM → SIGKILL)
    - Capturing stdout/stderr for debugging
    """

    def __init__(
        self,
        callback_url: str,
        port: int,
        gateway_script: str = "/work/ssegateway/scripts/run-gateway.sh",
        health_check_url: str | None = None,
        startup_timeout: float = 10.0,
        health_check_interval: float = 0.5,
        shutdown_timeout: float = 5.0,
    ):
        """Initialize SSE Gateway process manager.

        Args:
            callback_url: Full callback URL including secret (e.g., http://localhost:5000/api/sse/callback?secret=test-secret)
            port: Port for gateway to listen on
            gateway_script: Path to run-gateway.sh script
            health_check_url: URL to poll for readiness (defaults to http://localhost:{port}/readyz)
            startup_timeout: Total timeout for startup health checks (seconds)
            health_check_interval: Interval between health check attempts (seconds)
            shutdown_timeout: Grace period for SIGTERM before SIGKILL (seconds)
        """
        self.callback_url = callback_url
        self.port = port
        self.gateway_script = gateway_script
        self.health_check_url = health_check_url or f"http://localhost:{port}/readyz"
        self.startup_timeout = startup_timeout
        self.health_check_interval = health_check_interval
        self.shutdown_timeout = shutdown_timeout

        self.process: subprocess.Popen | None = None
        self.stdout_file: tempfile.NamedTemporaryFile | None = None
        self.stderr_file: tempfile.NamedTemporaryFile | None = None

    def start(self) -> None:
        """Start the SSE Gateway subprocess and wait for it to be ready.

        Raises:
            RuntimeError: If gateway fails to start or doesn't become ready within timeout
        """
        if self.process is not None:
            raise RuntimeError("Gateway process already started")

        # Start subprocess
        logger.info(
            f"Starting SSE Gateway on port {self.port} with callback URL: {self.callback_url}"
        )

        # Build command
        cmd = [
            self.gateway_script,
            "--callback-url", self.callback_url,
            "--port", str(self.port),
        ]

        # Create temporary files for stdout/stderr
        self.stdout_file = tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.log')
        self.stderr_file = tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.log')

        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=self.stdout_file,
                stderr=self.stderr_file,
                text=True,
            )
        except Exception as e:
            # Clean up temp files on error
            if self.stdout_file:
                self.stdout_file.close()
                Path(self.stdout_file.name).unlink(missing_ok=True)
            if self.stderr_file:
                self.stderr_file.close()
                Path(self.stderr_file.name).unlink(missing_ok=True)
            raise RuntimeError(f"Failed to start SSE Gateway subprocess: {e}") from e

        # Wait for gateway to be ready
        logger.info(f"Polling {self.health_check_url} for readiness...")
        start_time = time.perf_counter()
        last_error: Exception | None = None

        while time.perf_counter() - start_time < self.startup_timeout:
            # Check if process crashed
            if self.process.poll() is not None:
                raise RuntimeError(
                    f"SSE Gateway process exited with code {self.process.returncode} "
                    f"during startup.\nStdout: {self._get_stdout()}\nStderr: {self._get_stderr()}"
                )

            # Try health check
            try:
                response = requests.get(self.health_check_url, timeout=1.0)
                if response.status_code == 200:
                    logger.info(f"SSE Gateway ready after {time.perf_counter() - start_time:.2f}s")
                    return
                else:
                    last_error = RuntimeError(f"Health check returned {response.status_code}")
            except requests.RequestException as e:
                last_error = e

            time.sleep(self.health_check_interval)

        # Timeout reached
        self.stop()  # Clean up

        raise RuntimeError(
            f"SSE Gateway did not become ready within {self.startup_timeout}s. "
            f"Last error: {last_error}\n"
            f"Stdout: {self._get_stdout()}\nStderr: {self._get_stderr()}"
        )

    def stop(self) -> None:
        """Stop the SSE Gateway subprocess gracefully.

        Sends SIGTERM, waits for shutdown_timeout, then sends SIGKILL if needed.
        """
        if self.process is None:
            return

        # Check if already stopped
        if self.process.poll() is not None:
            logger.debug(f"SSE Gateway already stopped (exit code: {self.process.returncode})")
            self._cleanup_temp_files()
            return

        # Send SIGTERM
        logger.info(f"Stopping SSE Gateway (PID {self.process.pid})...")
        try:
            self.process.send_signal(signal.SIGTERM)
        except ProcessLookupError:
            # Already dead
            self._cleanup_temp_files()
            return

        # Wait for graceful shutdown
        try:
            self.process.wait(timeout=self.shutdown_timeout)
            logger.info(f"SSE Gateway stopped gracefully (exit code: {self.process.returncode})")
        except subprocess.TimeoutExpired:
            # Force kill
            logger.warning(
                f"SSE Gateway did not stop within {self.shutdown_timeout}s, sending SIGKILL"
            )
            self.process.kill()
            self.process.wait()
            logger.info(f"SSE Gateway killed (exit code: {self.process.returncode})")

        self._cleanup_temp_files()

    def _cleanup_temp_files(self) -> None:
        """Clean up temporary log files."""
        if self.stdout_file:
            try:
                self.stdout_file.close()
                Path(self.stdout_file.name).unlink(missing_ok=True)
            except Exception as e:
                logger.debug(f"Failed to clean up stdout file: {e}")
            self.stdout_file = None

        if self.stderr_file:
            try:
                self.stderr_file.close()
                Path(self.stderr_file.name).unlink(missing_ok=True)
            except Exception as e:
                logger.debug(f"Failed to clean up stderr file: {e}")
            self.stderr_file = None

    def _get_stdout(self) -> str:
        """Get captured stdout as string."""
        if not self.stdout_file:
            return ""

        try:
            # Flush the file to ensure all buffered data is written
            self.stdout_file.flush()
            # Read from beginning of file
            with open(self.stdout_file.name) as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read stdout: {e}")
            return ""

    def _get_stderr(self) -> str:
        """Get captured stderr as string."""
        if not self.stderr_file:
            return ""

        try:
            # Flush the file to ensure all buffered data is written
            self.stderr_file.flush()
            # Read from beginning of file
            with open(self.stderr_file.name) as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read stderr: {e}")
            return ""

    def get_base_url(self) -> str:
        """Get base URL for the running gateway."""
        return f"http://localhost:{self.port}"

    def print_logs(self) -> None:
        """Print captured stdout and stderr logs."""
        stdout = self._get_stdout()
        stderr = self._get_stderr()
        if stdout:
            print(f"\n===== SSE Gateway STDOUT =====\n{stdout}")
        if stderr:
            print(f"\n===== SSE Gateway STDERR =====\n{stderr}")
