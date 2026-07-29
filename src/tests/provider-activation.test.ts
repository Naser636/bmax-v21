/*
 * Provider Activation — end-to-end proof.
 *
 * Proves the seam that ACTIVATES the Provider Registry + Orchestrator inside the Runtime and turns
 * their decision into a real, evidenced provider call:
 *   A) policy-enabled + a credentialed provider + execute → the REAL adapter .execute() path runs
 *      (injected process runner, zero cost) and a genuine DONE response is captured;
 *   B) policy-enabled + NO credential → provider still SELECTED, but the precise failure cause is
 *      surfaced (no execution, honest blocker);
 *   C) policy DENIES external providers → NO_PROVIDER_AVAILABLE with a precise policy-deny cause;
 *   D) a read-only mission → NO_PROVIDER_NEEDED (capability-before-provider honoured).
 * Also verifies the live policy file (runtime/config/provider-policy.json) is enabled + enforced.
 */

import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

import { activateAndExecute, readProviderPolicy } from "@/runtime/provider-activation";
import type { ProviderProcessResult, ProviderProcessRunner } from "@/providers/claude-provider-adapter";
import type { AvailabilityEnv } from "@/providers/provider-availability";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const freshCacheDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "pa-cache-"));

/** Availability view: `present` ⇒ Claude credential + `claude` binary exist. */
const envWith = (present: boolean): AvailabilityEnv => ({
  env: present ? { ANTHROPIC_API_KEY: "test-key" } : {},
  hasBinary: (bin) => present && bin === "claude",
});

const successEnvelope = (result: object): string =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "sess-1", num_turns: 2, result: JSON.stringify(result) });

const engineeringMission = {
  mission: "PROVIDER_ACTIVATION_SMOKE",
  mode: "ENGINEERING",
  requiresEngineering: true,
  objectives: [{ id: "OBJ-1", goal: "exercise the provider route", done_when: ["evidence written"] }],
};

// --- A) real execute → DONE response (injected runner, no live/paid call) --------------------------
{
  const fakeRun: ProviderProcessRunner = (bin): ProviderProcessResult => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "", signal: null, timedOut: false };
    return {
      status: 0,
      stdout: successEnvelope({ mission: "PROVIDER_ACTIVATION_SMOKE", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["OBJ-1"], changedFiles: [], commandsRun: [], blocker: null }),
      stderr: "",
      signal: null,
      timedOut: false,
    };
  };
  const ev = activateAndExecute(engineeringMission, {
    policy: { mode: "ENGINEERING_ENABLED", externalProvidersEnabled: true },
    env: envWith(true),
    execute: true,
    claude: { run: fakeRun, cacheDir: freshCacheDir() },
  });

  assert(ev.registry.registered.length === 2, "both providers registered into the Registry");
  assert(ev.policy.enforced === true, "policy is enforced by the seam");
  assert(ev.orchestration.decision === "PROVIDER_SELECTED", "Orchestrator selected a provider");
  assert(ev.orchestration.selectedProvider === "claude", "Claude selected (highest priority)");
  assert(ev.orchestration.considered.includes("openai"), "OpenAI considered as failover");
  assert(ev.execution.executed === true, "the selected provider was actually executed");
  assert(ev.execution.providerExecuted === true, "the provider process ran");
  assert(ev.execution.response !== null && ev.execution.response.status === "DONE", "a real DONE response was captured");
  assert(ev.execution.blocker === null, "no blocker on the success path");
  assert(ev.secretsExposed === false, "no secret ever written to evidence");
}

// --- B) policy-enabled but NO credential → SELECTED + precise failure cause ------------------------
{
  const ev = activateAndExecute(engineeringMission, {
    policy: { mode: "ENGINEERING_ENABLED", externalProvidersEnabled: true },
    env: envWith(false),
    execute: false,
  });
  assert(ev.orchestration.decision === "PROVIDER_SELECTED", "provider still SELECTED (selection is policy-driven, not env-driven)");
  assert(ev.execution.executed === false, "no execution without readiness");
  assert(ev.failover.canContinue === false, "chain cannot continue without a credential");
  assert(typeof ev.execution.blocker === "string" && ev.execution.blocker.length > 0, "a precise, actionable blocker is surfaced");
  assert(ev.failover.providerLines.some((l) => /UNAVAILABLE/.test(l)), "provider lines enumerate the exact unavailability reason");
}

// --- C) policy denies external providers → NO_PROVIDER_AVAILABLE + policy-deny cause ---------------
{
  const ev = activateAndExecute(engineeringMission, {
    policy: { mode: "LOCAL_ONLY", externalProvidersEnabled: false },
    env: envWith(true),
  });
  assert(ev.orchestration.decision === "NO_PROVIDER_AVAILABLE", "no enabled provider when policy denies external");
  assert(/policy/i.test(ev.execution.blocker ?? ""), "the blocker names the policy as the cause");
  assert(ev.execution.attempted === false, "no execution attempted under a deny policy");
}

// --- D) read-only mission → NO_PROVIDER_NEEDED (capability before provider) ------------------------
{
  const ev = activateAndExecute({ mode: "AUDIT" }, {
    policy: { mode: "ENGINEERING_ENABLED", externalProvidersEnabled: true },
    env: envWith(true),
  });
  assert(ev.orchestration.decision === "NO_PROVIDER_NEEDED", "read-only mission needs no provider");
  assert(ev.orchestration.selectedProvider === null, "no provider selected for a read-only mission");
  assert(ev.execution.attempted === false, "nothing executed for a read-only mission");
}

// --- live policy file is enabled + enforced --------------------------------------------------------
{
  const policy = readProviderPolicy();
  assert(policy.externalProvidersEnabled === true, "runtime/config/provider-policy.json enables external providers");
  assert(policy.defaultProvider === "claude" && policy.fallbackProvider === "openai", "policy default=claude, fallback=openai");
}

console.log("Provider Activation OK");
