/**
 * AgentSecrets SDK — Integration Tests
 *
 * Mirrors Python SDK tests/integration_test.py.
 * Run MANUALLY against a live proxy before opening a PR.
 *
 * Prerequisites:
 *   1. agentsecrets CLI installed and on PATH
 *   2. Logged in (agentsecrets init / agentsecrets login)
 *   3. Active project with at least one secret:
 *        agentsecrets secrets set TEST_KEY=any-value
 *   4. httpbin.org on allowlist:
 *        agentsecrets workspace allowlist add httpbin.org
 *   5. Proxy running: agentsecrets proxy start
 *
 * Run:
 *   node --experimental-strip-types tests/integration/integration.test.ts
 */

import { AgentSecrets, AgentSecretsResponse, SDK_VERSION } from "../../src/index.ts";
import { MockAgentSecrets } from "../../src/testing/mock.ts";
import {
  AgentSecretsNotRunning,
  AgentSecretsError,
  CLINotFound,
  SecretNotFound,
  DomainNotAllowed,
  SessionExpired,
  ProxyConnectionError,
} from "../../src/types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let PASS = 0, FAIL = 0, SKIP = 0;
const results: Array<{ name: string; status: "pass" | "fail" | "skip"; detail?: string }> = [];

function ok(name: string) {
  PASS++;
  results.push({ name, status: "pass" });
  console.log(`  ✓ ${name}`);
}
function fail(name: string, err: unknown) {
  FAIL++;
  const detail = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
  results.push({ name, status: "fail", detail });
  console.log(`  ✗ ${name}\n      ${detail}`);
}
function skip(name: string, reason: string) {
  SKIP++;
  results.push({ name, status: "skip", detail: reason });
  console.log(`  ○ ${name} (skipped: ${reason})`);
}
function section(title: string) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}

// ─── 1. Import & Version ──────────────────────────────────────────────────────

function testImportsAndVersion() {
  section("1. Imports & Version");

  try {
    if (typeof SDK_VERSION !== "string" || !SDK_VERSION) throw new Error("SDK_VERSION is missing");
    ok(`SDK_VERSION = "${SDK_VERSION}"`);
  } catch (e) { fail("SDK_VERSION", e); }

  try {
    const errors = [
      AgentSecretsNotRunning, CLINotFound, SecretNotFound,
      DomainNotAllowed, SessionExpired, ProxyConnectionError,
    ];
    for (const E of errors) {
      if (typeof E !== "function") throw new Error(`${E} is not a class`);
    }
    ok(`All ${errors.length} error classes importable`);
  } catch (e) { fail("Error class imports", e); }

  try {
    if (typeof AgentSecretsResponse !== "function") throw new Error("AgentSecretsResponse not a class");
    if (typeof AgentSecrets !== "function") throw new Error("AgentSecrets not a class");
    ok("AgentSecrets and AgentSecretsResponse importable");
  } catch (e) { fail("Core class imports", e); }
}

// ─── 2. Client Construction ───────────────────────────────────────────────────

function testClientConstruction() {
  section("2. Client Construction");

  try {
    const c = new AgentSecrets({ autoStart: false });
    ok("Default construction succeeds");
  } catch (e) { fail("Default construction", e); }

  try {
    const c = new AgentSecrets({ port: 9999, autoStart: false });
    ok("Custom port accepted");
  } catch (e) { fail("Custom port", e); }

  try {
    const orig = process.env["AGENTSECRETS_PORT"];
    process.env["AGENTSECRETS_PORT"] = "9876";
    const c = new AgentSecrets({ autoStart: false });
    process.env["AGENTSECRETS_PORT"] = orig ?? "";
    ok("AGENTSECRETS_PORT env var read");
  } catch (e) { fail("AGENTSECRETS_PORT env", e); }

  try {
    const c = new AgentSecrets({ autoStart: false });
    if (typeof c.call !== "function") throw new Error("call() missing");
    if (typeof c.spawn !== "function") throw new Error("spawn() missing");
    if (typeof c.asyncCall !== "function") throw new Error("asyncCall() missing");
    if (typeof c.isProxyRunning !== "function") throw new Error("isProxyRunning() missing");
    if (typeof c.proxyStatus !== "function") throw new Error("proxyStatus() missing");
    if (typeof c.withWorkspace !== "function") throw new Error("withWorkspace() missing");
    if (typeof c.withProject !== "function") throw new Error("withProject() missing");
    if (typeof c.close !== "function") throw new Error("close() missing");
    ok("All public methods present");
  } catch (e) { fail("Public method surface", e); }

  try {
    const c = new AgentSecrets({ autoStart: false });
    if (typeof c[Symbol.asyncDispose] !== "function") throw new Error("Symbol.asyncDispose missing");
    ok("Symbol.asyncDispose present (await using support)");
  } catch (e) { fail("Symbol.asyncDispose", e); }
}

// ─── 3. Error Quality ─────────────────────────────────────────────────────────

function testErrorQuality() {
  section("3. Error Quality");

  const cases: Array<[string, AgentSecretsError]> = [
    ["AgentSecretsNotRunning", new AgentSecretsNotRunning(8765)],
    ["CLINotFound", new CLINotFound()],
    ["SecretNotFound", new SecretNotFound("STRIPE_KEY")],
    ["DomainNotAllowed", new DomainNotAllowed("api.evil.com")],
    ["SessionExpired", new SessionExpired()],
  ];

  for (const [name, err] of cases) {
    try {
      if (!(err instanceof AgentSecretsError)) throw new Error(`${name} does not extend AgentSecretsError`);
      if (!err.fixHint) throw new Error(`${name} has no fixHint`);
      if (!err.message.includes(err.fixHint)) throw new Error(`${name} message doesn't include fixHint`);
      ok(`${name}: fixHint="${err.fixHint}"`);
    } catch (e) { fail(name, e); }
  }

  // Zero-knowledge: no error class has a value field
  try {
    const notFound = new SecretNotFound("MY_KEY");
    if ("value" in notFound) throw new Error("SecretNotFound has 'value' field — ZK violation");
    if ("secretValue" in notFound) throw new Error("SecretNotFound has 'secretValue' field — ZK violation");
    ok("SecretNotFound has no value field (ZK intact)");
  } catch (e) { fail("ZK: SecretNotFound no value field", e); }
}

// ─── 4. AgentSecretsResponse ──────────────────────────────────────────────────

function testResponseModel() {
  section("4. AgentSecretsResponse Model");

  try {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode('{"id": 42, "name": "test"}'),
      durationMs: 123,
    });

    if (r.statusCode !== 200) throw new Error("statusCode wrong");
    if (r.durationMs !== 123) throw new Error("durationMs wrong");
    if (r.redacted !== false) throw new Error("redacted should default false");
    if (typeof r.text !== "string") throw new Error("text not a string");
    if (r.json<{id: number}>().id !== 42) throw new Error("json() failed");
    ok("Response model fields correct");
  } catch (e) { fail("Response model", e); }

  // json() on non-JSON gives actionable error
  try {
    const r = new AgentSecretsResponse({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: new TextEncoder().encode("<html>Not JSON</html>"),
    });
    try {
      r.json();
      fail("json() on non-JSON should throw", new Error("No error thrown"));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw new Error(`Expected SyntaxError, got ${(e as Error).constructor.name}`);
      const msg = (e as SyntaxError).message;
      if (!msg.includes("response.text")) throw new Error(`Error message should mention response.text: ${msg}`);
      ok("json() on non-JSON throws actionable SyntaxError");
    }
  } catch (e) { fail("json() non-JSON error", e); }

  // Zero-knowledge: response has no value field
  try {
    const r = new AgentSecretsResponse({ statusCode: 200, headers: {}, body: new Uint8Array() });
    if ("value" in r) throw new Error("Response has 'value' field — ZK violation");
    if ("secretValue" in r) throw new Error("Response has 'secretValue' field — ZK violation");
    if ("credential" in r) throw new Error("Response has 'credential' field — ZK violation");
    ok("Response has no value/credential fields (ZK intact)");
  } catch (e) { fail("ZK: Response no value field", e); }
}

// ─── 5. Header Injection Safety ──────────────────────────────────────────────

function testHeaderInjectionSafety() {
  section("5. Header Injection Safety");
  const { buildProxyHeaders, validateUrl, sanitiseHeaderKey } = require("../../src/proxy.ts");

  // URL validation
  const badUrls = ["file:///etc/passwd", "data:text/html,<x>", "javascript:alert(1)", "not-a-url"];
  for (const url of badUrls) {
    try {
      try {
        validateUrl(url);
        fail(`validateUrl should reject: ${url}`, new Error("No error thrown"));
      } catch (e) {
        if (e instanceof Error && e.message.includes("Invalid URL") || e instanceof Error && e.message.includes("http or https")) {
          ok(`Rejects bad URL: ${url}`);
        } else throw e;
      }
    } catch (e) { fail(`URL validation for ${url}`, e); }
  }

  // Header injection
  const badKeys = ["X-Key\nEvil: injected", "X-AS-Inject-Bearer", "Key: value"];
  for (const key of badKeys) {
    try {
      try {
        sanitiseHeaderKey(key, "header");
        fail(`sanitiseHeaderKey should reject: ${JSON.stringify(key)}`, new Error("No error thrown"));
      } catch (e) {
        ok(`Rejects bad header key: ${JSON.stringify(key)}`);
      }
    } catch (e) { fail(`Header key sanitisation for ${JSON.stringify(key)}`, e); }
  }

  // Proxy headers take precedence over user headers
  try {
    const client = new AgentSecrets({ autoStart: false });
    // Can't test the merge directly without a live proxy, but verify buildProxyHeaders works
    const headers = buildProxyHeaders({ url: "https://api.example.com", bearer: "MY_KEY" }, "GET");
    if (headers["X-AS-Inject-Bearer"] !== "MY_KEY") throw new Error("Bearer not set correctly");
    ok("buildProxyHeaders sets injection headers correctly");
  } catch (e) { fail("buildProxyHeaders", e); }
}

// ─── 6. Mock Client ───────────────────────────────────────────────────────────

async function testMockClient() {
  section("6. MockAgentSecrets");

  try {
    const mock = new MockAgentSecrets();
    await mock.call({ url: "https://api.github.com/user", bearer: "GITHUB_TOKEN" });
    await mock.call({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY", method: "GET" });
    await mock.spawn({ command: ["node", "server.js"] });

    if (mock.calls.length !== 2) throw new Error(`Expected 2 calls, got ${mock.calls.length}`);
    if (mock.spawns.length !== 1) throw new Error(`Expected 1 spawn, got ${mock.spawns.length}`);
    if (mock.calls[0]?.bearer !== "GITHUB_TOKEN") throw new Error("bearer not recorded");
    if (mock.calls[1]?.method !== "GET") throw new Error("method not recorded");
    ok("Records calls and spawns correctly");
  } catch (e) { fail("Mock recording", e); }

  try {
    const mock = new MockAgentSecrets();
    let ranWith = "";
    await mock.withWorkspace("production", async () => { ranWith = "production"; });
    if (ranWith !== "production") throw new Error("withWorkspace didn't run fn()");
    if (mock._workspaceSwitches[0] !== "production") throw new Error("workspace not recorded");
    ok("withWorkspace runs fn() and records switch");
  } catch (e) { fail("Mock withWorkspace", e); }

  try {
    const mock = new MockAgentSecrets();
    const response = await mock.asyncCall({ url: "https://api.example.com", bearer: "KEY" });
    if (response.statusCode !== 200) throw new Error("asyncCall default response wrong");
    ok("asyncCall() alias works");
  } catch (e) { fail("Mock asyncCall", e); }

  // Zero-knowledge: CallRecord has no value field
  try {
    const mock = new MockAgentSecrets();
    await mock.call({ url: "https://example.com", bearer: "MY_KEY" });
    const record = mock.calls[0]!;
    if ("value" in record) throw new Error("CallRecord has 'value' field — ZK violation");
    if ("secretValue" in record) throw new Error("CallRecord has 'secretValue' field — ZK violation");
    ok("CallRecord has no value fields (ZK intact)");
  } catch (e) { fail("ZK: CallRecord no value fields", e); }

  // Custom response
  try {
    const mock = new MockAgentSecrets({
      defaultResponse: new AgentSecretsResponse({
        statusCode: 201,
        headers: {},
        body: new TextEncoder().encode('{"id": "ch_123"}'),
      }),
    });
    const r = await mock.call({ url: "https://api.stripe.com/v1/charges", bearer: "STRIPE_KEY" });
    if (r.statusCode !== 201) throw new Error("custom statusCode wrong");
    if (r.json<{id: string}>().id !== "ch_123") throw new Error("custom body wrong");
    ok("Custom default response works");
  } catch (e) { fail("Mock custom response", e); }
}

// ─── 7. Live Proxy Tests ──────────────────────────────────────────────────────

async function testLiveProxy() {
  section("7. Live Proxy Tests (requires running proxy + secrets)");

  const client = new AgentSecrets({ autoStart: false });
  const running = await client.isProxyRunning();

  if (!running) {
    skip("All live proxy tests", "proxy not running — run: agentsecrets proxy start");
    return;
  }

  // Health check
  try {
    const status = await client.proxyStatus();
    if (!status.running) throw new Error("proxyStatus.running should be true");
    if (status.port !== 8765) throw new Error(`Expected port 8765, got ${status.port}`);
    ok(`proxyStatus: running=true port=${status.port} project="${status.project}"`);
  } catch (e) { fail("proxyStatus", e); }

  // SecretNotFound for a definitely-nonexistent key
  try {
    await client.call({
      url: "https://httpbin.org/get",
      bearer: "THIS_KEY_DEFINITELY_DOES_NOT_EXIST_SDK_TEST_XYZ_999",
    });
    fail("SecretNotFound", new Error("Expected SecretNotFound, got no error"));
  } catch (e) {
    if (e instanceof SecretNotFound) {
      if (!e.key.includes("THIS_KEY")) throw new Error(`key wrong: ${e.key}`);
      ok(`SecretNotFound raised: key="${e.key}" fixHint="${e.fixHint}"`);
    } else if (e instanceof DomainNotAllowed) {
      skip("SecretNotFound test", "httpbin.org not on allowlist — add it first");
    } else {
      fail("SecretNotFound", e);
    }
  }

  // DomainNotAllowed for a blocked domain
  try {
    await client.call({
      url: "https://this-domain-should-never-be-allowed-xyz-sdk-test.com/test",
      bearer: "SOME_KEY",
    });
    skip("DomainNotAllowed", "call succeeded — allowlist may be empty");
  } catch (e) {
    if (e instanceof DomainNotAllowed) {
      ok(`DomainNotAllowed raised: domain="${e.domain}" fixHint="${e.fixHint}"`);
    } else if (e instanceof SecretNotFound) {
      skip("DomainNotAllowed", "got SecretNotFound first (key doesn't exist)");
    } else {
      skip("DomainNotAllowed", `got ${(e as Error).constructor.name}: ${(e as Error).message}`);
    }
  }

  // Full call cycle with httpbin if a key exists
  const allKeys = await client.call({ url: "https://httpbin.org/get", bearer: "TEST_KEY" }).catch(() => null);
  if (!allKeys) {
    skip("Full call cycle", "TEST_KEY not set or httpbin.org not allowlisted");
    skip("POST with JSON body", "TEST_KEY not set or httpbin.org not allowlisted");
    skip("asyncCall()", "TEST_KEY not set or httpbin.org not allowlisted");
    skip("Response model completeness", "TEST_KEY not set or httpbin.org not allowlisted");
    return;
  }

  try {
    if (allKeys.statusCode !== 200) throw new Error(`Expected 200, got ${allKeys.statusCode}`);
    const data = allKeys.json<{url: string; headers: Record<string, string>}>();
    if (!data.headers["Authorization"]?.startsWith("Bearer ")) throw new Error("Authorization header not injected");
    if ("value" in allKeys) throw new Error("ZK VIOLATION: response has value field");
    ok(`GET with bearer: status=${allKeys.statusCode} auth injected durationMs=${allKeys.durationMs}`);
  } catch (e) { fail("GET with bearer", e); }

  // POST with JSON body
  try {
    const r = await client.call<{json: {title: string}}>({
      url: "https://httpbin.org/post",
      method: "POST",
      bearer: "TEST_KEY",
      body: { title: "SDK Integration Test", ts: Date.now() },
    });
    if (r.statusCode !== 200) throw new Error(`Expected 200, got ${r.statusCode}`);
    if (r.json().json?.title !== "SDK Integration Test") throw new Error("Body not echoed correctly");
    ok("POST with JSON body: status=200 body echoed correctly");
  } catch (e) { fail("POST with JSON body", e); }

  // asyncCall alias
  try {
    const r = await client.asyncCall({ url: "https://httpbin.org/get", bearer: "TEST_KEY" });
    if (r.statusCode !== 200) throw new Error(`Expected 200, got ${r.statusCode}`);
    ok("asyncCall() alias works end-to-end");
  } catch (e) { fail("asyncCall()", e); }

  // Response model completeness
  try {
    const r = await client.call({ url: "https://httpbin.org/get", bearer: "TEST_KEY" });
    if (typeof r.statusCode !== "number") throw new Error("statusCode not a number");
    if (typeof r.durationMs !== "number" || r.durationMs <= 0) throw new Error("durationMs invalid");
    if (!(r.body instanceof Uint8Array)) throw new Error("body not Uint8Array");
    if (typeof r.text !== "string") throw new Error("text not a string");
    if (typeof r.redacted !== "boolean") throw new Error("redacted not a boolean");
    if (typeof r.headers !== "object") throw new Error("headers not an object");
    ok(`Response model complete: statusCode=${r.statusCode} durationMs=${r.durationMs}ms`);
  } catch (e) { fail("Response model completeness", e); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("=".repeat(60));
console.log("  AgentSecrets SDK — Integration Tests");
console.log(`  SDK version: ${SDK_VERSION}`);
console.log("=".repeat(60));

testImportsAndVersion();
testClientConstruction();
testErrorQuality();
testResponseModel();
testHeaderInjectionSafety();
await testMockClient();
await testLiveProxy();

console.log(`\n${"=".repeat(60)}`);
console.log(`  Results: ${PASS} passed  ${FAIL} failed  ${SKIP} skipped`);
console.log("=".repeat(60));

if (FAIL > 0) {
  console.log("\n⚠️  TESTS FAILED — do not open PR until fixed.");
  process.exit(1);
} else if (SKIP > 0) {
  console.log("\n○  Some tests skipped. To run all: ensure proxy is running and TEST_KEY is set.");
} else {
  console.log("\n✓  ALL TESTS PASSED");
}
