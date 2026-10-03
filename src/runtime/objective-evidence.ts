/*
 * Objective-evidence assessment (ROOT CAUSE #1).
 *
 * The src/runtime LOCAL (migrated) route recorded every mission PROVEN on SELF-FULFILLING
 * evidence: RuntimeExecutor registered the plan's own steps into a fresh registry and then
 * derived the proof verdict from `registeredCount === plannedCount` — a tautology that is
 * always true, with `verification` hardcoded to {required:0, passed:0}. So an engineering
 * mission whose objective was never genuinely achieved (no capability executed, no evidence
 * artifact on disk) was still recorded SUCCESS.
 *
 * This module replaces that tautology with a verdict that is a function of GENUINE, mission-
 * derived evidence. It introduces NO new proof gate and does NOT weaken the existing
 * RuntimeReporter gate — it only computes the honest inputs that gate already re-enforces.
 *
 * Reuse (no new vocabulary, no invented evidence):
 *  - mission class follows runtime/core/validation-engine.js:66 exactly — a mission "requires
 *    engineering" when it declares authorized paths (the Mission Loader sets requiresEngineering
 *    true precisely when authorized_paths is non-empty), unless it explicitly opts out. Read-only
 *    AUDIT/ANALYZE missions (no authorized paths) keep their historical behaviour: a recorded
 *    analysis is sufficient (validation-engine A3 case 4), so no code-change evidence is demanded.
 *  - evidence existence follows runtime/core/scope-observer.js artifactNonEmpty exactly — a
 *    declared evidence artifact counts as present only when it EXISTS and is NON-EMPTY on disk.
 */
import fs from "node:fs";
import { ObjectiveSpec, VerifyRequirement } from "./mission-loader";
import { ExecutionStep } from "./mission-orchestrator";

export interface ObjectiveEvidenceInput {
  /** The mission's declared objectives, resolved from its own contract (mission.brain.objectiveSpecs). */
  objectiveSpecs: ObjectiveSpec[];
  /** The orchestrator's per-objective semantic steps built THIS run (plan.steps, OBJECTIVE_* only). */
  planObjectiveSteps: ExecutionStep[];
  /** The mission's authorized paths (mission.policies.authorizedPaths) — the engineering-class signal. */
  authorizedPaths: string[];
  /** The mission's declared capability→evidence bindings (mission.contract.verify). */
  verify: VerifyRequirement[];
  /** Explicit engineering flag when the contract carries one; authorizedPaths drives when absent. */
  requiresEngineering?: boolean;
  /** Genuine applied/executed effects observed THIS run (0 on the read-only LOCAL route). */
  appliedEvidenceCount?: number;
  /** Evidence-existence predicate; default mirrors scope-observer.artifactNonEmpty (exists + size>0). */
  evidenceExists?: (p: string) => boolean;
}

export interface ObjectiveEvidence {
  isEngineering: boolean;
  objectivesTotal: number;
  objectivesExecuted: number;
  verification: { required: number; passed: number };
  proof: { verdict: "PASS" | "FAIL" };
  reason?: string;
}

/** Default evidence predicate — EXISTS and NON-EMPTY on disk (mirrors artifactNonEmpty). */
function defaultEvidenceExists(p: string): boolean {
  if (typeof p !== "string" || !p) return false;
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

/**
 * Compute the honest proof inputs for a mission run. Pure except for the injected (default
 * fs-backed) evidence predicate. The returned verdict is PASS only when:
 *   - the mission genuinely declares at least one objective, AND
 *   - every declared objective was represented by a semantic step built this run, AND
 *   - the mission's genuine evidence requirement is met (see below).
 * Evidence requirement:
 *   - engineering-class (authorized paths declared): at least one genuine evidence — each declared
 *     verify artifact must EXIST non-empty, and a mission that declares none must still show at
 *     least one real applied/executed effect. No recorded no-op can satisfy this.
 *   - read-only (no authorized paths): only declared verify artifacts (if any) must exist; with
 *     none declared the recorded analysis is sufficient, preserving the existing AUDIT contract.
 */
export function assessObjectiveEvidence(input: ObjectiveEvidenceInput): ObjectiveEvidence {
  const evidenceExists = input.evidenceExists ?? defaultEvidenceExists;

  // Mission class — faithful to validation-engine.js:66 (authorized paths are the operative signal;
  // the loader sets requiresEngineering true exactly when authorized_paths is non-empty).
  const isEngineering =
    input.requiresEngineering === true ||
    (input.requiresEngineering !== false && input.authorizedPaths.length > 0);

  // Objective coverage — a CROSS-STAGE check (loader-declared objectives vs orchestrator-built
  // steps), never the executor counting its own registrations.
  const objectivesTotal = input.objectiveSpecs.length;
  const objectivesExecuted = Math.min(input.planObjectiveSteps.length, objectivesTotal);

  // Genuine declared evidence present on disk (existence + non-emptiness).
  const declaredEvidence = input.verify
    .map((v) => v.evidence)
    .filter((e): e is string => typeof e === "string" && e.length > 0);
  const presentEvidence = declaredEvidence.filter((e) => evidenceExists(e)).length;
  const applied = Math.max(0, Math.trunc(input.appliedEvidenceCount ?? 0));

  let required: number;
  let passed: number;
  if (isEngineering) {
    required = Math.max(declaredEvidence.length, 1);
    passed = presentEvidence + applied;
  } else {
    required = declaredEvidence.length;
    passed = presentEvidence;
  }

  let verdict: "PASS" | "FAIL" = "PASS";
  let reason: string | undefined;
  if (objectivesTotal <= 0) {
    verdict = "FAIL";
    reason = "objective-coverage-absent";
  } else if (objectivesExecuted < objectivesTotal) {
    verdict = "FAIL";
    reason = "objective-coverage-incomplete";
  } else if (passed < required) {
    verdict = "FAIL";
    reason = isEngineering ? "engineering-evidence-missing" : "verification-failed";
  }

  return {
    isEngineering,
    objectivesTotal,
    objectivesExecuted,
    verification: { required, passed },
    proof: { verdict },
    reason,
  };
}
