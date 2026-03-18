/**
 * @the-17/agentsecrets-sdk
 *
 * Zero-knowledge secrets infrastructure for AI agents.
 */

export { AgentSecrets } from "./client.js";
export type { AgentSecretsConfig } from "./client.js";

export { AgentSecretsResponse } from "./types.js";
export type {
  CallOptions,
  SpawnOptions,
  SpawnResult,
  ProxyStatus,
} from "./types.js";

export {
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
} from "./types.js";

export { SDK_VERSION } from "./types.js";

export { buildProxyHeaders, validateUrl, sanitiseHeaderKey, DEFAULT_PORT, PROXY_PATH, HEALTH_PATH, PROXY_HEADERS } from "./proxy.js";
export { which } from "./which.js";
