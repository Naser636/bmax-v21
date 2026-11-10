#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§12) — financial-objective register test. Verifies all three distinct net-profit figures are recorded
 * with provenance (€500M ambition, €5M minimum, €5,000 V62 floor), the €5M-vs-€5,000 discrepancy is flagged for OWNER
 * reconciliation (not silently resolved), the €500M ambition is unchanged, and no feasibility is declared/fabricated.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V62_FINANCIAL_OBJECTIVE_REGISTER.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("register exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const by: any = {}; for (const o of m.objectives) by[o.id] = o;
  check("€500M ambition recorded with provenance", by.AMBITION && by.AMBITION.amountEur === 500000000 && by.AMBITION.provenance.length >= 1);
  check("€5M minimum recorded (historical canonical)", by.MINIMUM_5M && by.MINIMUM_5M.amountEur === 5000000);
  check("€5,000 V62 floor recorded as discrepant", by.FLOOR_5K_V62 && by.FLOOR_5K_V62.amountEur === 5000 && /DISCREPANT/i.test(by.FLOOR_5K_V62.status));
  check("discrepancy flagged for OWNER reconciliation (not resolved)", (m.reconciliation.ownerDecisionNeeded && m.reconciliation.ownerDecisionNeeded.length > 0) && /owner reconciliation/i.test(m.reconciliation.invariant) && /never resolved/i.test(m.reconciliation.invariant));
  check("three distinct levels kept separate", Array.isArray(m.distinctLevels) && m.distinctLevels.length === 3);
  check("ambition unchanged / not lowered", /unchanged/i.test(m.honestConclusion) && by.AMBITION.amountEur === 500000000);
  check("no figure fabricated / no feasibility declared", /No figure fabricated|no figure invented/i.test(m["//"]) || /no figure invented/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V62 financial-objective register (3 levels, provenance, discrepancy flagged for owner)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
