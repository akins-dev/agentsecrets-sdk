# AgentSecrets — JavaScript/TypeScript SDK

> Build tools and agents on zero-knowledge secrets infrastructure.

[![npm](https://img.shields.io/npm/v/@the-17/agentsecrets-sdk)](https://www.npmjs.com/package/@the-17/agentsecrets-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node 18+](https://img.shields.io/badge/node-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**Website:** [agentsecrets.com](https://agentsecrets.com) &nbsp;|&nbsp;
**Docs:** [docs.agentsecrets.com](https://docs.agentsecrets.com) &nbsp;|&nbsp;
**CLI:** [github.com/The-17/agentsecrets](https://github.com/The-17/agentsecrets) &nbsp;|&nbsp;
**Security:** [hello@theseventeen.co](mailto:hello@theseventeen.co)

---

## What This Is

A TypeScript SDK that lets your code make authenticated API calls without ever holding a credential value. You pass a key name. The proxy resolves the real value from your OS keychain, injects it into the outbound request, and returns only the API response. The value never enters your process.

No `.env` files. No `process.env`. No `vault.get()`. Just: make the call.

---

## Prerequisites

You need the AgentSecrets CLI installed and a proxy running before using this SDK.
Full setup guide: [github.com/The-17/agentsecrets](https://github.com/The-17/agentsecrets)

```bash
# 1. Install the CLI (pick one)
pip install agentsecrets
npm install -g @the-17/agentsecrets
curl -sSL https://get.agentsecrets.com | sh

# 2. Create your account (first time only)
agentsecrets init

# 3. Create a workspace if you don't have one, or skip if one already exists
agentsecrets workspace create my-workspace

# 4. Create a project
agentsecrets project create my-app

# 5. Add your secrets (the one time values enter your terminal)
agentsecrets secrets set STRIPE_KEY=sk_live_...
agentsecrets secrets set OPENAI_KEY=sk-proj-...
agentsecrets secrets set GITHUB_TOKEN=ghp_...

# 6. Start the proxy (keep this running in a separate terminal)
agentsecrets proxy start
# → Proxy running at localhost:8765
```

---

## Install

```bash
npm install @the-17/agentsecrets-sdk
```

---

## Understanding TypeScript Generics in This SDK

Throughout this SDK you'll see calls like:

```typescript
const response = await client.call<{ login: string; public_repos: number }>({
  url: "https://api.github.com/user",
  bearer: "GITHUB_TOKEN",
});
```

The `<{ login: string; public_repos: number }>` part is a **TypeScript generic type parameter** — it tells the SDK what shape you expect the API to return. It has no effect at runtime. Its purpose is purely to give you type safety on `response.json()`:

```typescript
// Without the generic — TypeScript doesn't know the shape
const response = await client.call({ url: "...", bearer: "KEY" });
const data = response.json(); // type: unknown — no autocomplete, no type checking

// With the generic — TypeScript knows exactly what's in the response
const response = await client.call<{ login: string; public_repos: number }>({
  url: "...",
  bearer: "KEY",
});
const data = response.json(); // type: { login: string; public_repos: number }
data.login;        // ✅ TypeScript knows this exists
data.public_repos; // ✅ TypeScript knows this exists
data.nonexistent;  // ❌ TypeScript error — doesn't exist on the type
```

You can always omit it if you don't need type safety on the response:

```typescript
// This is valid — response.json() returns unknown
const response = await client.call({ url: "...", bearer: "KEY" });
```

---

## Full Working Example

This is the complete picture — every feature of the SDK in one flow.

```typescript
import {
  AgentSecrets,
  AgentSecretsNotRunning,
  SecretNotFound,
  DomainNotAllowed,
} from "@the-17/agentsecrets-sdk";
import { MockAgentSecrets } from "@the-17/agentsecrets-sdk/testing";

// ── 1. Instantiate ────────────────────────────────────────────────────────────

const client = new AgentSecrets();
// Options:
// const client = new AgentSecrets({
//   port: 9000,         // custom proxy port (default: 8765 or AGENTSECRETS_PORT)
//   autoStart: false,   // don't auto-start proxy if not running (default: true)
//   workspace: "prod",  // active workspace (default: AGENTSECRETS_WORKSPACE)
//   project: "my-app",  // active project   (default: AGENTSECRETS_PROJECT)
// });


// ── 2. Health check ───────────────────────────────────────────────────────────

const running = await client.isProxyRunning(); // true | false
const status  = await client.proxyStatus();
// → { running: true, port: 8765, project: "my-app" }

if (!running) {
  console.error("Run: agentsecrets proxy start");
  process.exit(1);
}


// ── 3. Bearer token call ──────────────────────────────────────────────────────
// Used by: Stripe, OpenAI, GitHub, and most REST APIs.
//
// The generic <{ available: ... }> tells TypeScript what shape to expect from
// response.json(). It has no effect at runtime — omit it if you don't need it.

const balance = await client.call<{ available: Array<{ amount: number; currency: string }> }>({
  url: "https://api.stripe.com/v1/balance",
  bearer: "STRIPE_KEY",   // key name — proxy resolves the real value
});

console.log(balance.statusCode);          // 200
console.log(balance.json().available);    // [{ amount: 10000, currency: "usd" }]
console.log(balance.text);               // raw response string
console.log(balance.durationMs);         // 212
console.log(balance.redacted);           // false


// ── 4. POST with JSON body ────────────────────────────────────────────────────
// Objects are JSON-serialised automatically. Content-Type is set to
// application/json unless you override it.

const completion = await client.call<{ choices: Array<{ message: { content: string } }> }>({
  url: "https://api.openai.com/v1/chat/completions",
  method: "POST",
  bearer: "OPENAI_KEY",
  body: {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Say hello." }],
    max_tokens: 20,
  },
});
console.log(completion.json().choices[0]?.message.content); // "Hello!"


// ── 5. POST with form-encoded body (Stripe, OAuth) ────────────────────────────
// String bodies are forwarded verbatim — not JSON-serialised.
// Set Content-Type manually when using non-JSON formats.

const customer = await client.call<{ id: string; email: string }>({
  url: "https://api.stripe.com/v1/customers",
  method: "POST",
  bearer: "STRIPE_KEY",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "email=user@example.com&description=SDK+test", // string — sent verbatim
});
console.log(customer.json().id); // "cus_..."


// ── 6. Custom header injection (SendGrid, AWS API Gateway) ────────────────────
// header is a Record<string, string> — key is the header name, value is the
// secret key name. The proxy injects: X-Api-Key: <resolved value>

const email = await client.call({
  url: "https://api.sendgrid.com/v3/mail/send",
  method: "POST",
  header: { "X-Api-Key": "SENDGRID_KEY" },
  body: {
    personalizations: [{ to: [{ email: "user@example.com" }] }],
    from: { email: "you@yourdomain.com" },
    subject: "Hello",
    content: [{ type: "text/plain", value: "Hello." }],
  },
});


// ── 7. Query parameter injection (Google Maps, weather APIs) ─────────────────
// query is a Record<string, string> — key is the param name, value is the
// secret key name. The proxy injects: ?key=<resolved value>

const geocode = await client.call({
  url: "https://maps.googleapis.com/maps/api/geocode/json?address=New+York",
  query: { key: "GMAP_KEY" },
});


// ── 8. Basic auth injection (Jira, legacy REST) ───────────────────────────────
// basic is a string — the secret key name holding "username:password".
// The proxy injects: Authorization: Basic <base64(username:password)>

const issue = await client.call({
  url: "https://yourorg.atlassian.net/rest/api/2/issue/PROJ-1",
  basic: "JIRA_CREDS",
});


// ── 9. Body field injection ───────────────────────────────────────────────────
// bodyField is a Record<string, string> — key is the JSON field path,
// value is the secret key name. The proxy injects the value into the body.

const dbResult = await client.call({
  url: "https://api.example.com/v1/query",
  method: "POST",
  bodyField: { api_key: "MY_KEY" },
  body: { query: "SELECT *" },
});


// ── 10. Form field injection ──────────────────────────────────────────────────
// Like bodyField but for form-encoded bodies.

const formResult = await client.call({
  url: "https://api.example.com/v1/auth",
  method: "POST",
  formField: { token: "SERVICE_TOKEN" },
});


// ── 11. Custom request headers ────────────────────────────────────────────────
// headers are forwarded as-is alongside the injected credential headers.
// Use for non-auth headers: Accept, API version, content negotiation, etc.

const github = await client.call<{ login: string; public_repos: number }>({
  url: "https://api.github.com/user",
  bearer: "GITHUB_TOKEN",
  headers: {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});


// ── 12. Agent ID for audit logging ────────────────────────────────────────────
// Attach an identifier to a call so it appears in the proxy audit log.
// Useful when multiple agents share the same proxy.

const auditedCall = await client.call({
  url: "https://api.stripe.com/v1/balance",
  bearer: "STRIPE_KEY",
  agentId: "billing-agent-v2",
});


// ── 13. Per-call timeout ──────────────────────────────────────────────────────

const slowCall = await client.call({
  url: "https://api.example.com/slow-endpoint",
  bearer: "MY_KEY",
  timeout: 60_000, // 60 seconds for this call only
});


// ── 14. One-shot CLI call via spawn() ────────────────────────────────────────
//
// spawn() wraps `agentsecrets call` directly, passing your command array as
// CLI flags. The CLI resolves credentials from the OS keychain without ever
// exposing the values. Prefer client.call() for most use cases — spawn() is
// for scripting contexts or when you need the raw CLI output.

// Equivalent to: agentsecrets call --url https://api.stripe.com/v1/balance --bearer STRIPE_KEY
const curlResult = await client.spawn({
  command: ["--url", "https://api.stripe.com/v1/balance", "--bearer", "STRIPE_KEY"],
});
console.log(curlResult.exitCode); // 0
console.log(curlResult.stdout);   // Stripe JSON response

// POST with body via CLI
const postResult = await client.spawn({
  command: [
    "--url", "https://api.openai.com/v1/chat/completions",
    "--method", "POST",
    "--bearer", "OPENAI_KEY",
    "--body", JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] }),
  ],
});


// ── 15. Temporary workspace/project switch ────────────────────────────────────
// withWorkspace() and withProject() switch context, run your function,
// then restore the previous context automatically.

await client.withWorkspace("production", async () => {
  const prodBalance = await client.call({
    url: "https://api.stripe.com/v1/balance",
    bearer: "STRIPE_KEY_PROD",
  });
  console.log("Prod balance:", prodBalance.json());
});
// Workspace restored to previous after the block exits


// ── 16. Error handling ────────────────────────────────────────────────────────

try {
  await client.call({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY" });
} catch (err) {
  if (err instanceof AgentSecretsNotRunning) {
    // err.port    → 8765
    // err.fixHint → "agentsecrets proxy start"
    console.error(err.message);

  } else if (err instanceof SecretNotFound) {
    // err.key     → "STRIPE_KEY"
    // err.fixHint → "agentsecrets secrets set STRIPE_KEY=VALUE"
    console.error(err.message);

  } else if (err instanceof DomainNotAllowed) {
    // err.domain  → "api.stripe.com"
    // err.fixHint → "agentsecrets workspace allowlist add api.stripe.com"
    console.error(err.message);
  }
}


// ── 17. Mock client for testing ───────────────────────────────────────────────
// MockAgentSecrets is a drop-in replacement for AgentSecrets in unit tests.
// It records every call() and spawn() without touching the proxy or keychain.

const mock = new MockAgentSecrets();
await mock.call({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY" });

console.log(mock.calls.length);    // 1
console.log(mock.calls[0]?.url);   // "https://api.stripe.com/v1/balance"
console.log(mock.calls[0]?.bearer); // "STRIPE_KEY" — key name only, never value

// Custom mock response:
// const mock = new MockAgentSecrets({
//   defaultResponse: new AgentSecretsResponse({
//     statusCode: 200,
//     headers: {},
//     body: new TextEncoder().encode('{"balance": 100}'),
//   }),
// });
```

---

## API Reference

### `new AgentSecrets(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `8765` or `AGENTSECRETS_PORT` | Proxy port |
| `autoStart` | `boolean` | `true` | Auto-start proxy if not running |
| `workspace` | `string` | `AGENTSECRETS_WORKSPACE` | Active workspace |
| `project` | `string` | `AGENTSECRETS_PROJECT` | Active project |

---

### `client.call<T>(opts): Promise<AgentSecretsResponse<T>>`

`T` is an optional TypeScript generic — it describes the shape of the API response body. Providing it gives you type safety on `response.json()`. Omitting it makes `response.json()` return `unknown`.

```typescript
// With generic — full type safety
const res = await client.call<{ id: string }>({ url: "...", bearer: "KEY" });
res.json().id; // ✅ TypeScript knows .id exists

// Without generic — still works, json() returns unknown
const res = await client.call({ url: "...", bearer: "KEY" });
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `url` | `string` | ✅ | Target API endpoint |
| `bearer` | `string` | one auth | Secret key name for `Authorization: Bearer` |
| `basic` | `string` | one auth | Secret key name holding `user:pass` |
| `header` | `Record<string, string>` | one auth | `{ "Header-Name": "KEY_NAME" }` |
| `query` | `Record<string, string>` | one auth | `{ "param": "KEY_NAME" }` |
| `bodyField` | `Record<string, string>` | one auth | `{ "field": "KEY_NAME" }` |
| `formField` | `Record<string, string>` | one auth | `{ "field": "KEY_NAME" }` |
| `method` | `string` | — | HTTP method. Default: `GET` |
| `headers` | `Record<string, string>` | — | Non-auth request headers |
| `body` | `unknown` | — | Objects → JSON-serialised. Strings → verbatim |
| `agentId` | `string` | — | Agent identifier for audit log |
| `port` | `number` | — | Per-call proxy port override |
| `timeout` | `number` | `30000` | Per-call timeout in ms |

**`AgentSecretsResponse<T>` properties:**

| Property | Type | Description |
|----------|------|-------------|
| `statusCode` | `number` | HTTP status from target API |
| `headers` | `Record<string, string>` | Response headers |
| `body` | `Uint8Array` | Raw response bytes |
| `redacted` | `boolean` | Whether proxy redacted part of the response |
| `durationMs` | `number` | Round-trip duration in ms |
| `text` | `string` | Response body decoded as UTF-8 |
| `json()` | `T` | Response body parsed as JSON |

---

### `client.spawn(opts): Promise<SpawnResult>`

A thin wrapper around `agentsecrets call` — passes your command array directly as flags to the CLI. The CLI resolves credentials from the OS keychain and injects them into the request without ever exposing the values.

For most use cases, prefer `client.call()` which handles flag construction automatically. `spawn()` is useful in scripting contexts or when you need the raw CLI output.

```typescript
// Equivalent to: agentsecrets call --url https://api.stripe.com/v1/balance --bearer STRIPE_KEY
const result = await client.spawn({
  command: ["--url", "https://api.stripe.com/v1/balance", "--bearer", "STRIPE_KEY"],
});
console.log(result.stdout); // Stripe JSON response
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `command` | `string[]` | ✅ | Flags forwarded to `agentsecrets call` (e.g. `["--url", "...", "--bearer", "KEY"]`) |
| `capture` | `boolean` | — | Capture stdout/stderr. Default: `true` |
| `timeout` | `number` | — | Timeout in ms |

**Returns `SpawnResult`:** `{ exitCode: number, stdout: string, stderr: string }`

Exit code conventions: `0` = success, `1` = process error, `124` = timed out, `127` = `agentsecrets` binary not found.

---

### `client.withWorkspace<T>(name, fn): Promise<T>`

Switches to `name`, runs `fn()`, then restores the previous workspace. Restores even if `fn()` throws.

### `client.withProject<T>(name, fn): Promise<T>`

Same pattern for projects.

---

### `client.isProxyRunning(): Promise<boolean>`

Runs `agentsecrets proxy status` and returns `true` if the exit code is 0.

### `client.proxyStatus(): Promise<ProxyStatus>`

Returns `{ running: boolean, port: number, project?: string }`.

---

### Mock Client for Testing

```typescript
import { MockAgentSecrets } from "@the-17/agentsecrets-sdk/testing";
```

Drop-in replacement for `AgentSecrets` in unit tests. Records every `call()` and `spawn()` without touching the proxy or keychain.

```typescript
const mock = new MockAgentSecrets();
await mock.call({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY" });

assert(mock.calls.length === 1);
assert(mock.calls[0].bearer === "STRIPE_KEY"); // key name — never value
```

Constructor options: `defaultResponse` (custom `AgentSecretsResponse`), `defaultSpawnResult` (custom `SpawnResult`).

---

### Error Classes

All errors extend `AgentSecretsError`. Every error exposes `.message` (human-readable, includes the CLI command to fix the problem) and `.fixHint` (just the command, machine-readable).

| Class | When thrown | `.fixHint` |
|-------|-------------|------------|
| `AgentSecretsNotRunning` | Proxy not running | `agentsecrets proxy start` |
| `ProxyConnectionError` | Can't connect to proxy | `agentsecrets proxy start` |
| `SecretNotFound` | Key name not in keychain | `agentsecrets secrets set KEY=VALUE` |
| `DomainNotAllowed` | Target domain not allowlisted | `agentsecrets workspace allowlist add domain` |
| `UpstreamError` | Target API returned an error | — |
| `CLINotFound` | `agentsecrets` binary not on PATH | Install link |
| `CLIError` | CLI command returned non-zero | — |
| `SessionExpired` | Session token expired | `agentsecrets login` |
| `PermissionDenied` | Insufficient role for operation | — |
| `WorkspaceNotFound` | Workspace doesn't exist | `agentsecrets workspace list` |
| `ProjectNotFound` | Project doesn't exist | `agentsecrets project list` |
| `AllowlistModificationDenied` | Only admins can modify allowlist | — |

---

### TypeScript Types

All types exported from the main entry point. No `@types/` package needed.

```typescript
import type {
  CallOptions,
  SpawnOptions,
  SpawnResult,
  ProxyStatus,
} from "@the-17/agentsecrets-sdk";

import { AgentSecretsResponse } from "@the-17/agentsecrets-sdk";
```

> **Note:** `AgentSecretsResponse` is a class (not just a type) because it has `.text` and `.json()` methods. Import it as a value, not just as a type.

---

## How the Proxy Protocol Works

Every `client.call()` sends an HTTP request to `localhost:8765/proxy` with `X-AS-*` headers. The proxy reads them, resolves values from the OS keychain, injects them into the forwarded request, and returns only the API response.

| Header | Auth Style | Format |
|--------|-----------|--------|
| `X-AS-Target-URL` | All | Target endpoint URL |
| `X-AS-Method` | All | HTTP method |
| `X-AS-Inject-Bearer` | `bearer` | Secret key name |
| `X-AS-Inject-Basic` | `basic` | Secret key name |
| `X-AS-Inject-Header-{Name}` | `header` | Secret key name (header name is the suffix) |
| `X-AS-Inject-Query-{param}` | `query` | Secret key name (param name is the suffix) |
| `X-AS-Inject-Body-{path}` | `bodyField` | Secret key name (field path is the suffix) |
| `X-AS-Inject-Form-{key}` | `formField` | Secret key name (field name is the suffix) |
| `X-AS-Agent-ID` | All (optional) | Agent identifier for audit log |

The proxy error codes: `403` = domain not in allowlist, `502` = all engine errors (including secret not found — distinguished by inspecting the error message body).

---

## Running the Tests

Unit tests — no proxy, no network, no CLI required:

```bash
npm install
node --test --experimental-strip-types tests/unit/proxy.test.ts
```

Typecheck everything (src + tests + examples):

```bash
npx tsc --project tsconfig.dev.json
```

Integration tests — run manually against a live proxy before opening a PR.

**Prerequisites:**

```bash
# Ensure the CLI is installed and initialized — see Prerequisites above
# or the CLI docs at https://github.com/The-17/agentsecrets

# If you don't have a project yet:
agentsecrets project create test

agentsecrets secrets set TEST_KEY=any-value       # value doesn't matter
agentsecrets workspace allowlist add httpbin.org  # used as a safe echo target
agentsecrets proxy start
```

No specific workspace or project name is required — the test uses whatever is currently active.

```bash
node --experimental-strip-types tests/integration/integration.test.ts
```

Individual sections skip gracefully if prerequisites aren't met.

---

## Running the Examples

End-to-end scripts that verify the SDK works against real APIs with a live proxy.

**Setup:**

Make sure you have the AgentSecrets CLI installed and initialized — see the [Prerequisites](#prerequisites) section above or the [CLI docs](https://github.com/The-17/agentsecrets).

```bash
# If you haven't already: agentsecrets init → workspace create → project create
agentsecrets secrets set STRIPE_KEY=sk_live_...
agentsecrets secrets set OPENAI_KEY=sk-proj-...
agentsecrets secrets set GITHUB_TOKEN=ghp_...
agentsecrets proxy start   # keep running in a separate terminal
```

**Run:**

```bash
node --experimental-strip-types examples/stripe.ts   # bearer + form-encoded POST
node --experimental-strip-types examples/openai.ts   # bearer + JSON body POST
node --experimental-strip-types examples/github.ts   # bearer + custom headers
```

All three should exit cleanly and print status 200.

---

## Further Reading

- [Tutorial — Your First Zero-Knowledge API Call](./TUTORIAL.md)
- [AgentSecrets CLI docs](https://github.com/The-17/agentsecrets)
- [Website](https://agentsecrets.com)

---

MIT License — Built by [The Seventeen](https://theseventeen.co)

---

**The agent operates it. The agent never sees it.**