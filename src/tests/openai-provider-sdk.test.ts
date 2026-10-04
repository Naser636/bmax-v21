/*
 * OpenAI Provider (SDK transport) — proof for IMPLEMENT_OPENAI_PROVIDER_ADAPTER,
 * VERIFY_OPENAI_PROVIDER_CONNECTIVITY and PROVE_OPENAI_PROVIDER_EXECUTION.
 *
 * Deterministic, zero-cost by default (an injected chat caller stands in for the real SDK). It
 * proves, without touching the network:
 *   A) availability requires ONLY a credential — no `codex` binary is ever needed (SDK transport);
 *   B) the OpenAI adapter's REAL execute() path runs end-to-end and returns a DONE result;
 *   C) the ProviderFactory selects OpenAI when Claude is unavailable (multi-provider, config-driven);
 *   D) the Provider Activation seam routes Registry → Orchestrator → OpenAI and captures the response.
 *
 * E) An OPTIONAL live call to the real OpenAI API runs ONLY when OPENAI_LIVE=1 and OPENAI_API_KEY are
 *    set — so the normal suite never makes a paid call — and writes the real-call proof file.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { OpenAIProviderAdapter, isLocalBaseURL } from "@/providers/openai-provider-adapter";
import { resolveEngineeringProvider } from "@/providers/provider-factory";
import { activateAndExecute } from "@/runtime/provider-activation";
import type { AvailabilityEnv } from "@/providers/provider-availability";
import type { OpenAiChatEnvelope, OpenAiChatInput } from "@/providers/openai-sdk-call";
import type { ProviderRequest } from "@/providers/provider-port";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const request: ProviderRequest = {
  providerContractVersion: "1.0.0",
  model: "",
  maxTurns: 8,
  mission: {
    mission: "PROVE_OPENAI_PROVIDER_EXECUTION",
    priority: "P1",
    mode: "ENGINEERING",
    objectives: [{ id: "OBJ-1", goal: "prove OpenAI execution", done_when: ["a real response"] }],
    definitionOfDone: [],
    completion: [],
    authorizedPaths: [],
    context: { repoRoot: process.cwd(), branch: "", headCommit: "", masterPlanObjectives: [], missingCapabilities: [] },
  },
};

const doneEnvelope = (): OpenAiChatEnvelope => ({
  ok: true,
  text:
    "```json\n" +
    JSON.stringify({
      mission: "PROVE_OPENAI_PROVIDER_EXECUTION",
      providerContractVersion: "1.0.0",
      status: "DONE",
      objectivesAddressed: ["OBJ-1"],
      changedFiles: [],
      commandsRun: [],
      blocker: null,
    }) +
    "\n```",
  model: "gpt-4o-mini",
  id: "chatcmpl-test-1",
  finishReason: "stop",
  usage: { promptTokens: 42, completionTokens: 18, totalTokens: 60 },
  created: 0,
  error: null,
});

// --- A) availability requires ONLY a key — no codex binary ----------------------------------------
{
  const adapter = new OpenAIProviderAdapter({ apiKey: "sk-test" });
  const noBinaries: AvailabilityEnv = { env: {}, hasBinary: () => false };
  const av = adapter.checkAvailability(noBinaries);
  assert(av.available === true, "OpenAI available with a key and NO binaries on PATH (SDK transport)");
  assert(av.checks.some((c) => c.requirement === "sdk:openai" && c.satisfied), "SDK requirement satisfied without any CLI");
  assert(!av.checks.some((c) => /codex/.test(c.requirement)), "no codex binary requirement remains");

  const noKey = new OpenAIProviderAdapter().checkAvailability({ env: {}, hasBinary: () => false });
  assert(noKey.available === false, "no key → unavailable");
  assert(/OPENAI_API_KEY/.test(noKey.missingConfiguration ?? ""), "missing config names OPENAI_API_KEY precisely");
}

// --- A2) LOCAL OpenAI-compatible endpoint (Ollama/LM Studio/LocalAI/vLLM) → available WITHOUT a key ---
{
  // local base URL + NO key ⇒ available (local servers need no credential); remote still needs a key.
  const local = new OpenAIProviderAdapter({ baseURL: "http://localhost:11434/v1" }).checkAvailability({ env: {}, hasBinary: () => false });
  assert(local.available === true, "local OpenAI-compatible endpoint ⇒ available without OPENAI_API_KEY");
  assert(local.checks.some((c) => /endpoint:local/.test(c.requirement)), "availability names the local-endpoint requirement");

  const remoteNoKey = new OpenAIProviderAdapter({ baseURL: "https://api.openai.com/v1" }).checkAvailability({ env: {}, hasBinary: () => false });
  assert(remoteNoKey.available === false, "remote base URL + no key ⇒ still unavailable (no accidental key bypass)");

  assert(isLocalBaseURL("http://127.0.0.1:1234/v1") === true, "isLocalBaseURL: 127.0.0.1 ⇒ local");
  assert(isLocalBaseURL("http://localhost:8000") === true, "isLocalBaseURL: localhost ⇒ local");
  assert(isLocalBaseURL("https://api.openai.com") === false, "isLocalBaseURL: remote host ⇒ not local");
  assert(isLocalBaseURL(undefined) === false, "isLocalBaseURL: undefined ⇒ not local");
}

// --- B) real execute() path via injected SDK caller (zero cost) → OK + DONE -----------------------
{
  let sawGuardrail = false;
  let sawMission = false;
  const call = (input: OpenAiChatInput): OpenAiChatEnvelope => {
    sawGuardrail = input.system.includes("engineering capability provider");
    sawMission = input.user.includes("PROVE_OPENAI_PROVIDER_EXECUTION");
    return doneEnvelope();
  };
  const adapter = new OpenAIProviderAdapter({ apiKey: "sk-test", call });
  const outcome = adapter.execute(request);
  assert(sawGuardrail, "guardrail system preamble was sent to the SDK");
  assert(sawMission, "deterministically rendered mission prompt was sent to the SDK");
  assert(outcome.provider === "openai-sdk", "provider identity is the SDK adapter (no codex)");
  assert(outcome.providerExecuted === true, "a real call was attempted");
  assert(outcome.classification === "OK", "clean SDK response → OK");
  assert(outcome.result?.status === "DONE", "DONE result parsed from the SDK response");
  assert(outcome.sessionId === "chatcmpl-test-1", "response id captured as the session handle");
}

// --- C) factory selects OpenAI when Claude is unavailable (config-driven multi-provider) ----------
{
  const env: AvailabilityEnv = { env: { OPENAI_API_KEY: "sk-test" }, hasBinary: () => false };
  const decision = resolveEngineeringProvider({ openai: { apiKey: "sk-test" } }, env);
  assert(decision.canContinue === true, "chain can continue on OpenAI");
  assert(decision.selectedProvider === "openai-sdk", "OpenAI selected as failover when Claude is absent");
}

// --- D) activation seam: Registry → Orchestrator → OpenAI, injected caller (zero cost) ------------
{
  const ev = activateAndExecute(
    {
      mission: "PROVE_OPENAI_PROVIDER_EXECUTION",
      mode: "ENGINEERING",
      requiresEngineering: true,
      objectives: [{ id: "OBJ-1", goal: "prove", done_when: ["evidence"] }],
    },
    {
      policy: { mode: "ENGINEERING_ENABLED", externalProvidersEnabled: true, providers: [{ id: "openai", priority: 100 }], defaultProvider: "openai", fallbackProvider: "openai" },
      env: { env: { OPENAI_API_KEY: "sk-test" }, hasBinary: () => false },
      execute: true,
      openai: { apiKey: "sk-test", call: () => doneEnvelope() },
    },
  );
  assert(ev.orchestration.selectedProvider === "openai", "Orchestrator/Registry selected OpenAI");
  assert(ev.execution.providerExecuted === true, "the real adapter execute() path ran via the seam");
  assert(ev.execution.response?.status === "DONE", "the seam captured a DONE response from OpenAI");
  assert(ev.secretsExposed === false, "no secret written to activation evidence");
}

// --- E) OPTIONAL live real OpenAI call (only OPENAI_LIVE=1 + OPENAI_API_KEY) -----------------------
if (process.env.OPENAI_LIVE === "1" && process.env.OPENAI_API_KEY) {
  const proofPath = path.join("runtime", "generated", "openai-provider-call.json");
  const ev = activateAndExecute(
    {
      mission: "VERIFY_OPENAI_PROVIDER_CONNECTIVITY",
      mode: "ENGINEERING",
      requiresEngineering: true,
      objectives: [{ id: "OBJ-1", goal: "Return a RESULT JSON with status DONE proving live connectivity.", done_when: ["a real OpenAI response is received"] }],
    },
    {
      policy: { mode: "ENGINEERING_ENABLED", externalProvidersEnabled: true, providers: [{ id: "openai", priority: 100 }], defaultProvider: "openai", fallbackProvider: "openai" },
      env: { env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY }, hasBinary: () => false },
      execute: true,
      openai: { apiKey: process.env.OPENAI_API_KEY, proofPath },
    },
  );
  assert(ev.orchestration.selectedProvider === "openai", "LIVE: OpenAI selected by the seam");
  assert(ev.execution.providerExecuted === true, "LIVE: OpenAI actually executed a real call");
  assert(fs.existsSync(proofPath), "LIVE: real-call proof file was written");
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  assert(proof.ok === true, `LIVE: the real OpenAI call succeeded (${proof.error ?? ""})`);
  assert(typeof proof.responseId === "string" && proof.responseId.length > 0, "LIVE: a real API response id is present");
  assert(proof.secretsExposed === false, "LIVE: proof carries no secret");
  console.log(`LIVE OpenAI call OK — model=${proof.servedModel}, id=${proof.responseId}, tokens=${proof.usage?.totalTokens ?? "?"}`);
} else {
  console.log("(live OpenAI call skipped — set OPENAI_LIVE=1 and OPENAI_API_KEY to run)");
}

console.log("OpenAI Provider SDK OK");
