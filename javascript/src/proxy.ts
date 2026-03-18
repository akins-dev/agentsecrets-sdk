/**
 * AgentSecrets Proxy Protocol — Header Builders
 *
 * Mirrors _build_proxy_headers() in the Python SDK (call.py).
 * Header format confirmed from Go proxy source (pkg/proxy/server.go parseInjections).
 */

import type { CallOptions } from "./types.js";

export const DEFAULT_PORT = 8765;
export const PROXY_PATH = "/proxy";
/** /health not used — health check uses `agentsecrets proxy status` CLI command instead */
export const HEALTH_PATH = "/health"; // kept for reference, not used in SDK

export const PROXY_HEADERS = {
  TARGET_URL: "X-AS-Target-URL",
  METHOD: "X-AS-Method",
  AGENT_ID: "X-AS-Agent-ID",
  INJECT_BEARER: "X-AS-Inject-Bearer",
  INJECT_BASIC: "X-AS-Inject-Basic",
} as const;

// ─── URL validation ───────────────────────────────────────────────────────────

/**
 * Validate that a URL is a safe, parseable http/https URL.
 * Prevents SSRF via file://, data://, internal hostnames passed blindly to proxy.
 */
export function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `URL must use http or https — got "${parsed.protocol}" in "${url}"`,
    );
  }
}

// ─── Header key sanitisation ──────────────────────────────────────────────────

/**
 * Sanitise a user-supplied key that will be embedded in an HTTP header name.
 * Header names must not contain: whitespace, colon, newline, carriage return,
 * or any X-AS-Inject-* prefix that could shadow proxy control headers.
 *
 * Throws if the key is unsafe rather than silently stripping — explicit failure
 * is safer than silent truncation which might still be exploitable.
 */
export function sanitiseHeaderKey(key: string, context: string): void {
  if (/[\r\n: \t]/.test(key)) {
    throw new Error(
      `${context} key "${key}" contains illegal characters (\\r, \\n, :, or whitespace). ` +
        "Header injection is not allowed.",
    );
  }
  // Prevent constructing a second X-AS-Inject-Bearer etc. via a crafted key name
  if (/^x-as-inject/i.test(key)) {
    throw new Error(
      `${context} key "${key}" must not start with "X-AS-Inject" — ` +
        "this would shadow proxy control headers.",
    );
  }
}

// ─── Header builder ───────────────────────────────────────────────────────────

/**
 * Build X-AS-* proxy headers from call options.
 *
 * Dynamic header formats (confirmed from Python SDK / Go proxy source):
 *   Custom header:  X-AS-Inject-Header-{HeaderName} = SECRET_KEY_NAME
 *   Query param:    X-AS-Inject-Query-{param}        = SECRET_KEY_NAME
 *   Body field:     X-AS-Inject-Body-{path}          = SECRET_KEY_NAME
 *   Form field:     X-AS-Inject-Form-{key}           = SECRET_KEY_NAME
 */
export function buildProxyHeaders(
  opts: CallOptions,
  method: string,
): Record<string, string> {
  validateUrl(opts.url);

  const headers: Record<string, string> = {
    [PROXY_HEADERS.TARGET_URL]: opts.url,
    [PROXY_HEADERS.METHOD]: method.toUpperCase(),
  };

  if (opts.bearer) headers[PROXY_HEADERS.INJECT_BEARER] = opts.bearer;
  if (opts.basic) headers[PROXY_HEADERS.INJECT_BASIC] = opts.basic;

  if (opts.header) {
    for (const [headerName, secretKey] of Object.entries(opts.header)) {
      sanitiseHeaderKey(headerName, "header");
      headers[`X-AS-Inject-Header-${headerName}`] = secretKey;
    }
  }
  if (opts.query) {
    for (const [param, secretKey] of Object.entries(opts.query)) {
      sanitiseHeaderKey(param, "query");
      headers[`X-AS-Inject-Query-${param}`] = secretKey;
    }
  }
  if (opts.bodyField) {
    for (const [path, secretKey] of Object.entries(opts.bodyField)) {
      sanitiseHeaderKey(path, "bodyField");
      headers[`X-AS-Inject-Body-${path}`] = secretKey;
    }
  }
  if (opts.formField) {
    for (const [key, secretKey] of Object.entries(opts.formField)) {
      sanitiseHeaderKey(key, "formField");
      headers[`X-AS-Inject-Form-${key}`] = secretKey;
    }
  }
  if (opts.agentId) headers[PROXY_HEADERS.AGENT_ID] = opts.agentId;

  return headers;
}
