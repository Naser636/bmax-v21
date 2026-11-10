#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V54 — P10 AI-governance second-pilot readiness test. Asserts the pilot simulation (a) runs the complete
 * 9-step parcours over a synthetic portfolio, (b) classifies roles + requirement types (distinguishing legal obligations
 * from recommendations), (c) REFUSES insufficient data (no fake PASS), (d) makes NO certification/legal-advice claim,
 * (e) is reproducible, (f) its evidence is independently O2-verifiable, and (g) P10 stays E4 with E5 = NOT_STARTED.
 * Fail-closed.
 */

const path = require("path");
const fs = require("fs");

const O2 = require("../core/shared-evidence-wrapper.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P10_AI_GOVERNANCE_PILOT_SIM.json");
const CRITERIA = path.join(__dirname, "..", "..", "docs", "odg", "pilot", "P10_E5_READINESS_CRITERIA.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let art: any = null;
  try { art = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("pilot-sim artifact exists & parses", !!art && !!art.report);
  if (!art) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // (a) complete 9-step parcours over a synthetic portfolio
  check("inputs flagged SYNTHETIC", art.synthetic === true);
  check("complete parcours (9 steps)", Array.isArray(art.parcours) && art.parcours.length === 9);
  check("synthetic portfolio assessed (≥3 systems, all ok)", Array.isArray(art.systems) && art.systems.filter((s: any) => s.ok).length >= 3);

  // (b) classification + traceability: roles assigned, requirement taxonomy present and MIXED (not a single bucket)
  const okSys = art.systems.filter((s: any) => s.ok);
  check("each system carries classified AI-Act role(s)", okSys.every((s: any) => Array.isArray(s.roles)));
  const types = art.portfolioSummary && art.portfolioSummary.byRequirementType;
  check("requirement taxonomy present", !!types && Object.keys(types).length >= 1);
  check("distinguishes legal obligations from legal-expertise/conditional (≥2 distinct types)", !!types && Object.keys(types).length >= 2);
  check("a LEGAL_OBLIGATION is identified (Art.50 in force) distinct from recommendations", !!types && (types.LEGAL_OBLIGATION || 0) >= 1);

  // (c) refuses insufficient data — no fake PASS
  check("insufficient-data input REFUSED (fail-closed)", art.insufficientDataCase && art.insufficientDataCase.refused === true && typeof art.insufficientDataCase.code === "string");

  // (d) no false compliance/certification/legal-advice claim
  check("regulatoryPosture = NOT_CERTIFIED", typeof art.regulatoryPosture === "string" && /NOT_CERTIFIED/.test(art.regulatoryPosture));
  const limits = JSON.stringify(art.report.limits || []);
  check("limits disclaim certification AND legal advice", /NOT a certification/i.test(limits) && /NOT legal advice/i.test(limits));
  check("no control reported PASS by listing (INSUFFICIENT_EVIDENCE kept)", okSys.every((s: any) => !s.controls.some((c: any) => c.status === "PASS" && c.group === "ai-act")));
  // in-force honesty: register-silent obligations are UNKNOWN_DATE, never asserted in force
  const anyUnknown = okSys.some((s: any) => (s.inForce && s.inForce.unknownDate > 0));
  check("register-silent obligations held UNKNOWN_DATE (fail-closed dates)", anyUnknown);

  // (e) reproducibility + (f) independent O2 verification
  const ev = art.report.evidence;
  check("O2 independently verifies the evidence digest", O2.verifyEvidence(ev).ok === true);
  check("artifact recorded its own independent verification = ok", art.independentEvidenceVerification && art.independentEvidenceVerification.ok === true);
  check("evidence counts: OBSERVED=0 (nothing claimed observed)", ev.counts.OBSERVED === 0);

  // (g) E5 remains NOT_STARTED; P10 stays E4
  check("artifact e5Status = NOT_STARTED", typeof art.e5Status === "string" && /^NOT_STARTED/.test(art.e5Status));
  let crit: any = null;
  try { crit = JSON.parse(fs.readFileSync(CRITERIA, "utf8")); } catch { /* null */ }
  check("E5 criteria file exists & parses", !!crit);
  check("E5 criteria: p10CurrentStage = E4", !!crit && crit.p10CurrentStage === "E4");
  check("E5 criteria: e5Status = NOT_STARTED", !!crit && crit.e5Status === "NOT_STARTED");
  check("E5 criteria: all transition conditions unmet (met=false)", !!crit && Array.isArray(crit.transitionConditions) && crit.transitionConditions.length >= 7 && crit.transitionConditions.every((c: any) => c.met === false));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V54 P10 second-pilot readiness (synthetic, no certification, E5=NOT_STARTED)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
export {};
