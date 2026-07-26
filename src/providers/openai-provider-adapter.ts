/*
 * OpenAI Provider Adapter — ODG ↔ OpenAI engineering provider (contract §10)
 *
 * A second EngineeringProviderPort implementation, added strictly per the contract's extension rule:
 * "adding OpenAI / Gemini / Codex means adding a class that implements the port and re-exporting it —
 * nothing in src/core or src/contracts changes" (provider-port.ts header, contract §10). It spawns
 * the OpenAI engineering CLI (`codex`) exactly as a human runs it headlessly — one non-interactive
 * call per mission — mirroring the ClaudeProviderAdapter's boundaries.
 *
 * What this adapter adds over the Claude one is a REQUIRED availability preflight: OpenAI is not the
 * default engineering provider in this repo, so before any (paid, side-effecting) call it verifies
 * its two hard prerequisites — an API credential and the engineering CLI binary. When either is
 * missing it returns a structured, non-throwing outcome that names the exact blocking component, the
 * exact missing resource, and the single next action (mission PROVIDER_FAILOVER_TO_OPENAI, objectives
 * 3–6). It NEVER pretends to have run.
 *
 * Boundaries honoured (identical to the Claude adapter):
 *   - ODG decides IF this runs; the adapter only executes the handed mission and returns data.
 *   - The provider never decides completion — the Release Manager does. This module imports nothing
 *     from src/core or src/contracts.
 *   - Additive: modifies no foundation and no existing file; reuses the deterministic prompt renderer
 *     and RESULT SCHEMA from provider-port.ts.
 *   - The process runner is injected, so conformance tests exercise the full contract WITHOUT calling
 *     the real (paid) CLI.
 */

import { spawnSync } from "node:child_process";

import {
  GUARDRAIL_SYSTEM_PROMPT,
  PROVIDER_CONTRACT_VERSION,
  isFrozenPath,
  renderMissionPrompt,
  type EngineeringProviderPort,
  type ProviderDescription,
  type ProviderOutcome,
  type ProviderRequest,
  type ProviderResult,
} from "./provider-port";
import {
  available,
  unavailable,
  type AvailabilityAware,
  type AvailabilityCheck,
  type AvailabilityEnv,
  type ProviderAvailability,
} from "./provider-availability";
import type { ProviderProcessResult, ProviderProcessRunner } from "./claude-provider-adapter";

/** The env var the OpenAI CLI/SDK reads for authentication. */
export const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

/** Default OpenAI engineering-CLI binary (OpenAI's coding agent). */
const DEFAULT_BIN = "codex";
/** Default pinned model id (contract §2 reproducibility). */
const DEFAULT_MODEL = "gpt-5-codex";

const WRITE_TOOLS = "read,edit,write,shell";
const READONLY_TOOLS = "read";

export interface OpenAIProviderOptions {
  /** Working directory / mission workspace. Defaults to process.cwd(). */
  cwd?: string;
  /** Pinned model id (contract §2). */
  model?: string;
  /** Path to the OpenAI engineering CLI binary (default `codex`). */
  bin?: string;
  /** Per-call wall-clock budget in ms (contract §7.1 timeout → INTERRUPTED). */
  timeoutMs?: number;
  /** Injected process runner — override in tests. */
  run?: ProviderProcessRunner;
}

const defaultRunner: ProviderProcessRunner = (bin, args, opts) => {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const err = r.error as NodeJS.ErrnoException | undefined;
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    signal: r.signal ?? null,
    timedOut: err?.code === "ETIMEDOUT" || (r.status === null && r.signal != null),
  };
};

export class OpenAIProviderAdapter implements EngineeringProviderPort, AvailabilityAware {
  readonly name = "openai-codex";
  private readonly cwd: string;
  private readonly model: string;
  private readonly bin: string;
  private readonly timeoutMs: number | undefined;
  private readonly run: ProviderProcessRunner;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    this.model = opts.model ?? DEFAULT_MODEL;
    this.bin = opts.bin ?? DEFAULT_BIN;
    this.timeoutMs = opts.timeoutMs;
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

  /**
   * Availability preflight (mission objectives 3–6). Two hard prerequisites, each inspected and
   * reported as evidence:
   *   1) an API credential — `OPENAI_API_KEY` — else no request can authenticate;
   *   2) the engineering CLI binary — `codex` — else there is no way to edit files headlessly.
   * The verdict is a pure function of the injected env; it performs no network or paid call.
   */
  checkAvailability(env: AvailabilityEnv): ProviderAvailability {
    const hasKey = typeof env.env[OPENAI_API_KEY_ENV] === "string" && env.env[OPENAI_API_KEY_ENV] !== "";
    const hasBin = env.hasBinary(this.bin);
    const checks: AvailabilityCheck[] = [
      {
        requirement: `env:${OPENAI_API_KEY_ENV}`,
        satisfied: hasKey,
        detail: hasKey ? `${OPENAI_API_KEY_ENV} is set` : `${OPENAI_API_KEY_ENV} is not set`,
      },
      {
        requirement: `binary:${this.bin}`,
        satisfied: hasBin,
        detail: hasBin ? `\`${this.bin}\` found on PATH` : `\`${this.bin}\` not found on PATH`,
      },
    ];

    if (hasKey && hasBin) return available(this.name, checks);

    // Report the credential first (it is the resource an operator most commonly forgets), then the
    // binary. Only ONE next action is surfaced — the first unmet prerequisite (contract "single next
    // action"): fix the credential before worrying about the binary.
    if (!hasKey) {
      return unavailable(this.name, {
        blockingComponent: `${this.name} credential preflight`,
        missingConfiguration: `environment variable ${OPENAI_API_KEY_ENV}`,
        nextAction: `Provision an OpenAI API key and export ${OPENAI_API_KEY_ENV} in the Runtime environment.`,
        checks,
      });
    }
    return unavailable(this.name, {
      blockingComponent: `${this.name} engineering-CLI preflight`,
      missingConfiguration: `executable \`${this.bin}\` (OpenAI engineering CLI) on PATH`,
      nextAction: `Install the OpenAI engineering CLI so \`${this.bin}\` resolves on PATH (e.g. \`npm i -g @openai/codex\`).`,
      checks,
    });
  }

  execute(request: ProviderRequest): ProviderOutcome {
    // Preflight FIRST: never spawn a call we know cannot authenticate or edit (cost + honesty).
    const env: AvailabilityEnv = {
      env: process.env,
      hasBinary: (bin) => binaryOnPath(this.run, this.cwd, bin),
    };
    const availability = this.checkAvailability(env);
    if (!availability.available) {
      return this.unavailableOutcome(request, availability);
    }

    const readOnly = request.mission.authorizedPaths.length === 0;
    const userPrompt = renderMissionPrompt(request);
    const args = this.buildArgs(request, userPrompt, readOnly);
    const proc = this.run(this.bin, args, { cwd: this.cwd, timeoutMs: this.timeoutMs });

    // 1) Interruption (contract §7.1 / §8): resumable.
    if (proc.timedOut || (proc.status === null && proc.signal)) {
      return this.finish({
        classification: "INTERRUPTED",
        result: null,
        changedFiles: [],
        unauthorizedChanges: [],
        proc,
        diagnostics: [`interrupted (signal=${proc.signal ?? "timeout"})`],
      });
    }

    const result = this.parseResult(proc.stdout, request.mission.mission);

    // 2) Process failure (contract §7.1) → FAILED.
    if (proc.status !== 0) {
      return this.finish({
        classification: "FAILED",
        result,
        changedFiles: [],
        unauthorizedChanges: [],
        proc,
        diagnostics: [`provider process failed (exit=${proc.status})`],
      });
    }

    // 3) Post-run scope enforcement (contract §9 layer 4).
    const changedFiles = this.observeChangedFiles();
    const unauthorizedChanges = changedFiles.filter(
      (f) => !this.isAuthorized(f, request.mission.authorizedPaths),
    );
    if (unauthorizedChanges.length > 0) {
      return this.finish({
        classification: "FAILED",
        result,
        changedFiles,
        unauthorizedChanges,
        proc,
        diagnostics: [`unauthorized changes outside mission scope: ${unauthorizedChanges.join(", ")}`],
      });
    }

    // 4) Provider-certified stop → BLOCKED.
    if (result?.status === "BLOCKED") {
      return this.finish({
        classification: "BLOCKED",
        result,
        changedFiles,
        unauthorizedChanges: [],
        proc,
        diagnostics: [`provider reported BLOCKED: ${result.blocker ?? "(no reason)"}`],
      });
    }

    // 5) Clean run → OK.
    return this.finish({
      classification: "OK",
      result,
      changedFiles,
      unauthorizedChanges: [],
      proc,
      diagnostics: [],
    });
  }

  // --- command construction ------------------------------------------------

  private buildArgs(request: ProviderRequest, userPrompt: string, readOnly: boolean): string[] {
    // `codex exec` is the non-interactive (headless) form; flags mirror the Claude adapter's intent.
    const args = ["exec"];
    if (request.resumeSessionId) args.push("--resume", request.resumeSessionId);
    args.push("--model", this.model);
    args.push("--output-format", "json");
    args.push("--cd", request.mission.context.repoRoot);
    args.push("--allowed-tools", readOnly ? READONLY_TOOLS : WRITE_TOOLS);
    if (readOnly) args.push("--sandbox", "read-only");
    // Guardrails are injected as a system preamble prepended to the mission prompt.
    args.push("--prompt", `${GUARDRAIL_SYSTEM_PROMPT}\n\n${userPrompt}`);
    return args;
  }

  // --- parsing -------------------------------------------------------------

  private parseResult(stdout: string, mission: string): ProviderResult | null {
    const json = extractJsonObject(stdout);
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

  // --- working-tree evidence & scope enforcement (contract §9) -------------

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
    if (isFrozenPath(file)) return authorizedPaths.some((p) => matchGlob(file, p));
    if (authorizedPaths.length === 0) return false;
    return authorizedPaths.some((p) => matchGlob(file, p));
  }

  // --- outcome assembly ----------------------------------------------------

  /** A structured, non-throwing outcome for the "cannot run" case. classification BLOCKED, no call made. */
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
    changedFiles: string[];
    unauthorizedChanges: string[];
    proc: ProviderProcessResult;
    diagnostics: string[];
  }): ProviderOutcome {
    return {
      provider: this.name,
      classification: p.classification,
      providerExecuted: true,
      fromCache: false,
      result: p.result,
      sessionId: null,
      changedFiles: p.changedFiles,
      unauthorizedChanges: p.unauthorizedChanges,
      raw: { exitCode: p.proc.status, stdout: p.proc.stdout, stderr: p.proc.stderr },
      diagnostics: p.diagnostics,
    };
  }
}

/** Factory mirroring the contract's provider-agnostic construction (contract §10). */
export function createOpenAIProvider(opts: OpenAIProviderOptions = {}): EngineeringProviderPort {
  return new OpenAIProviderAdapter(opts);
}

// --- shared helpers (module-local; no coupling to the Claude adapter) ------

/** Resolve whether `bin` exists on PATH using the injected runner (`command -v`). Deterministic. */
function binaryOnPath(run: ProviderProcessRunner, cwd: string, bin: string): boolean {
  try {
    const r = run("command", ["-v", bin], { cwd });
    return r.status === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Pull a single JSON object out of possibly-decorated text (fenced block or braces). */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) return fenced[1];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

function matchGlob(file: string, pattern: string): boolean {
  const f = file.replace(/^\.?\//, "");
  const p = pattern.replace(/^\.?\//, "");
  if (f === p) return true;
  if (p.endsWith("/")) return f.startsWith(p);
  const regex = new RegExp(
    "^" +
      p
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, " ")
        .replace(/\*/g, "[^/]*")
        .replace(/ /g, ".*") +
      "$",
  );
  return regex.test(f);
}
