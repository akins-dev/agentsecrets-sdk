"""Tests for the data models."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from agentsecrets.models import (
    AgentSecretsResponse,
    AuditEvent,
    DiffResult,
    SecretKey,
    SpawnResult,
    Workspace,
)


class TestAgentSecretsResponse:
    """The core response model."""

    def test_has_no_value_field(self) -> None:
        """Zero-knowledge: the response structurally cannot carry a credential."""
        resp = AgentSecretsResponse(
            status_code=200,
            headers={"Content-Type": "application/json"},
            body=b'{"ok": true}',
        )
        assert not hasattr(resp, "value")

    def test_json_parsing(self) -> None:
        body = json.dumps({"amount": 1000}).encode()
        resp = AgentSecretsResponse(status_code=200, headers={}, body=body)
        assert resp.json() == {"amount": 1000}

    def test_text_property(self) -> None:
        resp = AgentSecretsResponse(status_code=200, headers={}, body=b"hello")
        assert resp.text == "hello"

    def test_frozen(self) -> None:
        resp = AgentSecretsResponse(status_code=200, headers={}, body=b"")
        with pytest.raises(AttributeError):
            resp.status_code = 500  # type: ignore[misc]


class TestAuditEvent:
    """The audit log entry model."""

    def test_has_no_value_field(self) -> None:
        """Zero-knowledge: audit events never carry credential values."""
        event = AuditEvent(
            timestamp=datetime.now(timezone.utc),
            secret_keys=["STRIPE_KEY"],
            method="POST",
            target_url="https://api.stripe.com/v1/charges",
            auth_styles=["bearer"],
            status_code=200,
            duration_ms=342,
            status="OK",
        )
        assert not hasattr(event, "value")
        assert not hasattr(event, "secret_value")

    def test_frozen(self) -> None:
        event = AuditEvent(
            timestamp=datetime.now(timezone.utc),
            secret_keys=[],
            method="GET",
            target_url="",
            auth_styles=[],
            status_code=200,
            duration_ms=0,
            status="OK",
        )
        with pytest.raises(AttributeError):
            event.status_code = 500  # type: ignore[misc]


class TestOtherModels:
    """Smoke tests for remaining models."""

    def test_secret_key_has_no_value_field(self) -> None:
        key = SecretKey(key="API_KEY")
        assert not hasattr(key, "value")

    def test_workspace_creation(self) -> None:
        ws = Workspace(id="ws-123", name="My Workspace", type="team", role="admin")
        assert ws.name == "My Workspace"

    def test_diff_result_defaults(self) -> None:
        diff = DiffResult(has_drift=False)
        assert diff.local_only == []
        assert diff.remote_only == []

    def test_spawn_result_defaults(self) -> None:
        result = SpawnResult(exit_code=0)
        assert result.stdout == ""
        assert result.stderr == ""
