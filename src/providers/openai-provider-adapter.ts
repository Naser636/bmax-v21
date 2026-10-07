/*
 * OpenAI Provider Adapter — ODG ↔ OpenAI engineering provider (contract §10), via the OpenAI SDK.
 *
 * A second EngineeringProviderPort implementation, added strictly per the contract's extension rule:
 * "adding OpenAI / Gemini / Codex means adding a class that implements the port and re-exporting it —
 * nothing in src/core or src/contracts changes" (provider-port.ts header, contract §10).
 *
 * TRANSPORT — the OpenAI SDK, NOT the `codex` CLI. The Runtime talks to OpenAI through the official
 * `openai` package (src/providers/openai-sdk-call.ts). Consequences:
 *   - There is NO external-binary prerequisite. The single hard requirement is a credential
 *     (`OPENAI_API_KEY`); the SDK is a bundled library dependency that is always present. So the
 *     availability preflight checks the key ALONE — no `codex` on PATH is ever required again.
 *   - The engineering provider returns its work as a RESULT-SCHEMA message (a plan / diff / verdict);
 *     it does not itself mutate the working tree. The Runtime's existing Patch Executor applies any
 *     diff the model returns, so this adapter observes NO working-tree changes and reports none —
 *     honest ground truth for a text-transport provider.
 *
 * The frozen EngineeringProviderPort.execute() is SYNCHRONOUS. The OpenAI SDK is async, so — without
 * touching the port signature or any other file — the default caller spawns the SDK sidecar with
 * spawnSync (mirroring the Claude adapter's one-process-per-mission boundary). The caller is
 * injected, so conformance tests exercise the full contract WITHOUT a real (paid) call.
 *
 * Boundaries honoured (identical to the Claude adapter):
 *   - ODG decides IF this runs; the adapter only executes the handed mission and returns data.
 *   - The provider never decides completion — the Release Manager does. This module imports nothing
 *     from src/core or src/contracts.
 *   - Additive: reuses the deterministic prompt renderer and RESULT SCHEMA from provider-port.ts.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  GUARDRAIL_SYSTEM_PROMPT,
  PROVIDER_CONTRACT_VERSION,
  absentObservation,
  observedUsage,
  renderMissionPrompt,
  type EngineeringProviderPort,
  type ObservedQuantity,
  type ProviderDescription,
  type ProviderOutcome,
  type ProviderRequest,
  type ProviderResult,
  type ProposedEdit,
  type ProviderUsageObservation,
} from "./provider-port";
import {
  available,
  unavailable,
  type AvailabilityAware,
  type AvailabilityCheck,
  type AvailabilityEnv,
  type ProviderAvailability,
} from "./provider-availability";
import { callOpenAiChat, type OpenAiChatEnvelope, type OpenAiChatInput } from "./openai-sdk-call";

/** The env var the OpenAI SDK reads for authentication. */
export const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
/** Env var naming an OpenAI-COMPATIBLE base URL (e.g. a local Ollama / LM Studio / LocalAI / vLLM server). */
export const OPENAI_BASE_URL_ENV = "OPENAI_BASE_URL";

/**
 * True when a configured base URL targets a LOCAL OpenAI-compatible endpoint (localhost/loopback). Such a
 * server (Ollama :11434/v1, LM Studio, LocalAI, vLLM) needs NO real credential, so the adapter may be
 * available without OPENAI_API_KEY in that — and only that — case. A remote base URL still requires a key.
 */
export function isLocalBaseURL(url: string | undefined): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
  } catch {
    return false;
  }
}

/** Default pinned model id (contract §2 reproducibility). Overridable via option or OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * A synchronous OpenAI chat caller — the injected boundary. The default spawns the SDK sidecar via
 * spawnSync (real call); tests inject a fake that returns a canned envelope (zero cost).
 */
export type OpenAiChatCaller = (input: OpenAiChatInput & { cwd?: string }) => OpenAiChatEnvelope;

export interface OpenAIProviderOptions {
  /** Working directory / mission workspace. Defaults to process.cwd(). */
  cwd?: string;
  /**
   * Provider identity reported by `describe().name` and carried on every outcome. Defaults to
   * "openai-sdk" (unchanged for existing callers). A reuse seam pointing this same adapter at a LOCAL
   * OpenAI-compatible server (e.g. Ollama) sets a truthful name (e.g. "ollama-local") so evidence names
   * the provider that actually proposed — without any new adapter class or transport.
   */
  providerName?: string;
  /** Pinned model id (contract §2). Defaults to OPENAI_MODEL or gpt-4o-mini. */
  model?: string;
  /** API credential; defaults to process.env.OPENAI_API_KEY. Never written to evidence. */
  apiKey?: string;
  /** Optional custom base URL (Azure / gateway / proxy). */
  baseURL?: string;
  /** Output token ceiling (cost bound). */
  maxOutputTokens?: number;
  /** Per-call wall-clock budget in ms (contract §7.1 timeout → INTERRUPTED). */
  timeoutMs?: number;
  /** When set, the adapter writes a secret-free real-call proof object to this path after a call. */
  proofPath?: string;
  /** Injected chat caller — override in tests (zero cost). Default spawns the real SDK sidecar. */
  call?: OpenAiChatCaller;
}

/** Unique-ish temp request filenames without Math.random/Date (deterministic within a process). */
let sidecarSeq = 0;

/** Default caller: spawn the SDK sidecar synchronously through tsx and parse its envelope. */
const defaultCaller: OpenAiChatCaller = (input) => {
  const empty: OpenAiChatEnvelope = {
    ok: false,
    text: "",
    model: null,
    id: null,
    finishReason: null,
    usage: null,
    created: null,
    error: null,
  };
  const cwd = input.cwd ?? process.cwd();
  const reqFile = path.join(os.tmpdir(), `odg-openai-req-${process.pid}-${sidecarSeq++}.json`);
  // The credential travels to the sidecar via the request file (a private temp file), never argv.
  const { cwd: _cwd, ...payload } = input;
  try {
    fs.writeFileSync(reqFile, JSON.stringify(payload));
  } catch (e) {
    return { ...empty, error: `could not stage sidecar request: ${String((e as Error)?.message ?? e)}` };
  }
  const tsxCli = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  const sidecar = path.join(cwd, "src", "providers", "openai-sdk-call.ts");
  const r = spawnSync("node", [tsxCli, sidecar, reqFile], {
    cwd,
    timeout: input.timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    fs.unlinkSync(reqFile);
  } catch {
    /* best-effort cleanup */
  }
  const out = (r.stdout ?? "").trim();
  if (!out) {
    return { ...empty, error: `OpenAI SDK sidecar produced no output (status=${r.status}) ${(r.stderr ?? "").trim()}`.trim() };
  }
  try {
    return JSON.parse(out) as OpenAiChatEnvelope;
  } catch {
    return { ...empty, error: `unparseable OpenAI SDK sidecar output: ${out.slice(0, 500)}` };
  }
};

export class OpenAIProviderAdapter implements EngineeringProviderPort, AvailabilityAware {
  readonly name: string;
  private readonly cwd: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;
  private readonly maxOutputTokens: number | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly proofPath: string | undefined;
  private readonly call: OpenAiChatCaller;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.name = opts.providerName ?? "openai-sdk";
    this.cwd = opts.cwd ?? process.cwd();
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL ?? process.env[OPENAI_BASE_URL_ENV];
    this.maxOutputTokens = opts.maxOutputTokens;
    this.timeoutMs = opts.timeoutMs;
    this.proofPath = opts.proofPath;
    this.call = opts.call ?? defaultCaller;
  }

  describe(): ProviderDescription {
    return {
      name: this.name,
      kind: "engineering-provider",
      providerContractVersion: PROVIDER_CONTRACT_VERSION,
      model: this.model,
    };
  }

  /**
   * Availability preflight. With the SDK transport there is exactly ONE hard prerequisite: an API
   * credential (`OPENAI_API_KEY`, or an injected apiKey). The SDK itself is a bundled library, so no
   * binary is ever required. The verdict is a pure function of the injected env (env-first, with the
   * configured apiKey as a fallback); it performs no network or paid call.
   */
  checkAvailability(env: AvailabilityEnv): ProviderAvailability {
    const key = env.env[OPENAI_API_KEY_ENV] ?? this.apiKey;
    const hasKey = typeof key === "string" && key !== "";
    const checks: AvailabilityCheck[] = [
      {
        requirement: `env:${OPENAI_API_KEY_ENV}`,
        satisfied: hasKey,
        detail: hasKey ? `${OPENAI_API_KEY_ENV} is set` : `${OPENAI_API_KEY_ENV} is not set`,
      },
      {
        requirement: "sdk:openai",
        satisfied: true,
        detail: "openai SDK bundled (no external CLI / `codex` binary required)",
      },
    ];
    // A LOCAL OpenAI-compatible endpoint (Ollama/LM Studio/LocalAI/vLLM) needs no real credential, so a
    // configured local base URL makes the adapter available WITHOUT OPENAI_API_KEY. Remote still needs a key.
    if (isLocalBaseURL(this.baseURL)) {
      checks.push({
        requirement: `endpoint:local(${OPENAI_BASE_URL_ENV})`,
        satisfied: true,
        detail: `local OpenAI-compatible endpoint ${this.baseURL} — no API key required`,
      });
      return available(this.name, checks);
    }
    if (hasKey) return available(this.name, checks);
    return unavailable(this.name, {
      blockingComponent: `${this.name} credential preflight`,
      missingConfiguration: `environment variable ${OPENAI_API_KEY_ENV} (or a local ${OPENAI_BASE_URL_ENV})`,
      nextAction: `Provision an OpenAI API key and export ${OPENAI_API_KEY_ENV}, or set ${OPENAI_BASE_URL_ENV} to a local OpenAI-compatible server.`,
      checks,
    });
  }

  execute(request: ProviderRequest): ProviderOutcome {
    // Preflight FIRST: never attempt a call we know cannot authenticate (cost + honesty).
    const availability = this.checkAvailability(this.availabilityEnv());
    if (!availability.available) {
      return this.unavailableOutcome(request, availability);
    }

    // ONE real (or injected) OpenAI Chat Completions call per mission. Guardrail preamble as the
    // system message; the deterministically rendered mission as the user message.
    const userPrompt = renderMissionPrompt(request);
    const envelope = this.call({
      model: this.model,
      system: GUARDRAIL_SYSTEM_PROMPT,
      user: userPrompt,
      // A local OpenAI-compatible server ignores the credential; pass a non-secret placeholder so the
      // bundled SDK (which requires a non-empty apiKey) can reach it when no real key is configured.
      apiKey: this.apiKey ?? (isLocalBaseURL(this.baseURL) ? "local" : undefined),
      baseURL: this.baseURL,
      maxOutputTokens: this.maxOutputTokens,
      timeoutMs: this.timeoutMs,
      cwd: this.cwd,
    });

    // Emit the secret-free real-call proof BEFORE classifying, so a failed call is still evidenced.
    this.writeProof(request, envelope);

    const result = this.parseResult(envelope.text, request.mission.mission);

    // 1) The real call failed (network / auth / API error) → FAILED (a real attempt WAS made).
    if (!envelope.ok) {
      return this.finish({
        classification: "FAILED",
        result,
        envelope,
        diagnostics: [`OpenAI SDK call failed: ${envelope.error ?? "(no detail)"}`],
      });
    }

    // 2) Provider-certified stop → BLOCKED.
    if (result?.status === "BLOCKED") {
      return this.finish({
        classification: "BLOCKED",
        result,
        envelope,
        diagnostics: [`provider reported BLOCKED: ${result.blocker ?? "(no reason)"}`],
      });
    }

    // 3) A real response was received → OK. `result` may be null when the model returned no strict
    //    RESULT JSON; the response id + usage in the proof are the ground truth of the real call.
    return this.finish({
      classification: "OK",
      result,
      envelope,
      diagnostics: this.callDiagnostics(envelope),
    });
  }

  // --- availability view -----------------------------------------------------

  /** The env the preflight observes at execution time (process env; no binary probing needed). */
  private availabilityEnv(): AvailabilityEnv {
    return { env: process.env, hasBinary: () => true };
  }

  // --- parsing ---------------------------------------------------------------

  private parseResult(text: string, mission: string): ProviderResult | null {
    const json = extractJsonObject(text);
    if (!json) return null;
    try {
      const raw = JSON.parse(json) as Partial<ProviderResult>;
      if (raw.status !== "DONE" && raw.status !== "BLOCKED") return null;
      // V43 — carry PROPOSED edits (govern-the-apply): same structural filter as the Claude adapter so
      // the OpenAI failover delivers through the governed patch-executor too (it never writes the tree).
      const proposedEdits = Array.isArray(raw.proposedEdits)
        ? raw.proposedEdits.filter(
            (e): e is ProposedEdit =>
              !!e &&
              typeof e === "object" &&
              typeof (e as ProposedEdit).target === "string" &&
              (typeof (e as ProposedEdit).content === "string") !==
                (typeof (e as ProposedEdit).diff === "string"),
          )
        : undefined;
      return {
        mission: typeof raw.mission === "string" ? raw.mission : mission,
        providerContractVersion:
          typeof raw.providerContractVersion === "string"
            ? raw.providerContractVersion
            : PROVIDER_CONTRACT_VERSION,
        status: raw.status,
        objectivesAddressed: Array.isArray(raw.objectivesAddressed) ? raw.objectivesAddressed : [],
        changedFiles: Array.isArray(raw.changedFiles) ? raw.changedFiles : [],
        commandsRun: Array.isArray(raw.commandsRun) ? raw.commandsRun : [],
        blocker: typeof raw.blocker === "string" ? raw.blocker : null,
        notes: typeof raw.notes === "string" ? raw.notes : undefined,
        ...(proposedEdits && proposedEdits.length ? { proposedEdits } : {}),
      };
    } catch {
      return null;
    }
  }

  // --- real-call proof (secret-free) -----------------------------------------

  /** Write the real-call proof object to `proofPath` (never a secret). Best-effort; no throw. */
  private writeProof(request: ProviderRequest, envelope: OpenAiChatEnvelope): void {
    if (!this.proofPath) return;
    const proof = {
      capability: "OpenAI Provider Execution",
      provider: this.name,
      transport: "openai-sdk (chat.completions)",
      ranAt: new Date().toISOString(),
      mission: request.mission.mission,
      requestedModel: this.model,
      servedModel: envelope.model,
      responseId: envelope.id,
      finishReason: envelope.finishReason,
      usage: envelope.usage,
      ok: envelope.ok,
      error: envelope.error,
      responseTextPreview: envelope.text.slice(0, 800),
      resultParsed: this.parseResult(envelope.text, request.mission.mission),
      secretsExposed: false as const,
    };
    try {
      fs.mkdirSync(path.dirname(this.proofPath), { recursive: true });
      fs.writeFileSync(this.proofPath, JSON.stringify(proof, null, 2));
    } catch {
      /* proof is best-effort — never let it break the mission path */
    }
  }

  /**
   * Transport the OBSERVED token usage the OpenAI API returned (E). The API's `usage` block carries
   * prompt/completion/total token counts; we certify as OBSERVED the TOTAL tokens the call consumed, as
   * an exact economic quantity (unit "token", integer minor, scale 0). The per-side breakdown is kept
   * verbatim in `providerReported` as evidence. No money is derived here (OpenAI returns no cost figure,
   * and tokens → currency needs a declared price rule). ABSENT when the API reported no integer usage.
   */
  private observeUsage(envelope: OpenAiChatEnvelope): ProviderUsageObservation {
    const u = envelope.usage;
    // A reported total of 0 is a genuine OBSERVED zero; a MISSING total (null) is ABSENT, never a
    // fabricated zero (UNKNOWN ≠ 0). `typeof t === "number"` narrows out the null case for the integer
    // and non-negative checks.
    const t = u ? u.totalTokens : null;
    const total = typeof t === "number" && Number.isInteger(t) && t >= 0 ? t : null;
    if (total === null) return absentObservation("no integer total usage reported by provider");
    const quantities: ObservedQuantity[] = [
      { unit: "token", kind: "COST_UNIT", minor: total, scale: 0 },
    ];
    return observedUsage(quantities, `${this.name}:api.usage.total_tokens`, {
      promptTokens: u?.promptTokens ?? null,
      completionTokens: u?.completionTokens ?? null,
      totalTokens: total,
      model: envelope.model,
      responseId: envelope.id,
    });
  }

  private callDiagnostics(envelope: OpenAiChatEnvelope): string[] {
    const lines = [`openai-sdk call OK (model=${envelope.model ?? this.model}, id=${envelope.id ?? "?"})`];
    if (envelope.usage) {
      lines.push(`tokens: prompt=${envelope.usage.promptTokens}, completion=${envelope.usage.completionTokens}, total=${envelope.usage.totalTokens}`);
    }
    return lines;
  }

  // --- outcome assembly ------------------------------------------------------

  /** Structured, non-throwing outcome for the "cannot run" case. BLOCKED, no call made. */
  private unavailableOutcome(
    request: ProviderRequest,
    availability: ProviderAvailability,
  ): ProviderOutcome {
    const blocker = [
      `OpenAI provider unavailable — ${availability.missingConfiguration}.`,
      `Blocking component: ${availability.blockingComponent}.`,
      `Next action: ${availability.nextAction}`,
    ].join(" ");
    return {
      provider: this.name,
      classification: "BLOCKED",
      providerExecuted: false,
      fromCache: false,
      result: {
        mission: request.mission.mission,
        providerContractVersion: PROVIDER_CONTRACT_VERSION,
        status: "BLOCKED",
        objectivesAddressed: [],
        changedFiles: [],
        commandsRun: [],
        blocker,
        notes: availability.checks.map((c) => `${c.requirement}: ${c.detail}`).join("; "),
      },
      sessionId: null,
      changedFiles: [],
      unauthorizedChanges: [],
      raw: { exitCode: null, stdout: "", stderr: "" },
      diagnostics: [availability.detail],
    };
  }

  private finish(p: {
    classification: ProviderOutcome["classification"];
    result: ProviderResult | null;
    envelope: OpenAiChatEnvelope;
    diagnostics: string[];
  }): ProviderOutcome {
    return {
      provider: this.name,
      classification: p.classification,
      // A real attempt WAS made (the SDK call), whether it returned a response or an error.
      providerExecuted: true,
      fromCache: false,
      result: p.result,
      sessionId: p.envelope.id,
      // Text-transport provider: it mutates nothing in the working tree. The model's declared
      // changed files (if any) live in `result.changedFiles`; the adapter observes none itself.
      changedFiles: [],
      unauthorizedChanges: [],
      raw: {
        exitCode: p.envelope.ok ? 0 : 1,
        stdout: p.envelope.text,
        stderr: p.envelope.error ?? "",
      },
      diagnostics: p.diagnostics,
      // E: carry the API's OBSERVED token usage (ABSENT when none was reported — e.g. a failed call).
      observation: this.observeUsage(p.envelope),
    };
  }
}

/** Factory mirroring the contract's provider-agnostic construction (contract §10). */
export function createOpenAIProvider(opts: OpenAIProviderOptions = {}): EngineeringProviderPort {
  return new OpenAIProviderAdapter(opts);
}

// --- shared helpers (module-local; no coupling to the Claude adapter) --------

/** Pull a single JSON object out of possibly-decorated text (fenced block or braces). */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) return fenced[1];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}
