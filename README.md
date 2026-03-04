# AgentSecrets SDK

> Build tools and agents on zero-knowledge secrets infrastructure.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/downloads/)

---

## What This Is

The AgentSecrets SDK lets you build tools, MCP servers, and AI agents where credential values never enter your code — or the code of anyone using what you build.

```python
from agentsecrets import AgentSecrets

as_client = AgentSecrets()

response = as_client.call(
    url="https://api.stripe.com/v1/balance",
    bearer="STRIPE_KEY"
)
```

You pass a key name. The SDK resolves the value from the OS keychain, injects it at the transport layer, and returns the API response. The value is not in your code. Not as a variable. Not as a return value. Not in any log. Not in the context of any AI agent using your tool.

This is what it means to build on zero-knowledge infrastructure — not just for you, but for every user of everything you build on top of it.

---

## Why Build on This

Every secrets SDK today works the same way: retrieve the value, hand it to your code.

```python
# Every other approach
key = vault.get("STRIPE_KEY")   # sk_live_51H... is now in memory
                                 # prompt injection can reach it
                                 # malicious plugin can reach it
                                 # any agent using your tool can reach it
```

The AgentSecrets SDK has no `get()`. No `retrieve()`. The only way to use a credential is to make the call or spawn the process — and in both cases, the value never crosses into application code.

```python
# AgentSecrets SDK
as_client.call(bearer="STRIPE_KEY")   # proxy resolves from OS keychain
                                       # injects into HTTP request
                                       # returns only the API response
                                       # value never entered your code
```

When you build an MCP server, a LangChain tool, or any agent integration on this SDK, that guarantee extends to your users automatically. They get zero-knowledge credential management without knowing AgentSecrets exists.

---

## Getting Started

### 1. Create an AgentSecrets account

[Sign up at github.com/The-17/agentsecrets](https://github.com/The-17/agentsecrets)

### 2. Install the CLI

The CLI is required. It manages keychain access, auth, and workspace context —
everything the SDK deliberately doesn't touch.

```bash
# Homebrew (macOS / Linux):
brew install The-17/tap/agentsecrets

# npm (all platforms):
npm install -g @the-17/agentsecrets

# pip (all platforms):
pip install agentsecrets

# Go:
go install github.com/The-17/agentsecrets/cmd/agentsecrets@latest
```

### 3. Log in and set up your first project

```bash
agentsecrets init          # creates your account and encryption keys
agentsecrets project create my-project
agentsecrets secrets set MY_API_KEY=your-value-here
```

### 4. Install the SDK

```bash
pip install agentsecrets-sdk
```

### 5. Make your first zero-knowledge API call

```python
from agentsecrets import AgentSecrets

client = AgentSecrets()
response = client.call(
    "https://api.stripe.com/v1/balance",
    bearer="MY_API_KEY"
)
print(response.json())
```

> **If the CLI is not installed**, the SDK raises `CLINotFound` with a direct link
> to the install page. **If the proxy is not running**, it raises `AgentSecretsNotRunning`
> with the exact command to fix it. Errors are always actionable.

## Making Authenticated API Calls

Six injection styles — the same ones the AgentSecrets CLI supports.

```python
# Bearer token — Stripe, OpenAI, GitHub, most modern APIs
response = as_client.call(
    url="https://api.stripe.com/v1/charges",
    method="POST",
    body={"amount": 1000, "currency": "usd", "source": "tok_visa"},
    bearer="STRIPE_KEY"
)

# Custom header — SendGrid, Twilio, API Gateway
response = as_client.call(
    url="https://api.sendgrid.com/v3/mail/send",
    method="POST",
    body=email_payload,
    header={"X-Api-Key": "SENDGRID_KEY"}
)

# Query parameter — Google Maps, weather APIs
response = as_client.call(
    url="https://maps.googleapis.com/maps/api/geocode/json",
    query={"key": "GMAP_KEY", "address": "Lagos, Nigeria"}
)

# Basic auth — Jira, legacy REST APIs
response = as_client.call(
    url="https://yourcompany.atlassian.net/rest/api/2/issue",
    basic="JIRA_CREDS"   # stored as "user@email.com:api_token"
)

# JSON body injection
response = as_client.call(
    url="https://api.example.com/oauth/token",
    method="POST",
    body={"grant_type": "client_credentials"},
    body_field={"client_secret": "CLIENT_SECRET"}
)

# Form field injection
response = as_client.call(
    url="https://oauth.example.com/token",
    method="POST",
    form_field={"api_key": "API_KEY", "client_id": "CLIENT_ID"}
)
```

Combine multiple injection styles in one call:

```python
response = as_client.call(
    url="https://api.example.com/data",
    bearer="AUTH_TOKEN",
    header={"X-Org-ID": "ORG_SECRET"},
    query={"version": "API_VERSION"}
)
```

Async:

```python
response = await as_client.async_call(
    url="https://api.stripe.com/v1/balance",
    bearer="STRIPE_KEY"
)
```

### Response

```python
response.status_code   # 200
response.body          # Raw response body as string
response.json()        # Parsed JSON (raises if not valid JSON)
response.headers       # Response headers
response.redacted      # True if the proxy scrubbed an echoed credential
response.duration_ms   # Round-trip time in milliseconds
```

The response object has no field containing the injected credential value. This is structural.

---

## Spawning Processes With Secrets

Wrap any process and inject secrets from the OS keychain as environment variables at launch.
The calling code never sees the values. When the process exits, the secrets are gone.

```python
# Wrap the Stripe MCP server
result = as_client.spawn("stripe", ["mcp"])

# Wrap a Django dev server
result = as_client.spawn("python", ["manage.py", "runserver"])

# Use secrets from a specific project
result = as_client.spawn(
    "python", ["manage.py", "migrate"],
    project="payments-service"
)

# Run in background
proc = as_client.spawn_async("stripe", ["mcp"])

# Capture output for scripting or testing
result = as_client.spawn("python", ["manage.py", "test"], capture=True)
if result.exit_code != 0:
    print(result.stderr)
```

---

## Managing the Credentials Lifecycle

The SDK exposes the full AgentSecrets management layer from code. This is what lets an AI
agent — or any automation — manage the complete credentials lifecycle autonomously without
ever seeing a credential value.

### Status

```python
status = as_client.status()
print(status.workspace_name, status.project_name, status.last_pull)
```

### Drift Detection and Sync

```python
diff = as_client.secrets.diff()
# diff.has_drift, diff.local_only, diff.remote_only, diff.out_of_sync

if diff.has_drift:
    as_client.secrets.sync()
```

### Workspaces and Projects

```python
# List and create
as_client.workspaces.list()
as_client.workspaces.create("Acme Engineering")
as_client.projects.list()
as_client.projects.create("payments-service")

# Global switch
as_client.set_workspace("Acme Engineering")
as_client.set_project("payments-service")

# Scoped context — global state unchanged after exit
# Useful for multi-tenant tools operating across multiple workspaces
with as_client.workspace("Client A") as ws:
    response = ws.call(url="https://api.stripe.com/v1/balance", bearer="STRIPE_KEY")

with as_client.workspace("Client B") as ws:
    response = ws.call(url="https://api.stripe.com/v1/balance", bearer="STRIPE_KEY")
```

### Secrets

```python
keys = as_client.secrets.list()       # Key names only — never values
as_client.secrets.set("KEY", value)   # Provision a secret programmatically
as_client.secrets.delete("KEY")
as_client.secrets.push()              # Upload local secrets to cloud (encrypted)
as_client.secrets.sync()              # Pull cloud secrets to local keychain
```

### Audit Log

```python
logs = as_client.proxy.logs(last=10)
for event in logs:
    print(event.timestamp, event.method, event.target_url, event.status_code)

blocked = as_client.proxy.logs(last=50, status="BLOCKED")
stripe_calls = as_client.proxy.logs(secret="STRIPE_KEY")
```

Every `AuditEvent` contains timestamps, key names, endpoints, and status codes.
The struct has no value field — it is structurally impossible for a credential value
to appear in any log entry.

---

## Configuration

```python
from agentsecrets import AgentSecrets

as_client = AgentSecrets()                                        # Default
as_client = AgentSecrets(port=9000)                               # Custom proxy port
as_client = AgentSecrets(workspace="Acme", project="payments")    # Explicit context
as_client = AgentSecrets(auto_start=False)                        # No proxy auto-start
```

Environment variable overrides — read automatically, no constructor argument needed:

```bash
AGENTSECRETS_TOKEN=as_tok_live_abc123    # Service token (CI/CD, automated environments)
AGENTSECRETS_PORT=9000                   # Override proxy port
AGENTSECRETS_WORKSPACE=Acme             # Override active workspace
AGENTSECRETS_PROJECT=payments            # Override active project
```

---

## Error Handling

Every error is actionable — it tells you exactly what happened and exactly what to fix.

```python
from agentsecrets import (
    AgentSecrets,
    AgentSecretsNotRunning,
    DomainNotAllowed,
    SecretNotFound,
    UpstreamError
)

try:
    response = as_client.call(
        url="https://api.stripe.com/v1/balance",
        bearer="STRIPE_KEY"
    )
except AgentSecretsNotRunning:
    # No proxy running, no AGENTSECRETS_TOKEN found
    # Message includes install and setup instructions
    raise
except DomainNotAllowed as e:
    print(f"Add to allowlist: agentsecrets workspace allowlist add {e.domain}")
except SecretNotFound as e:
    print(f"Set the secret: agentsecrets secrets set {e.key}=<value>")
except UpstreamError as e:
    # Injection worked — the upstream API itself returned an error
    print(f"API returned {e.status_code}: {e.body}")
```

| Exception | Cause | Recovery |
|---|---|---|
| `AgentSecretsNotRunning` | No proxy, no token | `agentsecrets proxy start` or set `AGENTSECRETS_TOKEN` |
| `DomainNotAllowed` | Domain not on workspace allowlist | `agentsecrets workspace allowlist add <domain>` |
| `SecretNotFound` | Key not in active project | `agentsecrets secrets set <KEY>=<value>` |
| `ProxyConnectionError` | Proxy running but unreachable | `agentsecrets proxy status` |
| `SessionExpired` | Session TTL expired | `agentsecrets login` |
| `UpstreamError` | Upstream API error (injection succeeded) | Check upstream API docs |
| `PermissionDenied` | Insufficient workspace role | Contact workspace admin |

---

## Testing

Test without a running proxy. Test without real credentials. The zero-knowledge guarantee
holds in test mode — even mock call records have no value field.

```python
from agentsecrets.testing import MockAgentSecrets

mock = MockAgentSecrets(secrets={"STRIPE_KEY": "sk_test_mock"})

response = mock.call(
    url="https://api.stripe.com/v1/balance",
    bearer="STRIPE_KEY"
)

# Assert the right call was made
assert mock.calls[0].url == "https://api.stripe.com/v1/balance"
assert mock.calls[0].bearer == "STRIPE_KEY"

# mock.calls[0].value does not exist
# The zero-knowledge guarantee is structural, not conditional
```

---

## What You Can Build

The SDK is the foundation. These are some of the things you can build on it:

**MCP servers with no credential storage**
Build an MCP server where credential values never appear in any config file,
any environment variable, or any agent context.

**LangChain and agent framework integrations**
Give any LangChain agent, CrewAI crew, or AutoGen workflow zero-knowledge API access.
One import. Every authenticated call routes through the proxy.

**Multi-tenant developer tools**
Build tools that operate across multiple workspaces using scoped contexts.
Your users' credentials stay in their OS keychain. Your tool never holds them.

**CI/CD pipelines**
Use `AGENTSECRETS_TOKEN` to make authenticated deployment calls without credentials
in pipeline configuration files or environment variables.

---

## Contributing

```bash
git clone https://github.com/The-17/agentsecrets-sdk
cd agentsecrets-sdk/python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Found a bug? [Open an issue](https://github.com/The-17/agentsecrets-sdk/issues)
Have an idea? [Start a discussion](https://github.com/The-17/agentsecrets-sdk/discussions)

---

## Language Support

Python is the first language. Go and JavaScript are planned.

| Language | Package | Status |
|---|---|---|
| Python | `pip install agentsecrets-sdk` | 🔨 In development |
| Go | `go get github.com/The-17/agentsecrets-sdk/go` | 📋 Planned |
| JavaScript | `npm install @the-17/agentsecrets-sdk` | 📋 Planned |

---

## Links

- **AgentSecrets CLI**: [github.com/The-17/agentsecrets](https://github.com/The-17/agentsecrets)
- **ClawHub**: [clawhub.ai/SteppaCodes/agentsecrets](https://clawhub.ai/SteppaCodes/agentsecrets)
- **Security**: Report vulnerabilities to hello@theseventeen.co

---

MIT License — Built by [The Seventeen](https://github.com/The-17)