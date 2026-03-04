"""Project management sub-client."""

from __future__ import annotations

from .._cli import run
from ..models import Project


class ProjectsClient:
    """Manage projects via the ``agentsecrets project`` CLI commands."""

    def list(self) -> list[Project]:
        """List projects in the current workspace."""
        result = run("project", "list")
        return _parse_project_list(result.stdout)

    def create(self, name: str) -> None:
        """Create a new project in the current workspace."""
        run("project", "create", name)

    def use(self, name: str) -> None:
        """Switch the active project."""
        run("project", "use", name)

    def delete(self, name: str) -> None:
        """Delete a project."""
        run("project", "delete", name)


def _parse_project_list(output: str) -> list[Project]:
    """Best-effort parse of CLI project list output."""
    projects: list[Project] = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("─") or line.startswith("Name"):
            continue
        parts = line.split()
        if parts:
            projects.append(Project(id="", name=parts[0]))
    return projects
