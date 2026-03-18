/**
 * AgentSecrets SDK — Unit Tests
 * Uses Node's built-in test runner (node:test). No extra dependencies.
 * Run: node --test --experimental-strip-types tests/unit/proxy.test.ts
 *
 * Pure function tests only — no proxy, no network, no CLI required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProxyHeaders,
  validateUrl,
  sanitiseHeaderKey,
  PROXY_HEADERS,
} from "../../src/proxy.ts";
import {
  AgentSecretsError,
  AgentSecretsNotRunning,
  ProxyConnectionError,
  CLINotFound,
  CLIError,
  SessionExpired,
  SecretNotFound,
  DomainNotAllowed,
  UpstreamError,
  PermissionDenied,
  WorkspaceNotFound,
  ProjectNotFound,
  AllowlistModificationDenied,
  AgentSecretsResponse,
  SDK_VERSION,
} from "../../src/types.ts";

// ─── PROXY_HEADERS constants ──────────────────────────────────────────────────

describe("PROXY_HEADERS", () => {
  it("exports correct header names", () => {
    assert.equal(PROXY_HEADERS.TARGET_URL,    "X-AS-Target-URL");
    assert.equal(PROXY_HEADERS.METHOD,        "X-AS-Method");
    assert.equal(PROXY_HEADERS.INJECT_BEARER, "X-AS-Inject-Bearer");
    assert.equal(PROXY_HEADERS.INJECT_BASIC,  "X-AS-Inject-Basic");
    assert.equal(PROXY_HEADERS.AGENT_ID,      "X-AS-Agent-ID");
  });
});

// ─── SDK_VERSION ──────────────────────────────────────────────────────────────

describe("SDK_VERSION", () => {
  it("is a non-empty string", () => {
    assert.equal(typeof SDK_VERSION, "string");
    assert.ok(SDK_VERSION.length > 0);
  });
});

// ─── validateUrl ──────────────────────────────────────────────────────────────

describe("validateUrl — accepts", () => {
  it("http URLs",  () => assert.doesNotThrow(() => validateUrl("http://api.example.com/v1")));
  it("https URLs", () => assert.doesNotThrow(() => validateUrl("https://api.stripe.com/v1/balance")));
  it("URLs with query strings", () => assert.doesNotThrow(() => validateUrl("https://maps.googleapis.com/maps/api?address=NY")));
  it("URLs with ports", () => assert.doesNotThrow(() => validateUrl("http://localhost:9000/proxy")));
});

describe("validateUrl — rejects", () => {
  it("file:// URLs",  () => assert.throws(() => validateUrl("file:///etc/passwd"),   /http or https/));
  it("data: URLs",   () => assert.throws(() => validateUrl("data:text/html,<x>"),   /http or https/));
  it("ftp: URLs",    () => assert.throws(() => validateUrl("ftp://files.example.com"), /http or https/));
  it("empty string", () => assert.throws(() => validateUrl(""),                     /Invalid URL/));
  it("plain strings",() => assert.throws(() => validateUrl("not a url at all"),     /Invalid URL/));
});

// ─── sanitiseHeaderKey ────────────────────────────────────────────────────────

describe("sanitiseHeaderKey — accepts", () => {
  it("standard header names",     () => assert.doesNotThrow(() => sanitiseHeaderKey("X-Api-Key", "header")));
  it("lowercase header names",    () => assert.doesNotThrow(() => sanitiseHeaderKey("authorization", "header")));
  it("hyphenated names",          () => assert.doesNotThrow(() => sanitiseHeaderKey("My-Custom-Header", "header")));
  it("query param names",         () => assert.doesNotThrow(() => sanitiseHeaderKey("api_key", "query")));
  it("alphanumeric names",        () => assert.doesNotThrow(() => sanitiseHeaderKey("apiVersion2024", "header")));
});

describe("sanitiseHeaderKey — rejects", () => {
  it("newline injection",   () => assert.throws(() => sanitiseHeaderKey("X-Key\nEvil: bad", "header"), /illegal characters/));
  it("carriage return",     () => assert.throws(() => sanitiseHeaderKey("X-Key\rEvil",      "header"), /illegal characters/));
  it("colon in key",        () => assert.throws(() => sanitiseHeaderKey("X-Key: value",     "header"), /illegal characters/));
  it("space in key",        () => assert.throws(() => sanitiseHeaderKey("X Key",            "header"), /illegal characters/));
  it("tab in key",          () => assert.throws(() => sanitiseHeaderKey("X\tKey",           "header"), /illegal characters/));
  it("X-AS-Inject-Bearer — proxy header shadowing", () =>
    assert.throws(() => sanitiseHeaderKey("X-AS-Inject-Bearer", "header"), /shadow proxy control headers/));
  it("x-as-inject-query — case insensitive", () =>
    assert.throws(() => sanitiseHeaderKey("x-as-inject-query-key", "query"), /shadow proxy control headers/));
  it("X-AS-INJECT uppercase",   () =>
    assert.throws(() => sanitiseHeaderKey("X-AS-INJECT-BASIC", "header"), /shadow proxy control headers/));
});

// ─── buildProxyHeaders — target URL and method ────────────────────────────────

describe("buildProxyHeaders — always sets", () => {
  it("X-AS-Target-URL", () => {
    const h = buildProxyHeaders({ url: "https://api.stripe.com/v1/balance", bearer: "KEY" }, "GET");
    assert.equal(h[PROXY_HEADERS.TARGET_URL], "https://api.stripe.com/v1/balance");
  });

  it("X-AS-Method uppercased", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bearer: "KEY" }, "post");
    assert.equal(h[PROXY_HEADERS.METHOD], "POST");
  });

  it("X-AS-Method for all verbs", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      const h = buildProxyHeaders({ url: "https://x.com", bearer: "KEY" }, method);
      assert.equal(h[PROXY_HEADERS.METHOD], method.toUpperCase());
    }
  });
});

// ─── buildProxyHeaders — bearer ───────────────────────────────────────────────

describe("buildProxyHeaders — bearer", () => {
  it("sets X-AS-Inject-Bearer", () => {
    const h = buildProxyHeaders({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY" }, "GET");
    assert.equal(h[PROXY_HEADERS.INJECT_BEARER], "STRIPE_KEY");
  });

  it("does not set other inject headers", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bearer: "KEY" }, "GET");
    assert.equal(h[PROXY_HEADERS.INJECT_BASIC], undefined);
    assert.ok(!Object.keys(h).some(k => k.startsWith("X-AS-Inject-Header-")));
    assert.ok(!Object.keys(h).some(k => k.startsWith("X-AS-Inject-Query-")));
  });

  it("works with various key name formats", () => {
    for (const name of ["STRIPE_KEY", "stripe-key", "stripeKey", "KEY_V2", "KEY123"]) {
      const h = buildProxyHeaders({ url: "https://x.com", bearer: name }, "GET");
      assert.equal(h[PROXY_HEADERS.INJECT_BEARER], name);
    }
  });
});

// ─── buildProxyHeaders — basic ────────────────────────────────────────────────

describe("buildProxyHeaders — basic", () => {
  it("sets X-AS-Inject-Basic", () => {
    const h = buildProxyHeaders({ url: "https://jira.example.com", basic: "JIRA_CREDS" }, "GET");
    assert.equal(h[PROXY_HEADERS.INJECT_BASIC], "JIRA_CREDS");
  });
});

// ─── buildProxyHeaders — header (Record format) ───────────────────────────────

describe("buildProxyHeaders — header", () => {
  it("sets X-AS-Inject-Header-{Name} = SECRET_KEY", () => {
    const h = buildProxyHeaders({ url: "https://api.sendgrid.com", header: { "X-Api-Key": "SENDGRID_KEY" } }, "POST");
    assert.equal(h["X-AS-Inject-Header-X-Api-Key"], "SENDGRID_KEY");
  });

  it("supports multiple header injections", () => {
    const h = buildProxyHeaders({ url: "https://x.com", header: { "X-Api-Key": "KEY_A", "X-Org-Id": "KEY_B" } }, "GET");
    assert.equal(h["X-AS-Inject-Header-X-Api-Key"], "KEY_A");
    assert.equal(h["X-AS-Inject-Header-X-Org-Id"],  "KEY_B");
  });

  it("rejects injection key with newline", () => {
    assert.throws(
      () => buildProxyHeaders({ url: "https://x.com", header: { "X-Key\nEvil": "KEY" } }, "GET"),
      /illegal characters/
    );
  });
});

// ─── buildProxyHeaders — query ────────────────────────────────────────────────

describe("buildProxyHeaders — query", () => {
  it("sets X-AS-Inject-Query-{param} = SECRET_KEY", () => {
    const h = buildProxyHeaders({ url: "https://maps.googleapis.com", query: { key: "GMAP_KEY" } }, "GET");
    assert.equal(h["X-AS-Inject-Query-key"], "GMAP_KEY");
  });

  it("supports multiple query injections", () => {
    const h = buildProxyHeaders({ url: "https://x.com", query: { key: "K1", token: "K2" } }, "GET");
    assert.equal(h["X-AS-Inject-Query-key"],   "K1");
    assert.equal(h["X-AS-Inject-Query-token"], "K2");
  });
});

// ─── buildProxyHeaders — bodyField ───────────────────────────────────────────

describe("buildProxyHeaders — bodyField", () => {
  it("sets X-AS-Inject-Body-{path} = SECRET_KEY", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bodyField: { api_key: "MY_KEY" } }, "POST");
    assert.equal(h["X-AS-Inject-Body-api_key"], "MY_KEY");
  });

  it("supports dot-path field names (confirmed from Python tests)", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bodyField: { "auth.key": "SECRET" } }, "POST");
    assert.equal(h["X-AS-Inject-Body-auth.key"], "SECRET");
  });
});

// ─── buildProxyHeaders — formField ───────────────────────────────────────────

describe("buildProxyHeaders — formField", () => {
  it("sets X-AS-Inject-Form-{key} = SECRET_KEY", () => {
    const h = buildProxyHeaders({ url: "https://x.com", formField: { token: "SERVICE_TOKEN" } }, "POST");
    assert.equal(h["X-AS-Inject-Form-token"], "SERVICE_TOKEN");
  });
});

// ─── buildProxyHeaders — agentId ─────────────────────────────────────────────

describe("buildProxyHeaders — agentId", () => {
  it("sets X-AS-Agent-ID when provided", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bearer: "KEY", agentId: "claude-session-123" }, "GET");
    assert.equal(h[PROXY_HEADERS.AGENT_ID], "claude-session-123");
  });

  it("does not set X-AS-Agent-ID when absent", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bearer: "KEY" }, "GET");
    assert.equal(h[PROXY_HEADERS.AGENT_ID], undefined);
  });
});

// ─── buildProxyHeaders — multiple injections ─────────────────────────────────

describe("buildProxyHeaders — multiple injections", () => {
  it("bearer + header + query all present", () => {
    const h = buildProxyHeaders({
      url: "https://x.com",
      bearer: "TOKEN",
      header: { "X-Custom": "CUSTOM_KEY" },
      query: { key: "QUERY_KEY" },
    }, "GET");
    assert.equal(h[PROXY_HEADERS.INJECT_BEARER],    "TOKEN");
    assert.equal(h["X-AS-Inject-Header-X-Custom"], "CUSTOM_KEY");
    assert.equal(h["X-AS-Inject-Query-key"],        "QUERY_KEY");
  });
});

// ─── buildProxyHeaders — no injections ───────────────────────────────────────

describe("buildProxyHeaders — no injections", () => {
  it("only sets TARGET_URL and METHOD when no auth provided", () => {
    const h = buildProxyHeaders({ url: "https://example.com" }, "GET");
    assert.ok(PROXY_HEADERS.TARGET_URL in h);
    assert.ok(PROXY_HEADERS.METHOD in h);
    const injectKeys = Object.keys(h).filter(k => k.startsWith("X-AS-Inject-"));
    assert.equal(injectKeys.length, 0);
  });
});

// ─── AgentSecretsResponse ─────────────────────────────────────────────────────

describe("AgentSecretsResponse", () => {
  it("constructs with required fields", () => {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode('{"id": 42}'),
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.redacted, false);
    assert.equal(r.durationMs, 0);
  });

  it("text getter decodes body as UTF-8", () => {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: {},
      body: new TextEncoder().encode("hello world"),
    });
    assert.equal(r.text, "hello world");
  });

  it("json() parses body as JSON", () => {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: {},
      body: new TextEncoder().encode('{"id": 42, "name": "test"}'),
    });
    const data = r.json<{ id: number; name: string }>();
    assert.equal(data.id, 42);
    assert.equal(data.name, "test");
  });

  it("json() throws actionable SyntaxError on non-JSON", () => {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: new TextEncoder().encode("<html>Not JSON</html>"),
    });
    assert.throws(
      () => r.json(),
      (err: unknown) => {
        assert.ok(err instanceof SyntaxError);
        const msg = (err as SyntaxError).message;
        assert.ok(msg.includes("response.text"), `message should mention response.text: ${msg}`);
        assert.ok(msg.includes("text/html"), `message should include content-type: ${msg}`);
        return true;
      }
    );
  });

  it("has no value or credential fields (zero-knowledge structural check)", () => {
    const r = new AgentSecretsResponse({ statusCode: 200, headers: {}, body: new Uint8Array() });
    assert.ok(!("value" in r),      "response must not have 'value' field — ZK violation");
    assert.ok(!("secretValue" in r),"response must not have 'secretValue' field — ZK violation");
    assert.ok(!("credential" in r), "response must not have 'credential' field — ZK violation");
  });

  it("redacted defaults to false", () => {
    const r = new AgentSecretsResponse({ statusCode: 200, headers: {}, body: new Uint8Array() });
    assert.equal(r.redacted, false);
  });

  it("redacted can be set to true", () => {
    const r = new AgentSecretsResponse({ statusCode: 200, headers: {}, body: new Uint8Array(), redacted: true });
    assert.equal(r.redacted, true);
  });
});

// ─── Error hierarchy ──────────────────────────────────────────────────────────

describe("AgentSecretsError — base", () => {
  it("sets message and fixHint", () => {
    const err = new AgentSecretsError("something broke", { fixHint: "agentsecrets fix" });
    assert.ok(err.message.includes("something broke"));
    assert.ok(err.message.includes("agentsecrets fix"));
    assert.equal(err.fixHint, "agentsecrets fix");
  });

  it("works without fixHint", () => {
    const err = new AgentSecretsError("bare error");
    assert.equal(err.message, "bare error");
    assert.equal(err.fixHint, undefined);
  });

  it("is an instance of Error", () => {
    assert.ok(new AgentSecretsError("x") instanceof Error);
  });
});

describe("AgentSecretsNotRunning", () => {
  it("has correct name, code via fixHint, and port", () => {
    const err = new AgentSecretsNotRunning(8765);
    assert.equal(err.name, "AgentSecretsNotRunning");
    assert.equal(err.port, 8765);
    assert.equal(err.fixHint, "agentsecrets proxy start");
    assert.ok(err.message.includes("8765"));
  });
  it("extends AgentSecretsError", () => assert.ok(new AgentSecretsNotRunning(1) instanceof AgentSecretsError));
});

describe("ProxyConnectionError", () => {
  it("includes port and reason", () => {
    const err = new ProxyConnectionError(9000, "ECONNREFUSED");
    assert.ok(err.message.includes("9000"));
    assert.ok(err.message.includes("ECONNREFUSED"));
    assert.equal(err.fixHint, "agentsecrets proxy start");
  });
  it("extends AgentSecretsError", () => assert.ok(new ProxyConnectionError(1, "x") instanceof AgentSecretsError));
});

describe("CLINotFound", () => {
  it("has fixHint with install link", () => {
    const err = new CLINotFound();
    assert.ok(err.fixHint?.includes("github.com"));
    assert.equal(err.name, "CLINotFound");
  });
  it("extends AgentSecretsError", () => assert.ok(new CLINotFound() instanceof AgentSecretsError));
});

describe("CLIError", () => {
  it("exposes command, exitCode, stderr", () => {
    const err = new CLIError("secrets list", 1, "not logged in");
    assert.equal(err.command, "secrets list");
    assert.equal(err.exitCode, 1);
    assert.equal(err.stderr, "not logged in");
    assert.ok(err.message.includes("secrets list"));
    assert.ok(err.message.includes("not logged in"));
  });
  it("extends AgentSecretsError", () => assert.ok(new CLIError("x", 1, "y") instanceof AgentSecretsError));
});

describe("SessionExpired", () => {
  it("has fixHint for login", () => {
    const err = new SessionExpired();
    assert.equal(err.fixHint, "agentsecrets login");
    assert.equal(err.name, "SessionExpired");
  });
  it("extends AgentSecretsError", () => assert.ok(new SessionExpired() instanceof AgentSecretsError));
});

describe("SecretNotFound", () => {
  it("exposes key and actionable fixHint", () => {
    const err = new SecretNotFound("STRIPE_KEY");
    assert.equal(err.key, "STRIPE_KEY");
    assert.ok(err.fixHint?.includes("STRIPE_KEY"));
    assert.ok(err.message.includes("STRIPE_KEY"));
    assert.equal(err.name, "SecretNotFound");
  });

  it("includes project in message when provided", () => {
    const err = new SecretNotFound("MY_KEY", "my-project");
    assert.ok(err.message.includes("my-project"));
  });

  it("has no 'value' field (zero-knowledge)", () => {
    const err = new SecretNotFound("MY_KEY");
    assert.ok(!("value" in err));
    assert.ok(!("secretValue" in err));
  });

  it("extends AgentSecretsError", () => assert.ok(new SecretNotFound("K") instanceof AgentSecretsError));
});

describe("DomainNotAllowed", () => {
  it("exposes domain and allowlist fixHint", () => {
    const err = new DomainNotAllowed("api.stripe.com");
    assert.equal(err.domain, "api.stripe.com");
    assert.ok(err.fixHint?.includes("api.stripe.com"));
    assert.ok(err.fixHint?.includes("allowlist add"));
    assert.equal(err.name, "DomainNotAllowed");
  });
  it("extends AgentSecretsError", () => assert.ok(new DomainNotAllowed("x.com") instanceof AgentSecretsError));
});

describe("UpstreamError", () => {
  it("exposes statusCode, url, and truncated body", () => {
    const err = new UpstreamError(502, "bad gateway", "https://api.example.com");
    assert.equal(err.statusCode, 502);
    assert.equal(err.url, "https://api.example.com");
    assert.equal(err.body, "bad gateway");
  });

  it("truncates body to 500 chars at construction", () => {
    const longBody = "x".repeat(600);
    const err = new UpstreamError(502, longBody, "https://x.com");
    assert.ok(err.body.length <= 501, `body should be truncated, got length ${err.body.length}`);
    assert.ok(err.body.endsWith("…"), "truncated body should end with ellipsis");
  });

  it("does not truncate body under 500 chars", () => {
    const err = new UpstreamError(502, "short body", "https://x.com");
    assert.equal(err.body, "short body");
  });

  it("extends AgentSecretsError", () => assert.ok(new UpstreamError(500, "x", "y") instanceof AgentSecretsError));
});

describe("PermissionDenied", () => {
  it("includes operation, requiredRole, currentRole", () => {
    const err = new PermissionDenied("modify_allowlist", { requiredRole: "admin", currentRole: "member" });
    assert.ok(err.message.includes("modify_allowlist"));
    assert.ok(err.message.includes("admin"));
    assert.ok(err.message.includes("member"));
  });
  it("extends AgentSecretsError", () => assert.ok(new PermissionDenied("op") instanceof AgentSecretsError));
});

describe("WorkspaceNotFound", () => {
  it("includes name and list fixHint", () => {
    const err = new WorkspaceNotFound("my-workspace");
    assert.ok(err.message.includes("my-workspace"));
    assert.ok(err.fixHint?.includes("workspace list"));
  });
  it("extends AgentSecretsError", () => assert.ok(new WorkspaceNotFound("x") instanceof AgentSecretsError));
});

describe("ProjectNotFound", () => {
  it("includes project name and optionally workspace", () => {
    const err = new ProjectNotFound("my-project", "my-workspace");
    assert.ok(err.message.includes("my-project"));
    assert.ok(err.message.includes("my-workspace"));
  });
  it("extends AgentSecretsError", () => assert.ok(new ProjectNotFound("x") instanceof AgentSecretsError));
});

describe("AllowlistModificationDenied", () => {
  it("has message about admins", () => {
    const err = new AllowlistModificationDenied();
    assert.ok(err.message.includes("admin"));
  });
  it("extends AgentSecretsError", () => assert.ok(new AllowlistModificationDenied() instanceof AgentSecretsError));
});

// ─── Zero-knowledge structural guarantees ────────────────────────────────────

describe("Zero-knowledge structural guarantees", () => {
  it("buildProxyHeaders output contains key NAMES not values", () => {
    const h = buildProxyHeaders({ url: "https://x.com", bearer: "STRIPE_KEY" }, "GET");
    // The inject header value is the key name "STRIPE_KEY", never a real credential
    assert.equal(h[PROXY_HEADERS.INJECT_BEARER], "STRIPE_KEY");
    // Key names are identifier-format strings, not credential values
    assert.ok(!h[PROXY_HEADERS.INJECT_BEARER]!.startsWith("sk_live_"));
    assert.ok(!h[PROXY_HEADERS.INJECT_BEARER]!.startsWith("sk-proj-"));
  });

  it("no error class exposes a value field", () => {
    const errors: AgentSecretsError[] = [
      new AgentSecretsNotRunning(8765),
      new SecretNotFound("STRIPE_KEY"),
      new DomainNotAllowed("api.stripe.com"),
      new UpstreamError(502, "error body", "https://x.com"),
      new CLIError("cmd", 1, "stderr"),
    ];
    for (const err of errors) {
      assert.ok(!("value" in err),       `${err.name} must not have 'value' field`);
      assert.ok(!("secretValue" in err), `${err.name} must not have 'secretValue' field`);
      assert.ok(!("credential" in err),  `${err.name} must not have 'credential' field`);
    }
  });

  it("AgentSecretsResponse has no value field", () => {
    const r = new AgentSecretsResponse({ statusCode: 200, headers: {}, body: new Uint8Array() });
    assert.ok(!("value" in r));
    assert.ok(!("secretValue" in r));
    assert.ok(!("credential" in r));
  });

  it("header injection key sanitisation blocks proxy header shadowing", () => {
    assert.throws(
      () => buildProxyHeaders({ url: "https://x.com", header: { "X-AS-Inject-Bearer": "EVIL" } }, "GET"),
      /shadow proxy control headers/
    );
  });

  it("URL validation blocks SSRF via file:// scheme", () => {
    assert.throws(
      () => buildProxyHeaders({ url: "file:///etc/passwd", bearer: "KEY" }, "GET"),
      /http or https/
    );
  });
});
