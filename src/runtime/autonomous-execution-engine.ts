/*
 * AutonomousExecutionEngine — Autonomous Execution With Fallback (capability)
 *
 * The Runtime-owned capability required by the AUTONOMOUS_EXECUTION_WITH_FALLBACK mission. It is the
 * deterministic decision core of the autonomous factory loop:
 *
 *   1. EXECUTE the assigned engineering mission (via an injected capability, provider or local).
 *   2. On failure, IDENTIFY THE ROOT CAUSE (delegated to the RootCauseEngine seam).
 *   3. CLASSIFY the failure as INTERNAL (the Runtime can fix it) or EXTERNAL (something outside the
 *      Runtime's control must act).
 *   4. If INTERNAL, GENERATE AND APPLY a minimal patch, then retry.
 *   5. If EXTERNAL and systemic, GENERATE A BLOCKER REPORT with the exact action required and stop.
 *   6. RETRY using any available provider or local capability (the fallback list) before giving up.
 *   7. CONTINUE UNTIL NO AUTOMATIC ACTION REMAINS.
 *   8. STOP ONLY ON A VERIFIED EXTERNAL BLOCKER (systemic external, or the elevated blocker produced
 *      when every automatic remedy has been exhausted).
 *   9. GENERATE A SINGLE EXECUTIVE REPORT of the whole run.
 *
 * Design rules (mirroring the rest of the Runtime core — RuntimeAutonomy, ReleaseManager):
 *   - PURE & DETERMINISTIC. The engine performs no I/O and reads no clock of its own — every side
 *     effect (execute a mission, diagnose, apply a patch, stamp time) is an injected port. The same
 *     ports + mission yield the same ExecutiveReport (DETERMINISM_FIRST), so it is unit-testable
 *     without a repository, a provider or a network.
 *   - RECEIVES, NEVER DECIDES COMPLETION. It orchestrates remediation and reports; it does not
 *     certify a release. The Release Manager (frozen, elsewhere) remains the sole completion
 *     authority. A COMPLETED status means "the executing capability reported success"; it is an input
 *     to validation, never a substitute for it.
 *   - EVIDENCE, NOT NARRATIVE. Every classification is grounded in observable signals (the provider
 *     classification, unauthorized changes, structured diagnostics, the diagnosed release gate) and
 *     records those signals — never a provider's own status prose.
 *   - It imports only TYPES (provider port + root-cause report shape), so it stays decoupled from the
 *     concrete provider adapters and from src/core.
 */

import { isFrozenPath, type ProviderClassification } from "@/providers";
import type {
  MinimalPatch,
  ReleaseGateName,
  RootCauseReport,
} from "./root-cause-engine";

export const AUTONOMOUS_EXECUTION_ENGINE_VERSION = "AUTONOMOUS_EXECUTION_ENGINE_V1";
export const AUTONOMOUS_EXECUTION_CONTRACT_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// IO surface (all injected — the engine itself is pure)
// ---------------------------------------------------------------------------

/** A capability the engine may try, in fallback order (a provider or a local Runtime capability). */
export interface ExecutionCapability {
  id: string;
  kind: "provider" | "local";
}

/**
 * Evidence-grounded outcome of a single execution attempt. Never narrative: `classification`,
 * `changedFiles`, `unauthorizedChanges` and `diagnostics` are what the executing capability
 * OBSERVED, and `blocker` is a self-certified stop only when the capability set one.
 */
export interface ExecutionAttemptOutcome {
  ok: boolean;
  /** Capability id that produced this outcome. */
  capability: string;
  classification: ProviderClassification | "LOCAL_OK" | "LOCAL_FAILED";
  changedFiles: string[];
  unauthorizedChanges: string[];
  /** Structured failure reason(s) — the diagnostics the capability surfaced. */
  diagnostics: string[];
  /** Self-certified external blocker, when the capability stopped on one; else null. */
  blocker: string | null;
}

/** Result of attempting to apply a proposed minimal patch (obj 4). */
export interface PatchApplication {
  applied: boolean;
  /** Why it was (not) applied — audit trail. */
  note: string | null;
}

/**
 * The ports the engine drives. In production these wrap the real provider registry, the
 * RootCauseEngine, the mechanical patch applier and a wall clock (see AutonomousExecutionAdapter);
 * in tests they are trivial stubs.
 */
export interface AutonomousExecutionPorts {
  /** Fallback-ordered capabilities the engine may try (providers first, then local). */
  availableCapabilities(): ExecutionCapability[];
  /** Execute EXACTLY the mission with one capability. Must return evidence, never throw. */
  execute(capability: ExecutionCapability, mission: string): ExecutionAttemptOutcome;
  /** Diagnose a failed attempt into a RootCauseReport (delegates to RootCauseEngine). */
  diagnose(mission: string, outcome: ExecutionAttemptOutcome): RootCauseReport;
  /** Apply a proposed minimal patch for an INTERNAL failure. Must return data, never throw. */
  applyPatch(patch: MinimalPatch, mission: string): PatchApplication;
  /** Injected clock (ISO-8601) — keeps the engine deterministic. */
  now(): string;
}

// ---------------------------------------------------------------------------
// Report shape (obj 9)
// ---------------------------------------------------------------------------

export type FailureClass = "INTERNAL" | "EXTERNAL";

/** Classification of a single failed attempt, with the evidence it rests on (obj 3). */
export interface FailureClassification {
  class: FailureClass;
  /**
   * True when the external blocker is SYSTEMIC — retrying another provider or applying a patch
   * cannot clear it (missing credentials, no provider available, authorization required, ...). A
   * systemic external blocker is the only mid-loop reason to stop (obj 8).
   */
  systemic: boolean;
  reason: string;
  /** Observable signals the classification matched. */
  signals: string[];
  /** The diagnosed release gate, when the failure maps to one. */
  gate: ReleaseGateName | null;
}

/** A patch the engine generated and attempted to apply for an internal failure (obj 4). */
export interface PatchAction {
  gate: ReleaseGateName | null;
  rationale: string;
  filesToModify: string[];
  steps: string[];
  applied: boolean;
  note: string | null;
}

/** Exact-action blocker report for a verified external failure (obj 5). */
export interface BlockerReport {
  class: "EXTERNAL";
  summary: string;
  /** The EXACT action a human/operator must take to unblock. */
  actionRequired: string;
  /** Who must act. */
  owner: string;
  /** The observable evidence the blocker rests on. */
  evidence: string[];
}

/** One iteration of the loop, recorded for the executive report. */
export interface ExecutionCycle {
  index: number;
  capability: string;
  action: "SUCCESS" | "PATCH_APPLIED" | "PATCH_UNAVAILABLE" | "FALLBACK" | "BLOCKED";
  outcome: ExecutionAttemptOutcome;
  /** null when the attempt succeeded. */
  classification: FailureClassification | null;
  patch: PatchAction | null;
  blocker: BlockerReport | null;
}

export type ExecutiveStatus = "COMPLETED" | "BLOCKED_EXTERNAL" | "EXHAUSTED";

/** The single executive report the engine emits (obj 9). */
export interface ExecutiveReport {
  version: string;
  contractVersion: string;
  generatedAt: string;
  mission: string;
  status: ExecutiveStatus;
  summary: string;
  attempts: number;
  capabilitiesTried: string[];
  patchesApplied: PatchAction[];
  /** The verified external blocker that stopped the run, or null on success. */
  blocker: BlockerReport | null;
  cycles: ExecutionCycle[];
  /** Objective-by-objective evidence trace (mission objective id -> what was done). */
  objectives: Record<string, string>;
}

export interface AutonomousExecutionDescription {
  name: string;
  class: "capability";
  owner: "Runtime";
  autonomousExecutionContractVersion: string;
  status: "READY";
}

// ---------------------------------------------------------------------------
// External-signal detection (precise phrases only — never fuzzy single words,
// so a TypeScript "Unexpected token" is never mistaken for an auth failure).
// ---------------------------------------------------------------------------

const SYSTEMIC_EXTERNAL_SIGNAL =
  /(api[_-]?key|missing (credential|secret|api key|environment|dependency)|credential|unauthenticated|authorization required|permission denied|access denied|forbidden|\b401\b|\b403\b|rate limit|quota exceeded|billing|payment required|no provider (available|enabled)|provider (unavailable|not enabled)|not enabled|network (error|unreachable)|enotfound|econnrefused|etimedout|dns lookup|offline|manual (approval|intervention)|human (approval|decision|intervention)|requires? (human|manual|operator|authoriz))/i;

const CAPABILITY_NAME = "Autonomous Execution With Fallback";

export class AutonomousExecutionEngine {
  describe(): AutonomousExecutionDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Runtime",
      autonomousExecutionContractVersion: AUTONOMOUS_EXECUTION_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Run the autonomous execution loop for `mission` and return the single executive report.
   * Deterministic: a pure function of the mission and the injected ports.
   */
  run(mission: string, ports: AutonomousExecutionPorts): ExecutiveReport {
    const caps = ports.availableCapabilities();
    const cycles: ExecutionCycle[] = [];
    const patchesApplied: PatchAction[] = [];
    const appliedSig = new Set<string>();
    const triedCaps: string[] = [];

    // No capability at all is itself a verified external blocker: nothing can be tried (obj 8).
    if (caps.length === 0) {
      const blocker: BlockerReport = {
        class: "EXTERNAL",
        summary: "No execution capability is available: no provider is enabled and no local runner was offered.",
        actionRequired:
          "Enable/register at least one engineering provider (or a local capability) so the Runtime has a capability to execute the mission with.",
        owner: "Operator",
        evidence: ["availableCapabilities() returned an empty fallback list"],
      };
      return this.finalize(mission, ports, "EXHAUSTED", cycles, patchesApplied, blocker, triedCaps);
    }

    // Safety bound: each capability can be visited at most ~twice (one patch-retry + one fall-through).
    const maxCycles = caps.length * 3 + 3;
    let idx = 0;
    let i = 0;

    while (idx < caps.length && i < maxCycles) {
      const cap = caps[idx];
      i += 1;
      if (!triedCaps.includes(cap.id)) triedCaps.push(cap.id);

      // (1) EXECUTE the mission with this capability.
      const outcome = ports.execute(cap, mission);

      if (outcome.ok) {
        cycles.push({
          index: i,
          capability: cap.id,
          action: "SUCCESS",
          outcome,
          classification: null,
          patch: null,
          blocker: null,
        });
        return this.finalize(mission, ports, "COMPLETED", cycles, patchesApplied, null, triedCaps);
      }

      // (2) Diagnose the root cause, then (3) classify the failure.
      const report = ports.diagnose(mission, outcome);
      const cls = this.classify(outcome, report);

      // (8) A VERIFIED (systemic) external blocker is the only mid-loop stop (5): build the report.
      if (cls.class === "EXTERNAL" && cls.systemic) {
        const blocker = this.buildBlocker(outcome, report, cls);
        cycles.push({
          index: i,
          capability: cap.id,
          action: "BLOCKED",
          outcome,
          classification: cls,
          patch: null,
          blocker,
        });
        return this.finalize(mission, ports, "BLOCKED_EXTERNAL", cycles, patchesApplied, blocker, triedCaps);
      }

      // (4) INTERNAL failure -> generate and apply a minimal patch, then retry.
      if (cls.class === "INTERNAL") {
        const patch = report.minimalPatch;
        const sig = patch ? this.patchSig(patch) : null;

        if (patch && sig && !appliedSig.has(sig)) {
          const res = ports.applyPatch(patch, mission);
          const action = this.toPatchAction(cls.gate, patch, res);
          if (res.applied) {
            appliedSig.add(sig);
            patchesApplied.push(action);
            cycles.push({
              index: i,
              capability: cap.id,
              action: "PATCH_APPLIED",
              outcome,
              classification: cls,
              patch: action,
              blocker: null,
            });
            // (7) An automatic action was taken: retry the SAME capability — the patch may unblock it.
            continue;
          }
          // Could not apply the patch: (6) fall back to the next capability.
          cycles.push({
            index: i,
            capability: cap.id,
            action: "PATCH_UNAVAILABLE",
            outcome,
            classification: cls,
            patch: action,
            blocker: null,
          });
          idx += 1;
          continue;
        }

        // No patch, or the same patch was already applied (no NEW automatic action): (6) fall back.
        const action = patch
          ? this.toPatchAction(cls.gate, patch, {
              applied: false,
              note: "already applied this run; no new automatic action for this capability",
            })
          : null;
        cycles.push({
          index: i,
          capability: cap.id,
          action: "PATCH_UNAVAILABLE",
          outcome,
          classification: cls,
          patch: action,
          blocker: null,
        });
        idx += 1;
        continue;
      }

      // (6) EXTERNAL but NOT systemic (a provider-local transient failure): try the next capability.
      cycles.push({
        index: i,
        capability: cap.id,
        action: "FALLBACK",
        outcome,
        classification: cls,
        patch: null,
        blocker: null,
      });
      idx += 1;
    }

    // (7/8) The fallback list is exhausted with no success and no systemic blocker: the remaining
    // blocker is EXTERNAL by necessity — no automatic action remains, a human must intervene.
    const blocker = this.exhaustedBlocker(cycles, triedCaps);
    return this.finalize(mission, ports, "EXHAUSTED", cycles, patchesApplied, blocker, triedCaps);
  }

  // --- classification (obj 3) --------------------------------------------

  /**
   * Classify a failed attempt as INTERNAL (Runtime-fixable) or EXTERNAL, grounded ONLY in observable
   * evidence. Precedence, most-decisive first:
   *   1. a change to a FROZEN root  -> EXTERNAL, systemic (needs explicit path authorization);
   *   2. a systemic external signal -> EXTERNAL, systemic (credentials / no provider / auth / net);
   *   3. a self-certified BLOCKED    -> EXTERNAL, systemic (the capability stopped on a real blocker);
   *   4. a diagnosed fixable gate    -> INTERNAL (there is a minimal patch to apply);
   *   5. anything else               -> EXTERNAL, NON-systemic (retry the next capability first).
   */
  classify(outcome: ExecutionAttemptOutcome, report: RootCauseReport): FailureClassification {
    // 1. Scope violation against a frozen root — a patch cannot self-authorize this.
    const frozen = outcome.unauthorizedChanges.filter((f) => isFrozenPath(f));
    if (frozen.length > 0) {
      return {
        class: "EXTERNAL",
        systemic: true,
        reason: "the attempt changed a frozen Runtime root, which requires explicit path authorization",
        signals: [`unauthorized change to frozen root: ${frozen.join(", ")}`],
        gate: report.rootCause?.gate ?? null,
      };
    }

    // 2. Systemic external signal in any observed text.
    const text = [
      outcome.blocker ?? "",
      ...outcome.diagnostics,
      report.rootCause?.detail ?? "",
      report.summary,
    ].join(" ‖ ");
    const m = text.match(SYSTEMIC_EXTERNAL_SIGNAL);
    if (m) {
      return {
        class: "EXTERNAL",
        systemic: true,
        reason: "a systemic external condition was reported that retrying a provider cannot clear",
        signals: [`external signal: "${m[0]}"`],
        gate: report.rootCause?.gate ?? null,
      };
    }

    // 3. The capability self-certified a stop with a stated blocker.
    if (outcome.classification === "BLOCKED" && outcome.blocker) {
      return {
        class: "EXTERNAL",
        systemic: true,
        reason: "the capability self-certified a stop and named a blocker",
        signals: [`provider BLOCKED: ${outcome.blocker}`],
        gate: report.rootCause?.gate ?? null,
      };
    }

    // 4. A diagnosed, fixable release gate -> INTERNAL (a minimal patch exists).
    if (report.status === "DIAGNOSED" && report.rootCause) {
      return {
        class: "INTERNAL",
        systemic: false,
        reason: `the "${report.rootCause.gate}" release gate is red and is fixable inside the authorized paths`,
        signals: [`diagnosed gate: ${report.rootCause.gate}`, report.rootCause.detail],
        gate: report.rootCause.gate,
      };
    }

    // 5. No frozen violation, no systemic signal, no fixable gate: treat as a provider-local failure
    //    (EXTERNAL to this capability) and let the loop try the next capability before giving up.
    return {
      class: "EXTERNAL",
      systemic: false,
      reason: "the attempt failed without a diagnosable internal root cause; try the next capability",
      signals: outcome.diagnostics.length > 0 ? outcome.diagnostics : [`classification: ${outcome.classification}`],
      gate: null,
    };
  }

  // --- blocker reports (obj 5) -------------------------------------------

  private buildBlocker(
    outcome: ExecutionAttemptOutcome,
    report: RootCauseReport,
    cls: FailureClassification,
  ): BlockerReport {
    // The exact action: a named self-blocker wins; else the diagnosed gate's remediation steps; else
    // the classification reason. The report always says precisely WHAT must be done and BY WHOM.
    const actionRequired =
      outcome.blocker ??
      report.minimalPatch?.steps.join(" ; ") ??
      "Resolve the external condition named in the evidence, then re-authorize the mission.";
    return {
      class: "EXTERNAL",
      summary: `${cls.reason}. Root cause: ${report.summary}`,
      actionRequired,
      owner: "Operator",
      evidence: [
        ...cls.signals,
        `capability: ${outcome.capability}`,
        `classification: ${outcome.classification}`,
        ...(outcome.unauthorizedChanges.length > 0
          ? [`unauthorized changes: ${outcome.unauthorizedChanges.join(", ")}`]
          : []),
      ],
    };
  }

  private exhaustedBlocker(cycles: ExecutionCycle[], triedCaps: string[]): BlockerReport {
    const lastDiag = [...cycles]
      .reverse()
      .find((c) => c.outcome.diagnostics.length > 0)?.outcome.diagnostics ?? [];
    return {
      class: "EXTERNAL",
      summary:
        `Every automatic remedy was exhausted: ${triedCaps.length} capability(ies) tried ` +
        `(${triedCaps.join(", ")}) and every applicable patch applied, but the mission did not complete.`,
      actionRequired:
        "No automatic action remains. A human must investigate the last recorded diagnostics and either " +
        "author a corrective mission, provision an additional capability, or supply the missing external input.",
      owner: "Operator",
      evidence: [
        `capabilities tried: ${triedCaps.join(", ") || "(none)"}`,
        ...(lastDiag.length > 0 ? [`last diagnostics: ${lastDiag.join("; ")}`] : []),
      ],
    };
  }

  // --- helpers ------------------------------------------------------------

  private toPatchAction(
    gate: ReleaseGateName | null,
    patch: MinimalPatch,
    res: PatchApplication,
  ): PatchAction {
    return {
      gate,
      rationale: patch.rationale,
      filesToModify: [...patch.filesToModify],
      steps: [...patch.steps],
      applied: res.applied,
      note: res.note,
    };
  }

  private patchSig(patch: MinimalPatch): string {
    return JSON.stringify([patch.filesToModify, patch.steps]);
  }

  private finalize(
    mission: string,
    ports: AutonomousExecutionPorts,
    status: ExecutiveStatus,
    cycles: ExecutionCycle[],
    patchesApplied: PatchAction[],
    blocker: BlockerReport | null,
    triedCaps: string[],
  ): ExecutiveReport {
    const failures = cycles.filter((c) => c.classification !== null);
    const internal = failures.filter((c) => c.classification!.class === "INTERNAL").length;
    const external = failures.filter((c) => c.classification!.class === "EXTERNAL").length;
    const lastGate = [...cycles].reverse().find((c) => c.classification?.gate)?.classification?.gate ?? null;

    const summary =
      status === "COMPLETED"
        ? `Mission "${mission}" completed after ${cycles.length} attempt(s) across ${triedCaps.length} capability(ies).`
        : status === "BLOCKED_EXTERNAL"
          ? `Mission "${mission}" stopped on a verified external blocker: ${blocker?.summary ?? ""}`
          : `Mission "${mission}" exhausted all automatic remedies without completing: ${blocker?.summary ?? ""}`;

    return {
      version: AUTONOMOUS_EXECUTION_ENGINE_VERSION,
      contractVersion: AUTONOMOUS_EXECUTION_CONTRACT_VERSION,
      generatedAt: ports.now(),
      mission,
      status,
      summary,
      attempts: cycles.length,
      capabilitiesTried: triedCaps,
      patchesApplied,
      blocker,
      cycles,
      objectives: {
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_1: `Executed the mission via ${cycles.length} attempt(s) across capabilities: ${triedCaps.join(", ") || "(none)"}.`,
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_2:
          failures.length > 0
            ? `Root cause diagnosed on failure via the RootCauseEngine seam${lastGate ? ` (last gate: ${lastGate})` : ""}.`
            : "No failure occurred; no root cause was required.",
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_3: `Classified ${failures.length} failure(s): ${internal} INTERNAL, ${external} EXTERNAL.`,
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_4:
          patchesApplied.length > 0
            ? `Applied ${patchesApplied.length} internal patch(es): ${patchesApplied.map((p) => p.gate ?? "patch").join(", ")}.`
            : "No internal patch was applicable.",
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_5: blocker
          ? `Blocker report generated with exact action required: ${blocker.actionRequired}`
          : "No external blocker report was required.",
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_6: `Retried across ${triedCaps.length} available capability(ies) before giving up.`,
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_7: `Continued until no automatic action remained (terminal status: ${status}).`,
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_8:
          status === "COMPLETED"
            ? "Did not stop on a blocker; the mission completed."
            : "Stopped on a verified external blocker (systemic external condition or exhausted remedies).",
        AUTONOMOUS_EXECUTION_WITH_FALLBACK_9: "This document is the single executive report.",
      },
    };
  }

  /** Render the executive report as a compact human-readable Markdown brief. */
  render(report: ExecutiveReport): string {
    const lines: string[] = [
      "# Executive Report — Autonomous Execution With Fallback",
      "",
      `Mission : ${report.mission}`,
      `Status  : ${report.status}`,
      `Attempts: ${report.attempts}`,
      `Tried   : ${report.capabilitiesTried.join(", ") || "(none)"}`,
      "",
      report.summary,
    ];
    if (report.patchesApplied.length > 0) {
      lines.push("", "## Patches applied");
      for (const p of report.patchesApplied) {
        lines.push(`- [${p.gate ?? "patch"}] ${p.rationale}`);
      }
    }
    if (report.blocker) {
      lines.push(
        "",
        "## Verified external blocker",
        `- summary : ${report.blocker.summary}`,
        `- action  : ${report.blocker.actionRequired}`,
        `- owner   : ${report.blocker.owner}`,
      );
    }
    lines.push("", "## Objectives");
    for (const [id, note] of Object.entries(report.objectives)) {
      lines.push(`- ${id}: ${note}`);
    }
    return lines.join("\n") + "\n";
  }
}

export { CAPABILITY_NAME };
