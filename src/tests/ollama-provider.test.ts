/*
 * WAKE_OLLAMA_GOVERNED_PROVIDER_V1 (V61) — proof that the already-live local Ollama service is a GOVERNED,
 * PROPOSE-ONLY EngineeringProviderPort, built by REUSING the existing OpenAIProviderAdapter against Ollama's
 * OpenAI-compatible endpoint (/v1/chat/completions). No new adapter/transport/writer/primitive.
 *
 * Proven, deterministically (no network, zero cost):
 *   A) createOllamaProvider() conforms to EngineeringProviderPort and identifies truthfully as "ollama-local";
 *   B) ollamaAvailability — a LOCAL endpoint is available WITHOUT a key when a model is pinned; fail-closed
 *      UNAVAILABLE when no model is pinned; a NON-local base URL still requires a credential (can never
 *      silently become a paid remote provider);
 *   C) AUTHORITY: on a PROPOSE_ONLY run the provider returns proposedEdits but mutates NOTHING in the tree
 *      (ProviderOutcome.changedFiles === [] and unauthorizedChanges === []) — ODG's patch-executor applies.
 *
 * D) LIVE (reachability-gated; SKIPS when no local Ollama answers — CI-safe; external cost €0): drive the REAL
 *    createOllamaProvider().execute() against the real local Ollama and prove a real response + observed usage
 *    + zero tree writes. Endpoint = OLLAMA base URL; model auto-discovered from /v1/models.
 */
import {
  createOllamaProvider,
  ollamaAvailability,
  OLLAMA_DEFAULT_BASE_URL,
} from "@/providers/provider-factory";
import type { EngineeringProviderPort, ProviderRequest } from "@/providers/provider-port";
import type { OpenAiChatEnvelope } from "@/providers/openai-sdk-call";

let failures = 0;
function must(cond: unknown, msg: string): void {
  if (cond) console.log(`  PASS ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
}

const BASE = process.env.ODG_OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_BASE_URL;

const request = (proposeOnly: boolean): ProviderRequest => ({
  providerContractVersion: "1.0.0",
  model: "",
  maxTurns: 4,
  proposeOnly,
  mission: {
    mission: "WAKE_OLLAMA_GOVERNED_PROVIDER_V1",
    priority: "P2",
    mode: "ENGINEERING",
    objectives: [{ id: "OBJ-1", goal: "prove governed local Ollama proposal", done_when: ["a proposed edit"] }],
    definitionOfDone: [],
    completion: [],
    authorizedPaths: ["runtime/generated/ollama-proof.txt"],
    context: { repoRoot: process.cwd(), branch: "", headCommit: "", masterPlanObjectives: [], missingCapabilities: [] },
  },
});

/** A fake chat caller returning a PROPOSE-ONLY DONE envelope — zero cost, no network. */
const proposeEnvelope = (): OpenAiChatEnvelope => ({
  ok: true,
  text:
    "```json\n" +
    JSON.stringify({
      mission: "WAKE_OLLAMA_GOVERNED_PROVIDER_V1",
      providerContractVersion: "1.0.0",
      status: "DONE",
      objectivesAddressed: ["OBJ-1"],
      changedFiles: [],
      commandsRun: [],
      blocker: null,
      proposedEdits: [{ objectiveId: "OBJ-1", target: "runtime/generated/ollama-proof.txt", content: "ok\n" }],
    }) +
    "\n```",
  model: "qwen2.5:0.5b",
  id: "chatcmpl-test",
  finishReason: "stop",
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  created: null,
  error: null,
});

async function firstModel(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${BASE}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ id?: string }> };
    return j.data?.find((m) => typeof m.id === "string")?.id ?? null;
  } catch {
    return null;
  }
}

(async () => {
  console.log(`OLLAMA GOVERNED PROVIDER (V61) — ${BASE}`);

  // A) Conformance + truthful identity.
  const port: EngineeringProviderPort = createOllamaProvider({ model: "qwen2.5:0.5b", call: proposeEnvelope });
  must(port.name === "ollama-local", "provider identifies as ollama-local");
  const desc = port.describe();
  must(desc.kind === "engineering-provider" && desc.providerContractVersion === "1.0.0", "describe() = engineering-provider @ contract 1.0.0");

  // B) Governed availability (pure; no network).
  const localWithModel = ollamaAvailability({ env: {}, hasBinary: () => false }, { model: "qwen2.5:0.5b", baseURL: BASE });
  must(localWithModel.available === true, "LOCAL endpoint + pinned model ⇒ available WITHOUT a key");
  const localNoModel = ollamaAvailability({ env: {}, hasBinary: () => false }, { baseURL: BASE });
  must(localNoModel.available === false && /ODG_OLLAMA_MODEL/.test(localNoModel.nextAction ?? ""), "LOCAL endpoint + NO model ⇒ fail-closed UNAVAILABLE (model preflight)");
  const remote = ollamaAvailability({ env: {}, hasBinary: () => false }, { model: "x", baseURL: "https://api.openai.com/v1" });
  must(remote.available === false, "NON-local base URL still requires a credential (never a silent paid remote)");

  // C) AUTHORITY — PROPOSE-ONLY: returns proposedEdits, mutates NOTHING in the tree.
  const outcome = port.execute(request(true));
  must(outcome.provider === "ollama-local", "outcome names provider ollama-local");
  must(outcome.classification === "OK" && outcome.providerExecuted === true, "propose run classified OK, provider executed");
  must(Array.isArray(outcome.result?.proposedEdits) && outcome.result!.proposedEdits!.length === 1, "provider returned exactly one PROPOSED edit");
  must(outcome.changedFiles.length === 0, "AUTHORITY: provider wrote NOTHING to the tree (changedFiles === [])");
  must(outcome.unauthorizedChanges.length === 0, "AUTHORITY: no unauthorized tree changes observed");

  // D) LIVE against the real local Ollama (reachability-gated; cost €0).
  const liveModel = await firstModel();
  if (!liveModel) {
    console.log("  SKIP (live) — no local Ollama endpoint reachable (start ollama + `ollama pull` a model to exercise live)");
  } else {
    const live: EngineeringProviderPort = createOllamaProvider({ model: liveModel, baseURL: BASE });
    const out = live.execute(request(false));
    must(out.provider === "ollama-local", "(live) outcome names provider ollama-local");
    must(out.providerExecuted === true && out.raw.exitCode === 0, `(live) real response received (model=${liveModel})`);
    must(typeof out.raw.stdout === "string" && out.raw.stdout.length > 0, "(live) response carries non-empty text");
    const obs = out.observation;
    must(!!obs && (obs.basis === "OBSERVED" || obs.basis === "ABSENT"), "(live) usage observation present (OBSERVED or honest ABSENT)");
    must(out.changedFiles.length === 0, "(live) AUTHORITY: provider wrote NOTHING to the tree");
    console.log(`  evidence: provider=${out.provider} class=${out.classification} obsBasis=${obs?.basis} externalCostEUR=0 (localhost)`);
  }

  console.log(failures === 0 ? "Ollama Governed Provider OK" : `FAILURES: ${failures}`);
  if (failures > 0) process.exit(1);
})().catch((e) => {
  console.error("Ollama Governed Provider ERROR:", e?.message ?? e);
  process.exit(1);
});
