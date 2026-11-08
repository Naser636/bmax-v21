#!/usr/bin/env node
"use strict";
const assert = require("assert");
const DL = require("./dossier-ledger");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §71–§76 — SIX CTO DOSSIERS A–F LEDGER");

// completeness + presence discipline.
{
  const v = DL.verifyLedger();
  check(v.ok === true && v.count === 6 && v.distinct === 6, "exactly six dossiers A–F, all complete");
  check(v.incomplete.length === 0 && v.unsoundPresence.length === 0, "no incomplete dossier, no unsound presence claim");
}

// A seeded by the research readiness doc; E realized as the matrix; both cite a real artifact.
{
  const byId: any = {}; for (const d of DL.DOSSIERS) byId[d.id] = d;
  check(byId.A.seededBy.length >= 1 && byId.A.status === "PARTIAL", "A (research) cites a seeding artifact, PARTIAL");
  check(byId.E.seededBy.some((s: any) => /MATRIX/.test(s)) && byId.E.status === "PARTIAL", "E (reality) realized as the Target-to-Reality matrix");
}

// B/C/D/F verbatim NOT_RECOVERABLE + TO_AUDIT + no fabricated seed.
{
  const byId: any = {}; for (const d of DL.DOSSIERS) byId[d.id] = d;
  for (const id of ["B", "C", "D", "F"]) {
    check(/NOT_RECOVERABLE_VERBATIM/.test(byId[id].purpose) && byId[id].status === "TO_AUDIT" && byId[id].seededBy.length === 0, `${id}: verbatim NOT_RECOVERABLE, TO_AUDIT, no fabricated seed`);
  }
}

// verifyLedger is checkable against a present-artifact set.
check(DL.verifyLedger(["V12.4_SECTION_TRACEABILITY_MATRIX", "ODG_GLOBAL_RESEARCH_AND_EXECUTION_READINESS", "FRONTIER_V124_PREPARATION"]).unknownArtifacts.length === 0, "cited seeding artifacts resolve against a present-set");

console.log(failures === 0 ? "ALL PASS — V12.4 §71–§76 DOSSIER LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
