#!/usr/bin/env node
"use strict";
/* V278 §2 (P2 Lot 3) — Comptabilité / Assurances / Flotte functional assistants. Asserts real domain computation (pre-accounting
 * justified/unjustified via computeChantier; policy échéance + coverage-gap + certification refusal; fleet register + maintenance
 * alerts), reserved-act level D, coverage-never-asserted-without-proof, prepare-only, PARTIAL maturity, D06 not double-counted. SYNTHETIC. */
const A = require("./odg-admin-fleet-assistants.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const input = {
    surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, odg: { missions: [{ id: "M1", status: "READY" }] } } },  // commercial absent ⇒ UNKNOWN
    chantier: { id: "C1", expenses: [{ amountMinor: 10000, category: "MATERIAL", justifRef: "F1" }, { amountMinor: 5000, category: "LABOUR" }] },  // 15000 total, 10000 justified, 5000 unjustified (missing pièce)
    policies: [{ id: "RC", type: "RC_PRO", expiryDay: 400, coveredTrades: ["maconnerie"] }, { id: "DEC", type: "DECENNALE", expiryDay: 50, coveredTrades: ["maconnerie"] }],
    nowDay: 100, windowDays: 60, operationalTrades: ["maconnerie", "electricite"],   // DEC expired (50<100); electricite = coverage gap
    fleet: { equipments: [{ id: "V1", category: "VEHICLE" }, { id: "V2", category: "TOOL" }], alerts: { nowMs: 1000, maintenance: [{ equipmentId: "V1", dueMs: 500, kind: "vidange" }], controls: [], insurances: [] } },  // V1 maintenance overdue
  };

  const lot = A.runLot3(input);
  check("runLot3: 3 assistants (Comptabilité/Assurances/Flotte), all ok, all PREPARE-only, NONE operational", lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false);
  check("anti-double-count: D06 Finance NOT rebuilt (already Lot-1 FINANCES); 9/20 domains across Lots 1-3", /D06 Finance.*NOT rebuilt/.test(lot.d06Note) && /9 of 20 domains/.test(lot.note));

  const cpta = A.runAdminAssistant("COMPTABILITE", input);
  check("Comptabilité: real pre-accounting via computeChantier — total 15000, justified 10000, unjustified 5000 (missing pièce flagged)",
    cpta.ok && cpta.domainFindings.kind === "ACCOUNTING" && cpta.domainFindings.totalMinor === 15000 && cpta.domainFindings.justifiedMinor === 10000 && cpta.domainFindings.unjustifiedMinor === 5000 && cpta.domainFindings.missingJustif === true);
  check("Comptabilité: reserved act level D (expert-comptable validates); forbidden to certify accounts / replace validation / invent a justificatif",
    cpta.decisionLevelMax === "D" && cpta.domainFindings.validationIsExpertComptable === true && cpta.forbiddenActions.some((x: string) => /certify accounts/.test(x)) && cpta.forbiddenActions.some((x: string) => /invent a missing justificatif/.test(x)));

  const assu = A.runAdminAssistant("ASSURANCES", input);
  check("Assurances: real échéance (DEC expired) + coverage gap (electricite) computed from supplied policies",
    assu.ok && assu.domainFindings.kind === "INSURANCE" && assu.domainFindings.policyCount === 2 && assu.domainFindings.expired.indexOf("DEC") >= 0 && assu.domainFindings.coverageGaps.indexOf("electricite") >= 0);
  check("Assurances: certification claim REFUSED (regulatory-assurance); coverage NEVER asserted without proof; level D",
    assu.domainFindings.anyCertificationClaimRefused === true && assu.domainFindings.coverageAssertedWithoutProof === false && assu.decisionLevelMax === "D" && assu.forbiddenActions.some((x: string) => /without contract proof/.test(x)));

  const fleet = A.runAdminAssistant("FLOTTE", input);
  check("Flotte: real register (2 assets) + 1 maintenance-overdue alert via parc-stock; alerts are signals not decisions",
    fleet.ok && fleet.domainFindings.kind === "FLEET" && fleet.domainFindings.assetCount === 2 && fleet.domainFindings.alertCount === 1 && fleet.domainFindings.alertsAreSignalsNotDecisions === true);
  check("Flotte: forbidden to declare a vehicle roadworthy/compliant or fabricate an échéance", fleet.forbiddenActions.some((x: string) => /roadworthy\/compliant/.test(x)) && fleet.forbiddenActions.some((x: string) => /fabricate an asset or an échéance/.test(x)));

  // UNKNOWN surfacing + prepare-only + maturity honest.
  check("UNKNOWN ≠ 0 surfaced (commercial absent ⇒ missingDataCount>0, decidable false)", cpta.missingDataCount > 0 && cpta.decidable === false && assu.missingDataCount > 0);
  check("every assistant: executesNothing true, maturity PARTIAL not operational", [cpta, assu, fleet].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));

  // fail-closed + determinism + contract.
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runAdminAssistant("LEGAL_XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runAdminAssistant("ASSURANCES", input)) === JSON.stringify(assu) && Object.isFrozen(A.ADMIN_ASSISTANTS));
  check("contract: D06 not rebuilt; reuse engines (computeChantier/assertNotCertified/parc-stock); level-D reserved acts; coverage never without proof; PARTIAL",
    A.ADMIN_FLEET_ASSISTANTS_CONTRACT.invariants.some((i: string) => /D06 Finance already covered/.test(i)) && A.ADMIN_FLEET_ASSISTANTS_CONTRACT.invariants.some((i: string) => /expert-comptable's reserved act/.test(i)) && A.ADMIN_FLEET_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NEVER asserts coverage without contract proof/.test(i)) && A.ADMIN_FLEET_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NO assistant OPERATIONAL/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-admin-fleet-assistants (V278 P2 Lot 3: Comptabilité [pre-accounting justified/unjustified via computeChantier, validation=expert-comptable level D] / Assurances [échéance+coverage-gap, certification REFUSED, coverage never without proof, level D] / Flotte [register+maintenance alerts via parc-stock, alerts=signals]; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; D06 not double-counted; 9/20 domains; reuse — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
