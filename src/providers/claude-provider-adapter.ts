/*
 * Claude Provider Adapter — official ODG ↔ Claude Code engineering provider
 *
 * Implements EngineeringProviderPort (provider-port.ts) over the Claude Code CLI, per
 * docs/CLAUDE_PROVIDER_CONTRACT_v1.md. It is the ONE place allowed to spawn `claude`, and it does
 * so exactly as a human runs headless Claude Code — one non-interactive call per mission.
 *
 * Boundaries honoured:
 *   - ODG decides IF this runs (missionRequiresProvider, provider-port.ts). This adapter only
 *     executes the mission it is handed and returns the result as data — it never selects work and
 *     never decides completion.
 *   - Additive Runtime edge: modifies no foundation and no existing file. Reuses the deterministic
 *     prompt renderer and the RESULT SCHEMA from provider-port.ts.
 *   - Cost minimization: exactly one process per mission; a content-addressed result cache
 *     short-circuits identical re-requests; read-only missions run with no write tools.
 *
 * The process runner is injected, so conformance tests exercise the full contract WITHOUT calling
 * the real (paid) CLI. The default runner uses child_process.spawnSync.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  GUARDRAIL_SYSTEM_PROMPT,
  PROVIDER_CONTRACT_VERSION,
  absentObservation,
  isFrozenPath,
  observedUsage,
  renderMissionPrompt,
  type EngineeringProviderPort,
  type ObservedQuantity,
  type ProviderDescription,
  type ProviderOutcome,
  type ProviderRequest,
  type ProviderResult,
  type ProviderUsageObservation,
} from "./provider-port";

/** Result of running an external process — the injected boundary (kept tiny & pure-ish). */
export interface ProviderProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  signal?: string | null;
  timedOut?: boolean;
}

/** Injected process runner. Default spawns real processes; tests inject a fake (zero cost). */
export type ProviderProcessRunner = (
  bin: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number },
) => ProviderProcessResult;

export interface ClaudeProviderOptions {
  /** Working directory / mission workspace. Defaults to process.cwd(). */
  cwd?: string;
  /** Pinned model id (contract §2). */
  model?: string;
  /** Path to the claude binary. */
  bin?: string;
  /** Per-call wall-clock budget in ms (contract §7.1 timeout → INTERRUPTED). */
  timeoutMs?: number;
  /** Content-addressed cache directory (git-ignored). */
  cacheDir?: string;
  /** Injected process runner — override in tests. */
  run?: ProviderProcessRunner;
}

const DEFAULT_MODEL = "claude-opus-4-8";
const WRITE_TOOLS = "Read,Edit,Write,Bash,Grep,Glob";
const READONLY_TOOLS = "Read,Grep,Glob";

const defaultRunner: ProviderProcessRunner = (bin, args, opts) => {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const err = r.error as (NodeJS.ErrnoException | undefined);
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    signal: r.signal ?? null,
    timedOut: err?.code === "ETIMEDOUT" || (r.status === null && r.signal != null),
  };
};

export class ClaudeProviderAdapter implements EngineeringProviderPort {
  readonly name = "claude-code";
  private readonly cwd: string;
  private readonly model: string;
  private readonly bin: string;
  private readonly timeoutMs: number | undefined;
  private readonly cacheDir: string;
  private readonly run: ProviderProcessRunner;

  constructor(opts: ClaudeProviderOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    this.model = opts.model ?? DEFAULT_MODEL;
    this.bin = opts.bin ?? "claude";
    this.timeoutMs = opts.timeoutMs;
    this.cacheDir = opts.cacheDir ?? `${this.cwd}/runtime/generated/provider-cache`;
    this.run = opts.run ?? defaultRunner;
  }

  describe(): ProviderDescription {
    return {
      name: this.name,
      kind: "engineering-provider",
      providerContractVersion: PROVIDER_CONTRACT_VERSION,
      model: this.model,
    };
  }

  execute(request: ProviderRequest): ProviderOutcome {
    const diagnostics: string[] = [];
    const readOnly = request.mission.authorizedPaths.length === 0;
    const userPrompt = renderMissionPrompt(request);

    // Cost minimization (contract §7.1): reuse a prior identical, terminal result. Resume runs and
    // explicit bypass always call live; a changed head_commit changes the prompt ⇒ changes the key.
    const cacheKey = this.cacheKey(userPrompt, readOnly);
    const canCache = !request.bypassCache && !request.resumeSessionId;
    if (canCache) {
      const cached = this.readCache(cacheKey);
      if (cached) {
        diagnostics.push("served from provider cache (no live call)");
        return { ...cached, fromCache: true, providerExecuted: false, diagnostics };
      }
    }

    // Baseline the working tree BEFORE the provider runs so post-run enforcement attributes to the
    // provider ONLY the paths IT dirtied — not tracked changes that were already present at session
    // start (contract §9 layer 4 is about what the PROVIDER wrote, not the operator's pre-existing
    // work). In a proper autonomy loop each mission commits its deliverable, so this set is empty and
    // behaviour is unchanged; it only makes a real, dirty-tree run robust instead of failing on
    // unrelated uncommitted files. (git-ignored regenerated artifacts never appear in porcelain.)
    const baseline = new Set(this.observeChangedFiles());

    const args = this.buildArgs(request, userPrompt, readOnly);
    const proc = this.run(this.bin, args, { cwd: this.cwd, timeoutMs: this.timeoutMs });

    // 1) Interruption (contract §7.1 / §8): resumable.
    if (proc.timedOut || (proc.status === null && proc.signal)) {
      return this.finish({
        classification: "INTERRUPTED",
        providerExecuted: true,
        result: null,
        sessionId: this.parseSessionId(proc.stdout),
        changedFiles: [],
        unauthorizedChanges: [],
        proc,
        diagnostics: [...diagnostics, `interrupted (signal=${proc.signal ?? "timeout"})`],
      });
    }

    const envelope = this.parseEnvelope(proc.stdout);
    const sessionId = envelope?.session_id ?? null;
    const result = this.parseResult(envelope?.result ?? proc.stdout, request.mission.mission);
    // E: transport whatever usage the provider actually reported in the envelope (ABSENT when none).
    const observation = this.observeUsage(envelope);

    // 2) Process failure / error envelope (contract §7.1) → EXECUTION_FAILED.
    if (proc.status !== 0 || envelope?.is_error === true) {
      return this.finish({
        classification: "FAILED",
        providerExecuted: true,
        result,
        sessionId,
        changedFiles: [],
        unauthorizedChanges: [],
        proc,
        diagnostics: [
          ...diagnostics,
          `provider process failed (exit=${proc.status}, is_error=${String(envelope?.is_error)}, subtype=${envelope?.subtype ?? "?"})`,
        ],
        observation,
      });
    }

    // 3) Post-run enforcement (contract §9 layer 4): observe the working-tree changes the PROVIDER
    //    introduced (post-run set minus the pre-run baseline) and reject anything outside the
    //    mission's write scope or inside a frozen root.
    const changedFiles = this.observeChangedFiles().filter((f) => !baseline.has(f));
    const unauthorizedChanges = changedFiles.filter(
      (f) => !this.isAuthorized(f, request.mission.authorizedPaths),
    );
    if (unauthorizedChanges.length > 0) {
      return this.finish({
        classification: "FAILED",
        providerExecuted: true,
        result,
        sessionId,
        changedFiles,
        unauthorizedChanges,
        proc,
        diagnostics: [
          ...diagnostics,
          `unauthorized changes outside mission scope: ${unauthorizedChanges.join(", ")}`,
        ],
        observation,
      });
    }

    // 4) Provider-certified stop (advisory) → BLOCKED for ODG to halt.
    if (result?.status === "BLOCKED") {
      const outcome = this.finish({
        classification: "BLOCKED",
        providerExecuted: true,
        result,
        sessionId,
        changedFiles,
        unauthorizedChanges: [],
        proc,
        diagnostics: [...diagnostics, `provider reported BLOCKED: ${result.blocker ?? "(no reason)"}`],
        observation,
      });
      if (canCache) this.writeCache(cacheKey, outcome);
      return outcome;
    }

    // 5) Clean run → OK. ODG now gathers evidence and the Release Manager decides completion.
    const outcome = this.finish({
      classification: "OK",
      providerExecuted: true,
      result,
      sessionId,
      changedFiles,
      unauthorizedChanges: [],
      proc,
      diagnostics,
      observation,
    });
    if (canCache) this.writeCache(cacheKey, outcome);
    return outcome;
  }

  // --- command construction (contract §2) ---------------------------------

  private buildArgs(request: ProviderRequest, userPrompt: string, readOnly: boolean): string[] {
    const args: string[] = [];
    if (request.resumeSessionId) args.push("--resume", request.resumeSessionId);
    args.push("-p", userPrompt);
    args.push("--output-format", "json");
    args.push("--model", this.model);
    args.push("--max-turns", String(request.maxTurns));
    args.push("--append-system-prompt", GUARDRAIL_SYSTEM_PROMPT);
    args.push("--add-dir", request.mission.context.repoRoot);
    if (readOnly) {
      args.push("--permission-mode", "plan", "--allowedTools", READONLY_TOOLS);
    } else {
      args.push("--permission-mode", "acceptEdits", "--allowedTools", WRITE_TOOLS);
    }
    return args;
  }

  // --- parsing (contract §4) ----------------------------------------------

  private parseEnvelope(stdout: string): {
    is_error?: boolean;
    result?: string;
    session_id?: string;
    subtype?: string;
    num_turns?: number;
    usage?: Record<string, unknown>;
    total_cost_usd?: unknown;
    modelUsage?: unknown;
  } | null {
    try {
      const obj = JSON.parse(stdout.trim());
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }

  /**
   * Transport the provider's OBSERVED usage (E). The Claude Code CLI JSON envelope reports a `usage`
   * block (input/output/cache token counts) and its own `total_cost_usd`. We certify as OBSERVED ONLY
   * the token USAGE the envelope actually returned, as an exact economic quantity (unit "token",
   * integer minor, scale 0) — the sum of input + output tokens, the resources this call consumed. We do
   * NOT turn that into money: the provider's `total_cost_usd` (and the cache-token breakdown) is
   * preserved verbatim in `providerReported` as evidence, never certified here as an OBSERVED economic
   * cost (converting tokens → currency needs a declared price rule — a later stage). When the envelope
   * carries no usable integer token usage, the observation is explicitly ABSENT (never a fabricated 0).
   */
  private observeUsage(
    envelope: ReturnType<ClaudeProviderAdapter["parseEnvelope"]>,
  ): ProviderUsageObservation {
    const usage = envelope?.usage;
    if (!usage || typeof usage !== "object") return absentObservation("no usage reported by provider");
    const asInt = (v: unknown): number | null =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
    const input = asInt(usage.input_tokens);
    const output = asInt(usage.output_tokens);
    if (input === null && output === null) {
      return absentObservation("provider usage block carried no integer token counts");
    }
    const quantities: ObservedQuantity[] = [
      { unit: "token", kind: "COST_UNIT", minor: (input ?? 0) + (output ?? 0), scale: 0 },
    ];
    // Raw evidence, verbatim — NOT a certified economic cost and NEVER meterable without a price rule.
    const providerReported: Record<string, unknown> = {
      input_tokens: input,
      output_tokens: output,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
      total_cost_usd: envelope?.total_cost_usd ?? null,
      num_turns: envelope?.num_turns ?? null,
    };
    return observedUsage(quantities, `${this.name}:json.usage.input_tokens+output_tokens`, providerReported);
  }

  private parseSessionId(stdout: string): string | null {
    return this.parseEnvelope(stdout)?.session_id ?? null;
  }

  private parseResult(text: string, mission: string): ProviderResult | null {
    const json = this.extractJsonObject(text);
    if (!json) return null;
    try {
      const raw = JSON.parse(json) as Partial<ProviderResult>;
      if (raw.status !== "DONE" && raw.status !== "BLOCKED") return null;
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
      };
    } catch {
      return null;
    }
  }

  /** Pull a single JSON object out of possibly-decorated text (fenced block or braces). */
  private extractJsonObject(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced) return fenced[1];
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) return text.slice(first, last + 1);
    return null;
  }

  // --- working-tree evidence & scope enforcement (contract §9) ------------

  private observeChangedFiles(): string[] {
    const r = this.run("git", ["status", "--porcelain"], { cwd: this.cwd });
    if (r.status !== 0) return [];
    return r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const body = l.replace(/^[ MADRCU?!]{1,2}\s+/, "");
        const arrow = body.indexOf(" -> ");
        return arrow >= 0 ? body.slice(arrow + 4) : body;
      });
  }

  private isAuthorized(file: string, authorizedPaths: string[]): boolean {
    if (isFrozenPath(file)) {
      // A frozen file is authorized ONLY if a mission path explicitly names it.
      return authorizedPaths.some((p) => this.matchGlob(file, p));
    }
    if (authorizedPaths.length === 0) return false; // read-only mission: no writes allowed
    return authorizedPaths.some((p) => this.matchGlob(file, p));
  }

  private matchGlob(file: string, pattern: string): boolean {
    const f = file.replace(/^\.?\//, "");
    const p = pattern.replace(/^\.?\//, "");
    if (f === p) return true;
    if (p.endsWith("/")) return f.startsWith(p);
    const regex = new RegExp(
      "^" +
        p
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, " ")
          .replace(/\*/g, "[^/]*")
          .replace(/ /g, ".*") +
        "$",
    );
    return regex.test(f);
  }

  // --- content-addressed result cache (cost minimization) -----------------

  private cacheKey(userPrompt: string, readOnly: boolean): string {
    const material = JSON.stringify({
      provider: this.name,
      model: this.model,
      contract: PROVIDER_CONTRACT_VERSION,
      system: GUARDRAIL_SYSTEM_PROMPT,
      user: userPrompt,
      readOnly,
    });
    return createHash("sha256").update(material).digest("hex");
  }

  private readCache(key: string): ProviderOutcome | null {
    try {
      const raw = fs.readFileSync(path.join(this.cacheDir, `${key}.json`), "utf8");
      return JSON.parse(raw) as ProviderOutcome;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, outcome: ProviderOutcome): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.cacheDir, `${key}.json`),
        JSON.stringify(outcome, null, 2),
        "utf8",
      );
    } catch {
      /* cache is best-effort; never fail a mission over it */
    }
  }

  // --- outcome assembly ---------------------------------------------------

  private finish(p: {
    classification: ProviderOutcome["classification"];
    providerExecuted: boolean;
    result: ProviderResult | null;
    sessionId: string | null;
    changedFiles: string[];
    unauthorizedChanges: string[];
    proc: ProviderProcessResult;
    diagnostics: string[];
    observation?: ProviderUsageObservation;
  }): ProviderOutcome {
    return {
      provider: this.name,
      classification: p.classification,
      providerExecuted: p.providerExecuted,
      fromCache: false,
      result: p.result,
      sessionId: p.sessionId,
      changedFiles: p.changedFiles,
      unauthorizedChanges: p.unauthorizedChanges,
      raw: { exitCode: p.proc.status, stdout: p.proc.stdout, stderr: p.proc.stderr },
      diagnostics: p.diagnostics,
      observation: p.observation ?? absentObservation(),
    };
  }
}

/** Factory mirroring the contract's provider-agnostic construction (contract §10). */
export function createClaudeProvider(opts: ClaudeProviderOptions = {}): EngineeringProviderPort {
  return new ClaudeProviderAdapter(opts);
}
