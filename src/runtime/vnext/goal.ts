/*
 * VNext — Goal layer (ADDITIVE extension point)
 *
 * The current Runtime pipeline starts at a *Mission* (see runtime-executor.ts:
 * `MissionLoader.load()` → `createMissionIntent()`). The Goal-Oriented architecture
 * introduces two stages *above* Mission — Goal and Intent — and makes the Mission an
 * artifact GENERATED from `Goal + Strategy` rather than authored by hand.
 *
 * This module adds those two upstream stages WITHOUT modifying any existing file:
 *   Goal ──derive──▶ Intent (the EXISTING MissionIntent shape) ──synthesize──▶ Mission draft
 *
 * It reuses the frozen `MissionIntent` contract (./mission-intent) so a synthesized
 * mission is byte-compatible with everything the current Runtime already consumes.
 * Nothing here executes, decides completion, or mutates the tree — it is pure data
 * transformation (DETERMINISM_FIRST: same Goal ⇒ same Intent ⇒ same Mission draft).
 */

import {
  createMissionIntent,
  type MissionExecutionMode,
  type MissionIntent,
} from "../mission-intent";
import type { Strategy } from "./strategy-engine";

export const GOAL_LAYER_VERSION = "GOAL_LAYER_V1";

/**
 * A Goal is the WHAT/WHY the Runtime is asked to achieve — one level of abstraction
 * above a Mission (the HOW). It carries no execution steps; a Strategy turns it into a
 * concrete plan and the synthesizer turns Goal + Strategy into a Mission.
 */
export interface Goal {
  /** Stable identifier (kebab/upper-snake), reused as the synthesized mission id. */
  id: string;
  /** Human statement of the desired outcome. */
  statement: string;
  /** Priority passed straight through to the Intent/Mission. Defaults to NORMAL. */
  priority?: string;
  /** Optional invariants/limits the Constitution Engine can later assert against. */
  constraints?: string[];
  /** Optional observable outcomes; become the mission's definition-of-done seed. */
  successCriteria?: string[];
  /** Optional hint of the execution mode; otherwise inferred, else UNKNOWN. */
  mode?: MissionExecutionMode;
}

/** A Mission draft synthesized from `Goal + Strategy`. Compatible with the existing
 *  mission fields (id/name/objective/priority/mode) consumed by the current pipeline. */
export interface MissionDraft {
  id: string;
  name: string;
  objective: string;
  priority: string;
  mode: MissionExecutionMode;
  /** Provenance — which Goal and Strategy produced this draft (evidence). */
  derivedFrom: { goal: string; strategy: string };
  /** Seed definition-of-done taken from the Goal's success criteria. */
  definitionOfDone: string[];
}

/** Validate a Goal has the minimum fields to enter the pipeline. Pure. */
export function isValidGoal(goal: Goal): boolean {
  return Boolean(goal && goal.id && goal.statement);
}

/**
 * Derive the EXISTING `MissionIntent` from a Goal. This is the seam between the new
 * Goal stage and everything the current Runtime already understands: it starts from
 * the frozen `createMissionIntent()` factory and only enriches the fields a Goal
 * legitimately knows, so downstream consumers see a normal MissionIntent.
 */
export function deriveIntent(goal: Goal): MissionIntent {
  const base = createMissionIntent(goal.id);
  return {
    ...base,
    objective: goal.statement,
    priority: goal.priority ?? base.priority,
    mode: goal.mode ?? base.mode,
  };
}

/**
 * Synthesize a Mission draft from `Goal + Strategy`. This realizes the target-architecture
 * rule "Mission devient un artefact généré automatiquement à partir de Goal + Strategy".
 * Pure and deterministic; it never touches disk or the ledger — persisting/authorizing a
 * synthesized mission stays with the existing (frozen) mission lifecycle.
 */
export function synthesizeMission(goal: Goal, strategy: Strategy): MissionDraft {
  const intent = deriveIntent(goal);
  return {
    id: goal.id,
    name: strategy.missionName ?? goal.id,
    objective: intent.objective,
    priority: intent.priority,
    mode: intent.mode,
    derivedFrom: { goal: goal.id, strategy: strategy.id },
    definitionOfDone: goal.successCriteria ?? [],
  };
}
