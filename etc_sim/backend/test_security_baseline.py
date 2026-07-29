"""Regression tests for the maintenance security baseline."""

import unittest

from etc_sim.backend.main import app
from etc_sim.backend.security import is_unsafe_relative_path


class PathValidationTests(unittest.TestCase):
    def test_allows_normal_relative_paths(self):
        self.assertFalse(is_unsafe_relative_path("run_001/data.json"))
        self.assertFalse(is_unsafe_relative_path("nested/results.csv"))
        self.assertFalse(is_unsafe_relative_path(""))

    def test_rejects_parent_directory_components(self):
        self.assertTrue(is_unsafe_relative_path("../secret.txt"))
        self.assertTrue(is_unsafe_relative_path("runs/../../secret.txt"))
        self.assertTrue(is_unsafe_relative_path(r"runs\..\secret.txt"))

    def test_rejects_absolute_and_invalid_paths(self):
        self.assertTrue(is_unsafe_relative_path("/etc/passwd"))
        self.assertTrue(is_unsafe_relative_path(r"C:\Windows\system.ini"))
        self.assertTrue(is_unsafe_relative_path("safe" + chr(0) + "unsafe"))


class RouteRegistrationTests(unittest.TestCase):
    def test_host_execution_routes_are_not_registered(self):
        route_paths = {str(getattr(route, "path", "")) for route in app.routes}

        self.assertFalse(any(path.startswith("/api/code") for path in route_paths))
        self.assertFalse(any(path.startswith("/api/files/scripts") for path in route_paths))

    def test_non_execution_file_routes_remain_available(self):
        route_paths = {str(getattr(route, "path", "")) for route in app.routes}
        self.assertIn("/api/files/output-files", route_paths)


if __name__ == "__main__":
    unittest.main()
