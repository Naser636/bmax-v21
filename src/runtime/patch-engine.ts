/*
 * Provider Patch Engine — Runtime edge (integration glue)
 *
 * The missing seam between the engineering provider and validation, required by the
 * IMPLEMENT_ENGINEERING_PROVIDER mission (OBJ-003: "Le Patch Engine reçoit le résultat.
 * Le Validation Engine vérifie automatiquement.").
 *
 * A provider's only real engineering output is the working-tree diff it produced (Provider Contract
 * §6 — "The provider invents no artifact type. It only fills the working tree."). This module is the
 * Runtime-owned component that RECEIVES that result — the provider's normalized `ProviderOutcome` —
 * and turns it into a structured `PatchReceipt`: a decision, grounded in observed evidence, about
 * whether the patch is fit to be handed to the Validation Engine.
 *
 * Design rules (mirroring the rest of the Runtime edge):
 *   - RECEIVES, NEVER DECIDES COMPLETION. It reports whether the patch is ready for validation; the
 *     Validation Engine verifies it and the Release Manager remains the sole completion authority
 *     (Provider Contract §0 invariant 1). A `readyForValidation` receipt is an input to validation,
 *     never a substitute for it.
 *   - EVIDENCE, NOT NARRATIVE. The receipt is derived only from the provider's classification and the
 *     ground-truth `changedFiles` / `unauthorizedChanges` the adapter observed — never from the
 *     provider's own `status` prose (Provider Contract §0 invariant 3, §4.2).
 *   - PURE & DETERMINISTIC. No time, no randomness, no I/O — the same outcome yields the same receipt
 *     (DETERMINISM_FIRST). It imports only provider TYPES, so it stays decoupled from src/core.
 *   - ADDITIVE. It introduces no new persistence format; it normalizes an existing shape.
 */

import type { ProviderClassification, ProviderOutcome } from "@/providers";

/**
 * Disposition of a received patch:
 *   RECEIVED — the provider produced real, in-scope working-tree changes → validate them.
 *   EMPTY    — a clean run that changed nothing (e.g. the mission was already satisfied, or a
 *              marker / cached run). Still fit for validation: the Validation Engine + Release
 *              Manager decide whether "no change" is acceptable for the mission (never this engine).
 *   REJECTED — the patch cannot be validated: the provider did not finish cleanly (BLOCKED / FAILED /
 *              INTERRUPTED / SKIPPED) or it touched paths outside the mission's write scope.
 */
export type PatchStatus = "RECEIVED" | "EMPTY" | "REJECTED";

/** Normalized, evidence-grounded record of the patch the provider handed the Runtime. */
export interface PatchReceipt {
  mission: string;
  provider: string;
  status: PatchStatus;
  /** Provider classification this receipt was derived from (traceability). */
  classification: ProviderClassification;
  /** Ground-truth changed paths observed in the working tree (the actual patch). */
  changedFiles: string[];
  /** Objective ids the provider reported addressing (advisory; not proof). */
  objectivesAddressed: string[];
  /** Commands the provider reported running (advisory; audit trail). */
  commandsRun: string[];
  /** Changed paths that violated the mission write scope / touched a frozen root (Contract §9). */
  unauthorizedChanges: string[];
  /**
   * True when the patch is fit to be forwarded to the Validation Engine — i.e. the provider ran
   * cleanly (classification OK) and left nothing outside the authorized scope. This is exactly the
   * condition under which the Runtime should trigger validation of the patch, and NEVER an assertion
   * that the mission is done.
   */
  readyForValidation: boolean;
  /** Human-legible reason a patch was REJECTED (from the outcome's diagnostics), else null. */
  reason: string | null;
}

/**
 * Runtime-owned Patch Engine. Stateless: one call per provider result.
 */
export class ProviderPatchEngine {
  /**
   * Receive a provider result and normalize it into a Patch Receipt.
   *
   * The disposition is a pure function of the outcome's observable evidence:
   *   - unauthorized changes present         → REJECTED (scope violation, Contract §9 layer 4)
   *   - classification not OK                → REJECTED (provider did not cleanly produce a patch)
   *   - OK with observed changed files       → RECEIVED (a real patch to validate)
   *   - OK with no changed files             → EMPTY    (a clean no-op; still forwarded to validation)
   */
  receive(mission: string, outcome: ProviderOutcome): PatchReceipt {
    const base = {
      mission,
      provider: outcome.provider,
      classification: outcome.classification,
      changedFiles: [...outcome.changedFiles],
      objectivesAddressed: outcome.result ? [...outcome.result.objectivesAddressed] : [],
      commandsRun: outcome.result ? [...outcome.result.commandsRun] : [],
      unauthorizedChanges: [...outcome.unauthorizedChanges],
    };

    if (outcome.unauthorizedChanges.length > 0) {
      return {
        ...base,
        status: "REJECTED",
        readyForValidation: false,
        reason: `patch touches paths outside the mission scope: ${outcome.unauthorizedChanges.join(", ")}`,
      };
    }

    if (outcome.classification !== "OK") {
      return {
        ...base,
        status: "REJECTED",
        readyForValidation: false,
        reason: this.diagnose(outcome),
      };
    }

    return {
      ...base,
      status: outcome.changedFiles.length > 0 ? "RECEIVED" : "EMPTY",
      readyForValidation: true,
      reason: null,
    };
  }

  /** Best explanation for a non-OK outcome, drawn only from fields the adapter actually populated. */
  private diagnose(outcome: ProviderOutcome): string {
    if (outcome.diagnostics.length > 0) return outcome.diagnostics.join("; ");
    if (outcome.result?.blocker) return outcome.result.blocker;
    return `provider returned ${outcome.classification}`;
  }
}
