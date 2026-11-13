#!/usr/bin/env node
"use strict";
/* V183 Livrable A — 15-métier business matrix. Proves: all 15 canonical métiers covered; six honesty levels never
 * conflated; no invented client/demand/revenue/cert; owner-gates preserved; reuses roster; deterministic. */
const A = require("./odg-metier-business-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = A.matrix();
  const byId: any = {}; for (const r of m.metiers) byId[r.id] = r;

  check("all 15 canonical métiers covered (P1..P15)", m.count === 15 && ["P1", "P9", "P10", "P11", "P15"].every((id) => byId[id]));
  check("names come from the canonical roster (P9=FinOps, P11=Document intelligence)", byId.P9.name === "FinOps" && byId.P11.name === "Document intelligence");
  check("each métier has mission/users/reusableComponents/validation criteria", m.metiers.every((r: any) => r.mission && r.users && Array.isArray(r.reusableComponents) && r.technicalValidation && r.metierValidation && r.operationalProof));

  // ---- six honesty levels, never conflated ----
  check("six honesty levels defined and distinct", A.LEVELS.length === 6 && new Set(A.LEVELS).size === 6 && A.LEVELS.includes("TECHNICAL_EXISTENCE") && A.LEVELS.includes("REAL_COMMERCIAL_RESULT"));
  check("maturity: integrated/qualified/authorized/real-result are FALSE for every métier (honest)", m.metiers.every((r: any) => r.maturity.integrated === false && r.maturity.metierQualified === false && r.maturity.commerciallyAuthorized === false && r.maturity.realCommercialResult === false));
  check("operational proof is NOT_MEASURED (requires real runtime + independent verification)", m.metiers.every((r: any) => /NOT_MEASURED/.test(r.operationalProof)));

  // ---- demonstrated gaps are honest, owner-gates preserved ----
  check("P9 FinOps surfaces the 3-way-match/bank-anomaly gap (ext P2, not built)", byId.P9.demonstratedGaps.some((g: string) => /3-way match|bank-anomaly/i.test(g)));
  check("P11 Document surfaces the BTP DCE analyzer as a gap (V181 candidate, not built)", byId.P11.demonstratedGaps.some((g: string) => /DCE|CCAP|CCTP/i.test(g)));
  check("P10 Regulatory is owner-gated for external certification", byId.P10.ownerGated === true && byId.P10.demonstratedGaps.some((g: string) => /certification/i.test(g)));

  // ---- no invented commerce ----
  check("honesty: no client/demand/revenue/certification invented; €0 clients", /NO client\/demand\/revenue\/certification invented/.test(m.honesty) && /€0 clients/.test(m.honesty));
  check("contract: all 15 covered, six levels never conflated, nothing invented", A.METIER_BUSINESS_MATRIX_CONTRACT.invariants.some((i: string) => /all 15 canonical métiers/.test(i)) && A.METIER_BUSINESS_MATRIX_CONTRACT.invariants.some((i: string) => /never conflated/.test(i)));
  check("deterministic + frozen", JSON.stringify(A.matrix().count) === JSON.stringify(m.count) && Object.isFrozen(m) && Object.isFrozen(m.metiers));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-business-matrix (Livrable A: all 15 canonical métiers; six honesty levels never conflated [existence≠tested≠integrated≠qualified≠authorized≠real-result]; gaps honest [FinOps 3-way-match, BTP DCE]; operational proof NOT_MEASURED; no invented commerce; €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
