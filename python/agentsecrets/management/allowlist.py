"""Allowlist management sub-client."""

from __future__ import annotations

from .._cli import run
from ..models import AllowlistEntry


class AllowlistClient:
    """Manage the workspace domain allowlist via CLI commands."""

    def list(self) -> list[AllowlistEntry]:
        """List allowed domains for the current workspace."""
        result = run("workspace", "allowlist", "list")
        return _parse_allowlist(result.stdout)

    def add(self, *domains: str) -> None:
        """Add one or more domains to the allowlist."""
        if not domains:
            return
        run("workspace", "allowlist", "add", *domains)

    def remove(self, domain: str) -> None:
        """Remove a domain from the allowlist."""
        run("workspace", "allowlist", "remove", domain)

    def log(self) -> str:
        """View the allowlist audit log (raw CLI output)."""
        result = run("workspace", "allowlist", "log")
        return result.stdout


def _parse_allowlist(output: str) -> list[AllowlistEntry]:
    """Best-effort parse of CLI allowlist output."""
    entries: list[AllowlistEntry] = []
    for line in output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("─") or line.startswith("Domain"):
            continue
        if line:
            entries.append(AllowlistEntry(domain=line.split()[0]))
    return entries
