#!/usr/bin/env node
"use strict";
/* V260 §5 — BTP intelligent-devis engine. Proves exact integer-minor arithmetic (cost→margin→VAT→TTC), MARGIN≠MARKUP,
 * measurement-state gating (any ESTIMATED/ASSUMED ⇒ NOT final), omission/under-pricing detection, variants, forecast-vs-actual
 * (estimated≠realized margin), fail-closed, and an HONEST 20-function qualification (fns 1-3 ABSENT). Deterministic. */
const D = require("./odg-btp-devis-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const req = {
    lines: [
      { id: "L1", label: "maçonnerie", metier: "masonry", quantity: 10, unit: "m2", materialQty: 10, materialUnitPriceMinor: 1000, labourHours: 5, labourRateMinor: 4000, measurementState: "MEASURED" },
      { id: "L2", label: "béton", metier: "concrete", quantity: 2, unit: "m3", materialQty: 2, materialUnitPriceMinor: 5000, measurementState: "ESTIMATED" },
    ], overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20,
  };
  const r = D.computeDevis(req);
  // exact arithmetic: L1 direct 10*1000 + 5*4000 = 30000; L2 2*5000 = 10000; subtotal 40000; overhead 4000; cost 44000;
  // margin 8800; selling 52800; markup 8800/52800=0.1667; vat 10560; TTC 63360.
  check("exact costing: subtotalDirectHT 40000, overhead 4000, costHT 44000", r.ok === true && r.subtotalDirectHT === 40000 && r.overhead === 4000 && r.costHT === 44000);
  check("exact margin/selling/VAT/TTC: margin 8800, sellingHT 52800, vat 10560, totalTTC 63360", r.margin === 8800 && r.sellingHT === 52800 && r.vat === 10560 && r.totalTTC === 63360);
  check("CRUX: MARGIN (0.20 of cost) ≠ MARKUP (0.1667 of selling) — reported separately, never conflated", r.marginRate === 0.20 && Math.abs(r.markupRate - 0.1667) < 0.0005 && r.marginRate !== r.markupRate);

  // CRUX: any ESTIMATED/ASSUMED line ⇒ NOT final (requiresHumanValidation).
  check("CRUX: an ESTIMATED line ⇒ worstMeasurementState ESTIMATED, requiresHumanValidation, NOT final", r.worstMeasurementState === "ESTIMATED" && r.requiresHumanValidation === true && r.final === false);
  const allMeasured = D.computeDevis({ ...req, lines: req.lines.map((l: any) => ({ ...l, measurementState: "MEASURED" })) });
  check("all-MEASURED ⇒ final-eligible (requiresHumanValidation false)", allMeasured.requiresHumanValidation === false && allMeasured.final === true);
  const assumed = D.computeDevis({ ...req, lines: [{ ...req.lines[0], measurementState: "ASSUMED" }] });
  check("an ASSUMED quantity is never promoted — worst state ASSUMED, not final", assumed.worstMeasurementState === "ASSUMED" && assumed.final === false);

  // fail-closed.
  check("fail-closed: no lines ⇒ NO_LINES", D.computeDevis({ lines: [] }).code === "NO_LINES" && D.computeDevis(null).code === "NO_LINES");
  check("fail-closed: negative/non-integer money ⇒ INVALID_LINE (never silently coerced)", D.computeDevis({ lines: [{ id: "x", quantity: 1, materialQty: 1, materialUnitPriceMinor: -5 }] }).code === "INVALID_LINE" && D.computeDevis({ lines: [{ id: "y", quantity: 1, materialQty: 1, materialUnitPriceMinor: 10.5 }] }).code === "INVALID_LINE");

  // omission / under-pricing detection (fn 15).
  const om = D.detectOmissions({ lines: [{ id: "A", quantity: 5, materialQty: 0, labourHours: 0 }, { id: "B", quantity: 1, materialQty: 1, materialUnitPriceMinor: 100, measurementState: "ASSUMED" }] });
  check("detectOmissions: qty>0 with 0 cost ⇒ UNDERPRICED; an ASSUMED measure ⇒ UNVALIDATED_MEASURE", om.findings.some((x: any) => x.lineId === "A" && x.code === "UNDERPRICED") && om.findings.some((x: any) => x.lineId === "B" && x.code === "UNVALIDATED_MEASURE") && om.clean === false);
  check("detectOmissions: a fully-costed MEASURED line ⇒ clean", D.detectOmissions({ lines: [{ id: "C", quantity: 1, materialQty: 1, materialUnitPriceMinor: 100, labourHours: 1, labourRateMinor: 100, measurementState: "MEASURED" }] }).clean === true);

  // variants (fn 13): economic < standard < premium selling.
  const v = D.buildVariants(req);
  check("buildVariants: economic < standard < premium sellingHT (margin-rate variants)", v.economic.devis.sellingHT < v.standard.devis.sellingHT && v.standard.devis.sellingHT < v.premium.devis.sellingHT && v.economic.marginRate === 0.10);

  // forecast vs actual (fn 20): estimated margin ≠ realized margin.
  const cmp = D.compareToActual(r, { materialMinor: 25000, labourMinor: 25000, equipmentMinor: 0, transportMinor: 0, overheadMinor: 5000 });
  // actual cost 55000 vs forecast 44000 ⇒ overrun 11000; realized margin = selling 52800 − actual 55000 = -2200 (loss) ≠ forecast 8800.
  check("compareToActual: overrun 11000; realized margin (−2200) ≠ forecast margin (8800); marginErosion 11000", cmp.costVariance === 11000 && cmp.overrun === true && cmp.realizedMargin === -2200 && cmp.forecastMargin === 8800 && cmp.marginErosion === 11000);

  // HONEST 20-function qualification: fns 1-3 (photo/plan/voice) ABSENT; not everything claimed built.
  const q = D.qualifyFunctions();
  check("qualifyFunctions: 20 functions; photo/plan/voice (1,2,3) ABSENT; built+partial+absent = 20", q.total === 20 && [1, 2, 3].every((n) => q.functions.find((x: any) => x.n === n).status === "ABSENT") && q.built + q.partial + q.absent === 20);
  check("qualifyFunctions honest: nothing claimed OPERATIONAL end-to-end; >=1 ABSENT (not all built)", q.absent >= 3 && /Nothing claimed OPERATIONAL/i.test(q.note));

  check("contract: reuses quote.ts/chantier-profitability/normalize (no 2nd engine); margin≠markup; measurement distinct; photo-not-exact", D.BTP_DEVIS_ENGINE_CONTRACT.invariants.some((i: string) => /MARGIN.*MARKUP.*never conflated/.test(i)) && D.BTP_DEVIS_ENGINE_CONTRACT.invariants.some((i: string) => /no second lifecycle/.test(i)) && D.BTP_DEVIS_ENGINE_CONTRACT.invariants.some((i: string) => /photo alone cannot yield exact dimensions/.test(i)));
  check("deterministic + frozen", JSON.stringify(D.computeDevis(req)) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.lines));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-devis-engine (V260 §5: deterministic BTP devis costing — exact integer-minor COST→margin→VAT→TTC; MARGIN≠MARKUP; measurement-state gating [ESTIMATED/ASSUMED ⇒ not final]; omission/under-pricing detection; variants; forecast-vs-actual [estimated≠realized margin]; fail-closed; honest 20-fn map [photo/plan/voice ABSENT]; composes quote/profitability/normalize — no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
