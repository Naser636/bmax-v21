#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p4-distribution-drift");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 P4 — DISTRIBUTION DRIFT (PSI)");

// identical distributions ⇒ PSI ~0, no drift.
{
  const r = P.psi(["a", "a", "b", "b"], ["a", "a", "b", "b"]);
  check(r.psi < 0.1 && r.drift === "NONE", "identical distributions ⇒ PSI<0.1, NONE");
}

// a large shift ⇒ SIGNIFICANT drift.
{
  const ref = Array.from({ length: 100 }, (_, i) => (i < 90 ? "a" : "b"));  // 90% a
  const cur = Array.from({ length: 100 }, (_, i) => (i < 10 ? "a" : "b"));  // 10% a
  const r = P.psi(ref, cur);
  check(r.drift === "SIGNIFICANT" && r.psi > 0.25, "90%→10% shift ⇒ SIGNIFICANT (PSI>0.25)");
}

// an unseen category in current contributes to drift (fail-closed, not hidden).
{
  const r = P.psi(["a", "a", "a", "a"], ["a", "a", "b", "c"]);  // b,c unseen in ref
  check(r.psi > 0 && r.perBin.some((x: any) => x.unseenInRef === true), "unseen categories contribute to drift (fail-closed)");
}

// empty reference ⇒ SIGNIFICANT (fail-closed).
{
  check(P.psi([], ["a", "b"]).drift === "SIGNIFICANT", "empty reference ⇒ SIGNIFICANT (fail-closed)");
}

// gate: SIGNIFICANT ⇒ FAIL; NONE ⇒ PASS; moderate allowed only if opted in.
{
  const ref = Array.from({ length: 100 }, (_, i) => (i < 90 ? "a" : "b"));
  const cur = Array.from({ length: 100 }, (_, i) => (i < 10 ? "a" : "b"));
  check(P.assessDrift(ref, cur).gate === "FAIL", "significant drift ⇒ gate FAIL (fail-closed)");
  check(P.assessDrift(["a", "a"], ["a", "a"]).gate === "PASS", "no drift ⇒ gate PASS");
}

check(P.P4_DRIFT_CONTRACT.invariants.some((i: any) => /fail-closed/.test(i)), "contract documents fail-closed drift");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 P4 DISTRIBUTION DRIFT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
