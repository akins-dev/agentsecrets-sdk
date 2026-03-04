"""Workspace management sub-client."""

from __future__ import annotations

from .._cli import run
from ..models import Member, Workspace


class WorkspacesClient:
    """Manage workspaces via the ``agentsecrets workspace`` CLI commands."""

    def list(self) -> list[Workspace]:
        """List all workspaces the current user has access to."""
        result = run("workspace", "list")
        # The CLI outputs a formatted table. We return raw text for now;
        # richer parsing can be added once the CLI gains --json support.
        return _parse_workspace_list(result.stdout)

    def create(self, name: str) -> None:
        """Create a new workspace."""
        run("workspace", "create", name)

    def switch(self, name: str) -> None:
        """Switch the active workspace."""
        run("workspace", "switch", name)

    def invite(self, email: str, *, role: str = "member") -> None:
        """Invite a user to the current workspace."""
        run("workspace", "invite", email, "--role", role)

    def remove(self, email: str) -> None:
        """Remove a member from the current workspace."""
        run("workspace", "remove", email)

    def promote(self, email: str) -> None:
        """Promote a member to admin."""
        run("workspace", "promote", email)

    def demote(self, email: str) -> None:
        """Demote an admin to member."""
        run("workspace", "demote", email)

    def members(self) -> list[Member]:
        """List members of the current workspace."""
        result = run("workspace", "members")
        return _parse_member_list(result.stdout)


# ---------------------------------------------------------------------------
# Output parsers — intentionally simple; will improve with CLI --json support
# ---------------------------------------------------------------------------

def _parse_workspace_list(output: str) -> list[Workspace]:
    """Best-effort parse of CLI workspace list output."""
    workspaces: list[Workspace] = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("─") or line.startswith("Name"):
            continue
        parts = line.split()
        if parts:
            workspaces.append(Workspace(id="", name=parts[0]))
    return workspaces


def _parse_member_list(output: str) -> list[Member]:
    """Best-effort parse of CLI members output."""
    members: list[Member] = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("─") or line.startswith("Email"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            members.append(Member(email=parts[0], role=parts[1]))
    return members
