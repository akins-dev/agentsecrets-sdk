/**
 * AgentSecrets SDK — OpenAI Example
 *
 * Bearer token injection for OpenAI Chat Completions API.
 * OPENAI_KEY is never in this file, never in memory, never logged.
 *
 * Run: node --experimental-strip-types examples/openai.ts
 * Prereq: agentsecrets secrets set OPENAI_KEY=sk-proj-...
 *         agentsecrets proxy start
 */

import { AgentSecrets, AgentSecretsNotRunning, SecretNotFound } from "../src/index.ts";

const client = new AgentSecrets();

if (!(await client.isProxyRunning())) {
  console.error("Proxy not running. Start it with: agentsecrets proxy start");
  process.exit(1);
}

try {
  const response = await client.call<{
    choices: Array<{ message: { role: string; content: string } }>;
    usage: { total_tokens: number };
  }>({
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    bearer: "OPENAI_KEY", // key name — proxy resolves the real value
    body: {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Say hello in three words." }],
      max_tokens: 20,
    },
  });

  console.log(`Status:      ${response.statusCode}`);
  // Note: the proxy does not return which secret was used in the response headers
  console.log(`Duration:    ${response.durationMs}ms`);
  console.log(`Tokens used: ${response.json().usage.total_tokens}`);
  console.log(`Reply:       ${response.json().choices[0]?.message.content}`);

} catch (err) {
  if (err instanceof AgentSecretsNotRunning) {
    console.error(err.message);
  } else if (err instanceof SecretNotFound) {
    console.error(err.message); // "Add it with: agentsecrets secrets set OPENAI_KEY=..."
  } else {
    throw err;
  }
}
