/*
 * VNext — Strategy Engine (ADDITIVE extension point — INTERFACES ONLY)
 *
 * The target pipeline inserts a *Strategy* stage between Runtime Context and Capability
 * Resolution: the Runtime must be able to compare several ways of achieving an Intent
 * BEFORE it resolves capabilities. Today the current Runtime has exactly one implicit
 * strategy (runtime-executor.ts builds a single plan). This module makes that explicit
 * and extensible.
 *
 * Per the mission brief this ships ONLY the interfaces, the contract, and a trivial
 * default — NO comparison algorithm. The default `SingleStrategyEngine` preserves current
 * behavior exactly: it proposes one identity strategy and selects it, so wiring it into a
 * pipeline changes nothing until a real engine is supplied.
 */

import type { MissionIntent } from "../mission-intent";
import type { RuntimeContextView } from "./resource";

export const STRATEGY_ENGINE_VERSION = "STRATEGY_ENGINE_V1";

/** One candidate way of achieving an Intent. No execution — a plan description. */
export interface Strategy {
  /** Stable id used in evidence + as `derivedFrom.strategy` on the synthesized mission. */
  id: string;
  /** Human description of the approach. */
  description: string;
  /** Optional mission name the synthesizer should stamp (falls back to the Goal id). */
  missionName?: string;
  /** Ordered high-level steps this strategy would take (advisory; not executed here). */
  steps?: string[];
  /** Optional relative cost/effort estimate — the comparison signal a real engine ranks on. */
  estimatedCost?: number;
}

/** A Strategy paired with the engine's assessment of it. */
export interface StrategyCandidate {
  strategy: Strategy;
  /** Higher is better. Left undefined by the trivial default. */
  score?: number;
  /** Why this candidate was proposed/scored — evidence, not narrative. */
  rationale: string;
}

/**
 * The Strategy Engine contract. An implementation compares strategies for an Intent and
 * picks one — it NEVER executes and NEVER resolves capabilities (that is the next stage).
 * Kept deliberately small so alternative engines (cost-first, risk-first, learned) are
 * drop-in replacements at the pipeline seam.
 */
export interface StrategyEngine {
  /** Propose candidate strategies for the given Intent in the given context. */
  propose(intent: MissionIntent, context: RuntimeContextView): StrategyCandidate[];
  /** Select the winning candidate from a non-empty candidate list. */
  select(candidates: StrategyCandidate[]): StrategyCandidate;
}

/**
 * Behavior-preserving default: exactly one identity strategy, always selected. Installing
 * this into the Goal-Oriented pipeline reproduces today's single-plan Runtime. It exists so
 * the extension point is live and testable before any real comparison logic is written.
 */
export class SingleStrategyEngine implements StrategyEngine {
  propose(intent: MissionIntent): StrategyCandidate[] {
    const strategy: Strategy = {
      id: "SINGLE_PATH",
      description: `Direct execution of intent '${intent.mission}' (${intent.mode}).`,
      missionName: intent.mission,
      steps: ["resolve-capabilities", "allocate-resources", "execute", "validate"],
      estimatedCost: 1,
    };
    return [{ strategy, score: 1, rationale: "Default single-path strategy (no comparison performed)." }];
  }

  select(candidates: StrategyCandidate[]): StrategyCandidate {
    if (candidates.length === 0) {
      throw new Error("SingleStrategyEngine.select: no candidates to select from");
    }
    // Deterministic: highest score, ties broken by first-proposed order.
    return candidates.reduce((best, c) => ((c.score ?? 0) > (best.score ?? 0) ? c : best), candidates[0]);
  }
}
