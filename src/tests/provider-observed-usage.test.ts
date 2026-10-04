/*
 * V5 Stage 3 — E: PROVIDER OBSERVED USAGE TRANSPORT.
 *
 * Reproduces and locks the information loss E fixes: a provider can OBSERVE how many resources a call
 * consumed (the Claude Code CLI JSON envelope and the OpenAI API both return token usage), but before
 * this increment the common ProviderOutcome contract had nowhere to carry it, so every cost-accounting
 * consumer downstream was blind to it. This proves the observation is now transported — OBSERVED when
 * real, ABSENT when the provider reports nothing — WITHOUT fabricating a cost, defaulting a currency,
 * or turning a token count into money, and with full backward compatibility for pre-E outcomes.
 *
 * Injected/fake providers only — NO real (paid) provider call. Run:
 *   node_modules/.bin/tsx src/tests/provider-observed-usage.test.ts
 */
import {
  ClaudeProviderAdapter,
  type ProviderProcessResult,
  type ProviderProcessRunner,
} from "@/providers/claude-provider-adapter";
import { OpenAIProviderAdapter } from "@/providers/openai-provider-adapter";
import type { OpenAiChatEnvelope } from "@/providers/openai-sdk-call";
import {
  PROVIDER_CONTRACT_VERSION,
  observationOf,
  type ProviderMission,
  type ProviderOutcome,
  type ProviderRequest,
} from "@/providers/provider-port";
import { runMissionWithFailover, haltOutcome } from "@/runtime/provider-failover-engine";
import type { AvailabilityEnv } from "@/providers/provider-availability";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function mission(authorizedPaths: string[] = []): ProviderMission {
  return {
    mission: "DEMO_OBSERVED",
    priority: "NORMAL",
    mode: authorizedPaths.length ? "IMPLEMENT" : "AUDIT",
    objectives: [{ id: "o1", goal: "Deliver X.", done_when: ["ok"] }],
    definitionOfDone: ["done"],
    completion: ["RELEASE"],
    authorizedPaths,
    context: {
      repoRoot: "/repo",
      branch: "main",
      headCommit: "abc123",
      masterPlanObjectives: ["X"],
      missingCapabilities: ["X"],
    },
  };
}
function request(m: ProviderMission, extra: Partial<ProviderRequest> = {}): ProviderRequest {
  return { providerContractVersion: PROVIDER_CONTRACT_VERSION, mission: m, model: "claude-opus-4-8", maxTurns: 10, ...extra };
}

const doneResult = {
  mission: "DEMO_OBSERVED",
  providerContractVersion: "1.0.0",
  status: "DONE",
  objectivesAddressed: ["o1"],
  changedFiles: [],
  commandsRun: [],
  blocker: null,
};
const claudeEnvelope = (opts: { usage?: object; cost?: number } = {}): string =>
  JSON.stringify({
    type: "result", subtype: "success", is_error: false, session_id: "s1", num_turns: 3,
    ...(opts.cost !== undefined ? { total_cost_usd: opts.cost } : {}),
    ...(opts.usage !== undefined ? { usage: opts.usage } : {}),
    result: JSON.stringify(doneResult),
  });

/** Claude runner: clean tree, returns the scripted envelope on the `claude` call. */
function claudeRunner(stdout: string): ProviderProcessRunner {
  let claudeCalls = 0;
  return ((bin: string): ProviderProcessResult => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    claudeCalls++;
    return { status: 0, stdout, stderr: "" };
  }) as ProviderProcessRunner;
}

console.log("V5 — E: PROVIDER OBSERVED USAGE TRANSPORT");

// 1 — Claude WITH observed usage ⇒ OBSERVED token quantity transported; money kept as raw evidence only.
{
  const run = claudeRunner(claudeEnvelope({ usage: { input_tokens: 1000, output_tokens: 250, cache_read_input_tokens: 40 }, cost: 0.0123 }));
  const out = new ClaudeProviderAdapter({ run, cacheDir: `${process.cwd()}/runtime/generated/obs-cache-1` }).execute(request(mission()));
  const obs = observationOf(out);
  check(obs.basis === "OBSERVED", "claude usage present ⇒ basis OBSERVED");
  check(obs.quantities.length === 1 && obs.quantities[0].unit === "token" && obs.quantities[0].kind === "COST_UNIT", "observed quantity is a token COST_UNIT");
  check(obs.quantities[0].minor === 1250 && obs.quantities[0].scale === 0, "observed tokens = input+output (1250), exact integer, scale 0");
  check(obs.quantities.every((q) => Number.isInteger(q.minor)), "no float — minor is an integer (exact)");
  check(obs.provenance !== null && /claude-code/.test(obs.provenance), "provenance names the provider + source field");
  // The provider's own USD figure is preserved as EVIDENCE only — never certified as an economic cost.
  check(obs.providerReported?.total_cost_usd === 0.0123, "provider total_cost_usd preserved verbatim as raw evidence");
  check(!obs.quantities.some((q) => q.unit === "usd" || q.kind === "ASSET"), "money is NOT fabricated into an economic cost quantity (no currency unit)");
}

// 2 — Claude WITHOUT a usage block ⇒ explicit ABSENT (never a fabricated zero cost).
{
  const run = claudeRunner(claudeEnvelope({})); // no usage field at all
  const out = new ClaudeProviderAdapter({ run, cacheDir: `${process.cwd()}/runtime/generated/obs-cache-2` }).execute(request(mission()));
  const obs = observationOf(out);
  check(obs.basis === "ABSENT", "claude no usage ⇒ basis ABSENT (absence is explicit)");
  check(obs.quantities.length === 0, "ABSENT ⇒ no fabricated quantities");
}

// 3 — Claude usage present but non-integer / empty ⇒ ABSENT (never coerced).
{
  const run = claudeRunner(claudeEnvelope({ usage: { input_tokens: "lots", output_tokens: null } }));
  const out = new ClaudeProviderAdapter({ run, cacheDir: `${process.cwd()}/runtime/generated/obs-cache-3` }).execute(request(mission()));
  check(observationOf(out).basis === "ABSENT", "non-integer usage ⇒ ABSENT (no coercion, no fabrication)");
}

// 4 — OpenAI WITH usage ⇒ OBSERVED total tokens; WITHOUT usage ⇒ ABSENT.
{
  const envOk: OpenAiChatEnvelope = {
    ok: true, text: JSON.stringify(doneResult), model: "gpt-4o-mini", id: "resp-1",
    finishReason: "stop", usage: { promptTokens: 300, completionTokens: 120, totalTokens: 420 }, created: null, error: null,
  };
  const outA = new OpenAIProviderAdapter({ apiKey: "sk-test", call: () => envOk }).execute(request(mission()));
  const obsA = observationOf(outA);
  check(obsA.basis === "OBSERVED" && obsA.quantities[0].minor === 420 && obsA.quantities[0].unit === "token", "openai usage ⇒ OBSERVED total_tokens=420");
  check(obsA.providerReported?.promptTokens === 300 && obsA.providerReported?.completionTokens === 120, "openai per-side breakdown preserved as evidence");

  const envNoUsage: OpenAiChatEnvelope = { ...envOk, usage: null };
  const outB = new OpenAIProviderAdapter({ apiKey: "sk-test", call: () => envNoUsage }).execute(request(mission()));
  check(observationOf(outB).basis === "ABSENT", "openai no usage ⇒ ABSENT");
}

// 5 — Failover PRESERVES the provider's observation verbatim (Claude selected, injected runner).
{
  const env: AvailabilityEnv = { env: { ANTHROPIC_API_KEY: "k" }, hasBinary: () => true }; // claude available
  const run = claudeRunner(claudeEnvelope({ usage: { input_tokens: 10, output_tokens: 5 }, cost: 0.001 }));
  const res = runMissionWithFailover(request(mission()), { claude: { run }, env });
  check(res.executed && res.outcome !== null, "failover selected Claude and executed (injected runner)");
  const obs = observationOf(res.outcome as ProviderOutcome);
  check(obs.basis === "OBSERVED" && obs.quantities[0].minor === 15, "failover forwards the provider's OBSERVED usage unchanged (15 tokens)");
}

// 6 — A Runtime halt (no provider ran) carries ABSENT — nothing was observed, nothing fabricated.
{
  const env: AvailabilityEnv = { env: {}, hasBinary: () => false }; // neither provider usable
  const res = runMissionWithFailover(request(mission(["src/app/**"])), { env });
  check(!res.executed && res.outcome === null, "no provider can continue ⇒ no execution");
  const halt = haltOutcome(request(mission(["src/app/**"])), res.report);
  check(observationOf(halt).basis === "ABSENT", "synthesized halt outcome ⇒ ABSENT observation (no fabricated usage)");
}

// 7 — Backward compatibility: a pre-E outcome (no `observation` field) reads as ABSENT, not a crash/zero.
{
  const legacy = {
    provider: "claude-code", classification: "OK", providerExecuted: true, fromCache: false,
    result: null, sessionId: null, changedFiles: [], unauthorizedChanges: [],
    raw: { exitCode: 0, stdout: "", stderr: "" }, diagnostics: [],
  } as ProviderOutcome; // deliberately omits `observation`
  check(observationOf(legacy).basis === "ABSENT", "legacy outcome without observation ⇒ ABSENT (backward compatible)");
}

console.log(failures === 0 ? "ALL PASS — E PROVIDER OBSERVED USAGE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
