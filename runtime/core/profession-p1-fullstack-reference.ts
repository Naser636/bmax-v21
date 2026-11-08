#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P1 — Software/Full-Stack reference project (E2 + E3). PURE, deterministic. The P1 capability signal is
 * "change software WITHOUT regressing observed behaviour". It REUSES characterization-baseline (captureBaseline +
 * compareToBaseline — a sealed behavioural net, fail-closed) with NO second baseline engine, and DEMONSTRATES: a
 * behaviour-preserving refactor => BEHAVIOR_PRESERVED; a behaviour-changing one => BEHAVIOR_CHANGED (regression
 * caught); an incomplete sample set => INCOMPLETE (a coverage gap is NOT a pass). Synthetic; dual export.
 */

const CB = require("./characterization-baseline");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** refactorPreservesBehaviour(samplesBefore, samplesAfter, target) -> { ok, verdict, preserved, changed, missing }. */
function refactorPreservesBehaviour(samplesBefore: any, samplesAfter: any, target: any): any {
  const cap = CB.captureBaseline({ target: typeof target === "string" && target ? target : "p1-module", samples: samplesBefore });
  if (!cap.ok) return Object.freeze({ ok: false, verdict: "NO_BASELINE", reason: cap.reason });
  const cmp = CB.compareToBaseline(cap.baseline, samplesAfter);
  return Object.freeze({ ok: cmp.verdict === "BEHAVIOR_PRESERVED", verdict: cmp.verdict, changed: Array.isArray(cmp.changed) ? cmp.changed.length : 0, missing: Array.isArray(cmp.missing) ? cmp.missing.length : 0 });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  // A tiny deterministic "function under refactor": fizz-ish mapping over inputs 1..5.
  const inputs = [1, 2, 3, 4, 5];
  const v1 = (n: number) => (n % 2 === 0 ? "even" : "odd");
  const before = inputs.map((n) => ({ input: n, observedOutput: v1(n) }));
  const impl = typeof o.after === "function" ? o.after : v1;         // a behaviour-preserving refactor by default
  const after = inputs.map((n) => ({ input: n, observedOutput: impl(n) }));
  const preserve = refactorPreservesBehaviour(before, after, "p1-fizz");
  const degraded = !preserve.ok;
  return Object.freeze({
    synthetic: true, profession: "P1", refactor: preserve,
    level: "E2", degraded, note: "SYNTHETIC code-under-refactor (not a real client codebase, not E5); behaviour-preservation is the P1 signal via characterization-baseline (sealed, fail-closed); real external legacy case (E5) owner-gated NOT_RUN",
  });
}

const P1_FULLSTACK_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P1-FULLSTACK-REFERENCE",
  source: "V12.4 §43 P1 (Software/Full-Stack) — E2 reference + E3 (behaviour-changing refactor / coverage gap)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["characterization-baseline (captureBaseline + compareToBaseline, sealed, fail-closed)"]),
  notAuthority: "a runnable refactor-safety reference over SYNTHETIC code; no real client codebase, no E5 claim",
  invariants: Object.freeze([
    "behaviour-preservation is the P1 capability signal (not line count); verified against a SEALED characterization baseline",
    "a behaviour change is a regression (BEHAVIOR_CHANGED), a coverage gap is NOT a pass (INCOMPLETE) — fail-closed",
    "SYNTHETIC code only; real external legacy case (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses characterization-baseline; no second baseline/diff engine",
  ]),
});

module.exports = { refactorPreservesBehaviour, runReferenceProject, P1_FULLSTACK_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P1_FULLSTACK_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
