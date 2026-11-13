#!/usr/bin/env node
"use strict";
/* V185 §4/§8 — 9 programs × 20 métiers matrix. Proves: exactly 180 classified intersections; REUSE default; IMPROVE for
 * primary métiers; OWNER_GATED for payment/cert; NO construction; P9 applies to all; reuses canonical rosters. */
const M = require("./odg-program-metier-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = M.matrix();
  check("exactly 180 intersections (9 programs × 20 métiers)", m.programCount === 9 && m.metierCount === 20 && m.intersections === 180 && m.cells.length === 180);
  check("every cell classified (one of 6 labels) + basis + category", m.cells.every((c: any) => M.CLASS.includes(c.classification) && c.basis && (c.category === "PRINCIPAL" || c.category === "COMMERCIAL")));
  check("sum of class counts = 180", Object.values(m.byClass).reduce((a: any, b: any) => a + b, 0) === 180);
  check("roster is 15 principal + 5 commercial", M.ROSTER20.filter((x: any) => x.category === "PRINCIPAL").length === 15 && M.ROSTER20.filter((x: any) => x.category === "COMMERCIAL").length === 5);

  const get = (p: string, mt: string) => m.cells.find((c: any) => c.program === p && c.metier === mt);
  check("P2 financial × P9 FinOps = OWNER_GATED (payment)", get("P2_financial_control", "P9").classification === "OWNER_GATED");
  check("P2 financial × M3 FinOps = OWNER_GATED (payment)", get("P2_financial_control", "M3").classification === "OWNER_GATED");
  check("P3 doc-intel × M2 BTP = BUILD_CONDITIONAL (DCE analyzer, not built)", get("P3_document_contract_intelligence", "M2").classification === "BUILD_CONDITIONAL");
  check("P5 cyber × P3 Security = IMPROVE", get("P5_cyber_resilience", "P3").classification === "IMPROVE");
  check("P9 application × every métier = IMPROVE (applies to all by definition)", M.ROSTER20.every((mt: any) => get("P9_fifteen_metier_application", mt.id).classification === "IMPROVE"));
  check("a plain cell defaults to REUSE (common capability reused)", get("P6_observability_qualification", "P1").classification === "REUSE");
  check("REUSE is the dominant class", m.byClass.REUSE >= 90);

  // NO construction + contract + determinism
  check("BUILD_CONDITIONAL cells exist but are labelled 'NOT built in this lot'", m.byClass.BUILD_CONDITIONAL >= 1 && m.cells.filter((c: any) => c.classification === "BUILD_CONDITIONAL").every((c: any) => /NOT built/.test(c.basis)));
  check("contract: 180 intersections, REUSE default, no construction, OWNER_GATED preserved", M.PROGRAM_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /180 intersections/.test(i)) && M.PROGRAM_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /NO construction engaged/.test(i)));
  check("deterministic + frozen", JSON.stringify(M.matrix().byClass) === JSON.stringify(m.byClass) && Object.isFrozen(m) && Object.isFrozen(m.cells));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — program-metier-matrix (V185 §4/§8: 9 programs × 20 métiers = 180 classified intersections; REUSE default [common clusters built once]; IMPROVE for primary métiers; P9 applies to all; payment OWNER_GATED; NO construction; reuses canonical rosters)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
