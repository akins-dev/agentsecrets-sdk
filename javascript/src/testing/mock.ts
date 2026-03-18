/**
 * AgentSecrets SDK — Mock Client for Testing
 *
 * Drop-in replacement for AgentSecrets in tests.
 * Records every call() and spawn() without touching the proxy or keychain.
 * Mirrors MockAgentSecrets from the Python SDK (testing/mock.py).
 *
 * @example
 * import { MockAgentSecrets } from "@the-17/agentsecrets-sdk/testing";
 *
 * const mock = new MockAgentSecrets();
 * const response = await mock.call({ url: "https://api.stripe.com/v1/balance", bearer: "STRIPE_KEY" });
 *
 * assert(mock.calls.length === 1);
 * assert(mock.calls[0].url === "https://api.stripe.com/v1/balance");
 * assert(mock.calls[0].bearer === "STRIPE_KEY");
 * // No credential values are ever stored.
 */

import { AgentSecretsResponse, type CallOptions, type SpawnOptions, type SpawnResult } from "../types.js";

export interface CallRecord {
  url: string;
  method: string;
  bearer?: string;
  basic?: string;
  header?: Record<string, string>;
  query?: Record<string, string>;
  bodyField?: Record<string, string>;
  formField?: Record<string, string>;
  body?: unknown;
  agentId?: string;
}

export interface SpawnRecord {
  command: string[];
  capture: boolean;
}

export class MockAgentSecrets {
  readonly calls: CallRecord[] = [];
  readonly spawns: SpawnRecord[] = [];
  /** Workspace names passed to withWorkspace() — for assertions in tests */
  readonly _workspaceSwitches: string[] = [];
  /** Project names passed to withProject() — for assertions in tests */
  readonly _projectSwitches: string[] = [];

  private readonly defaultResponse: AgentSecretsResponse;
  private readonly defaultSpawnResult: SpawnResult;

  constructor(opts: {
    defaultResponse?: AgentSecretsResponse;
    defaultSpawnResult?: SpawnResult;
  } = {}) {
    this.defaultResponse = opts.defaultResponse ?? new AgentSecretsResponse({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode('{"ok": true}'),
    });
    this.defaultSpawnResult = opts.defaultSpawnResult ?? {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };
  }

  async call<T = unknown>(opts: CallOptions): Promise<AgentSecretsResponse<T>> {
    // Development-time guard: warn if body looks like it contains a real credential
    if (process.env["NODE_ENV"] !== "production" && opts.body !== undefined) {
      const bodyStr = typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
      const credPattern = /sk_live_|sk-proj-|ghp_/;
      if (credPattern.test(bodyStr)) {
        console.warn(
          "[AgentSecrets MockAgentSecrets] Warning: body may contain a real credential value. " +
          "Pass secret KEY NAMES, not values. e.g. bearer: \"STRIPE_KEY\" not \"sk_live_...\"."
        );
      }
    }
    const record: CallRecord = { url: opts.url, method: opts.method ?? "GET" };
    if (opts.bearer    !== undefined) record.bearer    = opts.bearer;
    if (opts.basic     !== undefined) record.basic     = opts.basic;
    if (opts.header    !== undefined) record.header    = opts.header;
    if (opts.query     !== undefined) record.query     = opts.query;
    if (opts.bodyField !== undefined) record.bodyField = opts.bodyField;
    if (opts.formField !== undefined) record.formField = opts.formField;
    if (opts.body      !== undefined) record.body      = opts.body;
    if (opts.agentId   !== undefined) record.agentId   = opts.agentId;
    this.calls.push(record);
    return this.defaultResponse as AgentSecretsResponse<T>;
  }

  async spawn(opts: SpawnOptions): Promise<SpawnResult> {
    this.spawns.push({ command: opts.command, capture: opts.capture ?? true });
    return this.defaultSpawnResult;
  }

  async isProxyRunning(): Promise<boolean> { return true; }

  /**
   * Alias for call() — matches AgentSecrets.asyncCall() signature.
   */
  asyncCall<T = unknown>(opts: CallOptions): Promise<AgentSecretsResponse<T>> {
    return this.call<T>(opts);
  }

  /**
   * Mock withWorkspace — runs fn() immediately without switching anything.
   * Records the workspace name so tests can assert it was used.
   */
  async withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this._workspaceSwitches.push(name);
    return fn();
  }

  /**
   * Mock withProject — runs fn() immediately without switching anything.
   * Records the project name so tests can assert it was used.
   */
  async withProject<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this._projectSwitches.push(name);
    return fn();
  }

  close(): void { /* no-op */ }

  async [Symbol.asyncDispose](): Promise<void> { this.close(); }
}
