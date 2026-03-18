/**
 * AgentSecrets SDK — GitHub Example
 *
 * Bearer injection with custom headers.
 * Demonstrates GET, typed response, and error handling.
 *
 * Run: node --experimental-strip-types examples/github.ts
 * Prereq: agentsecrets secrets set GITHUB_TOKEN=ghp_...
 *         agentsecrets proxy start
 */

import { AgentSecrets, AgentSecretsNotRunning, SecretNotFound } from "../src/index.ts";

const client = new AgentSecrets();

if (!(await client.isProxyRunning())) {
  console.error("Proxy not running. Start it with: agentsecrets proxy start");
  process.exit(1);
}

try {
  const user = await client.call<{ login: string; public_repos: number }>({
    url: "https://api.github.com/user",
    bearer: "GITHUB_TOKEN",
    headers: {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  console.log(`Status:      ${user.statusCode}`);
  // Note: the proxy does not return which secret was used in the response headers
    console.log(`Duration:    ${user.durationMs}ms`);
  console.log(`Login:       ${user.json().login}`);
  console.log(`Public repos:${user.json().public_repos}`);

} catch (err) {
  if (err instanceof AgentSecretsNotRunning) {
    console.error(err.message);
  } else if (err instanceof SecretNotFound) {
    console.error(err.message);
  } else {
    throw err;
  }
}
