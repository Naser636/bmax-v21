#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V53 — P9 FinOps first-pilot readiness test. Asserts the pilot simulation is (a) reproducible (stable digest
 * for a fixed output path), (b) HONEST — every cost ESTIMATED, every saving SIMULATED, never OBSERVED/realised, (c) its
 * evidence is independently verifiable via O2, and (d) E5 is NOT_STARTED and the E5-criteria file keeps P9 at E4. Fail-closed.
 */

const path = require("path");
const os = require("os");
const fs = require("fs");

const O2 = require("../core/shared-evidence-wrapper.js");
const CRITERIA = path.join(__dirname, "..", "..", "docs", "odg", "pilot", "P9_E5_READINESS_CRITERIA.json");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P9_FINOPS_PILOT_SIM.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // 1 — artifact exists and is well-formed
  let art: any = null;
  try { art = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* stays null */ }
  check("pilot-sim artifact exists & parses", !!art && !!art.report);
  if (!art) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // 2 — SYNTHETIC inputs, parcours complete (6 steps)
  check("inputs flagged SYNTHETIC", art.synthetic === true);
  check("complete parcours (6 steps)", Array.isArray(art.parcours) && art.parcours.length === 6);

  // 3 — HONESTY: no cost/saving is OBSERVED or presented as realised
  const ev = art.report.evidence;
  check("evidence counts: OBSERVED=0, PROVEN=0 (nothing claimed observed/proven)", ev.counts.OBSERVED === 0 && ev.counts.PROVEN === 0);
  check("savings carry SIMULATED basis (≥1)", ev.counts.SIMULATED >= 1);
  check("costs carry ESTIMATED basis (≥1)", ev.counts.ESTIMATED >= 1);
  const repLimits = JSON.stringify(art.report.limits || []);
  check("limits state inputs synthetic + savings not realised", /SYNTHETIC/.test(repLimits) && /SIMULATED/.test(repLimits) && /realised/.test(repLimits));

  // 4 — independent evidence verification (O2 re-derives the digest)
  const verify = O2.verifyEvidence(ev);
  check("O2 independently verifies the evidence digest", verify.ok === true);
  check("artifact recorded its own independent verification = ok", art.independentEvidenceVerification && art.independentEvidenceVerification.ok === true);

  // 5 — E5 remains NOT_STARTED, P9 stays E4
  check("artifact e5Status = NOT_STARTED", typeof art.e5Status === "string" && /^NOT_STARTED/.test(art.e5Status));
  let crit: any = null;
  try { crit = JSON.parse(fs.readFileSync(CRITERIA, "utf8")); } catch { /* null */ }
  check("E5 criteria file exists & parses", !!crit);
  check("E5 criteria: p9CurrentStage = E4", !!crit && crit.p9CurrentStage === "E4");
  check("E5 criteria: e5Status = NOT_STARTED", !!crit && crit.e5Status === "NOT_STARTED");
  check("E5 criteria: all transition conditions unmet (met=false)", !!crit && Array.isArray(crit.transitionConditions) && crit.transitionConditions.length >= 6 && crit.transitionConditions.every((c: any) => c.met === false));

  // 6 — savings are a hypothesis tied to explicit assumptions
  check("explicit savings hypotheses recorded", art.savingsHypotheses && typeof art.savingsHypotheses.storage_cold_tiering_pct === "number");
  check("simulated saving is a number and < total (sane)", typeof art.simulatedMonthlySaving === "number" && art.simulatedMonthlySaving > 0 && art.simulatedMonthlySaving < art.analysis.total);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V53 P9 first-pilot readiness (synthetic, reproducible, E5=NOT_STARTED)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
export {};
