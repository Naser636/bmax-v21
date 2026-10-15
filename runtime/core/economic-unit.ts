#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC PRIMITIVES (TypeScript port; parity with runtime/core/economic-unit.js).
 *
 * Pure/deterministic value-object library (no clock, no randomness, no I/O). PRIMITIVES ONLY — NOT
 * Revenue/Settlement/Cash/Profit, NOT a payment provider, NOT an FX engine (this is NOT the frozen
 * finance connector/ledger/accounting perimeter). Strict port: all exports (KIND, BASIS,
 * ECONOMIC_CONTRACT, emptyRegistry, declareUnit, hasUnit, getUnit, quantity, isQuantity, add, sub,
 * compare, gte, isZero, format, costMeasurement, valueComponents), the frozen constants, the exact
 * integer minor/scale arithmetic, same-unit enforcement (throws on mismatch), the error messages and
 * the read-only require.main descriptor are preserved EXACTLY. The historical .js remains the reference.
 */

const KIND = Object.freeze({ COST_UNIT: "COST_UNIT", ASSET: "ASSET" });
const BASIS = Object.freeze({ OBSERVED: "OBSERVED", ESTIMATED: "ESTIMATED" });

const ECONOMIC_CONTRACT = Object.freeze({
  id: "V5-ECONOMIC-PRIMITIVES",
  source: "FICHE_03 §176 (Total Cost of Verified Resolution); FICHE_04 §V4-16 (Economic/Settlement Contract)",
  kinds: Object.freeze(Object.values(KIND)),
  bases: Object.freeze(Object.values(BASIS)),
  rules: Object.freeze([
    "economic unit = opaque declared id; NO hardcoded currency/asset list; extensible registry",
    "value is EXACT integer minor / 10^scale — never a floating-point number",
    "arithmetic is same-unit only; mixing units throws (conversion is a separate, declared, provenance-bearing act)",
    "COST_UNIT (operational) is not an ASSET (currency); 1 operational unit is not 1 currency unit",
    "cost BASIS OBSERVED vs ESTIMATED kept distinct (an estimate is never a real cost)",
    "gross / fees / net kept separate; net derived, never overwrites gross",
    "COST ≠ BUDGET ≠ REVENUE ≠ CASH ≠ PROFIT ≠ SETTLEMENT (primitives only; not those stages)",
    "deterministic / pure",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v); }
function isNonNegInt(v: any): boolean { return isInt(v) && v >= 0; }
function isQuantity(q: any): boolean {
  return isPlainObject(q) && isNonEmptyString(q.unit) && (q.kind === KIND.COST_UNIT || q.kind === KIND.ASSET)
    && isInt(q.minor) && isNonNegInt(q.scale);
}

// ---- Extensible unit registry (data-driven; NO hardcoded currencies) --------------------------
function emptyRegistry(): any { return Object.freeze({ units: Object.freeze({}) }); }
function declareUnit(registry: any, id: any, spec: any): any {
  if (!isNonEmptyString(id)) throw new Error("declareUnit: id required");
  const s = isPlainObject(spec) ? spec : {};
  if (s.kind !== KIND.COST_UNIT && s.kind !== KIND.ASSET) throw new Error("declareUnit: kind ∈ COST_UNIT|ASSET");
  if (!isNonNegInt(s.scale)) throw new Error("declareUnit: scale (non-negative integer) required");
  const units: any = {};
  const prev = isPlainObject(registry) && isPlainObject(registry.units) ? registry.units : {};
  for (const k of Object.keys(prev)) units[k] = prev[k];
  units[id] = Object.freeze({ kind: s.kind, scale: s.scale, asset: s.asset === undefined ? null : s.asset, label: isNonEmptyString(s.label) ? s.label : id });
  return Object.freeze({ units: Object.freeze(units) });
}
function hasUnit(registry: any, id: any): boolean { return isPlainObject(registry) && isPlainObject(registry.units) && Object.prototype.hasOwnProperty.call(registry.units, id); }
function getUnit(registry: any, id: any): any { return hasUnit(registry, id) ? registry.units[id] : null; }

// ---- Quantity (exact) -------------------------------------------------------------------------
/** quantity(unit, kind, minor, scale) -> frozen exact Quantity (value = minor / 10^scale). */
function quantity(unit: any, kind: any, minor: any, scale: any): any {
  if (!isNonEmptyString(unit)) throw new Error("quantity: unit required");
  if (kind !== KIND.COST_UNIT && kind !== KIND.ASSET) throw new Error("quantity: kind ∈ COST_UNIT|ASSET");
  if (!isInt(minor)) throw new Error("quantity: minor must be an integer (exact; never a float value)");
  if (!isNonNegInt(scale)) throw new Error("quantity: scale must be a non-negative integer");
  return Object.freeze({ unit, kind, minor, scale });
}
function sameUnit(a: any, b: any): boolean { return a.unit === b.unit && a.kind === b.kind; }
// Normalize two same-unit quantities to a common scale (exact — integer scaling only).
function align(a: any, b: any): any {
  const scale = Math.max(a.scale, b.scale);
  return [a.minor * Math.pow(10, scale - a.scale), b.minor * Math.pow(10, scale - b.scale), scale];
}
function requireSameUnit(a: any, b: any, op: any): void {
  if (!isQuantity(a) || !isQuantity(b)) throw new Error(`${op}: both operands must be Quantities`);
  if (!sameUnit(a, b)) throw new Error(`${op}: unit mismatch ${a.unit}/${a.kind} vs ${b.unit}/${b.kind} — explicit declared conversion required (no implicit FX)`);
}
function add(a: any, b: any): any { requireSameUnit(a, b, "add"); const [x, y, scale] = align(a, b); return quantity(a.unit, a.kind, x + y, scale); }
function sub(a: any, b: any): any { requireSameUnit(a, b, "sub"); const [x, y, scale] = align(a, b); return quantity(a.unit, a.kind, x - y, scale); }
function compare(a: any, b: any): number { requireSameUnit(a, b, "compare"); const [x, y] = align(a, b); return x < y ? -1 : x > y ? 1 : 0; }
function gte(a: any, b: any): boolean { return compare(a, b) >= 0; }
function isZero(q: any): boolean { return isQuantity(q) && q.minor === 0; }
/** Exact decimal string (never a float). */
function format(q: any): string {
  if (!isQuantity(q)) throw new Error("format: not a Quantity");
  const neg = q.minor < 0; const abs = Math.abs(q.minor).toString();
  if (q.scale === 0) return (neg ? "-" : "") + abs + " " + q.unit;
  const padded = abs.padStart(q.scale + 1, "0");
  const intPart = padded.slice(0, padded.length - q.scale);
  const frac = padded.slice(padded.length - q.scale);
  return (neg ? "-" : "") + intPart + "." + frac + " " + q.unit;
}

// ---- Cost measurement (OBSERVED vs ESTIMATED) -------------------------------------------------
function costMeasurement(q: any, basis: any, meta: any): any {
  if (!isQuantity(q)) throw new Error("costMeasurement: quantity required");
  if (basis !== BASIS.OBSERVED && basis !== BASIS.ESTIMATED) throw new Error("costMeasurement: basis ∈ OBSERVED|ESTIMATED");
  const m = isPlainObject(meta) ? meta : {};
  return Object.freeze({
    quantity: q, basis,
    provider: isNonEmptyString(m.provider) ? m.provider : null,
    provenance: m.provenance === undefined ? null : m.provenance,
    calculationBasis: isNonEmptyString(m.calculationBasis) ? m.calculationBasis : null,
  });
}

// ---- Value components: gross / fees / net kept SEPARATE (net derived, never overwrites gross) --
function valueComponents(gross: any, fees: any): any {
  if (!isQuantity(gross)) throw new Error("valueComponents: gross Quantity required");
  const feeList = Array.isArray(fees) ? fees : [];
  let net = gross;
  for (const f of feeList) net = sub(net, f); // exact; same-unit enforced by sub()
  return Object.freeze({ gross, fees: Object.freeze([...feeList]), net });
}

module.exports = {
  KIND, BASIS, ECONOMIC_CONTRACT,
  emptyRegistry, declareUnit, hasUnit, getUnit,
  quantity, isQuantity, add, sub, compare, gte, isZero, format,
  costMeasurement, valueComponents,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ECONOMIC_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so the shared helper names
// (isPlainObject, isInt, …) are module-scoped, not global script scope (prevents cross-lot TS2393).
export {};
