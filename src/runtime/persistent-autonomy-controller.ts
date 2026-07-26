/*
 * PersistentAutonomyController — Persistent Autonomy Controller (capability)
 *
 * The Runtime-owned capability required by the PERSISTENT_AUTONOMY_CONTROLLER_V1 mission. Where the
 * AutonomousExecutionEngine tries a SINGLE minimal patch per failure and emits an executive report,
 * this controller is the persistent supervisor that surrounds a run and refuses to stop while any
 * automatic action remains:
 *
 *   1.  EXECUTE the assigned mission with a capability.                              (obj 1)
 *   2.  NEVER STOP ON THE FIRST FAILURE — a failure begins recovery, never ends the run. (obj 2)
 *   3.  CLASSIFY each failure (INTERNAL / EXTERNAL, systemic or not) from evidence.   (obj 3)
 *   4.  IDENTIFY THE ROOT CAUSE of each failure (delegated to the RootCauseEngine seam). (obj 4)
 *   5.  TRY ALL AVAILABLE RECOVERY STRATEGIES for that failure — every fresh strategy the
 *       ports offer, in order, not just one patch.                                   (obj 5)
 *   6.  TRY ALL AVAILABLE PROVIDERS — fall back through the whole capability list.    (obj 6)
 *   7.  IF NO PROVIDER CAN CONTINUE, EXPLAIN EXACTLY WHY.                             (obj 7)
 *   8.  LIST THE MISSING RESOURCE / CONFIGURATION / PERMISSION.                       (obj 8)
 *   9.  DESCRIBE THE SMALLEST ACTION REQUIRED TO RESUME.                             (obj 9)
 *   10. GENERATE A SINGLE ROOT CAUSE REPORT consolidating 7–9 over the whole run.     (obj 10)
 *   11. STOP ONLY WHEN NO AUTOMATIC ACTION REMAINS.                                   (obj 11)
 *
 * Design rules (identical discipline to AutonomousExecutionEngine / RuntimeAutonomy / ReleaseManager):
 *   - PURE & DETERMINISTIC. No I/O, no clock of its own — every side effect (execute, diagnose,
 *     recover, stamp time) is an injected port. Same ports + mission ⇒ same report (DETERMINISM_FIRST),
 *     so the whole loop is unit-testable without a repository, a provider or a network.
 *   - RECEIVES, NEVER DECIDES COMPLETION. It orchestrates recovery and reports; the Release Manager
 *     (frozen, elsewhere) remains the sole completion authority. COMPLETED means "a capability
 *     reported success", an input to validation, never a substitute for it.
 *   - EVIDENCE, NOT NARRATIVE. Every classification, every missing item and the smallest resume
 *     action are grounded in observable signals and record those signals — never a provider's prose.
 *   - It reuses the already-validated failure classifier (AutonomousExecutionEngine.classify) so the
 *     two capabilities can never diverge on what "systemic external" means.
 *   - It imports only TYPES from the provider port and the root-cause engine, staying decoupled from
 *     the concrete provider adapters and from src/core.
 */

import { isFrozenPath } from "@/providers";
import type {
  ExecutionAttemptOutcome,
  ExecutionCapability,
  FailureClass,
  FailureClassification,
} from "./autonomous-execution-engine";
import { AutonomousExecutionEngine } from "./autonomous-execution-engine";
import type { ReleaseGateName, RootCauseReport } from "./root-cause-engine";

export const PERSISTENT_AUTONOMY_CONTROLLER_VERSION = "PERSISTENT_AUTONOMY_CONTROLLER_V1";
export const PERSISTENT_AUTONOMY_CONTROLLER_CONTRACT_VERSION = "1.0.0";

// Re-export the shared execution vocabulary so a consumer can drive the controller without also
// importing the engine module directly.
export type { ExecutionAttemptOutcome, ExecutionCapability, FailureClass, FailureClassification };

// ---------------------------------------------------------------------------
// Recovery-strategy vocabulary (obj 5 — the distinguishing surface of this capability)
// ---------------------------------------------------------------------------

/**
 * The kind of automatic remedy a strategy represents. Kept open-ended but named so the report reads
 * as an audit trail of WHAT the controller tried, not just THAT it tried something.
 */
export type RecoveryStrategyKind =
  | "patch" // apply a minimal code/artifact patch (RootCauseEngine.minimalPatch)
  | "regenerate" // rebuild a regenerable artifact under runtime/generated/
  | "retry" // re-attempt the same capability unchanged (transient failure)
  | "reconfigure" // adjust an in-scope configuration the Runtime owns
  | "reset"; // roll back to a known-good savepoint before retrying

/** One automatic remedy the controller may attempt for a failure, offered by the ports (obj 5). */
export interface RecoveryStrategy {
  id: string;
  kind: RecoveryStrategyKind;
  description: string;
  /** Files the strategy would touch, when it is a patch/regenerate/reset (audit trail). */
  targets?: string[];
}

/** Result of attempting one recovery strategy. `applied:true` means an automatic action was taken. */
export interface RecoveryOutcome {
  applied: boolean;
  /** Why it was (not) applied — audit trail. */
  note: string | null;
}

/** A recorded attempt at one recovery strategy (goes into the report). */
export interface RecoveryAttempt {
  strategy: RecoveryStrategy;
  applied: boolean;
  note: string | null;
}

// ---------------------------------------------------------------------------
// IO surface (all injected — the controller itself is pure)
// ---------------------------------------------------------------------------

export interface PersistentAutonomyPorts {
  /** Fallback-ordered capabilities the controller may try (providers first, then local). */
  availableProviders(): ExecutionCapability[];
  /** Execute EXACTLY the mission with one capability. Must return evidence, never throw. */
  execute(capability: ExecutionCapability, mission: string): ExecutionAttemptOutcome;
  /** Diagnose a failed attempt into a RootCauseReport (delegates to RootCauseEngine). */
  diagnose(mission: string, outcome: ExecutionAttemptOutcome): RootCauseReport;
  /**
   * ALL recovery strategies available for this failure, in the order they should be tried (obj 5).
   * The controller tries every fresh one before falling back to the next provider. Returning [] is
   * legitimate — it means no automatic remedy exists for this failure.
   */
  recoveryStrategies(
    mission: string,
    outcome: ExecutionAttemptOutcome,
    report: RootCauseReport,
    classification: FailureClassification,
  ): RecoveryStrategy[];
  /** Attempt one recovery strategy. Must return data, never throw. */
  applyRecovery(strategy: RecoveryStrategy, mission: string): RecoveryOutcome;
  /** Injected clock (ISO-8601) — keeps the controller deterministic. */
  now(): string;
}

// ---------------------------------------------------------------------------
// Report shape (obj 7–10)
// ---------------------------------------------------------------------------

/** A missing external input the run needs, categorised for the operator (obj 8). */
export type MissingCategory = "RESOURCE" | "CONFIGURATION" | "PERMISSION";

export interface MissingItem {
  category: MissingCategory;
  /** The concrete thing that is missing (e.g. "api key", "network", "authorization required"). */
  item: string;
  /** The observed signal this was inferred from — evidence, never narrative. */
  evidence: string;
}

/**
 * The SINGLE consolidated root cause report the controller emits when it stops without completing
 * (obj 10). It answers 7 (why), 8 (what is missing) and 9 (the smallest action) in one artifact.
 */
export interface ConsolidatedRootCause {
  mission: string;
  /** obj 7 — exactly why no provider could continue. */
  whyBlocked: string;
  /** obj 8 — the missing resource(s) / configuration / permission(s). */
  missing: MissingItem[];
  /** obj 9 — the single smallest action required to resume. */
  smallestActionToResume: string;
  /** Who must take that action. */
  owner: string;
  /** The observable evidence the whole diagnosis rests on. */
  evidence: string[];
  /** The diagnosed release gate, when the last failure mapped to one. */
  gate: ReleaseGateName | null;
  /** How the run terminated: a verified systemic blocker, or exhaustion of every remedy. */
  terminal: "SYSTEMIC_EXTERNAL" | "REMEDIES_EXHAUSTED" | "NO_CAPABILITY";
}

/** One iteration of the persistent loop, recorded for the report. */
export interface ControllerCycle {
  index: number;
  provider: string;
  action: "SUCCESS" | "RECOVERED" | "RECOVERY_EXHAUSTED" | "FALLBACK" | "BLOCKED";
  outcome: ExecutionAttemptOutcome;
  /** null when the attempt succeeded. */
  classification: FailureClassification | null;
  /** Every recovery strategy tried in this cycle (obj 5). */
  recoveries: RecoveryAttempt[];
}

export type ControllerStatus = "COMPLETED" | "BLOCKED_EXTERNAL" | "EXHAUSTED";

/** The single report the controller emits. Its `rootCause` section IS the obj-10 root cause report. */
export interface PersistentAutonomyReport {
  version: string;
  contractVersion: string;
  generatedAt: string;
  mission: string;
  status: ControllerStatus;
  summary: string;
  attempts: number;
  providersTried: string[];
  /** Every recovery strategy attempted across the whole run (obj 5). */
  recoveriesAttempted: RecoveryAttempt[];
  /** The consolidated root cause report, or null on success (obj 7–10). */
  rootCause: ConsolidatedRootCause | null;
  cycles: ControllerCycle[];
  /** Objective-by-objective evidence trace. */
  objectives: Record<string, string>;
}

export interface PersistentAutonomyDescription {
  name: string;
  class: "capability";
  owner: "Runtime";
  persistentAutonomyControllerContractVersion: string;
  status: "READY";
}

// ---------------------------------------------------------------------------
// Missing-input detection — precise phrases per category, grounded in the same
// vocabulary the engine uses to detect a systemic external condition.
// ---------------------------------------------------------------------------

const MISSING_SIGNALS: Array<{ category: MissingCategory; re: RegExp }> = [
  // A PERMISSION is missing: someone with authority must act (auth, scope, human decision).
  {
    category: "PERMISSION",
    re: /(authorization required|permission denied|access denied|forbidden|\b401\b|\b403\b|unauthenticated|frozen (root|path)|path authorization|manual (approval|intervention)|human (approval|decision|intervention)|requires? (human|manual|operator|authoriz))/i,
  },
  // A CONFIGURATION is missing: a credential / setting the operator supplies (not a live outage).
  {
    category: "CONFIGURATION",
    re: /(api[_-]?key|credential|secret|missing (environment|api key)|no provider (available|enabled)|provider (unavailable|not enabled)|not enabled|billing|payment required|quota exceeded|rate limit)/i,
  },
  // A RESOURCE is missing: a runtime dependency / network reachability the environment must provide.
  {
    category: "RESOURCE",
    re: /(network (error|unreachable)|enotfound|econnrefused|etimedout|dns lookup|offline|missing (dependency|secret)|dependency)/i,
  },
];

const CAPABILITY_NAME = "Persistent Autonomy Controller";

export class PersistentAutonomyController {
  /** Reuse the already-validated classifier so the two capabilities never diverge (obj 3). */
  private readonly classifier = new AutonomousExecutionEngine();

  describe(): PersistentAutonomyDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Runtime",
      persistentAutonomyControllerContractVersion: PERSISTENT_AUTONOMY_CONTROLLER_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Run the persistent autonomy loop for `mission` and return the single report. Deterministic: a
   * pure function of the mission and the injected ports.
   */
  run(mission: string, ports: PersistentAutonomyPorts): PersistentAutonomyReport {
    const providers = ports.availableProviders();
    const cycles: ControllerCycle[] = [];
    const allRecoveries: RecoveryAttempt[] = [];
    const appliedSig = new Set<string>();
    const triedProviders: string[] = [];

    // No capability at all: nothing can be tried — a verified external blocker with no automatic
    // action remaining (obj 7/8/9/10/11).
    if (providers.length === 0) {
      const rootCause: ConsolidatedRootCause = {
        mission,
        whyBlocked:
          "No execution capability is available: no provider is enabled and no local runner was offered, so the mission cannot be executed at all.",
        missing: [
          {
            category: "CONFIGURATION",
            item: "an enabled engineering provider (or a local capability)",
            evidence: "availableProviders() returned an empty fallback list",
          },
        ],
        smallestActionToResume:
          "Enable or register at least one engineering provider (or a local capability) so the Runtime has a capability to execute the mission with.",
        owner: "Operator",
        evidence: ["availableProviders() returned an empty fallback list"],
        gate: null,
        terminal: "NO_CAPABILITY",
      };
      return this.finalize(mission, ports, "EXHAUSTED", cycles, allRecoveries, rootCause, triedProviders);
    }

    // Safety bound: each provider may be revisited once per fresh recovery strategy it triggers. The
    // appliedSig set makes recoveries finite; this is a hard backstop against a misbehaving port.
    const maxCycles = providers.length * 8 + 24;
    let idx = 0;
    let i = 0;

    while (idx < providers.length && i < maxCycles) {
      const cap = providers[idx];
      i += 1;
      if (!triedProviders.includes(cap.id)) triedProviders.push(cap.id);

      // (1) EXECUTE the mission with this capability.
      const outcome = ports.execute(cap, mission);

      if (outcome.ok) {
        cycles.push({
          index: i,
          provider: cap.id,
          action: "SUCCESS",
          outcome,
          classification: null,
          recoveries: [],
        });
        return this.finalize(mission, ports, "COMPLETED", cycles, allRecoveries, null, triedProviders);
      }

      // (2) A failure begins recovery — it never ends the run here.
      // (4) Diagnose the root cause, then (3) classify the failure.
      const report = ports.diagnose(mission, outcome);
      const cls = this.classifier.classify(outcome, report);

      // (5) TRY ALL AVAILABLE RECOVERY STRATEGIES — every fresh one, in order, not just one.
      const strategies = ports.recoveryStrategies(mission, outcome, report, cls);
      const recoveries: RecoveryAttempt[] = [];
      let recovered = false;
      for (const strategy of strategies) {
        const sig = this.strategySig(strategy);
        if (appliedSig.has(sig)) continue; // already tried this exact remedy — no NEW automatic action
        const res = ports.applyRecovery(strategy, mission);
        const attempt: RecoveryAttempt = { strategy, applied: res.applied, note: res.note };
        recoveries.push(attempt);
        allRecoveries.push(attempt);
        appliedSig.add(sig);
        if (res.applied) {
          recovered = true;
          break; // an automatic action was taken — retry the SAME provider (obj 2/5)
        }
      }

      if (recovered) {
        cycles.push({
          index: i,
          provider: cap.id,
          action: "RECOVERED",
          outcome,
          classification: cls,
          recoveries,
        });
        continue; // retry the SAME capability; the applied remedy may unblock it.
      }

      // No fresh remedy applied. (8-guard) A VERIFIED systemic external condition cannot be cleared by
      // trying another provider or another patch — it is the only mid-loop reason to stop (obj 7-11).
      if (cls.class === "EXTERNAL" && cls.systemic) {
        const rootCause = this.buildRootCause(mission, "SYSTEMIC_EXTERNAL", cycles, triedProviders, {
          outcome,
          report,
          cls,
        });
        cycles.push({
          index: i,
          provider: cap.id,
          action: "BLOCKED",
          outcome,
          classification: cls,
          recoveries,
        });
        return this.finalize(
          mission,
          ports,
          "BLOCKED_EXTERNAL",
          cycles,
          allRecoveries,
          rootCause,
          triedProviders,
        );
      }

      // (6) Recoverable / non-systemic failure with no automatic remedy left for THIS provider: fall
      // back to the next provider and keep going (never stop on the first failure — obj 2/6).
      cycles.push({
        index: i,
        provider: cap.id,
        action: recoveries.length > 0 ? "RECOVERY_EXHAUSTED" : "FALLBACK",
        outcome,
        classification: cls,
        recoveries,
      });
      idx += 1;
    }

    // (11) The fallback list is exhausted with no success and no systemic stop: every automatic remedy
    // has been tried. The remaining blocker is EXTERNAL by necessity — a human must intervene.
    const rootCause = this.buildRootCause(mission, "REMEDIES_EXHAUSTED", cycles, triedProviders, null);
    return this.finalize(mission, ports, "EXHAUSTED", cycles, allRecoveries, rootCause, triedProviders);
  }

  // --- consolidated root cause report (obj 7/8/9/10) ----------------------

  private buildRootCause(
    mission: string,
    terminal: ConsolidatedRootCause["terminal"],
    cycles: ControllerCycle[],
    triedProviders: string[],
    last: { outcome: ExecutionAttemptOutcome; report: RootCauseReport; cls: FailureClassification } | null,
  ): ConsolidatedRootCause {
    // Collect the evidence over the WHOLE run (every failed cycle), so the single report consolidates
    // the run rather than echoing only the last failure.
    const signals = this.collectSignals(cycles, last);
    const missing = this.detectMissing(signals);
    const gate = this.lastGate(cycles, last);

    // (7) WHY no provider could continue.
    const whyBlocked =
      terminal === "SYSTEMIC_EXTERNAL"
        ? `A verified systemic external condition was reported that retrying a provider or applying a patch cannot clear${
            last ? `: ${last.cls.reason}. Root cause: ${last.report.summary}` : "."
          }`
        : `Every automatic remedy was exhausted: ${triedProviders.length} provider(s) tried ` +
          `(${triedProviders.join(", ") || "(none)"}) and every applicable recovery strategy applied, ` +
          "but the mission did not complete and no diagnosable internal root cause remained.";

    // (9) The SMALLEST action required to resume — the single most decisive next step.
    const smallestActionToResume = this.smallestAction(missing, last, cycles);

    return {
      mission,
      whyBlocked,
      missing,
      smallestActionToResume,
      owner: "Operator",
      evidence: [
        `providers tried: ${triedProviders.join(", ") || "(none)"}`,
        ...signals,
      ],
      gate,
      terminal,
    };
  }

  /** Gather the observable signals across every failed cycle (and the last diagnosis). */
  private collectSignals(
    cycles: ControllerCycle[],
    last: { outcome: ExecutionAttemptOutcome; report: RootCauseReport; cls: FailureClassification } | null,
  ): string[] {
    const out: string[] = [];
    const push = (s: string | null | undefined) => {
      if (s && s.trim() && !out.includes(s)) out.push(s);
    };
    for (const c of cycles) {
      if (c.classification === null) continue;
      push(c.outcome.blocker);
      for (const d of c.outcome.diagnostics) push(d);
      for (const s of c.classification.signals) push(s);
      for (const f of c.outcome.unauthorizedChanges) {
        if (isFrozenPath(f)) push(`unauthorized change to frozen root: ${f}`);
      }
    }
    if (last) {
      push(last.outcome.blocker);
      for (const d of last.outcome.diagnostics) push(d);
      for (const s of last.cls.signals) push(s);
      push(last.report.summary);
      if (last.report.rootCause) push(last.report.rootCause.detail);
    }
    return out;
  }

  /** (8) Categorise the collected signals into missing resource / configuration / permission. */
  private detectMissing(signals: string[]): MissingItem[] {
    const seen = new Set<string>();
    const missing: MissingItem[] = [];
    for (const signal of signals) {
      for (const { category, re } of MISSING_SIGNALS) {
        const m = signal.match(re);
        if (!m) continue;
        const item = m[0].toLowerCase();
        const key = `${category}:${item}`;
        if (seen.has(key)) continue;
        seen.add(key);
        missing.push({ category, item, evidence: signal });
      }
    }
    return missing;
  }

  /** (9) The single smallest action: name the missing input first, else the proposed patch, else general. */
  private smallestAction(
    missing: MissingItem[],
    last: { outcome: ExecutionAttemptOutcome; report: RootCauseReport; cls: FailureClassification } | null,
    cycles: ControllerCycle[],
  ): string {
    // Order missing items PERMISSION > CONFIGURATION > RESOURCE — the most decisive human action first.
    const priority: MissingCategory[] = ["PERMISSION", "CONFIGURATION", "RESOURCE"];
    const ranked = [...missing].sort(
      (a, b) => priority.indexOf(a.category) - priority.indexOf(b.category),
    );
    if (ranked.length > 0) {
      const m = ranked[0];
      return `Provide the missing ${m.category.toLowerCase()} "${m.item}" (evidence: ${m.evidence}), then re-authorize the mission.`;
    }
    // A self-certified blocker names its own action.
    if (last?.outcome.blocker) return last.outcome.blocker;
    // A diagnosed, proposed minimal patch names its first step.
    if (last?.report.minimalPatch && last.report.minimalPatch.steps.length > 0) {
      return last.report.minimalPatch.steps[0];
    }
    // A recovery strategy that could not be auto-applied is the remaining lead.
    const unapplied = [...cycles]
      .reverse()
      .flatMap((c) => c.recoveries)
      .find((r) => !r.applied);
    if (unapplied) {
      return `Apply the recovery strategy that could not be automated: ${unapplied.strategy.description}${
        unapplied.note ? ` (${unapplied.note})` : ""
      }.`;
    }
    return (
      "No automatic action remains. A human must investigate the recorded diagnostics and either " +
      "author a corrective mission, provision an additional capability, or supply the missing external input."
    );
  }

  private lastGate(
    cycles: ControllerCycle[],
    last: { outcome: ExecutionAttemptOutcome; report: RootCauseReport; cls: FailureClassification } | null,
  ): ReleaseGateName | null {
    if (last?.cls.gate) return last.cls.gate;
    return [...cycles].reverse().find((c) => c.classification?.gate)?.classification?.gate ?? null;
  }

  // --- helpers ------------------------------------------------------------

  private strategySig(strategy: RecoveryStrategy): string {
    return JSON.stringify([strategy.id, strategy.kind, strategy.targets ?? []]);
  }

  private finalize(
    mission: string,
    ports: PersistentAutonomyPorts,
    status: ControllerStatus,
    cycles: ControllerCycle[],
    recoveriesAttempted: RecoveryAttempt[],
    rootCause: ConsolidatedRootCause | null,
    triedProviders: string[],
  ): PersistentAutonomyReport {
    const failures = cycles.filter((c) => c.classification !== null);
    const internal = failures.filter((c) => c.classification!.class === "INTERNAL").length;
    const external = failures.filter((c) => c.classification!.class === "EXTERNAL").length;
    const applied = recoveriesAttempted.filter((r) => r.applied).length;

    const summary =
      status === "COMPLETED"
        ? `Mission "${mission}" completed after ${cycles.length} attempt(s) across ${triedProviders.length} provider(s), applying ${applied} recovery action(s).`
        : status === "BLOCKED_EXTERNAL"
          ? `Mission "${mission}" stopped on a verified external blocker: ${rootCause?.whyBlocked ?? ""}`
          : `Mission "${mission}" exhausted every automatic remedy without completing: ${rootCause?.whyBlocked ?? ""}`;

    return {
      version: PERSISTENT_AUTONOMY_CONTROLLER_VERSION,
      contractVersion: PERSISTENT_AUTONOMY_CONTROLLER_CONTRACT_VERSION,
      generatedAt: ports.now(),
      mission,
      status,
      summary,
      attempts: cycles.length,
      providersTried: triedProviders,
      recoveriesAttempted,
      rootCause,
      cycles,
      objectives: {
        PERSISTENT_AUTONOMY_CONTROLLER_V1_1: `Executed the mission via ${cycles.length} attempt(s) across provider(s): ${triedProviders.join(", ") || "(none)"}.`,
        PERSISTENT_AUTONOMY_CONTROLLER_V1_2:
          failures.length > 0
            ? `Did not stop on the first failure: ${failures.length} failure(s) each began recovery rather than ending the run.`
            : "No failure occurred; the run completed on the first attempt.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_3: `Classified ${failures.length} failure(s): ${internal} INTERNAL, ${external} EXTERNAL.`,
        PERSISTENT_AUTONOMY_CONTROLLER_V1_4:
          failures.length > 0
            ? `Diagnosed the root cause of each failure via the RootCauseEngine seam${rootCause?.gate ? ` (last gate: ${rootCause.gate})` : ""}.`
            : "No failure occurred; no root cause was required.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_5: `Tried ${recoveriesAttempted.length} recovery strategy attempt(s); ${applied} applied an automatic action.`,
        PERSISTENT_AUTONOMY_CONTROLLER_V1_6: `Tried ${triedProviders.length} available provider(s) in fallback order before giving up.`,
        PERSISTENT_AUTONOMY_CONTROLLER_V1_7: rootCause
          ? `Explained exactly why no provider could continue: ${rootCause.whyBlocked}`
          : "Every provider could continue; the mission completed.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_8: rootCause
          ? `Listed ${rootCause.missing.length} missing input(s): ${
              rootCause.missing.map((m) => `${m.category}:${m.item}`).join(", ") || "(none — internal-only)"
            }.`
          : "No missing external input; the mission completed.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_9: rootCause
          ? `Described the smallest action to resume: ${rootCause.smallestActionToResume}`
          : "No resume action required; the mission completed.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_10: rootCause
          ? "Generated the single consolidated root cause report (this report's rootCause section)."
          : "No root cause report required on success.",
        PERSISTENT_AUTONOMY_CONTROLLER_V1_11: `Stopped only when no automatic action remained (terminal status: ${status}).`,
      },
    };
  }

  /** Render the report as a compact human-readable Markdown brief. */
  render(report: PersistentAutonomyReport): string {
    const lines: string[] = [
      "# Persistent Autonomy Report",
      "",
      `Mission  : ${report.mission}`,
      `Status   : ${report.status}`,
      `Attempts : ${report.attempts}`,
      `Providers: ${report.providersTried.join(", ") || "(none)"}`,
      "",
      report.summary,
    ];
    if (report.recoveriesAttempted.length > 0) {
      lines.push("", "## Recovery strategies tried");
      for (const r of report.recoveriesAttempted) {
        lines.push(`- [${r.strategy.kind}] ${r.strategy.description} — ${r.applied ? "APPLIED" : "not applied"}${r.note ? ` (${r.note})` : ""}`);
      }
    }
    if (report.rootCause) {
      const rc = report.rootCause;
      lines.push(
        "",
        "## Root cause (single consolidated report)",
        `- why blocked : ${rc.whyBlocked}`,
        `- smallest action to resume : ${rc.smallestActionToResume}`,
        `- owner : ${rc.owner}`,
      );
      if (rc.missing.length > 0) {
        lines.push("", "### Missing resource / configuration / permission");
        for (const m of rc.missing) lines.push(`- [${m.category}] ${m.item} — evidence: ${m.evidence}`);
      }
    }
    lines.push("", "## Objectives");
    for (const [id, note] of Object.entries(report.objectives)) {
      lines.push(`- ${id}: ${note}`);
    }
    return lines.join("\n") + "\n";
  }
}
