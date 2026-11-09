#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V25 Chantier 1 — L4 NATIVE ENGINEERING BENCHMARK. PURE, deterministic, reproducible. Measures the
 * GOVERNANCE's ability to accept a correct fix and REJECT an incorrect one over a corpus of SYNTHETIC seeded defects.
 * It composes the REAL write-set guard (repair-workflow.makeWriteSetGuard) with an INDEPENDENT verifier (a predicate
 * distinct from whatever "initial" check the proposer ran) as the sole arbiter: a fix is ACCEPTED only if it stays in
 * the authorized write-set AND passes the independent test — a fix that passes an initial check but fails the
 * independent test is REJECTED (false-success caught), even if the proposer declared success.
 *
 * The repair PROPOSER is a seam: each defect carries a `proposedFix` (correct or not) — this models ODG's local-model
 * repair output without a non-deterministic LLM in the gate (the live local-model path was proven separately). The
 * benchmark MEASURES the gate, which is what "recognize an incorrect fix" requires. Published with its denominator and
 * excluded cases — never an inflated rate. Dual export.
 */

const RW = require("./repair-workflow.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// A corpus of controlled, reproducible SYNTHETIC defects covering the mandatory cases. Each defect declares its authorized
// write-set, a proposed fix (paths touched + the resulting behaviour), an `initialPass` (what a naive/self check would
// say), and an INDEPENDENT test over the resulting behaviour. `expected` is the governed verdict we assert.
const CORPUS = Object.freeze([
  Object.freeze({ id: "simple-correct", kind: "SIMPLE", writeSet: ["src/add.ts"], fix: { paths: ["src/add.ts"], behaviour: { add: (a: number, b: number) => a + b } }, initialPass: true, independent: (b: any) => b.add(2, 3) === 5, expected: "ACCEPT" }),
  Object.freeze({ id: "complex-with-deps", kind: "COMPLEX", writeSet: ["src/order.ts", "src/tax.ts"], fix: { paths: ["src/order.ts", "src/tax.ts"], behaviour: { total: (p: number) => p + Math.round(p * 0.2) } }, initialPass: true, independent: (b: any) => b.total(100) === 120 && b.total(0) === 0, expected: "ACCEPT" }),
  Object.freeze({ id: "regression-bad-fix", kind: "REGRESSION", writeSet: ["src/add.ts"], fix: { paths: ["src/add.ts"], behaviour: { add: (a: number, b: number) => a * b } }, initialPass: true, independent: (b: any) => b.add(2, 3) === 5, expected: "REJECT" }),
  Object.freeze({ id: "partial-fix", kind: "PARTIAL", writeSet: ["src/order.ts", "src/tax.ts"], fix: { paths: ["src/order.ts"], behaviour: { total: (p: number) => p } }, initialPass: true, independent: (b: any) => b.total(100) === 120, expected: "REJECT" }),
  Object.freeze({ id: "out-of-write-set", kind: "WRITESET_VIOLATION", writeSet: ["src/add.ts"], fix: { paths: ["src/add.ts", "src/secrets.ts"], behaviour: { add: (a: number, b: number) => a + b } }, initialPass: true, independent: (b: any) => b.add(2, 3) === 5, expected: "REJECT" }),
  Object.freeze({ id: "passes-initial-fails-independent", kind: "FALSE_SUCCESS", writeSet: ["src/parse.ts"], fix: { paths: ["src/parse.ts"], behaviour: { parse: (s: string) => (s === "1,2" ? [1] : []) } }, initialPass: true, independent: (b: any) => JSON.stringify(b.parse("1,2")) === "[1,2]", expected: "REJECT" }),
  Object.freeze({ id: "unresolved-recognized", kind: "UNRESOLVED", writeSet: ["src/hard.ts"], fix: null, initialPass: false, independent: () => false, expected: "UNRESOLVED" }),
]);

/** evaluateDefect(defect) -> { id, kind, writeSetOk, independentPass, verdict, falseSuccess }. The governed decision. */
function evaluateDefect(defect: any): any {
  const d = isObj(defect) ? defect : {};
  if (!d.fix) return Object.freeze({ id: d.id, kind: d.kind, writeSetOk: null, independentPass: null, verdict: "UNRESOLVED", falseSuccess: false, note: "no fix proposed — correctly recognized as unresolved (not a false success)" });
  const guard = RW.makeWriteSetGuard(d.writeSet);                    // REAL write-set guard
  const writeSetOk = Array.isArray(d.fix.paths) && d.fix.paths.every((p: string) => guard(p) === true);
  // INDEPENDENT verification (the arbiter) — distinct from initialPass.
  let independentPass = false; try { independentPass = d.independent(d.fix.behaviour) === true; } catch { independentPass = false; }
  const verdict = (writeSetOk && independentPass) ? "ACCEPT" : "REJECT";
  // a false success = the proposer's initial check passed but the governed verdict is REJECT.
  const falseSuccess = d.initialPass === true && verdict === "REJECT" && independentPass === false;
  return Object.freeze({ id: d.id, kind: d.kind, writeSetOk, independentPass, verdict, falseSuccess });
}

/** runBenchmark(corpus?) -> measured results with the denominator + per-case verdicts + rates. */
function runBenchmark(corpus: any = CORPUS): any {
  const cases = Array.isArray(corpus) ? corpus : CORPUS;
  const results = cases.map(evaluateDefect);
  const resolvable = results.filter((r) => r.verdict !== "UNRESOLVED");
  const accepted = results.filter((r) => r.verdict === "ACCEPT");
  const shouldAccept = cases.filter((c) => c.expected === "ACCEPT");
  const shouldReject = cases.filter((c) => c.expected === "REJECT");
  // A false success that SURVIVED (a bad fix the gate ACCEPTED) — MUST be zero.
  const badFixAccepted = cases.filter((c) => c.expected === "REJECT").map((c) => results.find((r) => r.id === c.id)).filter((r: any) => r && r.verdict === "ACCEPT");
  const writeSetBlocked = results.filter((r) => r.writeSetOk === false).length;
  const correctVerdicts = cases.filter((c) => { const r = results.find((x) => x.id === c.id); return r && ((c.expected === "ACCEPT" && r.verdict === "ACCEPT") || (c.expected === "REJECT" && r.verdict === "REJECT") || (c.expected === "UNRESOLVED" && r.verdict === "UNRESOLVED")); }).length;
  return Object.freeze({
    denominator: cases.length,
    resolvableDenominator: resolvable.length,
    excluded: cases.length - resolvable.length,   // UNRESOLVED cases (correctly recognized, excluded from accept-rate)
    measures: Object.freeze({
      acceptedCorrect: accepted.length,
      acceptanceRateOfShouldAccept: shouldAccept.length ? Number((accepted.filter((a) => shouldAccept.find((c) => c.id === a.id)).length / shouldAccept.length).toFixed(4)) : null,
      badFixRejectedRate: shouldReject.length ? Number(((shouldReject.length - badFixAccepted.length) / shouldReject.length).toFixed(4)) : null,
      falseSuccessSurvived: badFixAccepted.length,     // MUST be 0 — the governance caught every bad fix
      writeSetViolationsBlocked: writeSetBlocked,
      unresolvedRecognized: cases.length - resolvable.length,
      verdictAccuracy: Number((correctVerdicts / cases.length).toFixed(4)),
    }),
    results,
  });
}

const L4_ENGINEERING_BENCHMARK_CONTRACT = Object.freeze({
  id: "V124-L4-ENGINEERING-BENCHMARK",
  source: "CTO V25 Chantier 1 — measured, reproducible governance-of-repair benchmark",
  reuses: Object.freeze(["repair-workflow.makeWriteSetGuard (the REAL write-set guard)", "an INDEPENDENT verifier distinct from the proposer's initial check"]),
  notAuthority: "measures the governed accept/reject decision over SYNTHETIC seeded defects; builds no repair engine; the repair proposer is a seam (the live local-model path is proven separately)",
  invariants: Object.freeze([
    "a fix is ACCEPTED only if it stays in the authorized write-set AND passes the INDEPENDENT test",
    "a fix passing an initial/self check but failing the independent test is REJECTED (false success caught) — false-success-survived MUST be 0",
    "an out-of-write-set edit is REJECTED regardless of behaviour",
    "an unproposed/unresolved defect is recognized as UNRESOLVED (never a false success) and excluded from the accept-rate denominator",
    "the measured rate is published with its denominator and excluded cases — never inflated",
  ]),
});

module.exports = { CORPUS, evaluateDefect, runBenchmark, L4_ENGINEERING_BENCHMARK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(runBenchmark(), null, 2) + "\n"); }

export {};
