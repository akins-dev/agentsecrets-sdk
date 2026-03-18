/**
 * AgentSecrets JavaScript/TypeScript SDK — Type Definitions
 *
 * Zero-knowledge is enforced structurally here:
 * No type in this file has a field that holds a credential value.
 * The proxy resolves values. This SDK never sees them.
 */

// ─── Version ──────────────────────────────────────────────────────────────────

/** SDK version — mirrors Python SDK __version__ for cross-language parity */
export const SDK_VERSION = "0.1.0";

// ─── Call Options ─────────────────────────────────────────────────────────────

export interface CallOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  headers?: Record<string, string>;
  /**
   * Request body. Objects are JSON-serialised. Strings forwarded verbatim.
   */
  body?: unknown;
  /** Bearer token injection — value is the secret key NAME */
  bearer?: string;
  /** Basic auth injection — value is the secret key NAME holding "user:pass" */
  basic?: string;
  /** Custom header injection — key: header name, value: secret key NAME */
  header?: Record<string, string>;
  /** Query parameter injection — key: param name, value: secret key NAME */
  query?: Record<string, string>;
  /** JSON body field injection — key: field path, value: secret key NAME */
  bodyField?: Record<string, string>;
  /** Form field injection — key: field name, value: secret key NAME */
  formField?: Record<string, string>;
  /** Optional agent identifier for audit logging */
  agentId?: string;
  /** Per-call proxy port override */
  port?: number;
  /** Request timeout in ms. Default: 30000 */
  timeout?: number;
}

// ─── Proxy Response ───────────────────────────────────────────────────────────

export class AgentSecretsResponse<T = unknown> {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array;
  readonly redacted: boolean;
  readonly durationMs: number;

  constructor(init: {
    statusCode: number;
    headers: Record<string, string>;
    body: Uint8Array;
    redacted?: boolean;
    durationMs?: number;
  }) {
    this.statusCode = init.statusCode;
    this.headers = init.headers;
    this.body = init.body;
    this.redacted = init.redacted ?? false;
    this.durationMs = init.durationMs ?? 0;
  }

  get text(): string {
    return new TextDecoder().decode(this.body);
  }

  json(): T {
    try {
      return JSON.parse(this.text) as T;
    } catch (err) {
      const preview = this.text.slice(0, 120).split("\n").join(" ");
      throw new SyntaxError(
        `AgentSecretsResponse.json() failed: response is not valid JSON.\n` +
          `Status: ${this.statusCode}  Content-Type: ${this.headers["content-type"] ?? "unknown"}\n` +
          `Body preview: ${preview}\n` +
          `Use response.text to inspect the raw response.`,
      );
    }
  }
}

// ─── Spawn Options ────────────────────────────────────────────────────────────

export interface SpawnOptions {
  /**
   * Arguments forwarded directly to `agentsecrets call`.
   * Confirmed from `agentsecrets call --help`: use flags like
   * ["--url", "https://...", "--bearer", "KEY_NAME", "--method", "POST"]
   *
   * For most use cases, prefer client.call() which handles flag construction
   * automatically. spawn() is for scripting contexts or when the proxy is not running.
   */
  command: string[];
  /** Whether to capture stdout/stderr. Default: true */
  capture?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

export interface SpawnResult {
  /**
   * Process exit code.
   * 0   = success
   * 1   = process error
   * 124 = timed out (SIGTERM sent by timeout option)
   * 127 = agentsecrets binary not found
   */
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ─── Proxy Status ─────────────────────────────────────────────────────────────

export interface ProxyStatus {
  running: boolean;
  port: number;
  project?: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AgentSecretsError extends Error {
  readonly fixHint?: string;
  constructor(message: string, options?: { fixHint?: string }) {
    const full = options?.fixHint
      ? `${message}\n  ↳ Fix: ${options.fixHint}`
      : message;
    super(full);
    this.name = "AgentSecretsError";
    if (options?.fixHint !== undefined) this.fixHint = options.fixHint;
  }
}

export class AgentSecretsNotRunning extends AgentSecretsError {
  readonly port: number;
  constructor(port: number) {
    super(`AgentSecrets proxy is not running on port ${port}.`, {
      fixHint: "agentsecrets proxy start",
    });
    this.name = "AgentSecretsNotRunning";
    this.port = port;
  }
}

export class ProxyConnectionError extends AgentSecretsError {
  constructor(port: number, reason: string) {
    super(`Cannot connect to proxy on port ${port}: ${reason}`, {
      fixHint: "agentsecrets proxy start",
    });
    this.name = "ProxyConnectionError";
  }
}

export class CLINotFound extends AgentSecretsError {
  constructor() {
    super("The 'agentsecrets' binary was not found on PATH.", {
      fixHint: "Install AgentSecrets: https://github.com/The-17/agentsecrets",
    });
    this.name = "CLINotFound";
  }
}

export class CLIError extends AgentSecretsError {
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  constructor(command: string, exitCode: number, stderr: string) {
    super(
      `CLI command failed (exit ${exitCode}): agentsecrets ${command}\n${stderr}`,
    );
    this.name = "CLIError";
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class SessionExpired extends AgentSecretsError {
  constructor() {
    super("Your session has expired.", { fixHint: "agentsecrets login" });
    this.name = "SessionExpired";
  }
}

export class SecretNotFound extends AgentSecretsError {
  readonly key: string;
  constructor(key: string, project?: string) {
    const ctx = project ? ` in project '${project}'` : "";
    super(`Secret '${key}' not found${ctx}.`, {
      fixHint: `agentsecrets secrets set ${key}=VALUE`,
    });
    this.name = "SecretNotFound";
    this.key = key;
  }
}

export class DomainNotAllowed extends AgentSecretsError {
  readonly domain: string;
  constructor(domain: string) {
    super(`Domain '${domain}' is not in the workspace allowlist.`, {
      fixHint: `agentsecrets workspace allowlist add ${domain}`,
    });
    this.name = "DomainNotAllowed";
    this.domain = domain;
  }
}

export class UpstreamError extends AgentSecretsError {
  readonly statusCode: number;
  /**
   * Truncated response body (max 500 chars), enforced at construction.
   * Never contains injected credential values — the proxy does not echo them.
   */
  readonly body: string;
  readonly url: string;
  constructor(statusCode: number, body: string, url: string) {
    super(`Upstream error ${statusCode} from ${url}`);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
    // Enforce truncation at construction — not just in mapProxyError
    this.body = body.length > 500 ? body.slice(0, 500) + "…" : body;
    this.url = url;
  }
}

export class PermissionDenied extends AgentSecretsError {
  constructor(
    operation: string,
    opts?: { requiredRole?: string; currentRole?: string },
  ) {
    const parts = [`Permission denied for '${operation}'.`];
    if (opts?.requiredRole) parts.push(`Required: ${opts.requiredRole}.`);
    if (opts?.currentRole) parts.push(`Current: ${opts.currentRole}.`);
    super(parts.join(" "));
    this.name = "PermissionDenied";
  }
}

export class WorkspaceNotFound extends AgentSecretsError {
  constructor(name: string) {
    super(`Workspace '${name}' not found.`, {
      fixHint: "agentsecrets workspace list",
    });
    this.name = "WorkspaceNotFound";
  }
}

export class ProjectNotFound extends AgentSecretsError {
  constructor(name: string, workspace?: string) {
    const ctx = workspace ? ` in workspace '${workspace}'` : "";
    super(`Project '${name}' not found${ctx}.`, {
      fixHint: "agentsecrets project list",
    });
    this.name = "ProjectNotFound";
  }
}

export class AllowlistModificationDenied extends AgentSecretsError {
  constructor() {
    super("Only workspace admins can modify the domain allowlist.");
    this.name = "AllowlistModificationDenied";
  }
}
