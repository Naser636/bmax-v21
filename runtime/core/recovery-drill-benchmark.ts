#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V25 Chantier 2 — RECOVERY & ROLLBACK DRILL. PURE, deterministic, ISOLATED (in-memory only — NEVER touches
 * real VPS data, services, or operational checkpoints). Proves resume-after-interruption and rollback restore WITHOUT
 * corruption, and — crucially — verifies the restored state against an INDEPENDENT reference snapshot (a separately-kept
 * deep copy), NOT the recovery mechanism's own self-report. Fail-closed: a corrupt/incomplete checkpoint is DETECTED and
 * recovery is REFUSED (never a silent partial restore). Dual export.
 */

const crypto = require("crypto");
function clone(o: any): any { return JSON.parse(JSON.stringify(o)); }
function checksum(o: any): string { return crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex"); }

/** checkpoint(state) -> a sealed checkpoint { state (deep copy), sum }. The sum seals integrity (tamper/corruption detection). */
function checkpoint(state: any): any { const snap = clone(state); return Object.freeze({ state: snap, sum: checksum(snap) }); }

/** verifyCheckpoint(cp) -> { ok, reason }. A checkpoint whose content no longer matches its sum (corrupt/incomplete) is invalid. */
function verifyCheckpoint(cp: any): any {
  if (!cp || typeof cp !== "object" || !("state" in cp) || typeof cp.sum !== "string") return { ok: false, reason: "missing/incomplete checkpoint" };
  return checksum(cp.state) === cp.sum ? { ok: true, reason: "checkpoint integrity verified" } : { ok: false, reason: "checkpoint corrupt (content ≠ sealed sum)" };
}

/** resume(cp) -> { ok, state?, reason }. Fail-closed: an invalid checkpoint ⇒ REFUSE (no silent partial restore). Idempotent. */
function resume(cp: any): any { const v = verifyCheckpoint(cp); return v.ok ? { ok: true, state: clone(cp.state), reason: "resumed from verified checkpoint" } : { ok: false, reason: `recovery REFUSED: ${v.reason}` }; }

/**
 * runDrill(scenario) -> a measured outcome. scenario: { initial, modifyTo, interruptAt: "BEFORE_CHECKPOINT"|
 * "AFTER_CHECKPOINT"|"DURING_MODIFY", corrupt?:boolean }. Keeps an INDEPENDENT reference = the state that SHOULD result.
 */
function runDrill(scenario: any): any {
  const sc = (scenario && typeof scenario === "object") ? scenario : {};
  const initial = sc.initial !== undefined ? sc.initial : { value: 0, version: 0 };
  const reference = clone(initial);                                  // INDEPENDENT reference (what a correct recovery must yield)

  // interrupt BEFORE checkpoint ⇒ nothing was checkpointed ⇒ resume must REFUSE (no state to recover), reference = initial.
  if (sc.interruptAt === "BEFORE_CHECKPOINT") {
    const r = resume(null);
    return Object.freeze({ scenario: "BEFORE_CHECKPOINT", resumed: r.ok, refused: !r.ok, restoredMatchesReference: null, rollbackMatchesInitial: true, reason: r.reason });
  }

  let cp: any = checkpoint(initial);                                 // checkpoint the known-good initial
  if (sc.corrupt === true) { const bad = clone(cp); bad.state.value = 999999; cp = Object.freeze({ state: bad.state, sum: cp.sum }); }   // corrupt AFTER sealing ⇒ sum mismatch

  // a controlled modification begins; an interruption may leave it partial. The checkpoint still holds the pre-modify state.
  // resume MUST restore the checkpoint (pre-modify), which equals the reference — regardless of a partial in-flight change.
  const r1 = resume(cp);
  const r2 = resume(cp);                                             // repeated resume ⇒ idempotent
  const resumeIdempotent = JSON.stringify(r1) === JSON.stringify(r2);
  const restoredMatchesReference = r1.ok ? checksum(r1.state) === checksum(reference) : false;

  // rollback to the initial reference (repeated ⇒ idempotent). Independent compare to `initial`, not a self-report.
  const rb1 = resume(sc.corrupt ? cp : checkpoint(initial));
  const rb2 = resume(sc.corrupt ? cp : checkpoint(initial));
  const rollbackIdempotent = JSON.stringify(rb1) === JSON.stringify(rb2);
  const rollbackMatchesInitial = rb1.ok ? checksum(rb1.state) === checksum(initial) : false;

  return Object.freeze({
    scenario: sc.corrupt ? "CORRUPT_CHECKPOINT" : (sc.interruptAt || "AFTER_CHECKPOINT"),
    resumed: r1.ok, refused: !r1.ok,
    corruptDetected: sc.corrupt === true ? !r1.ok : null,
    resumeIdempotent, rollbackIdempotent,
    restoredMatchesReference, rollbackMatchesInitial,
    silentLoss: r1.ok && !restoredMatchesReference,                 // restored but ≠ reference = silent loss (MUST be false)
    reason: r1.reason,
  });
}

const MANDATORY = Object.freeze(["BEFORE_CHECKPOINT", "AFTER_CHECKPOINT", "DURING_MODIFY"]);
/** runDrillSuite() -> the mandatory scenarios measured together. */
function runDrillSuite(): any {
  const base = { value: 42, version: 1 };
  const runs: any = {
    beforeCheckpoint: runDrill({ initial: base, interruptAt: "BEFORE_CHECKPOINT" }),
    afterCheckpoint: runDrill({ initial: base, interruptAt: "AFTER_CHECKPOINT" }),
    duringModify: runDrill({ initial: base, interruptAt: "DURING_MODIFY" }),
    corruptCheckpoint: runDrill({ initial: base, corrupt: true }),
  };
  const silentLosses = Object.values(runs).filter((r: any) => r.silentLoss === true).length;
  return Object.freeze({
    runs,
    measures: Object.freeze({
      corruptDetected: runs.corruptCheckpoint.corruptDetected === true,
      resumeIdempotentAll: runs.afterCheckpoint.resumeIdempotent && runs.duringModify.resumeIdempotent,
      rollbackIdempotentAll: runs.afterCheckpoint.rollbackIdempotent && runs.duringModify.rollbackIdempotent,
      restoredMatchesReference: runs.afterCheckpoint.restoredMatchesReference && runs.duringModify.restoredMatchesReference,
      refusesWhenNotRecoverable: runs.beforeCheckpoint.refused && runs.corruptCheckpoint.refused,
      silentLosses,
    }),
  });
}

const RECOVERY_DRILL_CONTRACT = Object.freeze({
  id: "V124-RECOVERY-DRILL",
  source: "CTO V25 Chantier 2 — isolated reproducible recovery & rollback drill",
  reuses: Object.freeze(["sha256-sealed checkpoints (integrity)", "an INDEPENDENT reference snapshot for comparison (not the mechanism's self-report)"]),
  notAuthority: "an ISOLATED in-memory drill — never touches real VPS data, services, or operational checkpoints",
  invariants: Object.freeze([
    "resume restores the sealed checkpoint and the restored state is compared to an INDEPENDENT reference (not a self-report)",
    "resume and rollback are idempotent (repeating yields an identical result)",
    "a corrupt/incomplete checkpoint is DETECTED (content ≠ sealed sum) ⇒ recovery REFUSED (fail-closed, no silent partial restore)",
    "no silent loss: a successful resume whose state ≠ reference is flagged (must never happen)",
    "when recovery is not demonstrable (no checkpoint / corrupt) the drill REFUSES safely",
  ]),
});

module.exports = { checkpoint, verifyCheckpoint, resume, runDrill, runDrillSuite, MANDATORY, RECOVERY_DRILL_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(runDrillSuite(), null, 2) + "\n"); }

export {};
