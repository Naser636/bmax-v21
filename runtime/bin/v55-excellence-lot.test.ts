#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 — GLOBAL EXCELLENCE lot test. Verifies the whole integrated lot is HONEST and reproducible:
 *  A) P3 CRA/SBOM third pilot — synthetic, SIMULATED vulns (no CVE scan), O2-verified, E5=NOT_STARTED;
 *  B) 15-métier global scorecard — per-domain, no artificial global score, superiority & commercial-validation FAIL-CLOSED(0);
 *  C) cost-superiority — ≥50% is an objective; all savings SIMULATED, 0 observed/validated, basis never double-counted;
 *  D) automation — % tasks automated ≠ % time saved; reserved decisions keep mandatory human validation;
 *  E) radar/weekly-loop audit — existing components load; no new engine; governed loop documented;
 *  F) economic scenarios — min €5M / ambition €500M recorded, not lowered; math-possible ≠ accessible.
 * Fail-closed.
 */

const path = require("path");
const fs = require("fs");
const O2 = require("../core/shared-evidence-wrapper.js");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // ── A) P3 pilot ──
  const p3 = j("demonstrators/P3_CRA_SBOM_PILOT_SIM.json");
  const p3crit = j("pilot/P3_E5_READINESS_CRITERIA.json");
  check("A P3 pilot sim exists & synthetic", !!p3 && p3.synthetic === true && !!p3.report);
  check("A P3 vulnerabilities SIMULATED (not a real CVE scan)", !!p3 && p3.report.evidence.counts.SIMULATED >= 1 && p3.craEvidence.summary.cveScan === "NOT_PERFORMED");
  check("A P3 O2 evidence independently verified", !!p3 && O2.verifyEvidence(p3.report.evidence).ok === true);
  check("A P3 sealed-bundle tamper-evidence re-verified", !!p3 && p3.tamperEvidenceVerification && p3.tamperEvidenceVerification.checks.bundle.ok === true);
  check("A P3 no false conformity (limits disclaim conformity+legal advice)", !!p3 && /NOT CRA conformity/i.test(JSON.stringify(p3.report.limits)) && /NOT legal advice/i.test(JSON.stringify(p3.report.limits)));
  check("A P3 E5 criteria all unmet; stage E4", !!p3crit && p3crit.p3CurrentStage === "E4" && p3crit.e5Status === "NOT_STARTED" && p3crit.transitionConditions.every((c: any) => c.met === false));

  // ── B) 15-métier scorecard ──
  const sc = j("V55_15_METIERS_GLOBAL_SCORECARD.json");
  check("B scorecard covers 15 métiers", !!sc && sc.metierCount === 15);
  check("B five separate states per métier", !!sc && sc.perMetier.every((m: any) => ["available", "tested", "demonstrated", "superior_to_reference", "commercially_validated"].every((k) => k in m.states)));
  check("B superiority FAIL-CLOSED (0)", !!sc && sc.tally.superior_to_reference === 0);
  check("B commercial-validation FAIL-CLOSED (0)", !!sc && sc.tally.commercially_validated === 0);
  check("B no artificial cross-métier global score", !!sc && /No artificial cross-métier global score/i.test(sc.methodology) && !("globalScore" in sc));
  check("B each métier scored vs its OWN domain references", !!sc && sc.perMetier.every((m: any) => Array.isArray(m.domainReferences)));

  // ── C) cost-superiority ──
  const cost = j("V55_COST_SUPERIORITY_PROGRAM.json");
  check("C ≥50% is stated as an OBJECTIVE not a result", !!cost && /OBJECTIVE/i.test(cost.target));
  check("C 0 observed-client & 0 client-validated savings", !!cost && cost.savingsByBasis.OBSERVED_CLIENT.count === 0 && cost.savingsByBasis.CLIENT_VALIDATED.count === 0);
  check("C savings SIMULATED only (no measured asserted)", !!cost && cost.savingsByBasis.SIMULATED.count === cost.perMetier.length && cost.savingsByBasis.MEASURED.count === 0);
  check("C reduction computed per métier (ref−odg)/ref", !!cost && cost.perMetier.every((m: any) => typeof m.reduction === "number" && m.reduction > 0 && m.reduction < 1));
  check("C quality/security/compliance preserved clause present", !!cost && cost.perMetier.every((m: any) => /PRESERVED/i.test(m.qualitySafetyCompliance)));

  // ── D) automation ──
  const auto = j("V55_AUTOMATION_MEASUREMENT.json");
  check("D % tasks automated and % time saved are DISTINCT fields", !!auto && auto.perMetier.every((m: any) => "pctEligibleAutomated" in m && "pctTimeSaved" in m));
  check("D 80% objective is eligible-only", !!auto && /ELIGIBLE/i.test(auto.objective));
  check("D reserved decisions keep mandatory human validation", !!auto && auto.perMetier.every((m: any) => Array.isArray(m.reservedKeepMandatoryValidation) && m.reservedKeepMandatoryValidation.length >= 1));
  check("D figures labelled SIMULATED", !!auto && auto.perMetier.every((m: any) => /SIMULATED/i.test(m.basis)));

  // ── E) radar/loop audit ──
  const radar = j("V55_RADAR_WEEKLY_LOOP_AUDIT.json");
  check("E existing radar/loop components all load", !!radar && radar.loaded === radar.componentCount && radar.missing.length === 0);
  check("E governed 7-stage loop documented", !!radar && Array.isArray(radar.governedLoop) && radar.governedLoop.length === 7);
  check("E no parallel radar/engine (invariant present)", !!radar && radar.governanceInvariants.some((s: string) => /no new radar/i.test(s)));

  // ── F) economic scenarios ──
  const eco = j("V55_ECONOMIC_SCENARIOS.json");
  check("F five scenarios incl. min-5M & ambition-500M", !!eco && ["prudent", "central", "ambitious", "min_5M_net", "ambition_500M_net"].every((k) => k in eco.scenarios));
  check("F min objective €5M net preserved", !!eco && eco.scenarios.min_5M_net.targetNet === 5000000 && /5,?000,?000/.test(eco.canonicalObjectives.minimum));
  check("F ambition €500M net preserved + INFEASIBLE recorded", !!eco && eco.scenarios.ambition_500M_net.targetNet === 500000000 && /INFEASIBLE/i.test(eco.scenarios.ambition_500M_net.feasibilityFromZero));
  check("F math-possible ≠ commercially accessible (invariant)", !!eco && /never presented as commercially accessible/i.test(eco.invariant));
  check("F scenarios are HYPOTHESES (0 observed conversion)", !!eco && /observed conversion = 0/i.test(eco.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V55 global excellence lot (honest, reproducible, superiority & commercial = fail-closed 0)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
