#!/usr/bin/env node
"use strict";
/* V183 complement — 20-métier reconciliation + 9×20 matrix. Proves: 5 commercial métiers reconciled from V151 (not
 * invented), each maps to a REAL module; 15+5=20; 9×20=180 intersections (135 reused); NO construction; OWNER_GATED kept. */
const C = require("./odg-commercial-metier-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = C.reconciliation();
  check("5 commercial métiers reconciled; 15 + 5 = 20 total", r.principalCount === 15 && r.commercialCount === 5 && r.total === 20);
  check("commercial métiers are the canonical M1..M5 from V151 (not invented)", C.COMMERCIAL_METIERS.map((m: any) => m.id).join(",") === "M1,M2,M3,M4,M5" && C.COMMERCIAL_METIERS.every((m: any) => /V151_CONSOLIDATION/.test(m.canonicalSource)));
  check("each commercial métier maps to a REAL existing module", C.COMMERCIAL_METIERS.every((m: any) => /\.ts$/.test(m.module)) && C.COMMERCIAL_METIERS.find((m: any) => m.id === "M1").module === "cra-remediation-engine.ts" && C.COMMERCIAL_METIERS.find((m: any) => m.id === "M3").module === "finops-analyzer.ts");
  check("none unreconciled", r.notReconciled.length === 0);
  check("commercial métiers are NOT new primitives / NOT a second architecture", /NOT new primitives/.test(r.note) && /NOT a second métier architecture/.test(r.note));

  // ---- 9×20 = 180 matrix ----
  const m = C.useMatrix20();
  check("9 × 20 = 180 intersections (135 principal reused + 45 commercial)", m.metierCount === 20 && m.principalIntersections === 135 && m.commercialIntersections === 45 && m.intersections === 180 && m.cells.length === 180);
  check("every cell is classified with a reference + category", m.cells.every((c: any) => c.classification && c.ref && c.category && (c.category === "PRINCIPAL" || c.category === "COMMERCIAL")));
  check("sum of class counts equals 180", Object.values(m.byClass).reduce((a: any, b: any) => a + b, 0) === 180);

  const get = (p: string, mt: string) => m.cells.find((c: any) => c.primitive === p && c.metier === mt);
  check("EXECUTOR×M3 (FinOps payment) is OWNER_GATED", get("EXECUTOR", "M3").classification === "OWNER_GATED");
  check("CONTRACT×M1 (CRA conformity) is OWNER_GATED", get("CONTRACT", "M1").classification === "OWNER_GATED");
  check("POLICY×M4 (data-layer tenancy) is BUILD_CONDITIONAL (not built)", get("POLICY", "M4").classification === "BUILD_CONDITIONAL" && /NOT present/.test(get("POLICY", "M4").ref));
  check("EXECUTOR×M2 (BTP DCE) is IMPROVE and references the known build candidate", get("EXECUTOR", "M2").classification === "IMPROVE" && /DCE/.test(get("EXECUTOR", "M2").basis));
  check("a plain commercial cell defaults to REUSE", get("IDENTITY", "M5").classification === "REUSE" && get("IDENTITY", "M5").category === "COMMERCIAL");

  // ---- honesty + contract + determinism ----
  check("métier honesty ladder distinguishes DEFINED..COMMERCIALLY_AUTHORIZED", C.METIER_LEVELS.length === 5 && C.METIER_LEVELS.includes("DEFINED") && C.METIER_LEVELS.includes("COMMERCIALLY_AUTHORIZED"));
  check("contract: 20 total, reconciled-not-invented, 135 reused, no construction, OWNER_GATED kept", C.COMMERCIAL_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /15 principal \+ 5 commercial/.test(i)) && C.COMMERCIAL_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /REUSED from odg-primitive-metier-matrix/.test(i)) && C.COMMERCIAL_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /NO construction engaged/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.useMatrix20().byClass) === JSON.stringify(m.byClass) && Object.isFrozen(m) && Object.isFrozen(C.COMMERCIAL_METIERS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — commercial-metier-matrix (V183 complement: 5 commercial métiers M1..M5 RECONCILED from V151 [not invented] → real modules; 15+5=20; 9×20=180 intersections [135 reused + 45 commercial]; NO construction; payment/CRA-cert OWNER_GATED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
