/*
 * V59 — governed Claude auth routing (cost-safe subscription-first). Offline + deterministic:
 * the process runner is injected, so NO live/paid call is made. Proves the policy functions and that
 * the governed failover chain constructs a Claude provider that prefers the subscription login (strips
 * ANTHROPIC_API_KEY from the spawned CLI env) when a login exists, honours the explicit opt-outs, and
 * never regresses key-only environments. Run: `npx tsx src/tests/provider-auth-routing.test.ts`.
 */

import fs from "node:fs";

import {
  subscriptionLoginAvailable,
  governedClaudeSubscriptionPref,
  createDefaultFailoverChain,
} from "@/providers/provider-factory";
import { PROVIDER_CONTRACT_VERSION, type ProviderMission, type ProviderRequest } from "@/providers/provider-port";
import type { ProviderProcessRunner } from "@/providers/claude-provider-adapter";

let failures = 0;
const must = (c: boolean, m: string) => { if (c) console.log("  ok -", m); else { failures++; console.error("  FAIL -", m); } };
const withEnv = (k: string, v: string | undefined, fn: () => void) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, k); const prev = process.env[k];
  if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try { fn(); } finally { if (!had) delete process.env[k]; else process.env[k] = prev; }
};

// --- 1. subscriptionLoginAvailable (injected fs/env — fully deterministic) ---
const pe = (o: Record<string, string>): NodeJS.ProcessEnv => o as unknown as NodeJS.ProcessEnv;
must(subscriptionLoginAvailable(pe({ CLAUDE_CODE_OAUTH_TOKEN: "tok" }), () => false) === true, "OAuth token env ⇒ login available");
must(subscriptionLoginAvailable(pe({}), (p) => p.endsWith(".credentials.json")) === true, "CLI credentials file ⇒ login available");
must(subscriptionLoginAvailable(pe({}), () => false) === false, "no token + no creds file ⇒ no login");

// --- 2. governedClaudeSubscriptionPref branches ---
must(governedClaudeSubscriptionPref({ preferSubscriptionAuth: false }) === false, "explicit caller false wins");
must(governedClaudeSubscriptionPref({ preferSubscriptionAuth: true }) === true, "explicit caller true wins");
withEnv("ODG_CLAUDE_USE_API_KEY", "1", () => withEnv("ODG_CLAUDE_PREFER_SUBSCRIPTION", undefined, () =>
  must(governedClaudeSubscriptionPref() === false, "ODG_CLAUDE_USE_API_KEY=1 ⇒ force API key (false)")));
withEnv("ODG_CLAUDE_USE_API_KEY", undefined, () => withEnv("ODG_CLAUDE_PREFER_SUBSCRIPTION", "1", () =>
  must(governedClaudeSubscriptionPref() === true, "ODG_CLAUDE_PREFER_SUBSCRIPTION=1 ⇒ subscription (true)")));
// Default branch (no flags): must equal the real login-availability signal (consistency, no hard-code).
withEnv("ODG_CLAUDE_USE_API_KEY", undefined, () => withEnv("ODG_CLAUDE_PREFER_SUBSCRIPTION", undefined, () => {
  const def = governedClaudeSubscriptionPref();
  const expected = subscriptionLoginAvailable() ? true : undefined;
  must(def === expected, `default branch tracks login signal (got ${String(def)})`);
}));

// --- 3. governed chain behaviour via injected runner (no live call) ---
function mission(): ProviderMission {
  return { mission: "V59", priority: "NORMAL", mode: "IMPLEMENT", objectives: [{ id: "o1", goal: "x", done_when: [] }],
    definitionOfDone: ["d"], completion: ["RELEASE"], authorizedPaths: ["src/app/**"],
    context: { repoRoot: "/repo", branch: "main", headCommit: "h", masterPlanObjectives: ["X"], missingCapabilities: ["X"] } };
}
const request: ProviderRequest = { providerContractVersion: PROVIDER_CONTRACT_VERSION, mission: mission(), model: "claude-opus-4-8", maxTurns: 3 };
const okEnvelope = JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "s",
  result: JSON.stringify({ mission: "V59", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: null }) });
function capture(): { run: ProviderProcessRunner; env: () => NodeJS.ProcessEnv | undefined } {
  let captured: NodeJS.ProcessEnv | undefined; let seen = false;
  const run: ProviderProcessRunner = (bin, _a, o) => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    seen = true; captured = o.env; return { status: 0, stdout: okEnvelope, stderr: "" };
  };
  return { run, env: () => { if (!seen) throw new Error("runner not invoked"); return captured; } };
}
const hadKey = Object.prototype.hasOwnProperty.call(process.env, "ANTHROPIC_API_KEY");
if (!hadKey) process.env.ANTHROPIC_API_KEY = "PLACEHOLDER_NOT_A_REAL_KEY";
const cacheBase = `${process.cwd()}/runtime/generated/provider-auth-test`;
try {
  // (a) governed default: if a login exists in THIS env, the child env strips ANTHROPIC_API_KEY (subscription).
  withEnv("ODG_CLAUDE_USE_API_KEY", undefined, () => withEnv("ODG_CLAUDE_PREFER_SUBSCRIPTION", undefined, () => {
    const c = capture();
    const chain = createDefaultFailoverChain({ claude: { run: c.run, cacheDir: `${cacheBase}-a` } });
    chain[0].create().execute(request);
    const e = c.env();
    if (subscriptionLoginAvailable()) must(!!e && !("ANTHROPIC_API_KEY" in e), "governed default + login ⇒ API key stripped (subscription, €0)");
    else must(e === undefined, "governed default + no login ⇒ inherit env (API key, no regression)");
  }));
  // (b) explicit API-key opt-out: child env inherits (uses key) regardless of login.
  withEnv("ODG_CLAUDE_USE_API_KEY", "1", () => {
    const c = capture();
    const chain = createDefaultFailoverChain({ claude: { run: c.run, cacheDir: `${cacheBase}-b` } });
    chain[0].create().execute(request);
    must(c.env() === undefined, "ODG_CLAUDE_USE_API_KEY=1 ⇒ governed chain inherits env (direct API key)");
  });
} finally {
  if (!hadKey) delete process.env.ANTHROPIC_API_KEY;
  fs.rmSync(cacheBase + "-a", { recursive: true, force: true });
  fs.rmSync(cacheBase + "-b", { recursive: true, force: true });
}

if (failures > 0) { console.error(`\nprovider-auth-routing: ${failures} FAILED`); process.exit(1); }
console.log("\nV59 provider auth routing OK");
