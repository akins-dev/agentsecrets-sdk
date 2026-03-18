/**
 * AgentSecrets SDK — Stripe Example
 *
 * Bearer token injection — the most common auth pattern.
 * STRIPE_KEY is never in this file, never in memory, never logged.
 *
 * Run: node --experimental-strip-types examples/stripe.ts
 * Prereq: agentsecrets secrets set STRIPE_KEY=sk_live_...
 *         agentsecrets proxy start
 */

import { AgentSecrets, AgentSecretsNotRunning, SecretNotFound } from "../src/index.ts";

const client = new AgentSecrets();

// Always check the proxy is up before making calls
if (!(await client.isProxyRunning())) {
  console.error("Proxy not running. Start it with: agentsecrets proxy start");
  process.exit(1);
}

try {
  // ── GET: fetch Stripe balance ───────────────────────────────────────────────
  const balance = await client.call<{
    available: Array<{ amount: number; currency: string }>;
  }>({
    url: "https://api.stripe.com/v1/balance",
    bearer: "STRIPE_KEY", // key name — proxy resolves the real value
  });

  console.log(`Status:      ${balance.statusCode}`);
  // Note: the proxy does not return which secret was used in the response headers
    console.log(`Duration:    ${balance.durationMs}ms`);
  console.log("Balance:    ", balance.json().available);

  // ── POST: create a Stripe customer ─────────────────────────────────────────
  // Stripe's create-customer endpoint uses application/x-www-form-urlencoded,
  // so we pass the body as URLSearchParams and set the Content-Type header manually.
  const params = new URLSearchParams();
  params.set("email", "user@example.com");
  params.set("description", "SDK test");

  const customer = await client.call<{ id: string; email: string }>({
    url: "https://api.stripe.com/v1/customers",
    method: "POST",
    bearer: "STRIPE_KEY",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  console.log("\nCreated customer:", customer.json().id, customer.json().email);

} catch (err) {
  if (err instanceof AgentSecretsNotRunning) {
    console.error(err.message);
  } else if (err instanceof SecretNotFound) {
    console.error(err.message); // "Add it with: agentsecrets secrets set STRIPE_KEY=..."
  } else {
    throw err;
  }
}
