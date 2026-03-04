"""Authentication resolution for the AgentSecrets SDK.

Resolution order:
1. Probe the proxy health endpoint → if running, use it.
2. Check ``AGENTSECRETS_TOKEN`` env var → if set, use token auth.
3. If ``auto_start`` is True, locate the binary and start the proxy.
4. Otherwise raise ``AgentSecretsNotRunning``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from .errors import AgentSecretsNotRunning, ProxyConnectionError
from .proxy import DEFAULT_PORT, auto_start, health_check, wait_for_ready


@dataclass(frozen=True)
class AuthContext:
    """Describes how the SDK is connected to AgentSecrets."""

    port: int
    project: str
    method: Literal["proxy", "token"]


def resolve(
    port: int = DEFAULT_PORT,
    *,
    auto_start_proxy: bool = True,
) -> AuthContext:
    """Determine how to connect to AgentSecrets.

    Parameters
    ----------
    port:
        Proxy port to probe (default 8765).
    auto_start_proxy:
        If ``True`` and the proxy isn't running, attempt to start it.

    Returns
    -------
    AuthContext
        Connection details for the SDK to use.

    Raises
    ------
    AgentSecretsNotRunning
        If neither the proxy nor a token is available.
    """
    # 1. Running proxy?
    try:
        status = health_check(port)
        return AuthContext(port=port, project=status.project, method="proxy")
    except ProxyConnectionError:
        pass

    # 2. Environment token?
    token = os.environ.get("AGENTSECRETS_TOKEN")
    if token:
        return AuthContext(port=port, project="", method="token")

    # 3. Auto-start?
    if auto_start_proxy:
        auto_start(port)
        status = wait_for_ready(port)
        return AuthContext(port=port, project=status.project, method="proxy")

    raise AgentSecretsNotRunning(port)
