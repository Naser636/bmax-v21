#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — PRICE RESOLUTION + EXACT VALUATION (the declared COST_UNIT→ASSET conversion).
 *
 * economic-unit.js keeps operational COST_UNITs (e.g. "token") and ASSET currencies (e.g. "EUR") DISTINCT
 * and states that converting one to the other is "a SEPARATE, explicitly-declared, provenance-bearing act"
 * (economic-unit.js:13-14,90) — deliberately NOT implied by its same-unit arithmetic. THIS module is that
 * act, as a GENERIC, DETERMINISTIC mechanism. It resolves a declared PriceRule and derives an EXACT
 * monetary value from OBSERVED usage. It is the missing link in the economic truth chain:
 *
 *   Observed Evidence → Usage → Normalization → [PRICE RESOLUTION → EXACT VALUATION] → Economic Record → …
 *
 * It composes the existing primitive (economic-unit) and invents NOTHING commercial:
 *   - It declares a PriceRule SHAPE and a versioned, append-only PriceCatalog — but ships ZERO rates. An
 *     empty catalog resolves to PRICE_RULE_MISSING, NEVER to a price of 0. Rate VALUES are external/business
 *     facts supplied by the catalog's author; this engine never fabricates them.
 *   - It is pure/deterministic: no clock, no randomness, no I/O. The temporal "as-of" is an INPUT.
 *
 * MANDATORY SEMANTICS (CTO V5 directive):
 *   - UNKNOWN is never silently 0. Missing/ambiguous/stale rule ⇒ status + value:null, NEVER a 0 value.
 *   - A genuine OBSERVED usage of 0 priced by a known rule ⇒ a genuine DERIVED 0 (0 × rate = exact 0). That
 *     is a real derived zero, not UNKNOWN.
 *   - Missing/invalid usage stays missing (USAGE_UNKNOWN), never priced as 0.
 *   - Multiple equally-applicable rules ⇒ PRICE_RULE_AMBIGUOUS (NO silent specificity preference — choosing
 *     "most specific wins" would be a policy; the catalog author must be unambiguous).
 *   - Rules are versioned; (id,version) is unique (append-only, no silent overwrite).
 *   - Provenance/source are REQUIRED on every rule; effective period (from/to) is explicit.
 *   - Money is EXACT (integer minor / 10^scale); multiplication uses BigInt and refuses to produce a value
 *     that would exceed Number.MAX_SAFE_INTEGER (VALUATION_OVERFLOW) rather than lose precision.
 *   - DERIVED value is tagged DERIVED — it is NOT an OBSERVED cost and is never fed to cost-accounting.spend
 *     (which requires OBSERVED), so derived ≠ observed ≠ billed is preserved.
 *   - Revaluation/replay is possible from recorded (usage + ruleId + ruleVersion): resolveRule(byVersion)
 *     then valueUsage reproduces the identical result.
 *
 * This is NOT Revenue / Invoice / Collection / Cash / Profit / Settlement (later, contract-gated stages).
 * A read-only require.main CLI prints the contract descriptor.
 */

const E = require("./economic-unit");

/** Valuation basis — DERIVED is distinct from economic-unit BASIS (OBSERVED|ESTIMATED): a value computed
 * from observed usage × a declared rule is neither a raw observation nor an estimate. Kept here so no
 * existing semantic (OBSERVED/ESTIMATED) is changed. */
const VALUATION_BASIS = Object.freeze({ DERIVED: "DERIVED" });

const RESOLUTION_STATUS = Object.freeze({
  OK: "OK",
  PRICE_RULE_MISSING: "PRICE_RULE_MISSING",
  PRICE_RULE_AMBIGUOUS: "PRICE_RULE_AMBIGUOUS",
  PRICE_RULE_STALE: "PRICE_RULE_STALE",
});

const VALUATION_STATUS = Object.freeze({
  OK: "OK",
  PRICE_RULE_MISSING: "PRICE_RULE_MISSING",
  PRICE_RULE_AMBIGUOUS: "PRICE_RULE_AMBIGUOUS",
  PRICE_RULE_STALE: "PRICE_RULE_STALE",
  USAGE_UNKNOWN: "USAGE_UNKNOWN",         // observed usage absent/invalid ⇒ not priced (never 0)
  USAGE_UNIT_MISMATCH: "USAGE_UNIT_MISMATCH", // observed unit/kind ≠ the rule's priced unit ⇒ no conversion
  VALUATION_OVERFLOW: "VALUATION_OVERFLOW",   // exact product would exceed safe-integer ⇒ refuse (never a lossy value)
});

const PRICE_RESOLUTION_CONTRACT = Object.freeze({
  id: "V5-ECONOMIC-CORE-PRICE-RESOLUTION",
  source: "FICHE_03 §176 (Total Cost of Verified Resolution); economic-unit.js:13-14,90 (declared COST_UNIT→ASSET conversion)",
  resolutionStatuses: Object.freeze(Object.values(RESOLUTION_STATUS)),
  valuationStatuses: Object.freeze(Object.values(VALUATION_STATUS)),
  valuationBases: Object.freeze(Object.values(VALUATION_BASIS)),
  rules: Object.freeze([
    "ships ZERO rates; empty catalog ⇒ PRICE_RULE_MISSING, never a 0 price",
    "UNKNOWN (missing/ambiguous/stale/usage-unknown/overflow) ⇒ value:null, never 0",
    "observed usage 0 × known rate ⇒ genuine DERIVED 0 (a real derived zero, not UNKNOWN)",
    "multiple equally-applicable rules ⇒ PRICE_RULE_AMBIGUOUS (no silent specificity preference)",
    "(id,version) unique; append-only catalog; no silent overwrite",
    "provenance + source REQUIRED; effective from/to explicit; as-of is an input (deterministic)",
    "money EXACT (integer minor/10^scale); BigInt multiply; refuse overflow (never lossy/float)",
    "DERIVED ≠ OBSERVED ≠ ESTIMATED ≠ BILLED (DERIVED never spent via cost-accounting)",
    "replayable: (usage + ruleId + ruleVersion) reproduces the identical value",
    "pure / deterministic (no clock, randomness or I/O)",
  ]),
});

// ---- Type guards (shared house style) ---------------------------------------------------------
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isInt(v) { return typeof v === "number" && Number.isInteger(v); }
function isNonNegInt(v) { return isInt(v) && v >= 0; }
/** A dimension matcher field is a concrete non-empty string, or null/undefined (= wildcard "any"). */
function isMatcher(v) { return v === null || v === undefined || isNonEmptyString(v); }
/** An effective-period bound is a comparable non-empty string (e.g. ISO date), or null/undefined (open). */
function isBound(v) { return v === null || v === undefined || isNonEmptyString(v); }

// ---- PriceRule --------------------------------------------------------------------------------
/**
 * priceRule(spec) -> a frozen, validated declared conversion from a COST_UNIT to an ASSET currency.
 * value(currency) = usage(usageUnit) × rate, where rate = rateMinor / 10^rateScale (currency per 1 usage unit).
 * Throws on a malformed rule — a price rule must be fully specified, provenance-bearing, and exact.
 */
function priceRule(spec) {
  const s = isPlainObject(spec) ? spec : {};
  if (!isNonEmptyString(s.id)) throw new Error("priceRule: id required");
  if (!isInt(s.version) || s.version < 1) throw new Error("priceRule: version (integer >= 1) required");
  if (!isMatcher(s.provider)) throw new Error("priceRule: provider must be a non-empty string or null (wildcard)");
  if (!isMatcher(s.model)) throw new Error("priceRule: model must be a non-empty string or null (wildcard)");
  if (!isNonEmptyString(s.usageUnit)) throw new Error("priceRule: usageUnit required (the COST_UNIT being priced)");
  const usageKind = s.usageKind === undefined ? E.KIND.COST_UNIT : s.usageKind;
  if (usageKind !== E.KIND.COST_UNIT) throw new Error("priceRule: usageKind must be COST_UNIT (only operational usage is priced)");
  if (!isNonEmptyString(s.currency)) throw new Error("priceRule: currency required (the ASSET the price is denominated in)");
  if (!isInt(s.rateMinor) || s.rateMinor < 0) throw new Error("priceRule: rateMinor (non-negative integer) required — exact, never a float");
  if (!isNonNegInt(s.rateScale)) throw new Error("priceRule: rateScale (non-negative integer) required");
  if (!isBound(s.effectiveFrom)) throw new Error("priceRule: effectiveFrom must be a comparable string or null");
  if (!isBound(s.effectiveTo)) throw new Error("priceRule: effectiveTo must be a comparable string or null");
  if (!isNonEmptyString(s.provenance)) throw new Error("priceRule: provenance required (no anonymous rate) ");
  return Object.freeze({
    id: s.id,
    version: s.version,
    provider: s.provider === undefined ? null : s.provider,
    model: s.model === undefined ? null : s.model,
    usageUnit: s.usageUnit,
    usageKind,
    currency: s.currency,
    rateMinor: s.rateMinor,
    rateScale: s.rateScale,
    effectiveFrom: s.effectiveFrom === undefined ? null : s.effectiveFrom,
    effectiveTo: s.effectiveTo === undefined ? null : s.effectiveTo,
    provenance: s.provenance,
    source: s.source === undefined ? null : s.source,
  });
}

// ---- PriceCatalog (versioned, append-only, immutable; ships NO rates) --------------------------
function emptyCatalog() { return Object.freeze({ rules: Object.freeze([]) }); }

/** declarePrice(catalog, ruleOrSpec) -> a NEW frozen catalog with the rule appended. (id,version) must be
 * unique (append-only; no silent overwrite). Accepts a spec (validated via priceRule) or a built rule. */
function declarePrice(catalog, ruleOrSpec) {
  const prev = isPlainObject(catalog) && Array.isArray(catalog.rules) ? catalog.rules : [];
  const rule = Object.isFrozen(ruleOrSpec) && isNonEmptyString(ruleOrSpec && ruleOrSpec.id) && isInt(ruleOrSpec.version)
    ? ruleOrSpec
    : priceRule(ruleOrSpec);
  if (prev.some((r) => r.id === rule.id && r.version === rule.version)) {
    throw new Error(`declarePrice: (id=${rule.id}, version=${rule.version}) already declared — catalog is append-only (no overwrite)`);
  }
  return Object.freeze({ rules: Object.freeze(prev.concat([rule])) });
}

/** findRule(catalog, id, version) -> the exact declared rule (for replay by recorded version), or null. */
function findRule(catalog, id, version) {
  const rules = isPlainObject(catalog) && Array.isArray(catalog.rules) ? catalog.rules : [];
  return rules.find((r) => r.id === id && r.version === version) || null;
}

// A rule MATCHES a query on dimensions when each concrete (non-null) rule field equals the query's, and a
// null rule field is a wildcard. The usage unit/kind the rule prices MUST equal what the query asks to price.
function dimensionMatch(rule, query) {
  if (rule.usageUnit !== query.usageUnit) return false;
  if (rule.usageKind !== (query.usageKind === undefined ? E.KIND.COST_UNIT : query.usageKind)) return false;
  if (rule.provider !== null && rule.provider !== (query.provider === undefined ? null : query.provider)) return false;
  if (rule.model !== null && rule.model !== (query.model === undefined ? null : query.model)) return false;
  return true;
}

// A rule is in effect at `asOf` (a comparable string) when asOf ∈ [effectiveFrom, effectiveTo] (null = open).
// asOf null/absent ⇒ no temporal filter (period ignored).
function inEffect(rule, asOf) {
  if (!isNonEmptyString(asOf)) return true;
  if (rule.effectiveFrom !== null && asOf < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && asOf > rule.effectiveTo) return false;
  return true;
}

/**
 * resolvePrice(catalog, query) -> { status, rule?|candidates? }.
 *   query: { provider?, model?, usageUnit, usageKind?, asOf? }
 *   - OK                   exactly one applicable rule.
 *   - PRICE_RULE_MISSING   no rule matches the dimensions at all.
 *   - PRICE_RULE_AMBIGUOUS more than one equally-applicable rule (caller must disambiguate the catalog).
 *   - PRICE_RULE_STALE     rule(s) match the dimensions but none is in effect at asOf (and asOf was given).
 * Deterministic. No specificity preference is applied (that would be a policy).
 */
function resolvePrice(catalog, query) {
  const q = isPlainObject(query) ? query : {};
  if (!isNonEmptyString(q.usageUnit)) throw new Error("resolvePrice: query.usageUnit required");
  const rules = isPlainObject(catalog) && Array.isArray(catalog.rules) ? catalog.rules : [];
  const dimMatches = rules.filter((r) => dimensionMatch(r, q));
  if (dimMatches.length === 0) {
    return Object.freeze({ status: RESOLUTION_STATUS.PRICE_RULE_MISSING, rule: null });
  }
  const applicable = dimMatches.filter((r) => inEffect(r, q.asOf));
  if (applicable.length === 0) {
    // There ARE rules for this dimension, but none is effective at the given as-of.
    return Object.freeze({ status: RESOLUTION_STATUS.PRICE_RULE_STALE, rule: null, candidates: Object.freeze(dimMatches.map((r) => `${r.id}@v${r.version}`)) });
  }
  if (applicable.length > 1) {
    return Object.freeze({ status: RESOLUTION_STATUS.PRICE_RULE_AMBIGUOUS, rule: null, candidates: Object.freeze(applicable.map((r) => `${r.id}@v${r.version}`)) });
  }
  return Object.freeze({ status: RESOLUTION_STATUS.OK, rule: applicable[0] });
}

// Exact product of two integers via BigInt; null when the magnitude would exceed Number.MAX_SAFE_INTEGER.
function safeMulExact(a, b) {
  const p = BigInt(a) * BigInt(b);
  const lim = BigInt(Number.MAX_SAFE_INTEGER);
  if (p > lim || p < -lim) return null;
  return Number(p);
}

/**
 * valueUsage(observed, resolution) -> a frozen, replayable valuation result:
 *   { status, basis, value|null, usage|null, rule|null, candidates?, explain }
 * `observed` is an economic Quantity (the OBSERVED usage, from provider-port/economic-unit).
 * `resolution` is the output of resolvePrice. value is a DERIVED ASSET Quantity in the rule's currency;
 * null for every non-OK status (UNKNOWN is never 0). A genuine observed 0 yields a genuine DERIVED 0.
 */
function valueUsage(observed, resolution) {
  const res = isPlainObject(resolution) ? resolution : { status: RESOLUTION_STATUS.PRICE_RULE_MISSING };

  // Usage must be a real observed quantity; absent/invalid usage is never priced (stays UNKNOWN, not 0).
  if (!E.isQuantity(observed)) {
    return frozenResult(VALUATION_STATUS.USAGE_UNKNOWN, null, null, null, res.candidates, "usage absent/invalid ⇒ not priced (UNKNOWN, never 0)");
  }
  // A non-OK resolution propagates verbatim; value stays null (never a fabricated 0).
  if (res.status !== RESOLUTION_STATUS.OK || !isPlainObject(res.rule)) {
    return frozenResult(res.status, null, null, observed, res.candidates,
      `no single applicable price rule (${res.status}) ⇒ valuation UNKNOWN, never 0`);
  }
  const rule = res.rule;
  // The observed unit/kind must be exactly what the rule prices (no implicit conversion).
  if (observed.unit !== rule.usageUnit || observed.kind !== rule.usageKind) {
    return frozenResult(VALUATION_STATUS.USAGE_UNIT_MISMATCH, null, ruleRef(rule), observed, undefined,
      `observed ${observed.unit}/${observed.kind} ≠ rule prices ${rule.usageUnit}/${rule.usageKind} — no conversion`);
  }
  // EXACT money: value = usage × rate. minor = observed.minor × rateMinor; scale = observed.scale + rateScale.
  const minor = safeMulExact(observed.minor, rule.rateMinor);
  if (minor === null) {
    return frozenResult(VALUATION_STATUS.VALUATION_OVERFLOW, null, ruleRef(rule), observed, undefined,
      "exact value exceeds Number.MAX_SAFE_INTEGER ⇒ refused (never a lossy/float value)");
  }
  const value = E.quantity(rule.currency, E.KIND.ASSET, minor, observed.scale + rule.rateScale);
  const explain =
    `DERIVED ${E.format(value)} = ${E.format(observed)} × ${rule.rateMinor}/10^${rule.rateScale} ${rule.currency}/${rule.usageUnit} ` +
    `[rule ${rule.id}@v${rule.version}, provenance=${rule.provenance}]`;
  return frozenResult(VALUATION_STATUS.OK, VALUATION_BASIS.DERIVED, ruleRef(rule), observed, undefined, explain, value);
}

function ruleRef(rule) {
  return Object.freeze({
    id: rule.id, version: rule.version, provider: rule.provider, model: rule.model,
    usageUnit: rule.usageUnit, currency: rule.currency, rateMinor: rule.rateMinor, rateScale: rule.rateScale,
    provenance: rule.provenance, source: rule.source,
  });
}

function frozenResult(status, basis, rule, usage, candidates, explain, value) {
  const out = {
    status,
    basis: basis === undefined ? null : basis,
    value: value === undefined ? null : value,
    usage: usage || null,
    rule: rule || null,
    explain: explain || "",
  };
  if (Array.isArray(candidates)) out.candidates = Object.freeze([...candidates]);
  return Object.freeze(out);
}

/**
 * valueFromCatalog(catalog, query, observed) -> resolvePrice + valueUsage in one deterministic call. This
 * is the replay/revaluation entry point: given the recorded usage and the catalog (at a rule version), it
 * reproduces the identical valuation. To replay a specific recorded rule version, pass a query that targets
 * it (the catalog is append-only, so old versions remain resolvable via their effective period / findRule).
 */
function valueFromCatalog(catalog, query, observed) {
  return valueUsage(observed, resolvePrice(catalog, query));
}

/** explainValuation(result) -> the deterministic human-readable derivation string. */
function explainValuation(result) {
  return isPlainObject(result) && isNonEmptyString(result.explain) ? result.explain : "";
}

module.exports = {
  PRICE_RESOLUTION_CONTRACT, RESOLUTION_STATUS, VALUATION_STATUS, VALUATION_BASIS,
  priceRule, emptyCatalog, declarePrice, findRule,
  resolvePrice, valueUsage, valueFromCatalog, explainValuation,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(PRICE_RESOLUTION_CONTRACT, null, 2) + "\n");
}
