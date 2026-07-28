/*
 * VNext — Constitution Engine (ADDITIVE — a VERIFIER, never a decider)
 *
 * Mission contract for this component (verbatim intent):
 *   - ne décide jamais ;
 *   - n'exécute jamais ;
 *   - ne choisit jamais de stratégie ;
 *   - vérifie uniquement que les décisions respectent les invariants du Runtime.
 *
 * It reads the EXISTING invariants from runtime/constitution/runtime-constitution.json
 * (the frozen Constitution — NOT modified) and, given a decision another stage has ALREADY
 * made, returns whether that decision is compatible with the invariants. It has no `execute`,
 * no `select`, no side effects. The principles source is injectable so the check is
 * deterministic and unit-testable without touching disk.
 */

import fs from "node:fs";
import path from "node:path";

export const CONSTITUTION_ENGINE_VERSION = "CONSTITUTION_ENGINE_V1";

/** The principles document shape (runtime/constitution/runtime-constitution.json). */
export interface Constitution {
  version: number;
  principles: string[];
}

/**
 * A decision produced by SOME OTHER stage (strategy selection, resource allocation, a mission
 * synthesis, …) submitted to the Constitution Engine for an invariant check. The engine reads
 * these declared attributes; it does not compute them and does not act on them.
 */
export interface RuntimeDecision {
  /** Which stage produced the decision (for evidence). */
  stage: string;
  /** Short summary of what was decided. */
  summary: string;
  /** Whether the decision carries/points at evidence (EVIDENCE_REQUIRED). */
  hasEvidence?: boolean;
  /** Whether the decision is reversible (ROLLBACK_MUST_ALWAYS_BE_POSSIBLE). */
  reversible?: boolean;
  /** Whether the decision would overwrite an existing artifact (ARTIFACTS_ARE_IMMUTABLE). */
  overwritesArtifact?: boolean;
  /** Whether the decision depends on wall-clock/randomness (DETERMINISM_FIRST / PIPELINE_IS_REPRODUCIBLE). */
  nonDeterministic?: boolean;
  /** Whether an existing component was reused rather than a new one created (REUSE_BEFORE_CREATE). */
  reusedExisting?: boolean;
}

/** One invariant breach found on a decision. */
export interface ConstitutionViolation {
  principle: string;
  detail: string;
}

/** The engine's verdict. Pure data — the caller decides what to do with a non-compliant verdict. */
export interface ConstitutionVerdict {
  compliant: boolean;
  checkedPrinciples: string[];
  violations: ConstitutionViolation[];
}

/** Default location of the frozen Constitution, relative to repo root. */
export const DEFAULT_CONSTITUTION_PATH = "runtime/constitution/runtime-constitution.json";

/** Load the Constitution from disk. Resilient: returns an empty principle set if unreadable. */
export function loadConstitution(cwd: string = process.cwd(), file: string = DEFAULT_CONSTITUTION_PATH): Constitution {
  try {
    const raw = fs.readFileSync(path.resolve(cwd, file), "utf8");
    const parsed = JSON.parse(raw) as Constitution;
    return { version: parsed.version ?? 0, principles: Array.isArray(parsed.principles) ? parsed.principles : [] };
  } catch {
    return { version: 0, principles: [] };
  }
}

/**
 * Map from a principle name to a predicate that returns a violation detail when the decision
 * breaches it, or null when it complies / the principle does not apply to this decision.
 * Only principles the Constitution actually lists are evaluated, so extending the Constitution
 * JSON automatically extends what is checked (no code change) for the mapped ones.
 */
type InvariantCheck = (d: RuntimeDecision) => string | null;

const INVARIANT_CHECKS: Record<string, InvariantCheck> = {
  EVIDENCE_REQUIRED: (d) =>
    d.hasEvidence === false ? "decision carries no evidence" : null,
  ROLLBACK_MUST_ALWAYS_BE_POSSIBLE: (d) =>
    d.reversible === false ? "decision is not reversible" : null,
  ARTIFACTS_ARE_IMMUTABLE: (d) =>
    d.overwritesArtifact === true ? "decision overwrites an existing artifact" : null,
  DETERMINISM_FIRST: (d) =>
    d.nonDeterministic === true ? "decision depends on wall-clock/randomness" : null,
  PIPELINE_IS_REPRODUCIBLE: (d) =>
    d.nonDeterministic === true ? "decision is not reproducible" : null,
  REUSE_BEFORE_CREATE: (d) =>
    d.reusedExisting === false ? "decision creates new where an existing component was available" : null,
};

/**
 * The Constitution Engine. Holds the invariants; verifies decisions against them. It exposes
 * a single `verify()` — there is intentionally no method that decides, executes, or selects.
 */
export class ConstitutionEngine {
  private readonly principles: string[];

  constructor(constitution: Constitution) {
    this.principles = constitution.principles ?? [];
  }

  /** Convenience factory that loads the frozen Constitution from disk. */
  static fromDisk(cwd?: string): ConstitutionEngine {
    return new ConstitutionEngine(loadConstitution(cwd));
  }

  /** The invariants this engine enforces (those it lists AND has a check for). */
  enforceablePrinciples(): string[] {
    return this.principles.filter((p) => p in INVARIANT_CHECKS);
  }

  /** Verify a single already-made decision against every enforceable invariant. Pure. */
  verify(decision: RuntimeDecision): ConstitutionVerdict {
    const checked = this.enforceablePrinciples();
    const violations: ConstitutionViolation[] = [];
    for (const principle of checked) {
      const detail = INVARIANT_CHECKS[principle](decision);
      if (detail) violations.push({ principle, detail });
    }
    return { compliant: violations.length === 0, checkedPrinciples: checked, violations };
  }
}
