#!/usr/bin/env node
"use strict";
/*
 * V163 (§2 P0 — broad-it-independent-eval-set, REALIZABLE portion). PURE, deterministic, fail-closed. A self-contained,
 * INDEPENDENTLY-LABELLED broad-IT evaluation set spanning multiple problem families, run against ODG's REAL native
 * capabilities (odg-closed-executor, odg-ast-operations, odg-audit-integrity-analysis) — NO new capability, NO parallel
 * mechanism. Each case's EXPECTED label is SPEC-derived and held SEPARATELY from the solver (anti-contamination): the solver
 * never receives `expected`, the HARNESS compares — so a result is never "correct" just because the implementation says so.
 *
 * HONEST BOUNDARY: the register mission's title names an EXTERNAL dependency — a real public independently-labelled corpus.
 * That external corpus is the owner/external blocker; this lot builds the realizable, labelled, reproducible HARNESS +
 * taxonomy + honest scorecard over ODG's own capabilities. It does NOT import proprietary datasets, does NOT fabricate a
 * perfect score, and does NOT mark the register mission ACCEPTED (a provider cannot close a real mission).
 */
const CEX = require("./odg-closed-executor.js");
const AST = require("./odg-ast-operations.js");
const AUDIT = require("./odg-audit-integrity-analysis.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// TAXONOMY — problem families × dimensions. Each case: { id, family, dimension, label, input, expected }. `expected` is the
// INDEPENDENT spec-derived label; the solver never sees it. label = SYNTHETIC (constructed) or PUBLIC_PATTERN (well-known idiom).
const EVAL_SET = Object.freeze([
  // deterministic-compute (correctness + robustness) — closed executor
  { id: "dc-1", family: "deterministic-compute", dimension: "correctness", label: "SYNTHETIC", solver: "compute", input: { opId: "sum@1", args: [2, 3] }, expected: { ok: true, result: 5 } },
  { id: "dc-2", family: "deterministic-compute", dimension: "correctness", label: "SYNTHETIC", solver: "compute", input: { opId: "max@1", args: [7, 2] }, expected: { ok: true, result: 7 } },
  { id: "dc-3", family: "deterministic-compute", dimension: "correctness", label: "PUBLIC_PATTERN", solver: "compute", input: { opId: "isEven@1", args: [4] }, expected: { ok: true, result: true } },
  { id: "dc-4", family: "deterministic-compute", dimension: "robustness", label: "SYNTHETIC", solver: "compute", input: { opId: "sum@1", args: ["2", 3] }, expected: { ok: false, code: "TYPE_MISMATCH" } },
  // ast-transform (correctness + robustness) — ast operations
  { id: "ast-1", family: "ast-transform", dimension: "correctness", label: "PUBLIC_PATTERN", solver: "astOrder", input: { source: 'import { z } from "./z";\nimport { a } from "./a";\n' }, expected: { outcome: "NATIVE_REPAIRED_GREEN", sortedFirst: "./a" } },
  { id: "ast-2", family: "ast-transform", dimension: "robustness", label: "SYNTHETIC", solver: "astOrder", input: { source: 'import "./polyfill";\nimport { b } from "./b";\nimport { a } from "./a";\n' }, expected: { outcome: "NATIVE_REFUSED" } },
  { id: "ast-3", family: "ast-transform", dimension: "robustness", label: "SYNTHETIC", solver: "astOrder", input: { source: 'import { a from "./bad\n' }, expected: { outcome: "NATIVE_REFUSED" } },
  // integrity-security (security) — audit-integrity
  { id: "sec-1", family: "integrity-security", dimension: "security", label: "SYNTHETIC", solver: "forgeryResistance", input: {}, expected: { keyedClosesFullRewrite: true, tipAnchorClosesTailTruncation: true, unkeyedMissesFullRewrite: true } },
  // authorization-refusal (security) — closed executor deny-by-default
  { id: "auth-1", family: "authorization-refusal", dimension: "security", label: "SYNTHETIC", solver: "compute", input: { opId: "(a,b)=>a+b", args: [1, 2] }, expected: { ok: false, code: "CODE_STRING_REJECTED" } },
  { id: "auth-2", family: "authorization-refusal", dimension: "security", label: "SYNTHETIC", solver: "compute", input: { opId: "no-such@9", args: [1] }, expected: { ok: false, code: "UNREGISTERED_OP" } },
  // recovery (recovery) — a failing operation must NOT yield a false success
  { id: "rec-1", family: "recovery", dimension: "recovery", label: "SYNTHETIC", solver: "compute", input: { opId: "sum@1", args: [1e20, 1] }, expected: { ok: false, code: "VALUE_TOO_LARGE" } },
]);

// SOLVERS — call ODG's REAL native capabilities. A solver NEVER receives `expected` (anti-contamination).
const SOLVERS: Record<string, any> = {
  compute: (input: any) => { const r = CEX.executeOp(input.opId, input.args); return r.ok ? { ok: true, result: r.result } : { ok: false, code: r.code }; },
  astOrder: (input: any) => { const r = AST.runAstOp("import-ordering@1", { source: input.source }); return r.outcome === "NATIVE_REPAIRED_GREEN" ? { outcome: r.outcome, sortedFirst: (r.after.match(/from "([^"]+)"/) || [])[1] } : { outcome: r.outcome }; },
  forgeryResistance: () => { const m = AUDIT.forgeryResistanceMatrix("eval-ephemeral-key"); return { keyedClosesFullRewrite: m.findings.keyedClosesFullRewrite, tipAnchorClosesTailTruncation: m.findings.tipAnchorClosesTailTruncation, unkeyedMissesFullRewrite: m.findings.unkeyedMissesFullRewrite }; },
};

// independent comparison — the HARNESS decides pass/fail by comparing actual vs the spec-held expected (NOT the solver's word).
function matches(expected: any, actual: any): boolean {
  if (!isObj(expected) || !isObj(actual)) return expected === actual;
  for (const k of Object.keys(expected)) { if (JSON.stringify(expected[k]) !== JSON.stringify(actual[k])) return false; }
  return true;
}

/* runEvalSet() — runs every case through its ODG capability, scores independently, checks reproducibility + contamination. */
function runEvalSet(): any {
  const run = () => EVAL_SET.map((c: any) => {
    const solver = SOLVERS[c.solver];
    let actual: any, err: string | null = null;
    try { actual = solver(c.input); } catch (e: any) { actual = null; err = (e && e.message) || String(e); }
    return { id: c.id, family: c.family, dimension: c.dimension, pass: err === null && matches(c.expected, actual), actual, err };
  });
  const first = run();
  const second = run();   // reproducibility: a second independent run must be identical
  const reproducible = JSON.stringify(first.map((r: any) => [r.id, r.pass])) === JSON.stringify(second.map((r: any) => [r.id, r.pass]));
  // anti-contamination check: confirm the solver signature never references `expected` (structural guarantee that labels are held apart).
  const contaminationFree = Object.values(SOLVERS).every((fn: any) => !/expected/.test(fn.toString()));

  const byFamily: Record<string, any> = {}; const byDimension: Record<string, any> = {};
  for (const r of first) {
    byFamily[r.family] = byFamily[r.family] || { total: 0, pass: 0 }; byFamily[r.family].total++; if (r.pass) byFamily[r.family].pass++;
    byDimension[r.dimension] = byDimension[r.dimension] || { total: 0, pass: 0 }; byDimension[r.dimension].total++; if (r.pass) byDimension[r.dimension].pass++;
  }
  const passCount = first.filter((r: any) => r.pass).length;
  return Object.freeze({
    ok: true, total: first.length, pass: passCount, fail: first.length - passCount,
    reproducible, contaminationFree,
    byFamily: Object.freeze(byFamily), byDimension: Object.freeze(byDimension),
    failures: Object.freeze(first.filter((r: any) => !r.pass).map((r: any) => ({ id: r.id, family: r.family, actual: r.actual, err: r.err }))),
    results: Object.freeze(first),
    note: "INDEPENDENTLY-labelled eval set over ODG's REAL native capabilities; expected labels held apart from the solver (anti-contamination); reproducible across runs. Honest scorecard — no inflated score.",
  });
}

/* scorecard() — the honest summary (overall + per-family + per-dimension pass rates). */
function scorecard(): any {
  const r = runEvalSet();
  const pct = (o: any) => (o.total > 0 ? Math.round((o.pass / o.total) * 1000) / 10 : null);
  const families: Record<string, any> = {}; for (const f of Object.keys(r.byFamily)) families[f] = `${r.byFamily[f].pass}/${r.byFamily[f].total} (${pct(r.byFamily[f])}%)`;
  const dims: Record<string, any> = {}; for (const d of Object.keys(r.byDimension)) dims[d] = `${r.byDimension[d].pass}/${r.byDimension[d].total} (${pct(r.byDimension[d])}%)`;
  return Object.freeze({ ok: true, overall: `${r.pass}/${r.total} (${pct({ pass: r.pass, total: r.total })}%)`, families: Object.freeze(families), dimensions: Object.freeze(dims), reproducible: r.reproducible, contaminationFree: r.contaminationFree, failures: r.failures });
}

const BROAD_IT_EVAL_CONTRACT = Object.freeze({
  id: "V163-BROAD-IT-EVAL-SET",
  purpose: "§2 P0 (realizable) — an independently-labelled broad-IT eval set over ODG's real native capabilities, with taxonomy + honest scorecard + reproducibility + anti-contamination",
  reuses: ["odg-closed-executor", "odg-ast-operations", "odg-audit-integrity-analysis (which reuses audit-log) — no new capability, no parallel mechanism"],
  families: ["deterministic-compute", "ast-transform", "integrity-security", "authorization-refusal", "recovery"],
  dimensions: ["correctness", "robustness", "security", "recovery"],
  invariants: Object.freeze([
    "expected labels are SPEC-derived and held SEPARATELY from the solver (anti-contamination; solver never sees `expected`)",
    "runs against ODG's REAL native capabilities; no new capability, no parallel mechanism, no proprietary dataset imported",
    "reproducible across runs; honest scorecard (no inflated/perfect score claimed)",
    "the EXTERNAL public corpus named in the mission title remains the blocker; this builds the realizable harness only",
    "does NOT mark the register mission ACCEPTED (a provider cannot close a real mission); no new primitive",
  ]),
});
module.exports = { EVAL_SET, runEvalSet, scorecard, BROAD_IT_EVAL_CONTRACT };
export {};
