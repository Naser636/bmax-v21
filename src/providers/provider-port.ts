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

/**
 * A verified prior-experience precedent for one objective (V31). ADVISORY INPUT ONLY — it is NOT
 * authority, proof, execution, or acceptance. Assembled read-only from patch-memory and revalidated
 * against current reality; the provider remains the author and every gate stays authoritative. Carries
 * NO edit body (representation C): it names where a validated change previously landed, not how to apply it.
 */
export interface KnownSolutionCandidate {
  objectiveId: string;
  signature: string;
  targets: string[];
  historicalMission: string | null;
  reuseCount: number;
  status: "VERIFIED_PRECEDENT";
}

/**
 * An ADVISORY predictive verification plan for a mission (V32). It tells the author WHAT the ODG
 * Validation Engine will independently re-check — probe gates, per-objective proofs, class gates
 * (build/typescript) — and the deterministic failure modes those checks imply, so the author can
 * produce the required evidence on the first pass. It is NOT proof, acceptance, or authority: nothing
 * here marks anything successful; the current governed validation chain remains the sole truth.
 * Derived purely from the CURRENT mission contract (declared + intent-implied verify, object proofs,
 * class) — never inferred from historical memory.
 */
export interface VerificationPlan {
  requiredChecks: string[];
  relevantProbes: Array<{ capability: string; evidence: string; required: boolean }>;
  objectiveProofs: string[];
  expectedEvidence: string[];
  classGates: string[];
  expectedFailureModes: string[];
}

/**
 * Pure, deterministic assembly of a {@link VerificationPlan} from already-resolved current-contract
 * inputs. No I/O, no time, no randomness, no memory. Fail-closed: empty/invalid inputs ⇒ empty plan.
 * Class gates are attached ONLY when the mission explicitly requires engineering (never inferred).
 */
export function buildVerificationPlan(input: {
  verifyProofs?: Array<{ capability?: unknown; evidence?: unknown; required?: unknown }>;
  objectiveProofs?: unknown[];
  requiresEngineering?: boolean;
}): VerificationPlan {
  const seen = new Set<string>();
  const relevantProbes = (Array.isArray(input.verifyProofs) ? input.verifyProofs : [])
    .filter((p) => p && typeof (p as { evidence?: unknown }).evidence === "string" && (p as { evidence: string }).evidence)
    .map((p) => {
      const evidence = String((p as { evidence: string }).evidence);
      return { capability: String((p as { capability?: unknown }).capability || evidence), evidence, required: (p as { required?: unknown }).required !== false };
    })
    .filter((p) => (seen.has(p.evidence) ? false : (seen.add(p.evidence), true)))
    .sort((a, b) => a.evidence.localeCompare(b.evidence));

  const objectiveProofs = [...new Set(
    (Array.isArray(input.objectiveProofs) ? input.objectiveProofs : []).filter((s): s is string => typeof s === "string" && !!s),
  )].sort();

  const classGates = input.requiresEngineering === true
    ? ["build: must stay green (npm build exit 0)", "typescript: must compile (tsc --noEmit exit 0)"]
    : [];

  const requiredProbeNames = relevantProbes.filter((p) => p.required).map((p) => p.evidence);
  const requiredChecks = [...classGates.map((g) => g.split(":")[0]), ...requiredProbeNames, ...objectiveProofs];
  const expectedEvidence = relevantProbes.map((p) => p.evidence);
  const expectedFailureModes = [
    ...(input.requiresEngineering === true
      ? ["validation BLOCKS if the build turns red", "validation BLOCKS if TypeScript fails to compile"]
      : []),
    ...requiredProbeNames.map((e) => `validation BLOCKS if required probe "${e}" evidence is absent/failing`),
    ...objectiveProofs.map((e) => `validation BLOCKS if objective-proof "${e}" does not pass`),
  ];

  return { requiredChecks, relevantProbes, objectiveProofs, expectedEvidence, classGates, expectedFailureModes };
}

/**
 * Pure, deterministic derivation of the verification gates currently reporting RED, from the EXISTING
 * runtime-verify.json booleans ({build, typescript, gitClean}) ODG already persists and the Release
 * decision already reads. ONLY an explicit `false` counts as failing (undefined/true ⇒ not claimed
 * failing — fail-closed). Stable gate order. No I/O; the caller supplies the already-read object.
 */
export function deriveFailingChecks(
  verify: { build?: unknown; typescript?: unknown; gitClean?: unknown } | null | undefined,
): string[] {
  if (!verify || typeof verify !== "object") return [];
  const out: string[] = [];
  for (const gate of ["build", "typescript", "gitClean"] as const) {
    if ((verify as Record<string, unknown>)[gate] === false) out.push(gate);
  }
  return out;
}

/** Deterministic selection context echoed into the prompt (contract §3.2 CONTEXT). */
export interface ProviderContext {
  repoRoot: string;
  branch: string;
  headCommit: string;
  masterPlanObjectives: string[];
  missingCapabilities: string[];
  /**
   * V31 — verified precedents for this mission's objectives (advisory INPUT; optional, defaults absent).
   * Reduces provider rediscovery without granting the Runtime any authoring authority.
   */
  knownSolutions?: KnownSolutionCandidate[];
  /**
   * V32 — advisory predictive verification plan (optional, defaults absent). Tells the author what the
   * Validation Engine will independently re-check. NOT proof; marks nothing successful.
   */
  verificationPlan?: VerificationPlan;
  /**
   * V36 — gates the local verification currently reports RED (from the already-persisted
   * runtime-verify.json). Advisory INPUT only — tells the author what is failing NOW so it fixes those
   * first; NOT proof. Optional, omitted when nothing is failing/known.
   */
  currentFailingChecks?: string[];
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

// ---------------------------------------------------------------------------
// OBSERVED provider usage transport (V5 Stage 3, increment E — FICHE_03 §176/§185).
//
// A provider can OBSERVE how many resources a call consumed (e.g. the token usage the Claude Code CLI
// JSON envelope and the OpenAI API both return). Before this increment that observation was DROPPED at
// the port boundary: ProviderOutcome had nowhere to carry it, so the common contract — and every
// cost-accounting consumer downstream — never saw it. These types are the smallest additive contract
// that transports the REAL observation without fabricating, defaulting, or confusing the distinct
// concepts the Master forbids fusing (usage ≠ cost ≠ budget ≠ value ≠ currency).
// ---------------------------------------------------------------------------

/**
 * Economic observation basis — the Master's distinction (economic-unit.js BASIS), plus explicit
 * absence. OBSERVED and ESTIMATED are never conflated; ABSENT is never fabricated into a zero cost.
 */
export type ObservationBasis = "OBSERVED" | "ESTIMATED" | "ABSENT";

/**
 * An exact economic quantity, STRUCTURALLY identical to runtime/core/economic-unit.js `quantity`
 * (opaque declared `unit` + `kind` + integer `minor` + non-negative `scale`; value = minor / 10^scale,
 * never a float). Declared HERE so provider-port keeps its zero-import-from-core discipline (contract
 * §0); TypeScript structural typing makes it assignable to the core Quantity, so a consumer can hand it
 * straight to economic-unit / cost-accounting. No currency is implied: `unit` is an opaque id the
 * PROVIDER reported (e.g. "token"), never a hardcoded EUR/USD.
 */
export interface ObservedQuantity {
  unit: string;
  kind: "COST_UNIT" | "ASSET";
  minor: number;
  scale: number;
}

/**
 * What a provider actually reported about the resources ONE call consumed (E). It keeps the three
 * states the Master forbids fusing:
 *   OBSERVED  — the provider returned real usage data (`quantities` non-empty).
 *   ESTIMATED — a derived/modelled figure (never certified as a real/observed cost).
 *   ABSENT    — the provider reported nothing (NOT fabricated as zero — absence is explicit).
 *
 * `quantities` carries resource USAGE (e.g. tokens) as exact economic quantities. It NEVER carries a
 * monetary cost derived from usage: converting usage → money requires a declared price rule with
 * provenance (a later stage), so a token count is never silently turned into currency. A monetary
 * figure a provider returns on its OWN (e.g. the Claude CLI's `total_cost_usd`) is preserved verbatim
 * in `providerReported` as evidence — it is NOT a certified OBSERVED economic cost here and is NEVER
 * meterable without an explicit, declared price rule.
 */
export interface ProviderUsageObservation {
  basis: ObservationBasis;
  quantities: ObservedQuantity[];
  /** Where the observation came from — provider + source field(s). null when ABSENT. */
  provenance: string | null;
  /** Raw provider-reported figures preserved verbatim as evidence (never a certified cost). */
  providerReported?: Record<string, unknown> | null;
}

/** Explicit ABSENT observation — the honest default when a provider reports no usage. Never fabricates 0. */
export function absentObservation(reason?: string): ProviderUsageObservation {
  return { basis: "ABSENT", quantities: [], provenance: reason ?? null };
}

/**
 * Build an OBSERVED usage observation from quantities the provider really returned. Empty `quantities`
 * degrade to ABSENT (there is nothing to certify), so a caller can never accidentally present an
 * OBSERVED observation with no observed data. `providerReported` is carried through verbatim as evidence.
 */
export function observedUsage(
  quantities: ObservedQuantity[],
  provenance: string,
  providerReported?: Record<string, unknown> | null,
): ProviderUsageObservation {
  if (quantities.length === 0) {
    return providerReported === undefined
      ? absentObservation()
      : { basis: "ABSENT", quantities: [], provenance: null, providerReported };
  }
  return {
    basis: "OBSERVED",
    quantities,
    provenance,
    ...(providerReported !== undefined ? { providerReported } : {}),
  };
}

/**
 * Read an outcome's observation, defaulting a legacy/missing field to ABSENT. This is what makes the
 * new field backward-compatible: an outcome built (or cached on disk) before E has `observation ===
 * undefined`, and every consumer must treat that as ABSENT — never as a zero cost.
 */
export function observationOf(
  outcome: { observation?: ProviderUsageObservation },
): ProviderUsageObservation {
  return outcome.observation ?? absentObservation();
}

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
  /**
   * The provider's OBSERVED resource usage for this call (E). OPTIONAL and additive: a provider that
   * cannot observe usage, and any outcome built before this increment, omits it — consumers read it via
   * observationOf(), which treats absence as ABSENT (never a fabricated zero cost). Carried through the
   * cache verbatim, so a cached outcome preserves exactly what the live call observed.
   */
  observation?: ProviderUsageObservation;
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
 * Structured failure diagnostics carried across the `PipelineOutcome` seam. Structurally identical
 * to the contract's `PipelineFailure` (src/contracts/runtime-autonomy.ts) but declared HERE so this
 * module keeps its zero-import-from-core discipline (contract §0); TypeScript structural typing
 * makes the two assignable. Populated only from fields actually present on the outcome — never
 * invented.
 */
export interface PipelineFailureData {
  stage: string;
  reason: string;
  message: string;
  exitCode?: number | null;
  provider?: string;
  stderr?: string;
  stdout?: string;
  blocker?: string;
  unauthorizedChanges?: string[];
}

/** Max captured stream length carried in diagnostics — enough to explain, bounded so a halt stays legible. */
const DIAGNOSTIC_STREAM_LIMIT = 4000;

function tail(text: string): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > DIAGNOSTIC_STREAM_LIMIT
    ? `…${trimmed.slice(-DIAGNOSTIC_STREAM_LIMIT)}`
    : trimmed;
}

/** Map a non-OK classification to the pipeline stage that produced it (for the halt). */
function stageForFailure(outcome: ProviderOutcome): string {
  if (outcome.unauthorizedChanges.length > 0) return "scope-enforcement";
  switch (outcome.classification) {
    case "INTERRUPTED":
      return "provider-timeout";
    case "BLOCKED":
      return "provider-report";
    case "SKIPPED":
      return "provider-skipped";
    default:
      return "provider-execution";
  }
}

/**
 * Build structured diagnostics from a non-OK provider outcome. This is what stops the Runtime from
 * hiding the real failure behind a boolean: every meaningful field the adapter observed
 * (classification, exit code, provider identity, blocker, unauthorized changes, captured streams,
 * diagnostic breadcrumbs) is preserved for the halt. Absent fields are omitted, never faked.
 */
export function toPipelineFailure(outcome: ProviderOutcome): PipelineFailureData {
  const summary =
    outcome.diagnostics.length > 0
      ? outcome.diagnostics.join("; ")
      : outcome.result?.blocker ?? `provider returned ${outcome.classification}`;
  const failure: PipelineFailureData = {
    stage: stageForFailure(outcome),
    reason: outcome.classification,
    message: summary,
    provider: outcome.provider,
  };
  if (outcome.raw.exitCode !== undefined) failure.exitCode = outcome.raw.exitCode;
  const stderr = tail(outcome.raw.stderr);
  if (stderr) failure.stderr = stderr;
  const stdout = tail(outcome.raw.stdout);
  if (stdout) failure.stdout = stdout;
  if (outcome.result?.blocker) failure.blocker = outcome.result.blocker;
  if (outcome.unauthorizedChanges.length > 0) {
    failure.unauthorizedChanges = outcome.unauthorizedChanges;
  }
  return failure;
}

/**
 * Structural bridge to the frozen `PipelineOutcome` seam (`AutonomyRuntimePorts.runPipeline`).
 * A future, explicitly-authorized edge mission can drop a provider into that seam without any
 * change to src/core: `{ pipelineOk }` is exactly what the core consumes. On failure the outcome
 * ALSO carries structured `diagnostics` so the core never surfaces a bare `{ pipelineOk: false }`.
 */
export function toPipelineOutcome(
  outcome: ProviderOutcome,
): { pipelineOk: boolean; diagnostics?: PipelineFailureData } {
  if (outcome.classification === "OK") return { pipelineOk: true };
  return { pipelineOk: false, diagnostics: toPipelineFailure(outcome) };
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

// Modes whose contract IS a code-authoring (engineering) mission. An explicit engineering mode is a
// first-class provider signal — symmetric to READ_ONLY_MODES — so a mission that DECLARES itself
// engineering requires the provider even when its contract has not (yet) enumerated authorized_paths.
// Escalation to the provider stays gated LOCAL_FIRST downstream (AutonomyRuntimeAdapter.runPipeline),
// so this never forces a paid call for a mission the Runtime can already complete locally.
const ENGINEERING_MODES = new Set(["ENGINEERING", "IMPLEMENT", "FIX", "REPAIR", "REFACTOR"]);

/**
 * ODG-owned predicate: call an engineering provider ONLY when the mission genuinely needs code
 * work (contract §1). Read-only / audit missions, and missions with no write scope, no explicit
 * engineering flag and no engineering mode, return false — so ODG never pays for an unnecessary
 * call (cost minimization).
 */
export function missionRequiresProvider(mission: RoutableMission): boolean {
  if (mission.requiresEngineering === true) return true;
  const mode = (mission.mode ?? "").toUpperCase();
  if (READ_ONLY_MODES.has(mode)) return false;
  if (ENGINEERING_MODES.has(mode)) return true;
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
  // V31 — verified precedents (advisory INPUT, NOT authority/proof): prior validated solutions for
  // these objectives. They remove rediscovery; you MUST still author the change under the CURRENT
  // contract and authorizedPaths, and it is independently validated afterwards. Rendered only when present.
  if (Array.isArray(m.context.knownSolutions) && m.context.knownSolutions.length > 0) {
    lines.push("- known_solutions (verified precedents; advisory input only — re-author under the current contract):");
    for (const k of m.context.knownSolutions) {
      lines.push(
        `  - objective ${k.objectiveId}: previously solved & validated in ${k.historicalMission ?? "a prior mission"} ` +
          `touching [${k.targets.join(", ")}] (reuseCount=${k.reuseCount})`,
      );
    }
  }
  // V32 — advisory predictive verification plan: what the Validation Engine will independently re-check.
  // NOT proof; produce the evidence these checks require so the first authored pass validates. Rendered
  // only when present and non-empty (a mission with no declared/implied verification renders nothing).
  const vp = m.context.verificationPlan;
  if (
    vp &&
    (vp.classGates.length > 0 || vp.relevantProbes.length > 0 || vp.objectiveProofs.length > 0 || vp.expectedFailureModes.length > 0)
  ) {
    lines.push("");
    lines.push("## VERIFICATION_PLAN");
    lines.push("- advisory only — ODG's Validation Engine independently re-checks ALL of this; it is NOT proof and marks nothing successful.");
    if (vp.classGates.length > 0) lines.push(`- class_gates: [${vp.classGates.join("; ")}]`);
    if (vp.relevantProbes.length > 0) {
      lines.push(`- probes_that_will_gate: [${vp.relevantProbes.map((p) => (p.required ? p.evidence : `${p.evidence} (optional)`)).join(", ")}]`);
    }
    if (vp.objectiveProofs.length > 0) lines.push(`- objective_proofs: [${vp.objectiveProofs.join(", ")}]`);
    if (vp.expectedFailureModes.length > 0) {
      lines.push("- expected_failure_modes (produce evidence to avoid these):");
      for (const f of vp.expectedFailureModes) lines.push(`  - ${f}`);
    }
  }
  // V36 — gates currently RED per the local verification (advisory INPUT; NOT proof). The provider was
  // reached because the local pipeline could not pass — fix these first. The Validation Engine re-checks.
  if (Array.isArray(m.context.currentFailingChecks) && m.context.currentFailingChecks.length > 0) {
    lines.push("");
    lines.push("## CURRENT_FAILING_CHECKS");
    lines.push("- advisory — the local verification currently reports these gates RED; prioritise fixing them. NOT proof; the Validation Engine re-checks independently.");
    lines.push(`- failing: [${m.context.currentFailingChecks.join(", ")}]`);
  }
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
