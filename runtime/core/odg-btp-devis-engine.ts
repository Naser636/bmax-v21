#!/usr/bin/env node
"use strict";

/*
 * V260 §5 — ODG BTP INTELLIGENT DEVIS (costing/estimating) ENGINE. PURE, deterministic, integer minor-unit (centimes)
 * arithmetic, fail-closed. It builds the DETERMINISTIC subset of the 20 mandatory devis functions that no existing module
 * covers: line métré → materials → labour → equipment/transport → overhead → MARGIN (≠ markup) → VAT → TTC, plus economic/
 * standard/premium VARIANTS, OMISSION / under-pricing detection, and forecast-vs-actual variance. It COMPOSES — not
 * duplicates — the existing quote.ts (lifecycle: createQuote/approve/accept), chantier-profitability.ts (chantier P&L) and
 * renovation-quote-normalize.ts (normalization). No second engine for those.
 *
 * HONESTY (directive §4/§5): measurement provenance is kept STRICTLY distinct — MEASURED / ESTIMATED / ASSUMED /
 * HUMAN_VALIDATED. A devis containing any ESTIMATED or ASSUMED quantity is NOT final (requiresHumanValidation); an uncertain
 * quantity is NEVER silently promoted to a measurement. MARGIN (margin/cost) and MARKUP (margin/selling) are reported
 * separately and never conflated. VAT is applied from the supplied rate (never invented). A photo/plan/voice alone cannot
 * yield exact dimensions — those input functions are ABSENT here (need a vision/STT capability) and are reported as such.
 */

const MEASURE_STATE = Object.freeze(["MEASURED", "HUMAN_VALIDATED", "ESTIMATED", "ASSUMED"]);  // order = most→least certain
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function intMinor(v: any): number | null { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0 ? v : null; }
function nonNegNum(v: any): number | null { return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }
function round(n: number): number { return Math.round(n); }

/** computeDevis(request) -> full costed devis (HT cost, margin, markup, VAT, TTC) with measurement-state rollup. */
function computeDevis(request: any): any {
  const req = isObj(request) ? request : {};
  const lines = arr(req.lines).filter(isObj);
  if (lines.length === 0) return Object.freeze({ ok: false, code: "NO_LINES", detail: "a devis needs >=1 line (fail-closed)" });
  const overheadRate = nonNegNum(req.overheadRate) !== null ? req.overheadRate : 0;
  const marginRate = nonNegNum(req.marginRate) !== null ? req.marginRate : 0;        // margin on COST (not markup)
  const vatRate = nonNegNum(req.vatRate) !== null ? req.vatRate : 0;
  const costed: any[] = [];
  let worst = 0;                                                                     // worst measurement-state index
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const qty = nonNegNum(l.quantity); const matQty = nonNegNum(l.materialQty); const matPrice = intMinor(l.materialUnitPriceMinor);
    const labHours = nonNegNum(l.labourHours); const labRate = intMinor(l.labourRateMinor);
    // fail-closed: test the RAW fields — a negative/non-integer money field or negative qty invalidates the whole devis
    // (never silently coerced). (equipment/transport default to 0 only when truly absent.)
    if ((l.materialUnitPriceMinor !== undefined && matPrice === null) || (l.labourRateMinor !== undefined && labRate === null) || (l.quantity !== undefined && qty === null)
      || (l.equipmentMinor !== undefined && intMinor(l.equipmentMinor) === null) || (l.transportMinor !== undefined && intMinor(l.transportMinor) === null))
      return Object.freeze({ ok: false, code: "INVALID_LINE", detail: "line '" + (l.id || i) + "' has a negative/non-integer money or quantity field" });
    const equip = intMinor(l.equipmentMinor) !== null ? l.equipmentMinor : 0; const transport = intMinor(l.transportMinor) !== null ? l.transportMinor : 0;
    const materialCost = matQty !== null && matPrice !== null ? round(matQty * matPrice) : 0;
    const labourCost = labHours !== null && labRate !== null ? round(labHours * labRate) : 0;
    const directCost = materialCost + labourCost + equip + transport;
    const ms = MEASURE_STATE.indexOf(l.measurementState) >= 0 ? MEASURE_STATE.indexOf(l.measurementState) : MEASURE_STATE.indexOf("ASSUMED");
    if (ms > worst) worst = ms;
    costed.push(Object.freeze({ id: l.id || "L" + (i + 1), label: l.label || null, metier: l.metier || null, unit: l.unit || null, quantity: qty, materialCost, labourCost, equipment: equip, transport, directCost, measurementState: MEASURE_STATE[ms] }));
  }
  const subtotalDirectHT = costed.reduce((a: number, c: any) => a + c.directCost, 0);
  const overhead = round(subtotalDirectHT * overheadRate);
  const costHT = subtotalDirectHT + overhead;                                        // total COST HT
  const margin = round(costHT * marginRate);                                         // margin = marginRate × cost
  const sellingHT = costHT + margin;                                                 // selling price HT
  const markupRate = sellingHT > 0 ? Math.round((margin / sellingHT) * 10000) / 10000 : 0;   // markup = margin / selling (≠ marginRate)
  const vat = round(sellingHT * vatRate);
  const totalTTC = sellingHT + vat;
  const worstState = MEASURE_STATE[worst];
  const requiresHumanValidation = worst >= MEASURE_STATE.indexOf("ESTIMATED");       // any ESTIMATED/ASSUMED ⇒ not final
  return Object.freeze({
    ok: true, lines: Object.freeze(costed), lineCount: costed.length,
    subtotalDirectHT, overheadRate, overhead, costHT,
    marginRate, margin, markupRate, sellingHT, vatRate, vat, totalTTC,
    worstMeasurementState: worstState, requiresHumanValidation, final: !requiresHumanValidation,
    note: "integer minor-unit (centimes); COST(HT) → +margin → sellingHT → +VAT → TTC. MARGIN(margin/cost=" + marginRate + ") and MARKUP(margin/selling=" + markupRate + ") are distinct. A devis with any ESTIMATED/ASSUMED line is NOT final (requiresHumanValidation). VAT applied from the supplied rate (never invented).",
  });
}

/** detectOmissions(request) -> under-pricing / missing-cost / unvalidated-measure findings (devis function 15). */
function detectOmissions(request: any): any {
  const req = isObj(request) ? request : {};
  const lines = arr(req.lines).filter(isObj);
  const findings: any[] = [];
  lines.forEach((l: any, i: number) => {
    const id = l.id || "L" + (i + 1);
    const qty = nonNegNum(l.quantity);
    const matPrice = intMinor(l.materialUnitPriceMinor); const matQty = nonNegNum(l.materialQty);
    const labHours = nonNegNum(l.labourHours); const labRate = intMinor(l.labourRateMinor);
    const material = matQty !== null && matPrice !== null ? matQty * matPrice : 0;
    const labour = labHours !== null && labRate !== null ? labHours * labRate : 0;
    const direct = material + labour + (intMinor(l.equipmentMinor) || 0) + (intMinor(l.transportMinor) || 0);
    if (qty !== null && qty > 0 && direct === 0) findings.push(Object.freeze({ lineId: id, code: "UNDERPRICED", detail: "quantity>0 but total direct cost is 0 ⇒ likely under-pricing / missing cost" }));
    else if (material === 0 && labour === 0) findings.push(Object.freeze({ lineId: id, code: "MISSING_COST", detail: "no material and no labour cost on the line" }));
    if (l.measurementState === "ASSUMED") findings.push(Object.freeze({ lineId: id, code: "UNVALIDATED_MEASURE", detail: "quantity is ASSUMED ⇒ requires human validation before the devis is final" }));
  });
  return Object.freeze({ findings: Object.freeze(findings), clean: findings.length === 0, note: "omission / under-pricing / unvalidated-measure detection; a clean result is NOT a guarantee of completeness (human review still required)." });
}

/** buildVariants(request) -> economic / standard / premium devis via distinct margin rates (devis function 13). */
function buildVariants(request: any): any {
  const base = isObj(request) ? request : {};
  const rates = isObj(base.variantMargins) ? base.variantMargins : { economic: 0.10, standard: 0.18, premium: 0.28 };
  const mk = (name: string, r: number) => Object.freeze({ variant: name, marginRate: r, devis: computeDevis({ ...base, marginRate: r }) });
  return Object.freeze({ economic: mk("economic", rates.economic), standard: mk("standard", rates.standard), premium: mk("premium", rates.premium),
    note: "three variants differing ONLY by margin rate (deterministic); scope/quantities identical — premium ≠ more work here, just higher margin unless the caller changes the lines." });
}

/** compareToActual(devisResult, actual) -> forecast-vs-actual variance (devis function 20). Estimated margin is NEVER realized margin. */
function compareToActual(devisResult: any, actual: any): any {
  const d = isObj(devisResult) ? devisResult : {}; const a = isObj(actual) ? actual : {};
  if (d.ok !== true) return Object.freeze({ ok: false, code: "INVALID_DEVIS" });
  const actualCostHT = (intMinor(a.materialMinor) || 0) + (intMinor(a.labourMinor) || 0) + (intMinor(a.equipmentMinor) || 0) + (intMinor(a.transportMinor) || 0) + (intMinor(a.overheadMinor) || 0);
  const forecastCostHT = typeof d.costHT === "number" ? d.costHT : 0;
  const costVariance = actualCostHT - forecastCostHT;                                // + = overrun
  const realizedMargin = typeof d.sellingHT === "number" ? d.sellingHT - actualCostHT : 0;   // selling fixed by the accepted devis
  const forecastMargin = typeof d.margin === "number" ? d.margin : 0;
  return Object.freeze({
    ok: true, forecastCostHT, actualCostHT, costVariance, overrun: costVariance > 0,
    forecastMargin, realizedMargin, marginErosion: forecastMargin - realizedMargin,
    note: "realizedMargin = accepted sellingHT − ACTUAL cost (selling is fixed by the accepted devis). forecastMargin is an ESTIMATE, never reported as realized profit; marginErosion = forecast − realized.",
  });
}

// honest qualification of all 20 mandatory devis functions against REAL backing (BUILT here / PARTIAL / ABSENT).
const DEVIS_FUNCTIONS = Object.freeze([
  Object.freeze({ n: 1, name: "Devis depuis photo", status: "ABSENT", backing: "needs computer-vision/OCR (not present) — a photo alone cannot yield exact dimensions without a metric reference" }),
  Object.freeze({ n: 2, name: "Devis depuis plan PDF/image", status: "ABSENT", backing: "needs plan vision/vector extraction (not present)" }),
  Object.freeze({ n: 3, name: "Devis depuis description vocale", status: "ABSENT", backing: "needs speech-to-text + intent (nl-objective-gateway is text-only)" }),
  Object.freeze({ n: 4, name: "Devis manuel assisté", status: "BUILT", backing: "computeDevis (structured line input)" }),
  Object.freeze({ n: 5, name: "Métré automatique + contrôle humain", status: "PARTIAL", backing: "computeDevis consumes métré quantities + measurement states; automatic extraction from plans is ABSENT; human validation enforced via requiresHumanValidation" }),
  Object.freeze({ n: 6, name: "Calcul matériaux et quantités", status: "BUILT", backing: "computeDevis per-line materialCost" }),
  Object.freeze({ n: 7, name: "Calcul heures et équipes", status: "BUILT", backing: "computeDevis per-line labourCost (hours × loaded rate)" }),
  Object.freeze({ n: 8, name: "Calcul matériel et transport", status: "BUILT", backing: "computeDevis equipment + transport" }),
  Object.freeze({ n: 9, name: "Prix fournisseurs + bibliothèque tarifaire", status: "PARTIAL", backing: "prices consumed per-line; a sourced supplier/price DB is ABSENT (prices supplied by caller)" }),
  Object.freeze({ n: 10, name: "Coûts indirects / frais généraux", status: "BUILT", backing: "computeDevis overhead (overheadRate × direct)" }),
  Object.freeze({ n: 11, name: "Marge personnalisable par chantier", status: "BUILT", backing: "computeDevis marginRate (margin ≠ markup, both reported)" }),
  Object.freeze({ n: 12, name: "TVA et conditions particulières", status: "PARTIAL", backing: "computeDevis applies the supplied vatRate; automatic FR-rate determination (20/10/5.5) + special conditions ABSENT (never invented)" }),
  Object.freeze({ n: 13, name: "Variantes éco/standard/premium", status: "BUILT", backing: "buildVariants" }),
  Object.freeze({ n: 14, name: "Options et travaux exclus", status: "PARTIAL", backing: "lines can carry options/exclusions structurally; dedicated option/exclusion modelling not built" }),
  Object.freeze({ n: 15, name: "Détection oublis / sous-chiffrage", status: "BUILT", backing: "detectOmissions" }),
  Object.freeze({ n: 16, name: "Génération PDF avec logo", status: "ABSENT", backing: "no PDF renderer (I/O) in scope" }),
  Object.freeze({ n: 17, name: "Signature et acceptation", status: "PARTIAL", backing: "EXISTING quote.ts lifecycle (approve/accept) — reuse, not rebuilt here" }),
  Object.freeze({ n: 18, name: "Relances automatiques", status: "PARTIAL", backing: "EXISTING quote.ts markSent + support-renewal patterns; scheduler owner-gated" }),
  Object.freeze({ n: 19, name: "Devis accepté → chantier", status: "PARTIAL", backing: "EXISTING quote.ts accept + chantier-cockpit; wiring not consolidated" }),
  Object.freeze({ n: 20, name: "Comparaison devis initial / coûts réels", status: "BUILT", backing: "compareToActual (+ EXISTING chantier-profitability for chantier P&L)" }),
]);

/** qualifyFunctions() -> honest roll-up of the 20 devis functions. */
function qualifyFunctions(): any {
  const count = (s: string) => DEVIS_FUNCTIONS.filter((f: any) => f.status === s).length;
  return Object.freeze({ total: 20, functions: DEVIS_FUNCTIONS, built: count("BUILT"), partial: count("PARTIAL"), absent: count("ABSENT"),
    note: "honest qualification: BUILT = implemented+tested here; PARTIAL = partly covered (here or by an existing module) but not world-class-complete; ABSENT = needs a capability not present (vision/STT/PDF). Nothing claimed OPERATIONAL end-to-end." });
}

const BTP_DEVIS_ENGINE_CONTRACT = Object.freeze({
  id: "V260-ODG-BTP-DEVIS-ENGINE",
  source: "V260 §5 — deterministic BTP intelligent-devis costing engine (the subset no existing module covers)",
  reuses: Object.freeze(["quote.ts (lifecycle)", "chantier-profitability.ts (chantier P&L)", "renovation-quote-normalize.ts (normalization)"]),
  measureStates: MEASURE_STATE,
  invariants: Object.freeze([
    "integer minor-unit arithmetic; COST(HT)→margin→selling→VAT→TTC; MARGIN (margin/cost) and MARKUP (margin/selling) reported separately, never conflated",
    "measurement provenance kept distinct (MEASURED/HUMAN_VALIDATED/ESTIMATED/ASSUMED); any ESTIMATED/ASSUMED ⇒ NOT final (requiresHumanValidation); an uncertain quantity is never promoted to a measurement",
    "fail-closed: no lines / negative / non-integer money ⇒ error; VAT applied from the supplied rate (never invented); omission/under-pricing surfaced, a clean result is not a completeness guarantee",
    "photo/plan/voice devis (fns 1-3) are ABSENT (need vision/STT) and reported as such — a photo alone cannot yield exact dimensions without a metric reference",
    "composes quote.ts/chantier-profitability/renovation-quote-normalize — no second lifecycle/P&L/normalization engine; no new primitive",
  ]),
});

module.exports = { MEASURE_STATE, computeDevis, detectOmissions, buildVariants, compareToActual, DEVIS_FUNCTIONS, qualifyFunctions, BTP_DEVIS_ENGINE_CONTRACT };

export {};
