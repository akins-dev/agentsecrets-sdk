# Tutorial — Your First Zero-Knowledge API Call

This tutorial walks you from zero to a working authenticated API call in under 10 minutes. By the end you'll have made a real call to the GitHub API without ever writing a credential value in your code.

---

## What You're Building

```
Your TypeScript code            AgentSecrets Proxy          GitHub API
─────────────────────           ──────────────────          ──────────
client.call({              →    reads GITHUB_TOKEN     →    GET /user
  url: "...",                   from OS keychain
  bearer: "GITHUB_TOKEN"        injects into request
})                         ←    returns response        ←    { login: "..." }

Your code never holds the token. It only ever holds the key name.
```

---

## Step 1 — Install the CLI

The CLI manages your secrets and runs the local proxy. Full docs at [github.com/The-17/agentsecrets](https://github.com/The-17/agentsecrets).

```bash
# Pick one
pip install agentsecrets
npm install -g @the-17/agentsecrets
curl -sSL https://get.agentsecrets.com | sh
```

Verify it works:

```bash
agentsecrets --version
```

---

## Step 2 — Create Your Account, Workspace, and Project

```bash
agentsecrets init
```

This creates your account and sets up the OS keychain integration. Follow the prompts.

If `init` didn't create a workspace, or you want a fresh one for this tutorial:

```bash
# Skip if you already have a workspace
agentsecrets workspace create my-workspace
```

Then create a project:

```bash
agentsecrets project create tutorial-app
```

---

## Step 3 — Add a Secret

Get a GitHub personal access token from [github.com/settings/tokens](https://github.com/settings/tokens) (classic, with `read:user` scope is enough for this tutorial).

```bash
agentsecrets secrets set GITHUB_TOKEN=ghp_your_token_here
```

The token is encrypted client-side and stored in your OS keychain. Verify it was registered (name only — value is never shown):

```bash
agentsecrets secrets list
# GITHUB_TOKEN
```

---

## Step 4 — Start the Proxy

The proxy is a local HTTP server. Your SDK sends requests to it with `X-AS-*` headers describing which secret to inject; the proxy resolves the real value from your OS keychain and forwards the authenticated request to the target API.

```bash
agentsecrets proxy start
```

Leave this running in a terminal. The SDK connects to it at `localhost:8765`.

---

## Step 5 — Install the SDK

In your project directory:

```bash
npm install @the-17/agentsecrets-sdk
```

---

## Step 6 — Write Your First Call

Create a file `hello.ts`:

```typescript
import { AgentSecrets } from "@the-17/agentsecrets-sdk";

const client = new AgentSecrets();

// T is optional — it tells TypeScript what shape to expect from response.json()
// Without it, response.json() returns unknown
const response = await client.call<{ login: string; public_repos: number }>({
  url: "https://api.github.com/user",
  bearer: "GITHUB_TOKEN",             // key name — not the value
  headers: {
    "Accept": "application/vnd.github+json",
  },
});

console.log(`Status:  ${response.statusCode}`);
console.log(`Login:   ${response.json().login}`);
console.log(`Repos:   ${response.json().public_repos}`);
console.log(`Time:    ${response.durationMs}ms`);
```

Run it:

```bash
node --experimental-strip-types hello.ts
```

Expected output:

```
Status:  200
Login:   your-github-username
Repos:   42
Time:    187ms
```

Your GitHub token was never in `hello.ts`. Never assigned to a variable. Never logged.

---

## Step 7 — Handle Errors

Good production code handles the three errors the SDK can throw:

```typescript
import {
  AgentSecrets,
  AgentSecretsNotRunning,
  SecretNotFound,
  DomainNotAllowed,
} from "@the-17/agentsecrets-sdk";

const client = new AgentSecrets();

try {
  const response = await client.call<{ login: string }>({
    url: "https://api.github.com/user",
    bearer: "GITHUB_TOKEN",
  });
  console.log(response.json().login);

} catch (err) {
  if (err instanceof AgentSecretsNotRunning) {
    // Proxy isn't running
    console.error(err.message);
    // → "AgentSecrets proxy is not running on port 8765."
    // → "  ↳ Fix: agentsecrets proxy start"

  } else if (err instanceof SecretNotFound) {
    // You referenced a key name that doesn't exist in the keychain
    console.error(err.message);
    // → "Secret 'GITHUB_TOKEN' not found."
    // → "  ↳ Fix: agentsecrets secrets set GITHUB_TOKEN=VALUE"

  } else if (err instanceof DomainNotAllowed) {
    // The target domain isn't in your workspace allowlist
    console.error(err.message);
    // → "Domain 'api.github.com' is not in the workspace allowlist."
    // → "  ↳ Fix: agentsecrets workspace allowlist add api.github.com"

  } else {
    throw err; // unexpected — rethrow
  }
}
```

Every error message includes the exact CLI command to fix the problem. Both `.message` (full human-readable string) and `.fixHint` (just the command) are available.

---

## Step 8 — Try a POST Call

Most real-world usage involves POST calls with a JSON body. Here's OpenAI:

```typescript
import { AgentSecrets } from "@the-17/agentsecrets-sdk";

// First, add the key:
// agentsecrets secrets set OPENAI_KEY=sk-proj-...

const client = new AgentSecrets();

const response = await client.call<{
  choices: Array<{ message: { content: string } }>;
}>({
  url: "https://api.openai.com/v1/chat/completions",
  method: "POST",
  bearer: "OPENAI_KEY",
  // Objects are JSON-serialised automatically
  // Content-Type: application/json is set automatically
  body: {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say hello in one sentence." }],
    max_tokens: 30,
  },
});

console.log(response.json().choices[0]?.message.content);
```

---

## Step 9 — Use the Mock Client in Tests

Never import `AgentSecrets` directly in unit tests — use `MockAgentSecrets` instead. It records every call without touching the proxy or keychain.

```typescript
// my-function.ts
import { AgentSecrets } from "@the-17/agentsecrets-sdk";

export async function fetchGitHubUser(client: AgentSecrets) {
  const response = await client.call<{ login: string }>({
    url: "https://api.github.com/user",
    bearer: "GITHUB_TOKEN",
  });
  return response.json().login;
}
```

```typescript
// my-function.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockAgentSecrets, AgentSecretsResponse } from "@the-17/agentsecrets-sdk/testing";
import { fetchGitHubUser } from "./my-function.ts";

describe("fetchGitHubUser", () => {
  it("returns the login from the response", async () => {
    const mock = new MockAgentSecrets({
      defaultResponse: new AgentSecretsResponse({
        statusCode: 200,
        headers: {},
        body: new TextEncoder().encode('{"login": "testuser", "public_repos": 5}'),
      }),
    });

    const login = await fetchGitHubUser(mock as any);

    assert.equal(login, "testuser");
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0]?.bearer, "GITHUB_TOKEN"); // key name — never value
  });
});
```

Run it:

```bash
node --test --experimental-strip-types my-function.test.ts
```

---

## What's Next

- **Multiple auth styles** — custom headers, query params, basic auth, body fields: see the [README](./README.md#full-working-example)
- **Multiple environments** — use `client.withWorkspace("production", ...)` to switch contexts
- **One-shot CLI calls** — use `client.spawn()` to forward flags directly to `agentsecrets call` from code
- **Proxy protocol** — building an SDK in another language? See the proxy header spec in the README

---

## Running the Integration Tests

The integration tests verify the full stack against a real proxy. Run them before opening a PR.

**Prerequisites:**

```bash
# Ensure CLI is installed and initialized — see Step 1 and Step 2 above
# or the full CLI docs at https://github.com/The-17/agentsecrets

# If you don't have a project yet:
agentsecrets project create test

agentsecrets secrets set TEST_KEY=any-value       # value doesn't matter
agentsecrets workspace allowlist add httpbin.org  # used as a safe echo target
agentsecrets proxy start
```

No specific workspace or project name required — the tests use whatever is currently active.

**Run:**

```bash
node --experimental-strip-types tests/integration/integration.test.ts
```

Individual sections skip gracefully if prerequisites aren't met — you'll see `○ skipped` lines for anything that needs the proxy or a live secret.

---

## Troubleshooting

**`AgentSecretsNotRunning`** — The proxy isn't running. Run `agentsecrets proxy start` and leave it running.

**`SecretNotFound`** — The key name you passed doesn't exist. Run `agentsecrets secrets list` to see what's registered. Add it with `agentsecrets secrets set KEY=value`.

**`DomainNotAllowed`** — The target domain isn't allowlisted. Run `agentsecrets workspace allowlist add domain.com`.

**`ERR_MODULE_NOT_FOUND` for `.js` files** — You're running source files directly with `--experimental-strip-types`. Use `.ts` extensions in imports, not `.js`.

**`Cannot find module 'node:test'`** — Run `npm install` to install `@types/node`.