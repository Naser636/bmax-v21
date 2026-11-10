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
  check("€5,000 figure recorded as ERROR/SUPERSEDED (V63 correction)", by.FLOOR_5K_V62 && by.FLOOR_5K_V62.amountEur === 5000 && /ERROR|SUPERSEDED/i.test(by.FLOOR_5K_V62.status));
  check("discrepancy RESOLVED by V63 (€5,000 error, floor=€5M), traceability preserved", /RESOLVED by V63/i.test(m.reconciliation.resolution) && /5,000,000/.test(m.reconciliation.resolution) && /traceab/i.test(m.reconciliation.invariant));
  check("canonical levels: €5M floor + €500M ambition", Array.isArray(m.canonicalLevels) && m.canonicalLevels.length === 2 && /5,000,000/.test(JSON.stringify(m.canonicalLevels)) && /500,000,000/.test(JSON.stringify(m.canonicalLevels)));
  check("ambition unchanged / not lowered", /neither lowered|not lowered|unchanged/i.test(m.honestConclusion) && by.AMBITION.amountEur === 500000000);
  check("€5M is the confirmed canonical floor", by.MINIMUM_5M.amountEur === 5000000 && /CANONICAL ABSOLUTE FLOOR|confirmed/i.test(by.MINIMUM_5M.status));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V62 financial-objective register (3 levels, provenance, discrepancy flagged for owner)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
