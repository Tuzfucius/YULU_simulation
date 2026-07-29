"""Security helpers shared by the FastAPI application.

This module intentionally contains only small, dependency-free checks so it can
be imported by API modules and regression tests without initializing the full
application.
"""

from __future__ import annotations

from pathlib import PurePosixPath
import re

_WINDOWS_DRIVE_PATH = re.compile(r"^[A-Za-z]:[/\\]")


def is_unsafe_relative_path(value: str | None) -> bool:
    """Return whether a user supplied path can escape its expected root.

    API paths must be relative resource paths. Absolute POSIX paths, Windows
    drive paths, NUL bytes and parent-directory components are rejected before
    an endpoint performs any filesystem access.
    """
    if value is None or value == "":
        return False

    if "\x00" in value:
        return True

    normalized = value.replace("\\", "/")
    if normalized.startswith("/") or _WINDOWS_DRIVE_PATH.match(value):
        return True

    return ".." in PurePosixPath(normalized).parts
