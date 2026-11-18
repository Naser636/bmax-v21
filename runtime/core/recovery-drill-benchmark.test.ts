#!/usr/bin/env node
"use strict";
/* V289 Lot 2.B — DIRECT contract tests for recovery-drill-benchmark (V124/CTO V25). Enriches the former 9-line aggregate
 * stub with direct, deterministic coverage of the REAL functions (checkpoint/verifyCheckpoint/resume/runDrill/
 * runDrillSuite): sha256-sealed integrity, deep-copy purity (NO side effects), fail-closed refusal on missing/corrupt,
 * resume+rollback idempotence, the per-scenario drill outcomes, and the anti-false-PASS property (restored state is
 * compared to an INDEPENDENT reference, never the mechanism's self-report; silentLoss must never occur). PURE in-memory
 * component — reuses the EXISTING recovery drill; no parallel recovery mechanism. */
const R = require("./recovery-drill-benchmark.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // ---- checkpoint: sealed, deep copy, frozen ----
  const src: any = { value: 1, nested: { a: 1 } };
  const cp = R.checkpoint(src);
  check("checkpoint ⇒ {state, sum} sealed + verifiable + frozen", R.verifyCheckpoint(cp).ok === true && typeof cp.sum === "string" && cp.sum.length === 64 && Object.isFrozen(cp));
  src.value = 777; src.nested.a = 2;   // mutate the ORIGINAL after checkpointing
  check("checkpoint takes a DEEP COPY (later source mutation does NOT leak into the checkpoint)", cp.state.value === 1 && cp.state.nested.a === 1 && R.verifyCheckpoint(cp).ok === true);

  // ---- verifyCheckpoint: integrity + fail-closed on malformed ----
  const tampered = JSON.parse(JSON.stringify(cp)); tampered.state.value = 999;
  check("tampered state ⇒ verify FAILS (content ≠ sealed sum)", R.verifyCheckpoint(tampered).ok === false && /corrupt/.test(R.verifyCheckpoint(tampered).reason));
  check("malformed checkpoints ⇒ 'missing/incomplete' (null / {} / no-sum / non-string sum)", R.verifyCheckpoint(null).ok === false && R.verifyCheckpoint({}).ok === false && R.verifyCheckpoint({ state: { x: 1 } }).ok === false && R.verifyCheckpoint({ state: {}, sum: 5 }).ok === false);

  // ---- resume: restore, deep-copy out, fail-closed, idempotent ----
  const good = R.checkpoint({ value: 42, version: 1 });
  const r1 = R.resume(good);
  check("resume(valid) ⇒ ok, state equals the sealed state", r1.ok === true && r1.state.value === 42 && r1.state.version === 1);
  r1.state.value = -1;   // mutate the RETURNED state
  check("resume returns a DEEP COPY (mutating the result does not corrupt the checkpoint)", good.state.value === 42 && R.verifyCheckpoint(good).ok === true);
  check("resume(tampered) ⇒ REFUSED (fail-closed, no silent partial restore)", R.resume(tampered).ok === false && /REFUSED/.test(R.resume(tampered).reason));
  check("resume(null / garbage) ⇒ REFUSED", R.resume(null).ok === false && R.resume(42).ok === false && R.resume({}).ok === false);
  check("resume is IDEMPOTENT (repeat ⇒ byte-identical result)", JSON.stringify(R.resume(good)) === JSON.stringify(R.resume(good)));

  // ---- runDrill: per-scenario outcomes ----
  const before = R.runDrill({ initial: { value: 5 }, interruptAt: "BEFORE_CHECKPOINT" });
  check("BEFORE_CHECKPOINT ⇒ nothing checkpointed ⇒ REFUSED (resumed false, restoredMatchesReference null)", before.refused === true && before.resumed === false && before.restoredMatchesReference === null);
  const after = R.runDrill({ initial: { value: 5, version: 1 }, interruptAt: "AFTER_CHECKPOINT" });
  check("AFTER_CHECKPOINT ⇒ resumed, matches INDEPENDENT reference, idempotent, NO silent loss", after.resumed === true && after.restoredMatchesReference === true && after.resumeIdempotent === true && after.rollbackIdempotent === true && after.silentLoss === false && after.corruptDetected === null);
  const during = R.runDrill({ initial: { value: 5 }, interruptAt: "DURING_MODIFY" });
  check("DURING_MODIFY ⇒ restores the pre-modify checkpoint = reference (no partial restore, no silent loss)", during.resumed === true && during.restoredMatchesReference === true && during.silentLoss === false);
  const corrupt = R.runDrill({ initial: { value: 5 }, corrupt: true });
  check("CORRUPT ⇒ DETECTED ⇒ recovery REFUSED, no silent loss", corrupt.corruptDetected === true && corrupt.resumed === false && corrupt.refused === true && corrupt.silentLoss === false);
  check("default/garbage scenario ⇒ uses default initial, still a valid resumable drill (deterministic)", R.runDrill(undefined).resumed === true && R.runDrill(null).silentLoss === false);

  // ---- anti-false-PASS: restored is compared to an INDEPENDENT reference, never a self-report ----
  const suite = R.runDrillSuite();
  check("SUITE: corrupt detected, resume+rollback idempotent, restored matches INDEPENDENT reference, refuses when unrecoverable", suite.measures.corruptDetected === true && suite.measures.resumeIdempotentAll === true && suite.measures.rollbackIdempotentAll === true && suite.measures.restoredMatchesReference === true && suite.measures.refusesWhenNotRecoverable === true);
  // silentLoss is only defined for runs that actually resumed; BEFORE_CHECKPOINT (refused) omits it. The invariant is
  // that NO run flags a silent loss (silentLoss===true), and the suite counter is 0.
  check("SUITE: ZERO silent losses across every scenario (no run flags silentLoss===true; a resume whose state ≠ reference would be flagged)", suite.measures.silentLosses === 0 && Object.values(suite.runs).every((x: any) => x.silentLoss !== true));
  // independent-reference teeth: a restored state's checksum MUST equal the reference's, computed separately.
  const crypto = require("crypto");
  const refSum = crypto.createHash("sha256").update(JSON.stringify({ value: 5, version: 1 })).digest("hex");
  const restored = R.resume(R.checkpoint({ value: 5, version: 1 }));
  check("restored state independently checksum-equals its reference (not a self-asserted PASS)", restored.ok === true && crypto.createHash("sha256").update(JSON.stringify(restored.state)).digest("hex") === refSum);

  // ---- MANDATORY + determinism + isolation + contract ----
  check("MANDATORY frozen = [BEFORE_CHECKPOINT, AFTER_CHECKPOINT, DURING_MODIFY]", Object.isFrozen(R.MANDATORY) && R.MANDATORY.join(",") === "BEFORE_CHECKPOINT,AFTER_CHECKPOINT,DURING_MODIFY");
  check("deterministic: identical input ⇒ identical sealed sum; suite byte-identical on re-run", R.checkpoint({ a: 1 }).sum === R.checkpoint({ a: 1 }).sum && JSON.stringify(R.runDrillSuite()) === JSON.stringify(suite));
  check("ISOLATED (no side effect): the drill mutates no shared state — a 2nd suite run equals the 1st", JSON.stringify(R.runDrillSuite().measures) === JSON.stringify(suite.measures) && Object.isFrozen(suite));
  check("contract: fail-closed refusal + INDEPENDENT reference + idempotent + no-silent-loss + isolated invariants present", R.RECOVERY_DRILL_CONTRACT.invariants.some((i: string) => /REFUSED/.test(i)) && R.RECOVERY_DRILL_CONTRACT.invariants.some((i: string) => /INDEPENDENT reference/.test(i)) && R.RECOVERY_DRILL_CONTRACT.invariants.some((i: string) => /no silent loss/i.test(i)) && /ISOLATED/.test(R.RECOVERY_DRILL_CONTRACT.notAuthority));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — recovery-drill-benchmark (V289 Lot 2.B direct tests: sha256-sealed checkpoints, deep-copy purity [no side-effect leak], fail-closed on missing/corrupt, resume+rollback idempotence, per-scenario drill [BEFORE/AFTER/DURING/CORRUPT], anti-false-PASS via INDEPENDENT reference checksum + zero silent loss, determinism, isolation; real component, no parallel recovery mechanism)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
