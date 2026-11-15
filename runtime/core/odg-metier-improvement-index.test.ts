#!/usr/bin/env node
"use strict";
/* V208 — métier improvement-capability integration index. Proves: all 16 V207 modules integrated (loadable + frozen
 * IMP-* contract + callable); per-métier grouping; composes the register (built=16); resolves the 0-consumer orphan gap. */
const I = require("./odg-metier-improvement-index.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const v = I.integrate();
  check("all 16 V207 modules integrated (loadable + frozen contract + ≥1 callable)", v.total === 16 && v.integrated === 16 && v.allIntegrated === true && v.records.every((r: any) => r.loadable && r.contractBearing && r.callableExports >= 1));
  check("each record carries a real IMP-* contractId + its métier + a guard invariant", v.records.every((r: any) => /^IMP-/.test(r.contractId) && r.metier && r.guard));
  check("per-métier grouping covers the spread (P1/P7/M1/M5 present)", ["P1", "P7", "M1", "M5"].every((m) => Array.isArray(v.byMetier[m])) && Object.keys(v.byMetier).length >= 14);
  check("composes the self-reconciling register (built=16, remaining=0)", v.registerReconciliation.built === 16 && v.registerReconciliation.remaining === 0);
  check("no load errors (orphan gap resolved — modules now have a consumer)", v.records.every((r: any) => r.loadError === null) && /now have a consumer/.test(v.note));

  check("contract: imports 16, missing-consumer, composes register, no new matrix", I.METIER_IMPROVEMENT_INDEX_CONTRACT.invariants.some((i: string) => /imports all 16/.test(i)) && I.METIER_IMPROVEMENT_INDEX_CONTRACT.invariants.some((i: string) => /missing CONSUMER/.test(i)) && I.METIER_IMPROVEMENT_INDEX_CONTRACT.invariants.some((i: string) => /NOT a new governance matrix/.test(i)));
  check("deterministic + frozen", JSON.stringify(I.integrate().byMetier) === JSON.stringify(v.byMetier) && Object.isFrozen(v) && Object.isFrozen(v.records));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-improvement-index (V208: 16 V207 modules INTEGRATED [loadable + frozen IMP-* contract + callable]; per-métier grouping; register built=16/16; resolves the 0-consumer orphan gap; no new matrix)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
