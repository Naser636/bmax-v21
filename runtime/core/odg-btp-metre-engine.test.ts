#!/usr/bin/env node
"use strict";
/* V262 — deterministic MÉTRÉ engine. 24 required cases with EXACT numerical results (not just object shape): geometry,
 * units, construction quantities, provenance gating, uncertainty, traceability, devis integration + V260 safeguards. */
const M = require("./odg-btp-metre-engine.js");
const DEV = require("./odg-btp-devis-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const m = (v: number, p?: string) => ({ value: v, unit: "m", provenance: p || "MEASURED" });

function main() {
  // 1 rectangular wall area = 4×2.5 = 10 m2
  const r1 = M.rectArea(m(4), m(2.5));
  check("1. rect wall area 4×2.5 = 10 m2 (MEASURED ⇒ no human-validation needed)", r1.ok && r1.quantity === 10 && r1.unit === "m2" && r1.provenance === "MEASURED" && r1.requiresHumanValidation === false);
  // 2 wall minus openings = 10 − (1×1.2) = 8.8
  const r2 = M.wallArea(m(4), m(2.5), [{ width: m(1), height: m(1.2) }]);
  check("2. wall 4×2.5 minus opening 1×1.2 = 8.8 m2 (deduction traced)", r2.ok && r2.quantity === 8.8 && r2.deductions.length === 1);
  // 3 floor surface 5×4 = 20
  check("3. floor surface 5×4 = 20 m2", M.rectArea(m(5), m(4)).quantity === 20);
  // 4 slab volume 5×4×0.2 = 4 m3
  check("4. concrete slab volume 5×4×0.2 = 4 m3", M.slabVolume(m(5), m(4), m(0.2)).quantity === 4 && M.slabVolume(m(5), m(4), m(0.2)).unit === "m3");
  // 5 foundation volume 10×0.5×0.8 = 4 m3
  check("5. foundation volume 10×0.5×0.8 = 4 m3", M.foundationVolume(m(10), m(0.5), m(0.8)).quantity === 4);
  // 6 cylindrical excavation π×0.5²×2 = 1.570796
  check("6. cylindrical excavation r0.5 h2 = π×0.25×2 = 1.570796 m3", M.cylinderVolume(m(0.5), m(2)).quantity === 1.570796);
  // 7 trench 20×0.4×1 = 8 m3
  check("7. trench volume 20×0.4×1 = 8 m3", M.trenchVolume(m(20), m(0.4), m(1)).quantity === 8);
  // 8 triangle ½×3×2 = 3
  check("8. triangular surface ½×3×2 = 3 m2", M.triangleArea(m(3), m(2)).quantity === 3);
  // 9 composite aggregation 10 + 20 = 30 m2
  check("9. composite aggregation (10 + 20) = 30 m2", M.aggregate([M.rectArea(m(2), m(5)), M.rectArea(m(4), m(5))]).quantity === 30);
  // 10 unit conversions
  check("10. unit conversions: 100cm→1m, 2.5m→250cm, 1m²→10000cm²", M.convert(100, "cm", "m").value === 1 && M.convert(2.5, "m", "cm").value === 250 && M.convert(1, "m2", "cm2").value === 10000);
  // 11 incompatible / unknown unit rejection
  check("11. incompatible-unit rejection: m→m² ⇒ INCOMPATIBLE_UNITS; unknown ⇒ UNKNOWN_UNIT", M.convert(1, "m", "m2").code === "INCOMPATIBLE_UNITS" && M.convert(1, "foo", "m").code === "UNKNOWN_UNIT");
  // 12 missing dimension
  check("12. missing dimension ⇒ MISSING_DIMENSION", M.rectArea(m(4), {}).code === "MISSING_DIMENSION");
  // 13 negative / zero dimension
  check("13. negative/zero dimension ⇒ INVALID_DIMENSION", M.rectArea(m(-4), m(2)).code === "INVALID_DIMENSION" && M.rectArea({ value: 0, unit: "m" }, m(2)).code === "INVALID_DIMENSION");
  // 14 contradictory measurements
  check("14. contradictory measurements (10 vs 12 m², tol 0.5) ⇒ contradictory; (10 vs 10.2, tol 0.5) ⇒ within", M.detectContradiction({ quantity: 10, unit: "m2" }, { quantity: 12, unit: "m2" }, 0.5).contradictory === true && M.detectContradiction({ quantity: 10, unit: "m2" }, { quantity: 10.2, unit: "m2" }, 0.5).contradictory === false);
  // 15 explicit waste factor: 100 × 10 × 1.05 = 1050
  const mq = M.materialQuantity({ quantity: 100, provenance: "MEASURED" }, { value: 10, unit: "u", per: "per m2", source: "supplier-catalogue-2026" }, { wasteFactor: 0.05 });
  check("15. material quantity 100 × 10/m² × (1+0.05 waste) = 1050 (coefficient sourced)", mq.ok && mq.quantity === 1050 && mq.wasteFactor === 0.05 && mq.coefficient.source === "supplier-catalogue-2026");
  // 16 missing coefficient
  check("16. missing material coefficient ⇒ MISSING_COEFFICIENT (never invented)", M.materialQuantity({ quantity: 100, provenance: "MEASURED" }, null).code === "MISSING_COEFFICIENT");
  // 17 estimated-input gate
  const est = M.rectArea(m(4, "ESTIMATED"), m(2.5));
  check("17. an ESTIMATED input ⇒ worst provenance ESTIMATED, requiresHumanValidation, validationStatus HUMAN_VALIDATION_REQUIRED", est.provenance === "ESTIMATED" && est.requiresHumanValidation === true && est.validationStatus === "HUMAN_VALIDATION_REQUIRED");
  // 18 assumed-input gate (no provenance supplied ⇒ ASSUMED)
  const asm = M.rectArea({ value: 4, unit: "m" }, { value: 2.5, unit: "m" });
  check("18. inputs with no provenance ⇒ ASSUMED ⇒ requiresHumanValidation (never silently measured)", asm.provenance === "ASSUMED" && asm.requiresHumanValidation === true);
  // 19 human-validated
  const hv = M.rectArea(m(4, "HUMAN_VALIDATED"), m(2.5, "HUMAN_VALIDATED"));
  check("19. all HUMAN_VALIDATED ⇒ not requiring further validation", hv.provenance === "HUMAN_VALIDATED" && hv.requiresHumanValidation === false);
  // 20 deterministic repeatability
  check("20. deterministic: identical inputs ⇒ byte-identical result; frozen", JSON.stringify(M.rectArea(m(4), m(2.5))) === JSON.stringify(r1) && Object.isFrozen(r1));
  // 21 trace reconstruction
  check("21. trace: result exposes formula + inputs + conversions + deductions", /length × width/.test(r1.formula) && r1.inputs.length === 2 && Array.isArray(r1.conversions) && Array.isArray(r2.deductions) && r2.deductions.length === 1);
  const convTrace = M.rectArea({ value: 400, unit: "cm", provenance: "MEASURED" }, m(2.5));
  check("21b. unit conversion appears in the trace (400cm→4m) and result 10 m2", convTrace.quantity === 10 && convTrace.conversions.some((c: string) => /400cm/.test(c) && /4m/.test(c)));

  // 22 quotation-engine integration (NO money recompute — feeds computeDevis)
  const lines = M.metreToDevisLines([{ id: "L1", metier: "masonry", metre: M.rectArea(m(4), m(2.5)), materialQty: 10, materialUnitPriceMinor: 500 }]);
  const devis = DEV.computeDevis({ lines: lines.lines, marginRate: 0.2, vatRate: 0.2 });
  check("22. integration: métré 10 m2 → devis line → cost 5000, margin 1000, selling 6000, VAT 1200, TTC 7200 (MEASURED ⇒ final)", lines.ok && devis.ok && devis.costHT === 5000 && devis.margin === 1000 && devis.sellingHT === 6000 && devis.vat === 1200 && devis.totalTTC === 7200 && devis.final === true);
  // 23 financial rounding / cent precision preserved (integer centimes)
  check("23. financial cent precision: all money fields are integers (centimes)", [devis.costHT, devis.margin, devis.sellingHT, devis.vat, devis.totalTTC].every((x: number) => Number.isInteger(x)));
  // 24 V260 safeguards through integration: an ESTIMATED métré ⇒ devis NOT final; margin ≠ markup preserved
  const estLines = M.metreToDevisLines([{ id: "L1", metier: "masonry", metre: M.rectArea(m(4, "ESTIMATED"), m(2.5)), materialQty: 10, materialUnitPriceMinor: 500 }]);
  const estDevis = DEV.computeDevis({ lines: estLines.lines, marginRate: 0.2, vatRate: 0.2 });
  check("24. V260 safeguards: ESTIMATED métré ⇒ devis NOT final (requiresHumanValidation); margin(0.2)≠markup", estDevis.final === false && estDevis.requiresHumanValidation === true && estDevis.marginRate !== estDevis.markupRate);

  // units/contract sanity
  check("engine supports the required units (m/cm/mm, m2/cm2, m3/L, kg/t, u) + reuses devis MEASURE_STATE", ["m", "cm", "mm", "m2", "cm2", "m3", "L", "kg", "t", "u"].every((u) => M.UNITS[u]) && JSON.stringify(M.MEASURE_STATE) === JSON.stringify(DEV.MEASURE_STATE));
  check("contract: strict units, worst-provenance, explicit coefficients, feeds computeDevis (no 2nd engine)", M.BTP_METRE_ENGINE_CONTRACT.invariants.some((i: string) => /never silently interpreted/.test(i)) && M.BTP_METRE_ENGINE_CONTRACT.invariants.some((i: string) => /WORST input provenance/.test(i)) && M.BTP_METRE_ENGINE_CONTRACT.invariants.some((i: string) => /no second quotation engine/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-metre-engine (V262: deterministic quantity-surveying — geometry [rect/triangle/circle/cylinder/slab/foundation/trench/wall-minus-openings] exact; strict units [reject unknown/incompatible]; explicit coefficients+waste [never invented]; provenance worst-of-inputs + ESTIMATED/ASSUMED ⇒ human-validation; contradiction detection; full traceability; FEEDS computeDevis [cost 5000→TTC 7200, cents, margin≠markup, estimated⇒not-final] — no 2nd quotation engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
