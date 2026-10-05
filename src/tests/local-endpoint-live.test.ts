/*
 * Local OpenAI-compatible endpoint — OPT-IN live regression (Ollama / LM Studio / any local OpenAI-compatible
 * server). Protects the governed local-provider path proven in the carnet: the EXISTING OpenAI adapter +
 * OPENAI_BASE_URL make a local server usable WITHOUT a real key, at external cost 0.
 *
 * CI-safe: if no local endpoint answers it SKIPS (exit 0) — exactly like the OPENAI_LIVE opt-in. No key, no
 * cloud, no secret. Endpoint is OPENAI_BASE_URL if set, else the Ollama default. It drives the REAL ODG
 * components — OpenAIProviderAdapter.checkAvailability + the single governed transport callOpenAiChat — so a
 * regression in the local path is caught here instead of silently breaking Ollama/LM Studio.
 *
 * Run: node_modules/.bin/tsx src/tests/local-endpoint-live.test.ts
 */
import { OpenAIProviderAdapter, isLocalBaseURL } from "@/providers/openai-provider-adapter";
import { callOpenAiChat } from "@/providers/openai-sdk-call";

const BASE = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:11434/v1";
let failures = 0;
const must = (cond: boolean, msg: string): void => { if (cond) console.log(`  PASS ${msg}`); else { failures++; console.log(`  FAIL ${msg}`); } };

async function firstModel(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${BASE}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ id?: string }> };
    const id = j.data?.find((m) => typeof m.id === "string")?.id;
    return id ?? null;
  } catch { return null; }
}

(async () => {
  console.log(`LOCAL ENDPOINT LIVE — ${BASE}`);
  const model = await firstModel();
  if (!model) {
    // No local server reachable → SKIP (CI-safe; this is NOT_AVAILABLE, not a failure).
    console.log("  SKIP — no local OpenAI-compatible endpoint reachable (set OPENAI_BASE_URL + run a local server to exercise live)");
    console.log("Local Endpoint Live OK (skipped)");
    return;
  }

  // 1) Governed availability: a LOCAL base URL ⇒ available WITHOUT a key.
  must(isLocalBaseURL(BASE), "endpoint URL classified LOCAL");
  const av = new OpenAIProviderAdapter({ baseURL: BASE }).checkAvailability({ env: {}, hasBinary: () => false });
  must(av.available === true, "adapter available on local endpoint WITHOUT OPENAI_API_KEY");

  // 2) Real call through the single governed ODG transport → local model → real response, external cost 0.
  const env = await callOpenAiChat({
    model,
    system: "You are a test. Reply with exactly: ODG_LOCAL_OK",
    user: "Say the phrase.",
    baseURL: BASE,
    apiKey: "local", // non-secret placeholder; a local server ignores it
    maxOutputTokens: 20,
    timeoutMs: 60000,
  });
  must(env.ok === true && env.error === null, `real live response received (model=${env.model})`);
  must(typeof env.text === "string" && env.text.length > 0, "response carries non-empty text");
  must(!!env.usage && typeof env.usage.totalTokens === "number", "usage observed from the local server");
  console.log(`  evidence: model=${env.model} usage=${JSON.stringify(env.usage)} externalCostEUR=0 (localhost)`);

  console.log(failures === 0 ? "Local Endpoint Live OK" : `FAILURES: ${failures}`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error("Local Endpoint Live ERROR:", e?.message ?? e); process.exit(1); });
