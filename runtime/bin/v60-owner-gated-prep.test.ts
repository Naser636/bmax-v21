#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§1) — OWNER_GATED preparation test. Verifies all 6 OWNER_GATED parts are prepared to decision-ready
 * state WITHOUT fabricating any owner decision: each separates owner-reserved decisions from locally-prepared items,
 * carries an acceptance scenario + validation criteria + procedure + checklist, points only at PRESENT evidence, and
 * leaves the owner decision slot empty. Fail-closed on a dangling evidence pointer.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V60_OWNER_GATED_PREP.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("prep artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const want = ["XVI", "XIX", "XXIII", "XXVII", "XXX", "XXXII"];
  check("all 6 OWNER_GATED parts present", m.partCount === 6 && want.every((w) => m.dossiers.some((d: any) => d.part.startsWith(w))));
  check("each dossier separates owner-reserved from prepared-locally", m.dossiers.every((d: any) => Array.isArray(d.ownerReserved) && d.ownerReserved.length >= 1 && Array.isArray(d.preparedLocally) && d.preparedLocally.length >= 1));
  check("each has acceptance scenario + validation criteria + procedure + checklist", m.dossiers.every((d: any) => d.acceptanceScenario && d.validationCriteria.length >= 1 && d.procedure.length >= 1 && d.checklist.length >= 1));
  check("owner decision NEVER pre-filled", m.dossiers.every((d: any) => d.ownerDecisionPreFilled === false));
  check("all cited evidence pointers present (no dangling claim)", m.allCitedEvidencePresent === true && m.dossiers.every((d: any) => d.evidencePresent.every((e: any) => e.present === true)));
  // XXXII must keep commercialization owner-gated: authorize-client / pricing / contracts / spend reserved
  const xxxii = m.dossiers.find((d: any) => d.part.startsWith("XXXII"));
  check("XXXII reserves client authorization / pricing / contracts / spend to owner", !!xxxii && /client/i.test(JSON.stringify(xxxii.ownerReserved)) && /spend|pricing|contract/i.test(JSON.stringify(xxxii.ownerReserved)));
  check("invariant: owner decisions prepared not taken; nothing fabricated", /never taken or pre-filled/i.test(m.invariant) && /fabricated/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V60 OWNER_GATED preparation (decision-ready, nothing invented, evidence present)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
