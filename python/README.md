# AgentSecrets Python SDK

The official Python client for [AgentSecrets](https://github.com/The-17/agentsecrets) — zero-knowledge secrets infrastructure for AI agents.

## Prerequisites

Everyone who uses this SDK needs:

1. **An AgentSecrets account** — [sign up here](https://github.com/The-17/agentsecrets)
2. **The AgentSecrets CLI installed** on their machine

Install the CLI:
```bash
pip install agentsecrets
```

> Other install methods (Homebrew, npm, Go) are listed in the
> [root README](../README.md#getting-started).

Log in and set up a project:
```bash
agentsecrets init          # creates your account and encryption keys
agentsecrets project create my-project
agentsecrets secrets set MY_API_KEY=your-value-here
```

> **Why is the CLI required?**
> The CLI manages everything your code should never touch: keychain access, auth
> token refresh, and workspace context. The SDK delegates all of that to the CLI
> so that credential values never enter your Python process.

## Install

```bash
pip install agentsecrets-sdk
```

Requires Python 3.10+ and the [AgentSecrets CLI](https://github.com/The-17/agentsecrets) installed.

## Quick Start

```python
from agentsecrets import AgentSecrets

client = AgentSecrets()

# Make an authenticated API call — the SDK never sees the credential value.
response = client.call(
    "https://api.stripe.com/v1/charges",
    method="POST",
    bearer="STRIPE_SECRET_KEY",
    body={"amount": 1000, "currency": "usd", "source": "tok_visa"},
)
print(response.json())
```

## Auth Styles

| Style | SDK Parameter | Proxy Header |
|-------|--------------|--------------|
| Bearer | `bearer="KEY"` | `X-AS-Inject-Bearer` |
| Basic | `basic="KEY"` | `X-AS-Inject-Basic` |
| Header | `header={"X-Api-Key": "KEY"}` | `X-AS-Inject-Header-X-Api-Key` |
| Query | `query={"key": "KEY"}` | `X-AS-Inject-Query-key` |
| Body | `body_field={"path": "KEY"}` | `X-AS-Inject-Body-path` |
| Form | `form_field={"key": "KEY"}` | `X-AS-Inject-Form-key` |

## Async Support

```python
response = await client.async_call(
    "https://api.openai.com/v1/models",
    bearer="OPENAI_KEY",
)
```

## Process Spawning

```python
result = client.spawn(["node", "server.js"])
print(result.exit_code)
```

## Management

```python
client.secrets.list()
client.secrets.set("API_KEY", "value")
client.workspaces.list()
client.proxy.status()
client.allowlist.add("api.stripe.com")
```

## Testing

```python
from agentsecrets.testing import MockAgentSecrets

mock = MockAgentSecrets()
response = mock.call("https://api.stripe.com", bearer="KEY")

assert len(mock.calls) == 1
assert mock.calls[0].bearer == "KEY"  # Key name recorded, never the value.
```

## Development

```bash
cd python
pip install -e ".[dev]"
pytest -v
```

## License

MIT — [The Seventeen](https://github.com/The-17)
