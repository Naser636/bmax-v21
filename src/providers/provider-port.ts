/*
 * Engineering Provider Port — provider-agnostic contract surface
 *
 * Implements the boundary frozen in docs/CLAUDE_PROVIDER_CONTRACT_v1.md (Provider Contract
 * Version 1.0.0). This is the SINGLE seam through which the ODG Runtime delegates the "execute"
 * stage of a mission to an external engineering provider (Claude Code today; OpenAI / Gemini /
 * Codex later — §10 of the contract).
 *
 * Design rules honoured here (contract §0):
 *   - ODG decides, the provider executes. `missionRequiresProvider()` is the ODG-owned decision;
 *     the port is never invoked speculatively.
 *   - The provider never decides completion. It returns a normalized result; the Release Manager
 *     (frozen, elsewhere) remains the sole completion authority. This module imports nothing from
 *     src/core or src/contracts, so it cannot fake or bypass that decision.
 *   - Prompts are a pure function of the Mission Contract (§3) — deterministic, no time, no
 *     randomness — so the same mission renders byte-identically (DETERMINISM_FIRST).
 *   - This module is additive Runtime-edge glue. It modifies no foundation and no existing file.
 */

/** Provider Contract Version implemented by this build (contract header). */
export const PROVIDER_CONTRACT_VERSION = "1.0.0";

/**
 * Frozen roots the provider must never mutate without an explicit `authorizedPaths` entry
 * (contract §9). Used by adapters as defence-in-depth (layer 4: post-run detective enforcement).
 */
export const FROZEN_ROOTS: readonly string[] = [
  "runtime/",
  "src/contracts/",
  "src/core/",
  "docs/CONSTITUTION_EDG_v1.md",
];

/** True when a repo-relative path targets a frozen root (contract §9). */
export function isFrozenPath(relPath: string): boolean {
  const p = relPath.replace(/^\.?\//, "");
  if (/_DESIGN_v\d+\.md$|_SPEC_v\d+\.md$/.test(p) && p.startsWith("docs/")) return true;
  return FROZEN_ROOTS.some((root) =>
    root.endsWith("/") ? p.startsWith(root) : p === root,
  );
}

/** One objective of a Mission Contract (matches runtime/missions/*.json). */
export interface ProviderObjective {
  id: string;
  goal: string;
  done_when: string[];
}

/** Deterministic selection context echoed into the prompt (contract §3.2 CONTEXT). */
export interface ProviderContext {
  repoRoot: string;
  branch: string;
  headCommit: string;
  masterPlanObjectives: string[];
  missingCapabilities: string[];
}

/**
 * A mission handed to a provider — assembled by ODG from the EXISTING MissionContract shape.
 * `authorizedPaths` is the explicit write scope (contract §5.2 / §9); empty ⇒ a read-only mission.
 */
export interface ProviderMission {
  mission: string;
  priority: string;
  mode: string;
  objectives: ProviderObjective[];
  definitionOfDone: string[];
  completion: string[];
  authorizedPaths: string[];
  context: ProviderContext;
}

/** A fully-prepared provider invocation (contract §2/§3). Pure data; ODG owns its construction. */
export interface ProviderRequest {
  providerContractVersion: string;
  mission: ProviderMission;
  /** Pinned model id for reproducibility (contract §2). */
  model: string;
  /** Defensive turn ceiling — cost + termination bound (contract §2 `--max-turns`). */
  maxTurns: number;
  /** Session id to resume an interrupted run (contract §8). */
  resumeSessionId?: string | null;
  /** When true, ODG forces a fresh call and ignores any cached result (contract §7.1 cost note). */
  bypassCache?: boolean;
}

/** The normalized RESULT SCHEMA every provider must return (contract §4.2). Advisory only. */
export interface ProviderResult {
  mission: string;
  providerContractVersion: string;
  status: "DONE" | "BLOCKED";
  objectivesAddressed: string[];
  changedFiles: string[];
  commandsRun: string[];
  blocker: string | null;
  notes?: string;
}

/**
 * Execution classification — the adapter's view, mapped by ODG onto the frozen AutonomyStatus set
 * (contract §7.2). Kept as its own vocabulary so this module stays decoupled from src/contracts.
 *   OK          → provider ran, process clean            → ODG gathers evidence → Release Manager
 *   BLOCKED     → provider certified a stop (self-report)→ ODG halts (BLOCKED)
 *   FAILED      → non-zero exit / error envelope / unauthorized frozen-file change → EXECUTION_FAILED
 *   INTERRUPTED → timeout or signal                      → resumable (contract §8)
 *   SKIPPED     → ODG decided the provider was not required (no call made — cost saving)
 */
export type ProviderClassification =
  | "OK"
  | "BLOCKED"
  | "FAILED"
  | "INTERRUPTED"
  | "SKIPPED";

/** Outcome of a provider invocation — always returned as data, never thrown (contract §4/§7). */
export interface ProviderOutcome {
  provider: string;
  classification: ProviderClassification;
  /** false when SKIPPED or served from cache without a live call. */
  providerExecuted: boolean;
  fromCache: boolean;
  /** Normalized RESULT SCHEMA payload, or null when unparseable / no call. */
  result: ProviderResult | null;
  /** Session handle for resume (contract §8); null when unavailable. */
  sessionId: string | null;
  /** Ground-truth changed files observed in the working tree (evidence, not narrative). */
  changedFiles: string[];
  /** Changed paths that violate the mission's write scope / touch frozen roots (contract §9). */
  unauthorizedChanges: string[];
  raw: { exitCode: number | null; stdout: string; stderr: string };
  diagnostics: string[];
}

/** Static description of a provider adapter. */
export interface ProviderDescription {
  name: string;
  kind: "engineering-provider";
  providerContractVersion: string;
  model: string;
}

/**
 * The one interface every provider implements (contract §1, §10). ODG depends only on this;
 * adding OpenAI / Gemini / Codex means adding a class that implements it — nothing else changes.
 */
export interface EngineeringProviderPort {
  readonly name: string;
  describe(): ProviderDescription;
  /** Execute EXACTLY the received mission and return the result to ODG. Never throws. */
  execute(request: ProviderRequest): ProviderOutcome;
}

/**
 * Structural bridge to the frozen `PipelineOutcome` seam (`AutonomyRuntimePorts.runPipeline`).
 * A future, explicitly-authorized edge mission can drop a provider into that seam without any
 * change to src/core: `{ pipelineOk }` is exactly what the core consumes.
 */
export function toPipelineOutcome(outcome: ProviderOutcome): { pipelineOk: boolean } {
  return { pipelineOk: outcome.classification === "OK" };
}

// ---------------------------------------------------------------------------
// ODG decision: is a provider required for this mission? (contract §0, §1)
// ---------------------------------------------------------------------------

/** Minimal shape needed to decide routing — a subset of a Mission Contract. */
export interface RoutableMission {
  mode?: string;
  authorizedPaths?: string[];
  /** Explicit opt-in when a mission needs engineering work but declares no paths yet. */
  requiresEngineering?: boolean;
}

const READ_ONLY_MODES = new Set(["AUDIT", "READ_ONLY", "REPORT", "STATUS", "SELF_AUDIT"]);

/**
 * ODG-owned predicate: call an engineering provider ONLY when the mission genuinely needs code
 * work (contract §1). Read-only / audit missions, and missions with no write scope and no explicit
 * engineering flag, return false — so ODG never pays for an unnecessary call (cost minimization).
 */
export function missionRequiresProvider(mission: RoutableMission): boolean {
  if (mission.requiresEngineering === true) return true;
  const mode = (mission.mode ?? "").toUpperCase();
  if (READ_ONLY_MODES.has(mode)) return false;
  return Array.isArray(mission.authorizedPaths) && mission.authorizedPaths.length > 0;
}

// ---------------------------------------------------------------------------
// Deterministic prompt rendering (contract §3) — shared by ALL providers.
// ---------------------------------------------------------------------------

/** Fixed, mission-independent guardrail preamble (contract §3.1). */
export const GUARDRAIL_SYSTEM_PROMPT = [
  "You are an engineering capability provider invoked by the ODG Runtime.",
  "- Execute ONLY the mission described below. Do not expand scope.",
  "- Do NOT modify any frozen Runtime file unless the mission's AUTHORIZED_PATHS explicitly lists it.",
  "  Frozen roots: runtime/, src/contracts/, src/core/, docs/*_DESIGN_v1.md, docs/*_SPEC_v1.md.",
  "- Do NOT create commits. Do NOT push. Leave changes in the working tree only.",
  "- Produce evidence, never claims. You do not decide completion; the Release Manager does.",
  "- On any ambiguity or blocked precondition, STOP and report the blocker. Do not guess.",
  "- Your FINAL message MUST be a single JSON object matching the RESULT SCHEMA. No prose around it.",
].join("\n");

/** Render the mission prompt (contract §3.2) — a pure function of the request. No time/randomness. */
export function renderMissionPrompt(request: ProviderRequest): string {
  const m = request.mission;
  const lines: string[] = [];
  lines.push(`# MISSION: ${m.mission}`);
  lines.push(`PROVIDER_CONTRACT_VERSION: ${request.providerContractVersion}`);
  lines.push(`PRIORITY: ${m.priority}`);
  lines.push(`MODE: ${m.mode}`);
  lines.push("");
  lines.push("## OBJECTIVES");
  for (const o of m.objectives) {
    lines.push(`- id: ${o.id}`);
    lines.push(`  goal: ${o.goal}`);
    lines.push("  done_when:");
    for (const c of o.done_when) lines.push(`    - ${c}`);
  }
  lines.push("");
  lines.push("## DEFINITION_OF_DONE");
  for (const d of m.definitionOfDone) lines.push(`- ${d}`);
  lines.push("");
  lines.push("## COMPLETION");
  for (const c of m.completion) lines.push(`- ${c}`);
  lines.push("");
  lines.push("## AUTHORIZED_PATHS");
  if (m.authorizedPaths.length === 0) {
    lines.push("- (none — this is a READ-ONLY mission; do not modify any file)");
  } else {
    for (const p of m.authorizedPaths) lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## CONTEXT");
  lines.push(`- repo_root: ${m.context.repoRoot}`);
  lines.push(`- branch: ${m.context.branch}`);
  lines.push(`- head_commit: ${m.context.headCommit}`);
  lines.push(`- master_plan_objectives: [${m.context.masterPlanObjectives.join(", ")}]`);
  lines.push(`- missing_capabilities: [${m.context.missingCapabilities.join(", ")}]`);
  lines.push("");
  lines.push("## REQUIRED_OUTPUT");
  lines.push("Return a final message that is a single JSON object matching the RESULT SCHEMA:");
  lines.push(
    '{ "mission": string, "providerContractVersion": "1.0.0", "status": "DONE"|"BLOCKED",',
  );
  lines.push(
    '  "objectivesAddressed": string[], "changedFiles": string[], "commandsRun": string[],',
  );
  lines.push('  "blocker": string|null, "notes"?: string }');
  return lines.join("\n");
}
