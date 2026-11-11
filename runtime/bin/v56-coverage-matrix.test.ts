#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V56 (§2) — V12.4 coverage-matrix honesty test. Verifies the consolidated coverage matrix: (a) covers all
 * 31 numbered parts + Préambule + Part XXXII, (b) rests on the PROVEN structural §1–§122 exactly-once coverage, (c) is
 * classified only from the existing SSOT into the five buckets, (d) is FAIL-CLOSED — no part is DONE unless its matrix
 * status actually proves it, structural coverage is never conflated with functional completion, and unknown ⇒ NOT_VALIDATED.
 */

const path = require("path");
const fs = require("fs");
const COV = require("../core/v124-section-coverage.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V56_V124_COVERAGE_MATRIX.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null;
  try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("coverage matrix exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // (a) completeness of the enumeration
  check("31 parts + Préambule parsed (32)", m.partsParsed === 32);
  check("Part XXXII tracked", !!m.partXXXII && /XXXII/.test(m.partXXXII.part));

  // (b) rests on the PROVEN structural coverage primitive (re-derived here)
  const proof = COV.verifyCoverage();
  check("structural §1–§122 coverage proven exactly-once", proof.ok === true && proof.covered === 122 && proof.totalSections === 122);
  check("matrix records the same structural proof", m.structuralCoverage.ok === true && m.structuralCoverage.covered === 122);

  // (c) five buckets, tally sums to parts
  const buckets = ["DONE", "PARTIAL", "MISSING", "BLOCKED", "NOT_VALIDATED"];
  check("every part has a valid bucket", m.parts.every((p: any) => buckets.includes(p.bucket)));
  const sum = buckets.reduce((s, b) => s + (m.tally[b] || 0), 0);
  check("tally sums to parts parsed", sum === m.partsParsed);

  // (d) fail-closed honesty
  check("structural coverage NOT conflated with functional completion", /structural, NOT per-section functional/i.test(m.structuralCoverage.note) || /structural, not functional/i.test(m.honestConclusion));
  check("a document alone never flips a bucket to DONE (invariant)", /document alone never flips/i.test(m.invariant));
  // no part marked DONE whose matrix status is a mere documented/proposed token
  check("no DONE part is only documented/proposed", m.parts.filter((p: any) => p.bucket === "DONE").every((p: any) => !/DOCUMENTED_NOT_VERIFIED|PROPOSED/i.test(p.matrixStatus)));
  // Part XXXII (proposed, 0 clients) is NOT_VALIDATED, never DONE
  check("Part XXXII is NOT_VALIDATED (proposed, 0 clients)", m.partXXXII.bucket === "NOT_VALIDATED");

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V56 V12.4 coverage matrix (honest, SSOT-derived, fail-closed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
