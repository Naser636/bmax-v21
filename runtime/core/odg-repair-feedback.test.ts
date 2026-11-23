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

  // V16.7 DEFECT-J2 REPRO (scenario J honestLimits): structured (array/object) results compared with === never match ⇒ a
  // CORRECT structured case is reported as the failing one ("returned [1,2] but expected [1,2]") and the real failure is hidden.
  const st = M.buildExecutionFeedback([{ args: ["aab"], expect: [["a", 2], ["b", 1]] }, { args: ["c"], expect: [["c", 1]] }], (s: string) => (s === "c" ? [["c", 9]] : [["a", 2], ["b", 1]]));
  check("DEFECT-J2: a structurally-equal ARRAY result is a PASS; the first REAL failure (c) is reported", st.hasFailure === true && JSON.stringify(st.failing.args) === '["c"]' && /returned \[\["c",9\]\]/.test(st.verifyError));
  check("DEFECT-J2: structurally-equal OBJECT results (key order ignored) ⇒ all pass", M.buildExecutionFeedback([{ args: [1], expect: { a: 1, b: [2, { c: 3 }] } }], () => ({ b: [2, { c: 3 }], a: 1 })).hasFailure === false);
  check("DEFECT-J2: a structurally-DIFFERENT object still fails (nested value differs)", M.buildExecutionFeedback([{ args: [1], expect: { a: 1, b: [2, 3] } }], () => ({ a: 1, b: [2, 4] })).hasFailure === true);
  // semantics pinned: undefined-valued key ≠ missing key; array ≠ object; length matters; NaN never equal (as ===); -0 equals 0 (as ===); primitives unchanged (no coercion)
  check("semantics: {a:undefined} ≠ {} (undefined-vs-missing is a difference)", M.buildExecutionFeedback([{ args: [], expect: {} }], () => ({ a: undefined })).hasFailure === true);
  check("semantics: [] ≠ {} and [1] ≠ [1,undefined] (type + length strict)", M.buildExecutionFeedback([{ args: [], expect: {} }], () => []).hasFailure === true && M.buildExecutionFeedback([{ args: [], expect: [1] }], () => [1, undefined]).hasFailure === true);
  check("semantics: NaN never equal (top-level AND nested), -0 equals 0 (=== primitive rule kept)", M.buildExecutionFeedback([{ args: [], expect: NaN }], () => NaN).hasFailure === true && M.buildExecutionFeedback([{ args: [], expect: [NaN] }], () => [NaN]).hasFailure === true && M.buildExecutionFeedback([{ args: [], expect: [0] }], () => [-0]).hasFailure === false);
  check("semantics: primitives unchanged — no coercion ('1' ≠ 1, null ≠ undefined)", M.buildExecutionFeedback([{ args: [], expect: 1 }], () => "1").hasFailure === true && M.buildExecutionFeedback([{ args: [], expect: null }], () => undefined).hasFailure === true);
  check("semantics: non-plain objects (Date) compare by reference only — two equal-valued Dates do NOT match", M.buildExecutionFeedback([{ args: [], expect: new Date(0) }], () => new Date(0)).hasFailure === true);
  check("semantics: a cyclic result does not hang / throw (deterministic verdict)", (() => { const c: any = { a: 1 }; c.self = c; const e: any = { a: 1 }; e.self = e; const r = M.buildExecutionFeedback([{ args: [], expect: e }], () => c); return typeof r.hasFailure === "boolean"; })());

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
