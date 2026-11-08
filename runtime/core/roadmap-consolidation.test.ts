#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./roadmap-consolidation");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 / ROADMAP CONSOLIDATION");
// all programs integrated into V12.4 ⇒ single source.
{
  const r = C.consolidate({ directeur: "V12.4", programs: [{ name: "V5", integratedInto: "V12.4" }, { name: "FIED", integratedInto: "V12.4 + V5" }, { name: "EngIntel", integratedInto: "V12.4 + V5" }] });
  check(r.singleSource === true && r.consolidated.length === 3, "all programs integrated ⇒ single source V12.4");
}
// a concurrent roadmap ⇒ CONFLICT.
{
  const r = C.consolidate({ directeur: "V12.4", programs: [{ name: "rogue", integratedInto: "V12.4", concurrent: true }] });
  check(r.singleSource === false && r.conflicts.some((c: any) => /concurrent/.test(c.detail)), "concurrent roadmap ⇒ CONFLICT");
}
// a program not integrated into V12.4 ⇒ CONFLICT.
check(C.consolidate({ directeur: "V12.4", programs: [{ name: "x", integratedInto: "SomethingElse" }] }).singleSource === false, "non-V12.4-integrated program ⇒ CONFLICT");
// wrong directeur ⇒ not single source.
check(C.consolidate({ directeur: "V99", programs: [] }).singleSource === false, "directeur != V12.4 ⇒ not single source");
// reconcile: all requirements mapped ⇒ allCovered.
{
  const r = C.reconcile({ requirements: [{ id: "r1", canonicalLocation: "register:serie26-x" }, { id: "r2", canonicalLocation: "manifest:E-MEASURE" }] });
  check(r.allCovered === true && r.coverage === 1, "all requirements mapped ⇒ covered");
}
// orphan requirement ⇒ flagged, never dropped.
{
  const r = C.reconcile({ requirements: [{ id: "r1", canonicalLocation: "register:x" }, { id: "orphan1" }] });
  check(r.allCovered === false && r.orphans.includes("orphan1"), "unmapped requirement ⇒ ORPHAN (flagged, not dropped)");
}
check(C.ROADMAP_CONSOLIDATION_CONTRACT.invariants.some((i: any) => /NEVER dropped/i.test(i)), "contract: orphan never dropped");
console.log(failures === 0 ? "ALL PASS — V12.4 ROADMAP CONSOLIDATION" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
