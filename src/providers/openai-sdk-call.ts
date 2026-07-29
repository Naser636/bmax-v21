/*
 * OpenAI SDK Call — the SINGLE place the ODG Runtime performs a real OpenAI API call.
 *
 * This is the concrete "without codex" transport for the OpenAI engineering provider: it talks to
 * the OpenAI Chat Completions API through the official `openai` SDK (node_modules/openai), NOT the
 * `codex` CLI. There is no external binary prerequisite — the SDK is a bundled library dependency —
 * so the OpenAI provider is available whenever `OPENAI_API_KEY` is present.
 *
 * Two usage shapes, one implementation:
 *   1. `callOpenAiChat(input)` — the async function, imported directly by tests (with a fake, zero
 *      cost) and by any async caller.
 *   2. Direct invocation via tsx (`tsx src/providers/openai-sdk-call.ts <request.json>`) — a tiny
 *      sidecar the SYNCHRONOUS provider port (OpenAIProviderAdapter.execute) spawns with spawnSync so
 *      it can await a real network call without changing the frozen synchronous port signature.
 *
 * Everything is error-as-data: a failed call returns an envelope with `ok:false` and a precise
 * `error`, never a throw, and NEVER a secret (the API key is read, used, and never echoed back).
 */

import * as fs from "node:fs";

import { OpenAI } from "openai";

/** The request handed to a real OpenAI Chat Completions call. Pure data. */
export interface OpenAiChatInput {
  /** Pinned model id (reproducibility). */
  model: string;
  /** System preamble (the ODG guardrail). */
  system: string;
  /** User content (the deterministically rendered mission prompt). */
  user: string;
  /** API credential; defaults to process.env.OPENAI_API_KEY. Never echoed back in the envelope. */
  apiKey?: string;
  /** Optional custom base URL (Azure / gateway / proxy). */
  baseURL?: string;
  /** Output token ceiling (cost bound). */
  maxOutputTokens?: number;
  /** Per-call wall-clock budget in ms. */
  timeoutMs?: number;
}

/** The normalized result of a real OpenAI call — the proof object. Carries no secret. */
export interface OpenAiChatEnvelope {
  /** True when a real response was received. */
  ok: boolean;
  /** The assistant message text (contains the RESULT JSON when the model complied). */
  text: string;
  /** The model that actually served the request (echoed by the API). */
  model: string | null;
  /** The API response id — the ground-truth handle of the real call. */
  id: string | null;
  /** Why generation stopped (stop / length / …). */
  finishReason: string | null;
  /** Token usage as reported by the API (evidence of a real, metered call). */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  /** API-reported creation epoch (seconds). */
  created: number | null;
  /** Precise failure cause when ok:false; null on success. */
  error: string | null;
}

const EMPTY: OpenAiChatEnvelope = {
  ok: false,
  text: "",
  model: null,
  id: null,
  finishReason: null,
  usage: null,
  created: null,
  error: null,
};

/**
 * Perform ONE real OpenAI Chat Completions call. Returns an evidence envelope; never throws.
 * A missing credential is reported as data (ok:false) rather than an exception.
 */
export async function callOpenAiChat(input: OpenAiChatInput): Promise<OpenAiChatEnvelope> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey === "") {
    return { ...EMPTY, error: "OPENAI_API_KEY is not set" };
  }
  try {
    const client = new OpenAI({ apiKey, baseURL: input.baseURL, timeout: input.timeoutMs });
    const resp = await client.chat.completions.create({
      model: input.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      max_completion_tokens: input.maxOutputTokens ?? 1024,
    });
    const choice = resp.choices?.[0];
    const usage = resp.usage
      ? {
          promptTokens: resp.usage.prompt_tokens ?? 0,
          completionTokens: resp.usage.completion_tokens ?? 0,
          totalTokens: resp.usage.total_tokens ?? 0,
        }
      : null;
    return {
      ok: true,
      text: choice?.message?.content ?? "",
      model: resp.model ?? input.model,
      id: resp.id ?? null,
      finishReason: choice?.finish_reason ?? null,
      usage,
      created: typeof resp.created === "number" ? resp.created : null,
      error: null,
    };
  } catch (err) {
    return { ...EMPTY, error: String((err as Error)?.message ?? err) };
  }
}

// ---------------------------------------------------------------------------
// Sidecar entrypoint — the synchronous adapter spawns this via tsx:
//   tsx src/providers/openai-sdk-call.ts <request.json>
// Reads the request JSON, performs the real call, writes the envelope JSON to stdout, exits 0.
// ---------------------------------------------------------------------------
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  /openai-sdk-call\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  const reqFile = process.argv[2];
  void (async () => {
    let input: OpenAiChatInput | null = null;
    try {
      input = JSON.parse(fs.readFileSync(reqFile, "utf8")) as OpenAiChatInput;
    } catch (e) {
      process.stdout.write(JSON.stringify({ ...EMPTY, error: `cannot read request file: ${String((e as Error)?.message ?? e)}` }));
      process.exit(0);
    }
    const envelope = await callOpenAiChat(input as OpenAiChatInput);
    process.stdout.write(JSON.stringify(envelope));
    process.exit(0);
  })();
}
