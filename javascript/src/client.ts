/**
 * AgentSecrets JavaScript/TypeScript SDK — Call Layer
 *
 * Mirrors the Python SDK client.py / call.py:
 * - Same proxy header format (confirmed from Go source)
 * - Same error codes: 403 = domain not allowed, 502 = all engine errors
 * - auto_start support (fire-and-forget, not blocking)
 * - withWorkspace / withProject context helpers
 */

import { execFile, spawn as nodeSpawn } from "node:child_process";
import { promisify } from "node:util";
import {
  AgentSecretsResponse,
  AgentSecretsError,
  AgentSecretsNotRunning,
  ProxyConnectionError,
  CLINotFound,
  SecretNotFound,
  DomainNotAllowed,
  UpstreamError,
  type CallOptions,
  type SpawnOptions,
  type SpawnResult,
  type ProxyStatus,
} from "./types.js";
import {
  buildProxyHeaders,
  DEFAULT_PORT,
  PROXY_PATH,
  HEALTH_PATH,
} from "./proxy.js";
import { which } from "./which.js";

const execFileAsync = promisify(execFile);

export interface AgentSecretsConfig {
  /** Proxy port. Default: 8765 or AGENTSECRETS_PORT env var */
  port?: number;
  /** Auto-start the proxy if not running. Default: true */
  autoStart?: boolean;
  /** Active workspace (or AGENTSECRETS_WORKSPACE env var) */
  workspace?: string;
  /** Active project (or AGENTSECRETS_PROJECT env var) */
  project?: string;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function mapProxyError(
  statusCode: number,
  bodyText: string,
  url: string,
): AgentSecretsError {
  // Truncate body before storing — upstream errors may echo credential values
  const truncated =
    bodyText.length > 500 ? bodyText.slice(0, 500) + "…" : bodyText;

  let errorMsg = truncated;
  try {
    const data = JSON.parse(truncated) as Record<string, string>;
    errorMsg = data["error"] ?? data["message"] ?? truncated;
  } catch {
    /* use raw text */
  }

  if (statusCode === 400) {
    return new AgentSecretsError(
      `Proxy rejected the request (400): ${errorMsg} — check that you passed an auth style (bearer, basic, header, query, bodyField, or formField).`,
    );
  }

  if (statusCode === 403) {
    // Extract domain from the already-parsed error message.
    // The Go proxy sets: { "error": "domain_not_in_allowlist", "domain": "...", "message": "..." }
    // errorMsg was set from data["error"] above — we need data["domain"] separately.
    let domain = errorMsg;
    try {
      const raw = JSON.parse(truncated) as Record<string, string>;
      domain = raw["domain"] ?? raw["message"] ?? errorMsg;
    } catch {
      /* use errorMsg */
    }
    return new DomainNotAllowed(domain);
  }

  if (statusCode === 502) {
    // Go proxy wraps ALL engine errors as 502 (server.go:115).
    // "secret not found" is detected by matching engine.go:202 message format:
    //   "secret 'KEY' not found in keychain — ..."
    const lower = errorMsg.toLowerCase();
    if (
      lower.includes("not found in keychain") ||
      (lower.includes("secret '") && lower.includes("not found"))
    ) {
      const match = errorMsg.match(/secret '([^']+)'/);
      const key = match?.[1] ?? errorMsg;
      return new SecretNotFound(key);
    }
    return new UpstreamError(statusCode, truncated, url);
  }

  return new AgentSecretsError(`Proxy error ${statusCode}: ${errorMsg}`);
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Check if the proxy is running using `agentsecrets proxy status`.
 * Confirmed from CLI --help: `agentsecrets proxy status` exists.
 * Falls back to a TCP probe on ENOENT (CLI not found).
 */
async function healthCheck(port: number): Promise<ProxyStatus> {
  const binary = await which("agentsecrets");
  if (!binary) throw new CLINotFound();
  try {
    const { stdout } = await execFileAsync(binary, ["proxy", "status"], {
      timeout: 5_000,
    });
    // proxy status exits 0 if running, non-zero if not.
    // stdout may contain port/project info — parse best-effort
    const portMatch = stdout.match(/port[\s:]+([0-9]+)/i);
    const projMatch = stdout.match(/project[\s:]+([\w-]+)/i);
    const result: ProxyStatus = {
      running: true,
      port: portMatch ? parseInt(portMatch[1]!, 10) : port,
    };
    if (projMatch?.[1]) result.project = projMatch[1];
    return result;
  } catch (err: any) {
    // Non-zero exit = proxy not running
    if (err.code !== undefined && typeof err.code === "number") {
      throw new AgentSecretsNotRunning(port);
    }
    throw new ProxyConnectionError(port, (err as Error).message);
  }
}

/**
 * Start the proxy as a fire-and-forget background process.
 * Uses spawn (not execFile) so it does not block waiting for the process to exit.
 * Mirrors Python SDK's subprocess.Popen approach.
 */
async function autoStartProxy(port: number): Promise<void> {
  const binary = await which("agentsecrets");
  if (!binary) throw new CLINotFound(); // fail fast — don't wait 10s for health timeout

  nodeSpawn(binary, ["proxy", "start", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
  }).unref(); // Detach from parent — process runs independently
}

async function waitForReady(
  port: number,
  timeoutMs = 10_000,
): Promise<ProxyStatus> {
  const deadline = Date.now() + timeoutMs;
  let delay = 250;
  while (Date.now() < deadline) {
    try {
      return await healthCheck(port);
    } catch {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 2_000);
    }
  }
  throw new AgentSecretsNotRunning(port);
}

// ─── Concurrency mutex ────────────────────────────────────────────────────────

/**
 * Simple async mutex — prevents concurrent withWorkspace/withProject races.
 * Each call queues behind the previous one, ensuring CLI state switches
 * are serialised even under concurrent async calls.
 */
class Mutex {
  private _queue: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Chain fn onto the queue. The queue itself never rejects (errors swallowed
    // so subsequent queued items still run). The returned promise carries the
    // real result or error back to the caller.
    let resolve!: () => void;
    const slot = new Promise<void>((r) => {
      resolve = r;
    });
    const result = this._queue.then(() => fn()).finally(resolve);
    this._queue = slot;
    return result;
  }
}

// ─── Main client ──────────────────────────────────────────────────────────────

export class AgentSecrets {
  private readonly port: number;
  private readonly autoStart: boolean;
  private _workspace: string | undefined;
  private _project: string | undefined;
  /**
   * _ready caches the proxy health check promise.
   * Reset to null by close() or on any failure so the next call retries.
   */
  private _ready: Promise<ProxyStatus> | null = null;
  private readonly _contextMutex = new Mutex();

  constructor(config: AgentSecretsConfig = {}) {
    const envPort = parseInt(process.env["AGENTSECRETS_PORT"] ?? "", 10);
    this.port =
      config.port ??
      (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT);
    this.autoStart = config.autoStart ?? true;
    this._workspace = config.workspace ?? process.env["AGENTSECRETS_WORKSPACE"];
    this._project = config.project ?? process.env["AGENTSECRETS_PROJECT"];
  }

  private ensureReady(): Promise<ProxyStatus> {
    if (!this._ready) {
      this._ready = healthCheck(this.port)
        .catch(async (err) => {
          if (!this.autoStart) {
            this._ready = null; // reset so next call retries
            throw new AgentSecretsNotRunning(this.port);
          }
          await autoStartProxy(this.port);
          return waitForReady(this.port);
        })
        .catch((err) => {
          this._ready = null; // reset on any failure — allows recovery after proxy starts
          throw err;
        });
    }
    return this._ready;
  }

  // ── call() ────────────────────────────────────────────────────────────────

  async call<T = unknown>(opts: CallOptions): Promise<AgentSecretsResponse<T>> {
    await this.ensureReady();

    const method = opts.method ?? "GET";
    const port = opts.port ?? this.port;
    const proxyUrl = `http://localhost:${port}${PROXY_PATH}`;
    const timeout = opts.timeout ?? 30_000;

    // buildProxyHeaders validates the URL and sanitises injection keys
    const proxyHeaders = buildProxyHeaders(opts, method);
    if (opts.headers) {
      // Merge user headers safely:
      // 1. Copy user headers, stripping any X-AS-* keys — that namespace belongs to the proxy.
      //    If a target API genuinely needs an X-AS-* header, the caller should
      //    contact the maintainers; this restriction protects against injection.
      // 2. Apply proxy injection headers on top, so they always win.
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(opts.headers)) {
        if (!k.toLowerCase().startsWith("x-as-")) safe[k] = v;
      }
      Object.assign(proxyHeaders, safe);
    }

    let body: string | undefined;
    if (opts.body !== undefined) {
      if (typeof opts.body === "string") {
        body = opts.body;
      } else {
        body = JSON.stringify(opts.body);
        proxyHeaders["Content-Type"] ??= "application/json";
      }
    }

    const start = Date.now();
    let res: Response;
    const fetchInit: RequestInit = {
      method,
      headers: proxyHeaders,
      signal: AbortSignal.timeout(timeout),
    };
    if (body !== undefined) fetchInit.body = body;
    try {
      res = await fetch(proxyUrl, fetchInit);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const code =
        e.code ?? (e.cause as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ECONNREFUSED") {
        this._ready = null; // proxy went down — reset so next call retries
        throw new AgentSecretsNotRunning(port);
      }
      throw new AgentSecretsError(`Proxy request failed: ${e.message}`);
    }

    const durationMs = Date.now() - start;
    const bodyBytes = new Uint8Array(await res.arrayBuffer());
    const bodyText = new TextDecoder().decode(bodyBytes);
    // Any proxy-level 5xx could mean the proxy is degraded — reset cache
    if (res.status >= 500) this._ready = null;

    if (res.status >= 400) {
      throw mapProxyError(res.status, bodyText, opts.url);
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return new AgentSecretsResponse<T>({
      statusCode: res.status,
      headers,
      body: bodyBytes,
      // Prefer the X-AS-Redacted header if present (more reliable than body scan)
      // Fall back to body string scan for backwards compatibility
      redacted:
        headers["x-as-redacted"] === "true" ||
        bodyText.includes("[REDACTED_BY_AGENTSECRETS]"),
      durationMs,
    });
  }

  /**
   * Alias for call() — provided for parity with Python SDK's async_call().
   * call() is already async; this alias exists for developer familiarity.
   */
  asyncCall<T = unknown>(opts: CallOptions): Promise<AgentSecretsResponse<T>> {
    return this.call<T>(opts);
  }

  // ── spawn() ───────────────────────────────────────────────────────────────

  /**
   * Make a one-shot authenticated CLI call via `agentsecrets call`.
   *
   * Confirmed from `agentsecrets call --help`: this command resolves credentials
   * from the OS keychain and injects them into the request without ever exposing
   * the values. Equivalent to making an HTTP call through the proxy but uses the
   * CLI directly — useful when the proxy is not running or for scripting contexts.
   *
   * Flags used: --url, --method, --bearer/--basic/--header/--query/--body-field/--form-field, --body
   */
  async spawn(opts: SpawnOptions): Promise<SpawnResult> {
    if (!opts.command.length) {
      throw new AgentSecretsError("command must not be empty");
    }

    const binary = await which("agentsecrets");
    if (!binary) throw new CLINotFound();

    // `agentsecrets call` confirmed from CLI --help.
    // Build flags from SpawnOptions.command — expected format: [url, ...extra_args]
    // For richer usage, callers should use client.call() instead.
    const fullCmd = [binary, "call", ...opts.command];

    return new Promise<SpawnResult>((resolve) => {
      const proc = nodeSpawn(fullCmd[0]!, fullCmd.slice(1), {
        stdio: opts.capture === false ? "inherit" : "pipe",
        timeout: opts.timeout,
      });

      let stdout = "";
      let stderr = "";

      if (opts.capture !== false) {
        proc.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
      }

      proc.on("close", (code, signal) => {
        if (signal === "SIGTERM" && opts.timeout) {
          // Timeout fired — process was killed. Surface this clearly.
          resolve({
            exitCode: 124,
            stdout,
            stderr: `Process timed out after ${opts.timeout}ms`,
          });
        } else {
          resolve({ exitCode: code ?? 1, stdout, stderr });
        }
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          resolve({
            exitCode: 127,
            stdout: "",
            stderr: `agentsecrets binary not found: ${err.message}`,
          });
        } else {
          resolve({ exitCode: 1, stdout: "", stderr: err.message });
        }
      });
    });
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async isProxyRunning(): Promise<boolean> {
    try {
      await healthCheck(this.port);
      return true;
    } catch {
      return false;
    }
  }

  async proxyStatus(): Promise<ProxyStatus> {
    try {
      return await healthCheck(this.port);
    } catch {
      return { running: false, port: this.port };
    }
  }

  // ── Context helpers ───────────────────────────────────────────────────────

  /**
   * Temporarily switch to a workspace, run fn(), then restore.
   * Serialised via mutex — safe under concurrent async calls.
   * Reads the current workspace from CLI before switching so restoration
   * is correct even when this._workspace is undefined.
   */
  async withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this._contextMutex.run(async () => {
      // Read current workspace from CLI rather than relying on cached state
      let previous: string | undefined;
      try {
        const { stdout } = await execFileAsync("agentsecrets", [
          "workspace",
          "current",
        ]);
        previous = stdout.trim() || undefined;
      } catch {
        previous = this._workspace;
      }

      try {
        await execFileAsync("agentsecrets", ["workspace", "switch", name]);
        this._workspace = name;
        return await fn();
      } finally {
        if (previous) {
          await execFileAsync("agentsecrets", [
            "workspace",
            "switch",
            previous,
          ]).catch(() => {});
          this._workspace = previous;
        }
      }
    });
  }

  /**
   * Temporarily switch to a project, run fn(), then restore.
   * Serialised via mutex — safe under concurrent async calls.
   */
  async withProject<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this._contextMutex.run(async () => {
      let previous: string | undefined;
      try {
        const { stdout } = await execFileAsync("agentsecrets", [
          "project",
          "current",
        ]);
        previous = stdout.trim() || undefined;
      } catch {
        previous = this._project;
      }

      try {
        await execFileAsync("agentsecrets", ["project", "use", name]);
        this._project = name;
        return await fn();
      } finally {
        if (previous) {
          await execFileAsync("agentsecrets", [
            "project",
            "use",
            previous,
          ]).catch(() => {});
          this._project = previous;
        }
      }
    });
  }

  // ── Resource management ───────────────────────────────────────────────────

  close(): void {
    this._ready = null;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}
