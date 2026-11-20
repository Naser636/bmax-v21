#!/usr/bin/env node
"use strict";
/* Tests for odg-repair-feedback (V327 §3 execution-feedback repair, Self-Debugging/Reflexion technique). Proves it emits
 * SPECIFIC execution feedback (first failing input→expected/actual) in the {verifyError} seam, never a fabricated trace.
 * Deterministic. */
const M = require("./odg-repair-feedback.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const ex = [{ args: [2, 3], expect: 5 }, { args: [10, 2, 3], expect: 5 }];

function main(): void {
  // all pass ⇒ no failure
  check("all examples pass ⇒ hasFailure false, verifyError null", (() => { const r = M.buildExecutionFeedback([{ args: [2, 3], expect: 5 }], (a: number, b: number) => a + b); return r.hasFailure === false && r.verifyError === null; })());

  // wrong output ⇒ SPECIFIC execution feedback (args, expected, actual) — the world-reference technique
  const wrong = M.buildExecutionFeedback([{ args: [2, 3], expect: 5 }], (a: number, b: number) => a * b);
  check("wrong output ⇒ hasFailure, failing carries (args, expect, actual)", wrong.hasFailure === true && wrong.failing.actual === 6 && wrong.failing.expect === 5 && JSON.stringify(wrong.failing.args) === "[2,3]");
  check("verifyError contains the SPECIFIC input, actual and expected (not a generic 'fix the logic')", /\(2, 3\)/.test(wrong.verifyError) && /returned 6/.test(wrong.verifyError) && /expected result is 5/.test(wrong.verifyError) && /EXECUTION FEEDBACK/.test(wrong.verifyError));

  // reports the FIRST failing example (ordered)
  const firstFail = M.buildExecutionFeedback([{ args: [2, 3], expect: 5 }, { args: [1, 1], expect: 99 }], (a: number, b: number) => a + b);
  check("reports the FIRST failing example (2nd here: 1+1≠99)", firstFail.hasFailure === true && JSON.stringify(firstFail.failing.args) === "[1,1]" && firstFail.failing.actual === 2);

  // throws ⇒ feedback mentions the thrown error
  const thrown = M.buildExecutionFeedback([{ args: [1], expect: 2 }], () => { throw new Error("boom"); });
  check("thrown error ⇒ verifyError mentions THREW + the message", thrown.hasFailure === true && /THREW/.test(thrown.verifyError) && /boom/.test(thrown.verifyError) && thrown.failing.threw === "boom");

  // fail-closed: non-function / no examples ⇒ GENERIC verifyError (never a false all-pass)
  check("non-function ⇒ fail-closed GENERIC verifyError (not a false all-pass)", (() => { const r = M.buildExecutionFeedback(ex, null); return r.hasFailure === true && /fix the logic/.test(r.verifyError) && r.failing === null; })());
  check("no structured examples ⇒ GENERIC feedback (no execution trace available)", (() => { const r = M.buildExecutionFeedback([], (a: number) => a); return r.hasFailure === true && /no execution trace/.test(r.reason); })());
  check("malformed examples filtered (no args array) ⇒ treated as none ⇒ generic", M.buildExecutionFeedback([{ expect: 5 }], (a: number) => a).checked === 0);

  // honesty: reports REAL observed values; frozen; contract cites the world references
  check("honesty: actual is the REAL returned value (not invented)", M.buildExecutionFeedback([{ args: [4], expect: 9 }], (x: number) => x * 2).failing.actual === 8);
  check("frozen result", Object.isFrozen(wrong) && Object.isFrozen(wrong.failing));
  check("contract cites Self-Debugging + Reflexion; same {verifyError} seam; no parallel engine",
    M.REPAIR_FEEDBACK_CONTRACT.reference.some((s: string) => /Self-Debug/.test(s)) &&
    M.REPAIR_FEEDBACK_CONTRACT.reference.some((s: string) => /Reflexion/.test(s)) &&
    M.REPAIR_FEEDBACK_CONTRACT.invariants.some((s: string) => /SAME `\{ verifyError \}` seam/.test(s)) &&
    M.REPAIR_FEEDBACK_CONTRACT.invariants.some((s: string) => /never invents a trace/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-repair-feedback (V327 §3 Self-Debugging/Reflexion execution-feedback repair: emits the FIRST failing example's REAL (args→expected vs actual|threw) as a specific {verifyError} hint [vs generic 'fix the logic']; all-pass⇒no failure; non-fn/no-examples⇒fail-closed generic; reports real observed values [never invented]; same seam, no parallel engine; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
