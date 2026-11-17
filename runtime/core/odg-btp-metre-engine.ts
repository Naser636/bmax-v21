#!/usr/bin/env node
"use strict";

/*
 * V262 — ODG BTP DETERMINISTIC QUANTITY-SURVEYING (MÉTRÉ) ENGINE. PURE, deterministic, fail-closed, fully traced. It computes
 * geometry (lengths/areas/volumes), strict unit conversions, construction material quantities (explicit coefficients + waste),
 * with full measurement PROVENANCE, uncertainty gating and reproducible traces. It REUSES odg-btp-devis-engine.MEASURE_STATE
 * (single measurement ladder) and FEEDS its computeDevis via metreToDevisLines WITHOUT recomputing any money (no second
 * quotation engine). It mutates nothing, builds no roadmap/primitive/scheduler.
 *
 * HONESTY (directive §3D/E): MEASURED / HUMAN_VALIDATED / ESTIMATED / ASSUMED are kept distinct; a derived quantity takes the
 * WORST (most-uncertain) provenance of its inputs; any ESTIMATED/ASSUMED input ⇒ requiresHumanValidation (never silently a
 * measurement). Coefficients/waste/thickness are EXPLICIT INPUTS with provenance — never invented. Unknown or dimensionally-
 * incompatible units are REJECTED (never silently interpreted). Missing/negative/zero/contradictory dimensions ⇒ fail-closed.
 */

const DEV = require("./odg-btp-devis-engine.js");
const MEASURE_STATE: string[] = Array.isArray(DEV.MEASURE_STATE) ? DEV.MEASURE_STATE : ["MEASURED", "HUMAN_VALIDATED", "ESTIMATED", "ASSUMED"];
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }
function provIdx(p: any): number { const i = MEASURE_STATE.indexOf(p); return i >= 0 ? i : MEASURE_STATE.indexOf("ASSUMED"); }
function worstProv(provs: any[]): string { let w = 0; for (const p of provs) { const i = provIdx(p); if (i > w) w = i; } return MEASURE_STATE[w]; }
function needsHuman(prov: string): boolean { return provIdx(prov) >= MEASURE_STATE.indexOf("ESTIMATED"); }

// ---- UNITS: name -> { dim, toBase } (base: m / m2 / m3 / kg / count). Strict dimensional compatibility. ----
const UNITS: Record<string, any> = Object.freeze({
  m: { dim: "LENGTH", toBase: 1 }, cm: { dim: "LENGTH", toBase: 0.01 }, mm: { dim: "LENGTH", toBase: 0.001 },
  m2: { dim: "AREA", toBase: 1 }, cm2: { dim: "AREA", toBase: 0.0001 }, mm2: { dim: "AREA", toBase: 0.000001 },
  m3: { dim: "VOLUME", toBase: 1 }, L: { dim: "VOLUME", toBase: 0.001 }, l: { dim: "VOLUME", toBase: 0.001 },
  kg: { dim: "MASS", toBase: 1 }, t: { dim: "MASS", toBase: 1000 }, g: { dim: "MASS", toBase: 0.001 },
  u: { dim: "COUNT", toBase: 1 }, unit: { dim: "COUNT", toBase: 1 },
});
const BASE_OF: Record<string, string> = Object.freeze({ LENGTH: "m", AREA: "m2", VOLUME: "m3", MASS: "kg", COUNT: "u" });

/** convert(value, from, to) -> { ok, value } or a fail-closed error. Unknown unit ⇒ UNKNOWN_UNIT; cross-dimension ⇒ INCOMPATIBLE_UNITS. */
function convert(value: any, from: any, to: any): any {
  if (typeof value !== "number" || !isFinite(value)) return Object.freeze({ ok: false, code: "INVALID_VALUE" });
  const f = UNITS[from], t = UNITS[to];
  if (!f) return Object.freeze({ ok: false, code: "UNKNOWN_UNIT", detail: "unknown unit '" + from + "'" });
  if (!t) return Object.freeze({ ok: false, code: "UNKNOWN_UNIT", detail: "unknown unit '" + to + "'" });
  if (f.dim !== t.dim) return Object.freeze({ ok: false, code: "INCOMPATIBLE_UNITS", detail: from + " (" + f.dim + ") ≠ " + to + " (" + t.dim + ")" });
  return Object.freeze({ ok: true, value: round6(value * f.toBase / t.toBase), from, to, dim: f.dim });
}

// validate + normalize a dimension to its base unit. Geometry dimensions must be finite and > 0 (fail-closed).
function normDim(d: any, name: string, allowZero?: boolean): any {
  const o = isObj(d) ? d : {};
  const v = o.value; const unit = o.unit;
  if (typeof v !== "number" || !isFinite(v)) return { ok: false, code: "MISSING_DIMENSION", detail: name + " value missing/non-finite" };
  if (v < 0 || (!allowZero && v === 0)) return { ok: false, code: "INVALID_DIMENSION", detail: name + " must be " + (allowZero ? ">= 0" : "> 0") + " (got " + v + ")" };
  if (!UNITS[unit]) return { ok: false, code: "UNKNOWN_UNIT", detail: name + " unit '" + unit + "'" };
  const base = BASE_OF[UNITS[unit].dim];
  const c = convert(v, unit, base);
  if (!c.ok) return { ok: false, code: c.code, detail: c.detail };
  return { ok: true, name, original: { value: v, unit }, base: { value: c.value, unit: base }, dim: UNITS[unit].dim, provenance: MEASURE_STATE.indexOf(o.provenance) >= 0 ? o.provenance : "ASSUMED" };
}

// build a fully-traced result.
function result(quantity: number, unit: string, inputs: any[], formula: string, extra?: any): any {
  const prov = worstProv(inputs.map((i: any) => i.provenance));
  return Object.freeze(Object.assign({
    ok: true, quantity: round6(quantity), unit, provenance: prov, requiresHumanValidation: needsHuman(prov),
    formula, inputs: Object.freeze(inputs.map((i: any) => Object.freeze({ name: i.name, original: i.original, base: i.base, provenance: i.provenance }))),
    conversions: Object.freeze(inputs.filter((i: any) => i.original && i.original.unit !== (i.base && i.base.unit)).map((i: any) => i.name + ": " + i.original.value + i.original.unit + " → " + i.base.value + i.base.unit)),
    deductions: Object.freeze((extra && extra.deductions) || []), coefficients: Object.freeze((extra && extra.coefficients) || []),
    warnings: Object.freeze((extra && extra.warnings) || []), validationStatus: needsHuman(prov) ? "HUMAN_VALIDATION_REQUIRED" : "OK",
  }, extra && extra.meta ? extra.meta : {}));
}
function fail(code: string, detail: string): any { return Object.freeze({ ok: false, code, detail }); }

// ---- A. GEOMETRY (all return base units m / m2 / m3, fully traced) ----
function rectArea(length: any, width: any): any { const L = normDim(length, "length"), W = normDim(width, "width"); if (!L.ok) return fail(L.code, L.detail); if (!W.ok) return fail(W.code, W.detail); return result(L.base.value * W.base.value, "m2", [L, W], "area = length × width"); }
function triangleArea(base: any, height: any): any { const B = normDim(base, "base"), H = normDim(height, "height"); if (!B.ok) return fail(B.code, B.detail); if (!H.ok) return fail(H.code, H.detail); return result(0.5 * B.base.value * H.base.value, "m2", [B, H], "area = ½ × base × height"); }
function circleArea(radius: any): any { const R = normDim(radius, "radius"); if (!R.ok) return fail(R.code, R.detail); return result(Math.PI * R.base.value * R.base.value, "m2", [R], "area = π × r²"); }
function cylinderVolume(radius: any, height: any): any { const R = normDim(radius, "radius"), H = normDim(height, "height"); if (!R.ok) return fail(R.code, R.detail); if (!H.ok) return fail(H.code, H.detail); return result(Math.PI * R.base.value * R.base.value * H.base.value, "m3", [R, H], "volume = π × r² × height"); }
function slabVolume(length: any, width: any, thickness: any): any { const L = normDim(length, "length"), W = normDim(width, "width"), T = normDim(thickness, "thickness"); if (!L.ok) return fail(L.code, L.detail); if (!W.ok) return fail(W.code, W.detail); if (!T.ok) return fail(T.code, T.detail); return result(L.base.value * W.base.value * T.base.value, "m3", [L, W, T], "volume = length × width × thickness"); }
function boxVolume(length: any, width: any, depth: any, label: string): any { const L = normDim(length, "length"), W = normDim(width, "width"), D = normDim(depth, "depth"); if (!L.ok) return fail(L.code, L.detail); if (!W.ok) return fail(W.code, W.detail); if (!D.ok) return fail(D.code, D.detail); return result(L.base.value * W.base.value * D.base.value, "m3", [L, W, D], label + " = length × width × depth"); }
function foundationVolume(length: any, width: any, depth: any): any { return boxVolume(length, width, depth, "foundation volume"); }
function trenchVolume(length: any, width: any, depth: any): any { return boxVolume(length, width, depth, "trench volume"); }

/** wallArea(length, height, openings[]) -> net wall area = L×H − Σ opening areas. Openings cannot exceed the wall (fail-closed). */
function wallArea(length: any, height: any, openings: any): any {
  const L = normDim(length, "length"), H = normDim(height, "height");
  if (!L.ok) return fail(L.code, L.detail); if (!H.ok) return fail(H.code, H.detail);
  const gross = L.base.value * H.base.value;
  const ded: any[] = []; let openSum = 0; const inputs = [L, H];
  for (const [i, op] of arr(openings).entries()) {
    const ow = normDim(op && op.width, "opening" + (i + 1) + ".width"), oh = normDim(op && op.height, "opening" + (i + 1) + ".height");
    if (!ow.ok) return fail(ow.code, ow.detail); if (!oh.ok) return fail(oh.code, oh.detail);
    const a = ow.base.value * oh.base.value; openSum += a; ded.push("opening" + (i + 1) + " = " + round6(ow.base.value) + "×" + round6(oh.base.value) + " = " + round6(a) + " m2"); inputs.push(ow, oh);
  }
  if (openSum > gross) return fail("IMPLAUSIBLE", "openings area (" + round6(openSum) + " m2) exceeds the wall (" + round6(gross) + " m2) — contradictory/implausible");
  return result(gross - openSum, "m2", inputs, "net wall area = (length × height) − Σ openings", { deductions: ded });
}

// ---- C. MATERIAL QUANTITY: explicit coefficient + explicit waste factor (never invented). ----
/** materialQuantity(baseQty, coefficient, opts) -> quantity × coefficient × (1 + waste). coefficient = { value, unit, per, source }. */
function materialQuantity(baseQty: any, coefficient: any, opts?: any): any {
  const q = isObj(baseQty) ? baseQty : {};
  if (typeof q.quantity !== "number" || !isFinite(q.quantity) || q.quantity < 0) return fail("INVALID_BASE_QTY", "base quantity missing/negative");
  const c = isObj(coefficient) ? coefficient : null;
  if (!c || typeof c.value !== "number" || !isFinite(c.value) || c.value < 0) return fail("MISSING_COEFFICIENT", "an explicit, non-negative coefficient { value, unit, per, source } is required — never invented");
  const o = isObj(opts) ? opts : {};
  const waste = typeof o.wasteFactor === "number" && isFinite(o.wasteFactor) && o.wasteFactor >= 0 ? o.wasteFactor : 0;   // explicit, default 0
  const raw = q.quantity * c.value; const withWaste = raw * (1 + waste);
  const prov = worstProv([q.provenance, c.source && c.source.provenance].filter(Boolean));
  return Object.freeze({
    ok: true, quantity: round6(withWaste), unit: c.unit || "unit", provenance: prov, requiresHumanValidation: needsHuman(prov),
    formula: "material = baseQty × coefficient × (1 + waste)", baseQuantity: q.quantity, coefficient: Object.freeze({ value: c.value, unit: c.unit || null, per: c.per || null, source: c.source || "UNSOURCED" }),
    wasteFactor: waste, rawBeforeWaste: round6(raw),
    coefficients: Object.freeze([(c.per || "coeff") + " = " + c.value + (c.source ? " [" + (typeof c.source === "string" ? c.source : JSON.stringify(c.source)) + "]" : "")]),
    warnings: Object.freeze(c.source ? [] : ["coefficient has no provenance source"]), validationStatus: needsHuman(prov) ? "HUMAN_VALIDATION_REQUIRED" : "OK",
  });
}

// ---- aggregate by same unit (fail-closed on mixed units). ----
function aggregate(items: any): any {
  const list = arr(items).filter((x: any) => isObj(x) && x.ok === true && typeof x.quantity === "number");
  if (list.length === 0) return fail("NO_ITEMS", "nothing to aggregate");
  const unit = list[0].unit;
  if (!list.every((x: any) => x.unit === unit)) return fail("MIXED_UNITS", "cannot aggregate mixed units (" + Array.from(new Set(list.map((x: any) => x.unit))).join(", ") + ")");
  const total = list.reduce((a: number, x: any) => a + x.quantity, 0);
  const prov = worstProv(list.map((x: any) => x.provenance));
  return Object.freeze({ ok: true, quantity: round6(total), unit, count: list.length, provenance: prov, requiresHumanValidation: needsHuman(prov), formula: "Σ quantities (same unit)", components: Object.freeze(list.map((x: any) => ({ quantity: x.quantity, provenance: x.provenance }))), validationStatus: needsHuman(prov) ? "HUMAN_VALIDATION_REQUIRED" : "OK" });
}

/** detectContradiction(a, b, tolerance) -> flags two measurements of the SAME quantity that disagree beyond tolerance. */
function detectContradiction(a: any, b: any, tolerance: any): any {
  if (!isObj(a) || !isObj(b) || a.unit !== b.unit) return Object.freeze({ ok: false, code: "INCOMPARABLE" });
  const tol = typeof tolerance === "number" && tolerance >= 0 ? tolerance : 0;
  const diff = Math.abs(a.quantity - b.quantity);
  return Object.freeze({ ok: true, diff: round6(diff), tolerance: tol, contradictory: diff > tol, note: diff > tol ? "measurements disagree beyond tolerance ⇒ CONTRADICTION (requires human resolution)" : "within tolerance" });
}

// ---- D/integration: turn métré results into devis lines (NO money recompute — the devis engine owns that). ----
/** metreToDevisLines(entries) -> lines for odg-btp-devis-engine.computeDevis. Each entry: { id, label, metier, metre (a result), materialUnitPriceMinor, materialQty?, labourHours?, labourRateMinor? }. */
function metreToDevisLines(entries: any): any {
  const out: any[] = [];
  for (const [i, e] of arr(entries).entries()) {
    const m = e && e.metre;
    if (!isObj(m) || m.ok !== true) return fail("INVALID_METRE", "entry " + i + " has no valid métré result");
    out.push(Object.freeze({
      id: e.id || "L" + (i + 1), label: e.label || null, metier: e.metier || null, unit: m.unit, quantity: m.quantity,
      materialQty: typeof e.materialQty === "number" ? e.materialQty : m.quantity, materialUnitPriceMinor: e.materialUnitPriceMinor,
      labourHours: e.labourHours, labourRateMinor: e.labourRateMinor, equipmentMinor: e.equipmentMinor, transportMinor: e.transportMinor,
      measurementState: m.provenance,     // propagates uncertainty ⇒ an ESTIMATED métré makes the devis non-final (V260 safeguard)
    }));
  }
  return Object.freeze({ ok: true, lines: Object.freeze(out), note: "métré quantities + measurementState feed devis lines; the money (cost→margin→VAT→TTC) stays in odg-btp-devis-engine.computeDevis (no recompute)." });
}

const BTP_METRE_ENGINE_CONTRACT = Object.freeze({
  id: "V262-ODG-BTP-METRE-ENGINE",
  source: "V262 — deterministic BTP quantity-surveying (métré): geometry + strict units + material quantities + provenance + traceability",
  reuses: Object.freeze(["odg-btp-devis-engine.MEASURE_STATE + computeDevis (financial; no recompute)"]),
  units: Object.freeze(Object.keys(UNITS)), measureStates: MEASURE_STATE,
  invariants: Object.freeze([
    "deterministic + fully traced: every result exposes formula + inputs + conversions + deductions + coefficients + warnings; reproducible",
    "strict units: unknown unit ⇒ UNKNOWN_UNIT, cross-dimension ⇒ INCOMPATIBLE_UNITS (never silently interpreted); missing/negative/zero dimension ⇒ fail-closed",
    "provenance kept distinct (MEASURED/HUMAN_VALIDATED/ESTIMATED/ASSUMED); a derived quantity takes the WORST input provenance; ESTIMATED/ASSUMED ⇒ requiresHumanValidation (never silently a measurement)",
    "coefficients + waste + thickness are EXPLICIT inputs with provenance — never invented; a missing coefficient ⇒ MISSING_COEFFICIENT",
    "openings cannot exceed the wall (IMPLAUSIBLE); contradictory measurements are flagged; integration FEEDS computeDevis (no second quotation engine); no new primitive/roadmap",
  ]),
});

module.exports = { UNITS, MEASURE_STATE, convert, rectArea, triangleArea, circleArea, cylinderVolume, slabVolume, foundationVolume, trenchVolume, wallArea, materialQuantity, aggregate, detectContradiction, metreToDevisLines, BTP_METRE_ENGINE_CONTRACT };

export {};
