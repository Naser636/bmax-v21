#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC PRIMITIVES (Stage 3 foundation; prepares Stage 9 Economic/Settlement — FICHE_04 §V4-16).
 *
 * The smallest shared vocabulary for economic quantities, with the concepts the Master keeps DISTINCT
 * (never fused into a naive amount+currency):
 *   - ECONOMIC UNIT: an opaque, declared identifier (e.g. "token", "compute-ms", "verification",
 *     "human-attention-min", "EUR", "USD", "BTC"). NO currency/asset list is hardcoded; units live in an
 *     extensible registry so reference data evolves WITHOUT rewriting the engine (no `if unit === "EUR"`).
 *   - KIND: COST_UNIT (an operational resource consumed) vs ASSET (a financial/monetary asset). An
 *     operational unit is NOT a currency; 1 token is NOT 1 EUR. A conversion between units is a SEPARATE,
 *     explicitly-declared, provenance-bearing act — NOT implied here (no FX engine in this increment).
 *   - QUANTITY: an EXACT value = minor / 10^scale, stored as an INTEGER `minor` + non-negative `scale`.
 *     Never a floating-point number (no float rounding on financial values). Arithmetic is exact and
 *     same-unit only; mixing units throws (no implicit conversion).
 *   - COST MEASUREMENT: a Quantity + BASIS (OBSERVED vs ESTIMATED) + optional provider + provenance. An
 *     ESTIMATED cost is never certified as an OBSERVED (real) cost.
 *   - VALUE COMPONENTS: gross / fees / net kept SEPARATE (net is derived, never overwrites gross).
 *
 * This increment defines PRIMITIVES ONLY. It is NOT Revenue, NOT Settlement, NOT Cash, NOT Profit, NOT a
 * payment provider, NOT an FX system — those are later, contract-gated stages. Pure/deterministic (no
 * clock, no randomness, no I/O). A read-only require.main CLI prints the descriptor.
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
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isInt(v) { return typeof v === "number" && Number.isInteger(v); }
function isNonNegInt(v) { return isInt(v) && v >= 0; }
function isQuantity(q) {
  return isPlainObject(q) && isNonEmptyString(q.unit) && (q.kind === KIND.COST_UNIT || q.kind === KIND.ASSET)
    && isInt(q.minor) && isNonNegInt(q.scale);
}

// ---- Extensible unit registry (data-driven; NO hardcoded currencies) --------------------------
function emptyRegistry() { return Object.freeze({ units: Object.freeze({}) }); }
function declareUnit(registry, id, spec) {
  if (!isNonEmptyString(id)) throw new Error("declareUnit: id required");
  const s = isPlainObject(spec) ? spec : {};
  if (s.kind !== KIND.COST_UNIT && s.kind !== KIND.ASSET) throw new Error("declareUnit: kind ∈ COST_UNIT|ASSET");
  if (!isNonNegInt(s.scale)) throw new Error("declareUnit: scale (non-negative integer) required");
  const units = {};
  const prev = isPlainObject(registry) && isPlainObject(registry.units) ? registry.units : {};
  for (const k of Object.keys(prev)) units[k] = prev[k];
  units[id] = Object.freeze({ kind: s.kind, scale: s.scale, asset: s.asset === undefined ? null : s.asset, label: isNonEmptyString(s.label) ? s.label : id });
  return Object.freeze({ units: Object.freeze(units) });
}
function hasUnit(registry, id) { return isPlainObject(registry) && isPlainObject(registry.units) && Object.prototype.hasOwnProperty.call(registry.units, id); }
function getUnit(registry, id) { return hasUnit(registry, id) ? registry.units[id] : null; }

// ---- Quantity (exact) -------------------------------------------------------------------------
/** quantity(unit, kind, minor, scale) -> frozen exact Quantity (value = minor / 10^scale). */
function quantity(unit, kind, minor, scale) {
  if (!isNonEmptyString(unit)) throw new Error("quantity: unit required");
  if (kind !== KIND.COST_UNIT && kind !== KIND.ASSET) throw new Error("quantity: kind ∈ COST_UNIT|ASSET");
  if (!isInt(minor)) throw new Error("quantity: minor must be an integer (exact; never a float value)");
  if (!isNonNegInt(scale)) throw new Error("quantity: scale must be a non-negative integer");
  return Object.freeze({ unit, kind, minor, scale });
}
function sameUnit(a, b) { return a.unit === b.unit && a.kind === b.kind; }
// Normalize two same-unit quantities to a common scale (exact — integer scaling only).
function align(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return [a.minor * Math.pow(10, scale - a.scale), b.minor * Math.pow(10, scale - b.scale), scale];
}
function requireSameUnit(a, b, op) {
  if (!isQuantity(a) || !isQuantity(b)) throw new Error(`${op}: both operands must be Quantities`);
  if (!sameUnit(a, b)) throw new Error(`${op}: unit mismatch ${a.unit}/${a.kind} vs ${b.unit}/${b.kind} — explicit declared conversion required (no implicit FX)`);
}
function add(a, b) { requireSameUnit(a, b, "add"); const [x, y, scale] = align(a, b); return quantity(a.unit, a.kind, x + y, scale); }
function sub(a, b) { requireSameUnit(a, b, "sub"); const [x, y, scale] = align(a, b); return quantity(a.unit, a.kind, x - y, scale); }
function compare(a, b) { requireSameUnit(a, b, "compare"); const [x, y] = align(a, b); return x < y ? -1 : x > y ? 1 : 0; }
function gte(a, b) { return compare(a, b) >= 0; }
function isZero(q) { return isQuantity(q) && q.minor === 0; }
/** Exact decimal string (never a float). */
function format(q) {
  if (!isQuantity(q)) throw new Error("format: not a Quantity");
  const neg = q.minor < 0; const abs = Math.abs(q.minor).toString();
  if (q.scale === 0) return (neg ? "-" : "") + abs + " " + q.unit;
  const padded = abs.padStart(q.scale + 1, "0");
  const intPart = padded.slice(0, padded.length - q.scale);
  const frac = padded.slice(padded.length - q.scale);
  return (neg ? "-" : "") + intPart + "." + frac + " " + q.unit;
}

// ---- Cost measurement (OBSERVED vs ESTIMATED) -------------------------------------------------
function costMeasurement(q, basis, meta) {
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
function valueComponents(gross, fees) {
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
