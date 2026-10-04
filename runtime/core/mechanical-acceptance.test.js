#!/usr/bin/env node
"use strict";

/*
 * V5 CONTROLLED EXECUTION — anti-fraud regression for the MECHANICAL ACCEPTANCE evaluator.
 * Proves the evaluator decides on FACTS, never worker claims, and that commit/push cannot occur
 * before ACCEPT. Pure/deterministic; reuses the C03 validator through evaluateAcceptance.
 *
 * Run directly: node runtime/core/mechanical-acceptance.test.js
 */
const {
  VERDICT,
  ACCEPTANCE_CONTRACT,
  isControlled,
  evaluateAcceptance,
  commitAllowed,
  pushAllowed,
} = require("./mechanical-acceptance");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// A valid C03 expected-transition record (per state-transition.js invariants).
const VALID_TRANSITION = {
  state_before: { v: 1 }, action: { do: "write" }, observed_effect: { wrote: true },
  state_after: { v: 2 }, state_version_before: 1, state_version_after: 2,
  difference: { v: { before: 1, after: 2 } }, evidence_refs: ["runtime/generated/x.json"], verification_status: "VERIFIED",
};

// A fully-proven, clean, authorized controlled mission — the ACCEPT baseline.
const CLEAN = () => ({
  mission: {
    id: "M-CLEAN", authorized: true, control: { required: true },
    base_commit: "abc123", write_set: ["runtime/core"], forbidden_paths: ["src/core/release-manager.ts"],
    required_checks: ["build", "typescript"],
  },
  git: { base_commit: "abc123", changed_files: ["runtime/core/mechanical-acceptance.js"] },
  verify: { build: true, typescript: true },
  evidence: { required: [{ path: "runtime/generated/mission-report.json", present: true, nonEmpty: true }] },
  checkpoint: { status: "COMPLETE" },
  idempotency: { decision: "PROCEED" },
  transition: VALID_TRANSITION,
});

console.log("V5 CONTROLLED EXECUTION — MECHANICAL ACCEPTANCE");

// Contract descriptor sanity.
check(ACCEPTANCE_CONTRACT.verdicts.length === 4 &&
  ["ACCEPT", "REJECT", "BLOCKED", "UNKNOWN"].every((v) => ACCEPTANCE_CONTRACT.verdicts.includes(v)),
  "contract exposes exactly the 4 verdicts");

// (9) valid clean authorized mission ⇒ ACCEPT  [positive control]
check(evaluateAcceptance(CLEAN()).verdict === VERDICT.ACCEPT, "9. valid clean mission ⇒ ACCEPT");

// (1) fake PASS text cannot produce ACCEPT.
{
  // No real proof at all, but the worker CLAIMS success loudly.
  const r = evaluateAcceptance({
    mission: { id: "M1", authorized: true },
    report: { mission: "M1", status: "SUCCESS", validated: true, summary: "DONE — ALL GREEN — PASS" },
  });
  check(r.verdict !== VERDICT.ACCEPT, "1. fake PASS/SUCCESS/DONE text ⇒ not ACCEPT");
  check(r.verdict === VERDICT.UNKNOWN, "1b. loud claim with no proof ⇒ UNKNOWN (deny-by-default)");
}

// (2) missing evidence cannot produce ACCEPT.
{
  const f = CLEAN();
  f.evidence.required = [{ path: "runtime/generated/mission-report.json", present: false, nonEmpty: false }];
  const r = evaluateAcceptance(f);
  check(r.verdict !== VERDICT.ACCEPT && r.verdict === VERDICT.REJECT, "2. missing required evidence ⇒ REJECT (never ACCEPT)");
}

// (3) wrong / failing exit code (red check) cannot produce ACCEPT.
{
  const f = CLEAN(); f.verify.build = false;
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.REJECT && r.rejections.some((x) => x.includes("build")), "3. red build (failed check) ⇒ REJECT");
}
{
  const f = CLEAN(); f.verify.typescript = false;
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "3b. failed typescript check ⇒ REJECT");
}

// (4) unauthorized modification (outside write_set) cannot produce ACCEPT.
{
  const f = CLEAN();
  f.git.changed_files = ["runtime/core/mechanical-acceptance.js", "src/app/page.tsx"];
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.REJECT && r.rejections.some((x) => x.includes("write_set")), "4. modification outside write_set ⇒ REJECT");
}

// (5) forbidden-path modification cannot produce ACCEPT.
{
  const f = CLEAN();
  f.mission.write_set = ["runtime/core", "src/core"]; // widen so the path is "authorized" yet still forbidden
  f.git.changed_files = ["src/core/release-manager.ts"];
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.REJECT && r.rejections.some((x) => x.includes("forbidden_paths")), "5. forbidden-path modification ⇒ REJECT");
}

// (6) interrupted RUNNING becomes UNKNOWN.
{
  const f = CLEAN(); f.checkpoint.status = "RUNNING";
  check(evaluateAcceptance(f).verdict === VERDICT.UNKNOWN, "6. interrupted RUNNING checkpoint ⇒ UNKNOWN");
  const g = CLEAN(); g.checkpoint.status = "INTERRUPTED";
  check(evaluateAcceptance(g).verdict === VERDICT.UNKNOWN, "6b. INTERRUPTED checkpoint ⇒ UNKNOWN");
}

// (7) UNKNOWN cannot become ACCEPT without reconstruction (checkpoint COMPLETE + proof restored).
{
  const interrupted = CLEAN(); interrupted.checkpoint.status = "RUNNING";
  check(evaluateAcceptance(interrupted).verdict === VERDICT.UNKNOWN, "7. before reconstruction ⇒ UNKNOWN");
  // Reconstruction: the ONLY change is the checkpoint reaching COMPLETE again with facts re-proven.
  const reconstructed = CLEAN(); reconstructed.checkpoint.status = "COMPLETE";
  check(evaluateAcceptance(reconstructed).verdict === VERDICT.ACCEPT, "7b. only after reconstruction (COMPLETE + proof) ⇒ ACCEPT");
  // A bare UNKNOWN with no facts never flips to ACCEPT.
  check(evaluateAcceptance({ mission: { id: "M", authorized: true } }).verdict === VERDICT.UNKNOWN, "7c. authorized but zero proof stays UNKNOWN (no ACCEPT)");
}

// (8) failed required test cannot produce ACCEPT.
{
  const f = CLEAN(); f.mission.required_checks = ["build", "typescript", "tests"]; f.checks = { tests: false };
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.REJECT && r.rejections.some((x) => x.includes("tests")), "8. failed required test ⇒ REJECT");
}
{
  const f = CLEAN(); f.mission.required_checks = ["build", "typescript", "tests"]; // tests required but no result
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.UNKNOWN && r.unknowns.some((x) => x.includes("tests")), "8b. required test with no result ⇒ UNKNOWN (not ACCEPT)");
}

// (10) commit/push cannot occur before ACCEPT.
{
  for (const v of [VERDICT.REJECT, VERDICT.BLOCKED, VERDICT.UNKNOWN]) {
    check(commitAllowed(v).allowed === false, `10. commit refused when verdict ${v}`);
    check(pushAllowed(v, { commitVerified: true }).allowed === false, `10. push refused when verdict ${v}`);
  }
  check(commitAllowed(VERDICT.ACCEPT).allowed === true, "10b. commit allowed on ACCEPT");
  check(pushAllowed(VERDICT.ACCEPT, { commitVerified: false }).allowed === false, "10c. push refused on ACCEPT when commit not verified");
  check(pushAllowed(VERDICT.ACCEPT, { commitVerified: true }).allowed === true, "10d. push allowed on ACCEPT + verified commit");
  // Accepts a verdict RECORD as well as a bare string.
  check(commitAllowed(evaluateAcceptance(CLEAN())).allowed === true, "10e. commitAllowed accepts a verdict record");
}

// (11) duplicate execution cannot mutate twice where idempotency applies.
{
  const f = CLEAN(); f.idempotency = { decision: "DUPLICATE" };
  const r = evaluateAcceptance(f);
  check(r.verdict === VERDICT.BLOCKED && r.blocks.some((x) => x.includes("DUPLICATE")), "11. idempotent DUPLICATE ⇒ BLOCKED (no second mutation)");
  const g = CLEAN(); g.idempotency = { decision: "CONFLICT" };
  check(evaluateAcceptance(g).verdict === VERDICT.REJECT, "11b. compare-and-set CONFLICT ⇒ REJECT");
}

// (12) legacy behavior compatible when control is not declared.
{
  check(isControlled({ id: "L", authorized: true }) === false, "12. mission without control ⇒ isControlled false (legacy path)");
  check(isControlled({ id: "L", authorized: true, control: { required: true } }) === true, "12b. mission with control:{required:true} ⇒ isControlled true");
  check(isControlled({ id: "L", control: { required: false } }) === false, "12c. control:{required:false} ⇒ isControlled false");
}

// Governance precondition: not AUTHORIZED ⇒ BLOCKED (never ACCEPT).
{
  const f = CLEAN(); f.mission.authorized = false;
  check(evaluateAcceptance(f).verdict === VERDICT.BLOCKED, "authority: not AUTHORIZED ⇒ BLOCKED");
}

// Base-commit mismatch ⇒ REJECT; unverifiable base ⇒ UNKNOWN.
{
  const f = CLEAN(); f.git.base_commit = "WRONG";
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "base_commit mismatch ⇒ REJECT");
  const g = CLEAN(); delete g.git.base_commit;
  check(evaluateAcceptance(g).verdict === VERDICT.UNKNOWN, "base_commit unverifiable ⇒ UNKNOWN");
}

// Evidence integrity: recomputed seal mismatch ⇒ REJECT.
{
  const f = CLEAN(); f.evidence.sealHash = "SEAL-A"; f.evidence.recomputedSealHash = "SEAL-B";
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "evidence seal mismatch ⇒ REJECT");
  const g = CLEAN(); g.evidence.sealHash = "SEAL-A"; g.evidence.recomputedSealHash = "SEAL-A";
  check(evaluateAcceptance(g).verdict === VERDICT.ACCEPT, "evidence seal match ⇒ ACCEPT");
}

// Report identity mismatch ⇒ REJECT (a claim about a different mission is never our proof).
{
  const f = CLEAN(); f.report = { mission: "OTHER", validated: true };
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "report identity mismatch ⇒ REJECT");
}

// Invalid state transition ⇒ REJECT (reuses C03 validator).
{
  const f = CLEAN(); f.transition = { ...VALID_TRANSITION, state_version_after: 1 }; // not strictly advancing
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "invalid C03 transition ⇒ REJECT");
}

// Precedence: a proven REJECT dominates a co-occurring BLOCKED and UNKNOWN.
{
  const f = CLEAN();
  f.mission.authorized = false;            // BLOCKED signal
  f.checkpoint.status = "RUNNING";         // UNKNOWN signal
  f.verify.build = false;                  // REJECT signal
  check(evaluateAcceptance(f).verdict === VERDICT.REJECT, "precedence: REJECT dominates BLOCKED + UNKNOWN");
}

// Determinism + purity: identical facts ⇒ identical result; input object is not mutated.
{
  const f = CLEAN();
  const snapshot = JSON.stringify(f);
  const r1 = evaluateAcceptance(f);
  const r2 = evaluateAcceptance(f);
  check(JSON.stringify(r1) === JSON.stringify(r2), "deterministic: same facts ⇒ identical result");
  check(JSON.stringify(f) === snapshot, "pure: evaluator does not mutate its input facts");
  check(Object.isFrozen(r1) && Object.isFrozen(r1.rejections), "result is frozen (immutable record)");
}

// Malformed / unidentifiable ⇒ UNKNOWN (cannot evaluate), never a crash, never ACCEPT.
check(evaluateAcceptance(null).verdict === VERDICT.UNKNOWN, "null facts ⇒ UNKNOWN (no crash)");
check(evaluateAcceptance({ mission: { authorized: true } }).verdict === VERDICT.UNKNOWN, "missing mission.id ⇒ UNKNOWN");

console.log(failures === 0 ? "ALL PASS — V5 MECHANICAL ACCEPTANCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
