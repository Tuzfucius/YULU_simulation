"""Unified maintenance verification entrypoint.

Run from the repository root:

    python scripts/maintenance_check.py

The runner executes independent checks even after failures. A check is skipped
only when one of its declared dependencies failed or was skipped. Results are
printed to the console and written to ``reports/maintenance_check.json``.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = REPO_ROOT / "reports"
DEFAULT_REPORT = REPORT_DIR / "maintenance_check.json"


@dataclass
class CheckResult:
    name: str
    group: str
    status: str
    duration_seconds: float
    command: Optional[List[str]] = None
    return_code: Optional[int] = None
    dependencies: Optional[List[str]] = None
    stdout: str = ""
    stderr: str = ""
    reason: str = ""


@dataclass
class Check:
    name: str
    group: str
    dependencies: Sequence[str]
    runner: Callable[[], CheckResult]


def _trim_output(value: str, limit: int = 20000) -> str:
    if len(value) <= limit:
        return value
    return value[-limit:]


def _run_command(
    name: str,
    group: str,
    command: Sequence[str],
    *,
    cwd: Path = REPO_ROOT,
    timeout: int = 300,
    dependencies: Sequence[str] = (),
) -> CheckResult:
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            list(command),
            cwd=str(cwd),
            text=True,
            capture_output=True,
            timeout=timeout,
            env=os.environ.copy(),
            check=False,
        )
        status = "passed" if completed.returncode == 0 else "failed"
        return CheckResult(
            name=name,
            group=group,
            status=status,
            duration_seconds=round(time.perf_counter() - started, 3),
            command=list(command),
            return_code=completed.returncode,
            dependencies=list(dependencies),
            stdout=_trim_output(completed.stdout),
            stderr=_trim_output(completed.stderr),
        )
    except subprocess.TimeoutExpired as exc:
        return CheckResult(
            name=name,
            group=group,
            status="failed",
            duration_seconds=round(time.perf_counter() - started, 3),
            command=list(command),
            dependencies=list(dependencies),
            stdout=_trim_output(exc.stdout or ""),
            stderr=_trim_output(exc.stderr or ""),
            reason=f"timeout after {timeout} seconds",
        )
    except OSError as exc:
        return CheckResult(
            name=name,
            group=group,
            status="failed",
            duration_seconds=round(time.perf_counter() - started, 3),
            command=list(command),
            dependencies=list(dependencies),
            reason=str(exc),
        )


def _python_version_check() -> CheckResult:
    started = time.perf_counter()
    current = sys.version_info[:3]
    required = (3, 11, 0)
    status = "passed" if current >= required else "failed"
    return CheckResult(
        name="python-version",
        group="environment",
        status=status,
        duration_seconds=round(time.perf_counter() - started, 3),
        command=[sys.executable, "--version"],
        return_code=0 if status == "passed" else 1,
        stdout=sys.version,
        reason=(
            ""
            if status == "passed"
            else f"Python 3.11+ required; current version is {current[0]}.{current[1]}.{current[2]}"
        ),
    )


def _tool_check(name: str, executable: str) -> CheckResult:
    started = time.perf_counter()
    path = shutil.which(executable)
    status = "passed" if path else "failed"
    return CheckResult(
        name=name,
        group="environment",
        status=status,
        duration_seconds=round(time.perf_counter() - started, 3),
        command=[executable, "--version"],
        return_code=0 if path else 1,
        stdout=path or "",
        reason="" if path else f"{executable} was not found on PATH",
    )


def _api_smoke_command() -> List[str]:
    return [sys.executable, "scripts/api_smoke_test.py"]


def _simulation_smoke_command() -> List[str]:
    return [sys.executable, "scripts/simulation_smoke_test.py"]


def _build_checks(include_frontend: bool) -> List[Check]:
    checks: List[Check] = [
        Check("python-version", "environment", (), _python_version_check),
        Check(
            "backend-imports",
            "environment",
            ("python-version",),
            lambda: _run_command(
                "backend-imports",
                "environment",
                [
                    sys.executable,
                    "-c",
                    "import fastapi, pydantic, numpy; import etc_sim.backend.main; import etc_sim.simulation.engine",
                ],
                dependencies=("python-version",),
            ),
        ),
        Check(
            "security-tests",
            "unit",
            ("backend-imports",),
            lambda: _run_command(
                "security-tests",
                "unit",
                [sys.executable, "-m", "unittest", "etc_sim.backend.test_security_baseline"],
                dependencies=("backend-imports",),
            ),
        ),
        Check(
            "configuration-tests",
            "unit",
            ("backend-imports",),
            lambda: _run_command(
                "configuration-tests",
                "unit",
                [sys.executable, "-m", "unittest", "etc_sim.config.test_parameters"],
                dependencies=("backend-imports",),
            ),
        ),
        Check(
            "engine-runtime-tests",
            "unit",
            ("backend-imports",),
            lambda: _run_command(
                "engine-runtime-tests",
                "unit",
                [sys.executable, "-m", "unittest", "etc_sim.simulation.test_engine_runtime"],
                dependencies=("backend-imports",),
            ),
        ),
        Check(
            "api-smoke",
            "integration",
            ("backend-imports", "security-tests", "configuration-tests"),
            lambda: _run_command(
                "api-smoke",
                "integration",
                _api_smoke_command(),
                timeout=180,
                dependencies=("backend-imports", "security-tests", "configuration-tests"),
            ),
        ),
        Check(
            "simulation-smoke",
            "integration",
            ("configuration-tests", "engine-runtime-tests"),
            lambda: _run_command(
                "simulation-smoke",
                "integration",
                _simulation_smoke_command(),
                timeout=300,
                dependencies=("configuration-tests", "engine-runtime-tests"),
            ),
        ),
    ]

    if include_frontend:
        checks.extend(
            [
                Check(
                    "node-available",
                    "environment",
                    (),
                    lambda: _tool_check("node-available", "node"),
                ),
                Check(
                    "npm-available",
                    "environment",
                    (),
                    lambda: _tool_check("npm-available", "npm"),
                ),
                Check(
                    "frontend-build",
                    "frontend",
                    ("node-available", "npm-available"),
                    lambda: _run_command(
                        "frontend-build",
                        "frontend",
                        ["npm", "run", "build"],
                        cwd=REPO_ROOT / "etc_sim" / "frontend",
                        timeout=600,
                        dependencies=("node-available", "npm-available"),
                    ),
                ),
            ]
        )

    return checks


def _dependency_failure(
    dependencies: Iterable[str],
    results_by_name: Dict[str, CheckResult],
) -> Optional[str]:
    blocked = [
        dependency
        for dependency in dependencies
        if results_by_name.get(dependency) is None
        or results_by_name[dependency].status != "passed"
    ]
    if not blocked:
        return None
    return ", ".join(blocked)


def run_checks(include_frontend: bool) -> List[CheckResult]:
    results: List[CheckResult] = []
    results_by_name: Dict[str, CheckResult] = {}

    for check in _build_checks(include_frontend):
        blocked_by = _dependency_failure(check.dependencies, results_by_name)
        if blocked_by:
            result = CheckResult(
                name=check.name,
                group=check.group,
                status="skipped",
                duration_seconds=0.0,
                dependencies=list(check.dependencies),
                reason=f"blocked by failed dependency: {blocked_by}",
            )
        else:
            print(f"\n[RUN ] {check.group}/{check.name}")
            result = check.runner()

        results.append(result)
        results_by_name[result.name] = result

        marker = {"passed": "PASS", "failed": "FAIL", "skipped": "SKIP"}[result.status]
        print(f"[{marker}] {result.group}/{result.name} ({result.duration_seconds:.3f}s)")
        if result.reason:
            print(f"       {result.reason}")
        if result.status == "failed":
            if result.stdout:
                print("--- stdout ---")
                print(result.stdout)
            if result.stderr:
                print("--- stderr ---")
                print(result.stderr)

    return results


def write_report(results: List[CheckResult], report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    summary = {
        "passed": sum(result.status == "passed" for result in results),
        "failed": sum(result.status == "failed" for result in results),
        "skipped": sum(result.status == "skipped" for result in results),
        "total": len(results),
    }
    payload = {
        "python": sys.version,
        "executable": sys.executable,
        "repository_root": str(REPO_ROOT),
        "summary": summary,
        "results": [asdict(result) for result in results],
    }
    report_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-frontend",
        action="store_true",
        help="skip Node.js and frontend build checks",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="JSON report output path",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="return a non-zero process code when any check fails",
    )
    args = parser.parse_args()

    results = run_checks(include_frontend=not args.no_frontend)
    write_report(results, args.report)

    failed = [result for result in results if result.status == "failed"]
    skipped = [result for result in results if result.status == "skipped"]

    print("\n========== Maintenance check summary ==========")
    print(f"Passed : {len(results) - len(failed) - len(skipped)}")
    print(f"Failed : {len(failed)}")
    print(f"Skipped: {len(skipped)}")
    print(f"Report : {args.report.resolve()}")

    if failed:
        print("Failed checks:")
        for result in failed:
            print(f"  - {result.group}/{result.name}")

    # Default mode is diagnostic: preserve a zero exit code so one independent
    # failure does not block the developer workflow. CI can opt into --strict.
    return 1 if args.strict and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
