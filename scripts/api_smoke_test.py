"""Start a temporary backend and exercise critical HTTP endpoints."""

from __future__ import annotations

import json
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _request(base_url: str, method: str, path: str, body: bytes | None = None) -> Dict[str, Any]:
    request = Request(
        f"{base_url}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=5) as response:
            payload = response.read().decode("utf-8", errors="replace")
            return {
                "status": response.status,
                "body": payload,
            }
    except HTTPError as exc:
        return {
            "status": exc.code,
            "body": exc.read().decode("utf-8", errors="replace"),
        }


def _wait_for_health(base_url: str, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        try:
            response = _request(base_url, "GET", "/health")
            if response["status"] == 200:
                return
            last_error = f"unexpected status {response['status']}"
        except (URLError, OSError) as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"backend did not become healthy: {last_error}")


def main() -> int:
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "etc_sim.backend.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]

    process = subprocess.Popen(
        command,
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    checks: List[Dict[str, Any]] = []
    try:
        _wait_for_health(base_url)

        specifications = [
            ("root", "GET", "/", None, 200),
            ("health", "GET", "/health", None, 200),
            ("openapi", "GET", "/api/openapi.json", None, 200),
            ("configs-list", "GET", "/api/configs", None, 200),
            ("files-list", "GET", "/api/files/output-files", None, 200),
            ("retired-code-execution", "POST", "/api/code/execute", b'{}', 404),
            ("retired-script-execution", "POST", "/api/files/scripts/run", b'{}', 404),
            ("path-traversal", "GET", "/api/files/output-files?path=../secret", None, 400),
        ]

        for name, method, path, body, expected_status in specifications:
            response = _request(base_url, method, path, body)
            actual_status = int(response["status"])
            passed = actual_status == expected_status
            checks.append(
                {
                    "name": name,
                    "method": method,
                    "path": path,
                    "expected_status": expected_status,
                    "actual_status": actual_status,
                    "passed": passed,
                    "body": response["body"][:1000],
                }
            )
            marker = "PASS" if passed else "FAIL"
            print(
                f"[{marker}] {method:4s} {path} "
                f"expected={expected_status} actual={actual_status}"
            )

        failures = [check for check in checks if not check["passed"]]
        print(json.dumps({"checks": checks, "failed": len(failures)}, indent=2, ensure_ascii=False))
        return 1 if failures else 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

        stdout, stderr = process.communicate()
        if process.returncode not in (0, -15, 1) and stderr:
            print("--- backend stderr ---", file=sys.stderr)
            print(stderr, file=sys.stderr)
        if stdout:
            print("--- backend stdout ---")
            print(stdout)


if __name__ == "__main__":
    raise SystemExit(main())
