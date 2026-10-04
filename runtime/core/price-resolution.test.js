#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — PRICE RESOLUTION + EXACT VALUATION regression.
 *
 * Proves the generic, deterministic price-resolution mechanism WITHOUT any invented rate, and locks the
 * mandatory economic semantics: UNKNOWN ≠ 0, genuine observed 0 ⇒ genuine DERIVED 0, missing usage stays
 * missing, ambiguous/stale rules are explicit, money is exact (no float), (id,version) is append-only, and
 * valuation is replayable/deterministic. Picked up by `npm test` (runtime/core/*.test.js glob).
 *
 * Run directly: node runtime/core/price-resolution.test.js
 */

const E = require("./economic-unit");
const P = require("./price-resolution");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("V5 ECONOMIC CORE — PRICE RESOLUTION + EXACT VALUATION");

const tokens = (minor, scale = 0) => E.quantity("token", E.KIND.COST_UNIT, minor, scale);
// A declared rate: `rateMinor / 10^rateScale` currency per 1 token. VALUES here are TEST fixtures, not real
// commercial rates (the engine ships none).
const usdPerToken = (rateMinor, rateScale, extra = {}) => P.priceRule({
  id: "openai-token-usd", version: 1, provider: "openai", model: "gpt-4o-mini",
  usageUnit: "token", currency: "USD", rateMinor, rateScale, provenance: "test-fixture", ...extra,
});

// 1 — EMPTY catalog ⇒ MISSING; valuation UNKNOWN (never 0).
{
  const cat = P.emptyCatalog();
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  check(r.status === "PRICE_RULE_MISSING" && r.rule === null, "1. empty catalog ⇒ PRICE_RULE_MISSING");
  const v = P.valueUsage(tokens(420), r);
  check(v.status === "PRICE_RULE_MISSING" && v.value === null, "1b. missing rule ⇒ value null (UNKNOWN never 0)");
}

// 2 — One rule ⇒ OK ⇒ EXACT DERIVED value.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6)); // 0.000001 USD / token
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  check(r.status === "OK" && r.rule.id === "openai-token-usd", "2. one applicable rule ⇒ OK");
  const v = P.valueUsage(tokens(420), r);
  check(v.status === "OK" && v.basis === "DERIVED", "2b. OK ⇒ basis DERIVED");
  check(v.value.unit === "USD" && v.value.kind === E.KIND.ASSET && v.value.minor === 420 && v.value.scale === 6, "2c. exact value 420 × 1e-6 = 0.000420 USD (minor 420, scale 6)");
  check(E.format(v.value) === "0.000420 USD", "2d. exact decimal format 0.000420 USD");
  check(/DERIVED 0\.000420 USD = 420 token/.test(P.explainValuation(v)), "2e. explain is a deterministic derivation string");
}

// 3 — GENUINE observed 0 usage + known rule ⇒ genuine DERIVED 0 (NOT unknown).
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(5, 6));
  const v = P.valueFromCatalog(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" }, tokens(0));
  check(v.status === "OK" && v.basis === "DERIVED" && v.value.minor === 0, "3. observed 0 × known rate ⇒ DERIVED 0 (a real derived zero)");
  check(E.isZero(v.value) && v.value.unit === "USD", "3b. derived zero is an exact 0 USD value, not null/UNKNOWN");
}

// 4 — MISSING/invalid usage ⇒ USAGE_UNKNOWN, never priced as 0.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6));
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  check(P.valueUsage(null, r).status === "USAGE_UNKNOWN", "4. null usage ⇒ USAGE_UNKNOWN");
  check(P.valueUsage(null, r).value === null, "4b. usage unknown ⇒ value null (never 0)");
  check(P.valueUsage({ unit: "token", kind: "COST_UNIT", minor: 1.5, scale: 0 }, r).status === "USAGE_UNKNOWN", "4c. non-integer usage ⇒ USAGE_UNKNOWN (not a valid Quantity)");
}

// 5 — AMBIGUOUS: two equally-applicable rules ⇒ explicit, value null (no silent specificity preference).
{
  let cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6));
  cat = P.declarePrice(cat, P.priceRule({ id: "any-provider-token-usd", version: 1, provider: null, model: null, usageUnit: "token", currency: "USD", rateMinor: 2, rateScale: 6, provenance: "test-fixture" }));
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  check(r.status === "PRICE_RULE_AMBIGUOUS" && r.candidates.length === 2, "5. specific + wildcard both apply ⇒ PRICE_RULE_AMBIGUOUS (2 candidates)");
  const v = P.valueUsage(tokens(100), r);
  check(v.status === "PRICE_RULE_AMBIGUOUS" && v.value === null, "5b. ambiguous ⇒ value null (no fabricated pick)");
}

// 6 — STALE: dimension matches but none in effect at asOf (and without asOf ⇒ OK).
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6, { effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }));
  const stale = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token", asOf: "2026-06-01" });
  check(stale.status === "PRICE_RULE_STALE" && stale.rule === null, "6. as-of after effectiveTo ⇒ PRICE_RULE_STALE");
  check(P.valueUsage(tokens(10), stale).value === null, "6b. stale ⇒ value null (never 0)");
  const inWindow = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token", asOf: "2025-06-01" });
  check(inWindow.status === "OK", "6c. as-of inside the effective window ⇒ OK");
  const noAsOf = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  check(noAsOf.status === "OK", "6d. no as-of ⇒ no temporal filter ⇒ OK");
}

// 7 — USAGE_UNIT_MISMATCH: observed unit ≠ the priced unit ⇒ no conversion.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6));
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  const computeMs = E.quantity("compute-ms", E.KIND.COST_UNIT, 500, 0);
  const v = P.valueUsage(computeMs, r);
  check(v.status === "USAGE_UNIT_MISMATCH" && v.value === null, "7. observed compute-ms vs token rule ⇒ USAGE_UNIT_MISMATCH (no conversion, value null)");
}

// 8 — EXACTNESS / NO FLOAT: a value that float arithmetic would lose.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(7, 9)); // 0.000000007 USD/token
  const v = P.valueFromCatalog(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" }, tokens(333333));
  check(Number.isInteger(v.value.minor) && v.value.minor === 2333331 && v.value.scale === 9, "8. 333333 × 7 = 2333331 exact (integer minor, scale 9) — no float");
}

// 9 — OVERFLOW guard: an exact product beyond MAX_SAFE_INTEGER is refused, never a lossy value.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(2000000, 0));
  const v = P.valueFromCatalog(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" }, tokens(9000000000));
  check(v.status === "VALUATION_OVERFLOW" && v.value === null, "9. 9e9 × 2e6 > MAX_SAFE_INTEGER ⇒ VALUATION_OVERFLOW (never lossy)");
}

// 10 — APPEND-ONLY: re-declaring the same (id,version) throws; a new version is fine.
{
  let threw = false;
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6));
  try { P.declarePrice(cat, usdPerToken(2, 6)); } catch { threw = true; }
  check(threw, "10. duplicate (id,version) ⇒ throws (catalog append-only, no overwrite)");
  const cat2 = P.declarePrice(cat, usdPerToken(2, 6, { version: 2 }));
  check(cat2.rules.length === 2 && P.findRule(cat2, "openai-token-usd", 2).rateMinor === 2, "10b. a new version is appended and findable by version");
}

// 11 — VERSIONING + REPLAY/DETERMINISM: same (usage, catalog, query) reproduces the identical result.
{
  let cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6, { version: 1, effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }));
  cat = P.declarePrice(cat, usdPerToken(3, 6, { version: 2, effectiveFrom: "2026-01-01", effectiveTo: null }));
  const q2026 = { provider: "openai", model: "gpt-4o-mini", usageUnit: "token", asOf: "2026-06-01" };
  const a = P.valueFromCatalog(cat, q2026, tokens(1000));
  const b = P.valueFromCatalog(cat, q2026, tokens(1000));
  check(a.rule.version === 2 && a.value.minor === 3000, "11. as-of 2026 resolves rule v2 ⇒ 1000 × 3e-6 = 0.003000 USD");
  check(JSON.stringify(a) === JSON.stringify(b), "11b. deterministic: two valuations of identical inputs are identical (replayable)");
  const q2025 = { provider: "openai", model: "gpt-4o-mini", usageUnit: "token", asOf: "2025-06-01" };
  check(P.valueFromCatalog(cat, q2025, tokens(1000)).rule.version === 1, "11c. as-of 2025 replays rule v1 (version-correct revaluation)");
}

// 12 — PROVENANCE/VERSION/RATE validation: a malformed rule is refused (no anonymous or lossy rate).
{
  const bad = (spec, label) => { let t = false; try { P.priceRule(spec); } catch { t = true; } check(t, label); };
  const base = { id: "r", version: 1, usageUnit: "token", currency: "USD", rateMinor: 1, rateScale: 6, provenance: "p" };
  bad({ ...base, provenance: undefined }, "12. rule without provenance ⇒ rejected (no anonymous rate)");
  bad({ ...base, version: 0 }, "12b. rule without a valid version ⇒ rejected");
  bad({ ...base, rateMinor: -1 }, "12c. negative rate ⇒ rejected");
  bad({ ...base, rateMinor: 1.5 }, "12d. non-integer rate ⇒ rejected (exact, never a float)");
  bad({ ...base, currency: undefined }, "12e. rule without currency ⇒ rejected");
}

// 13 — NO FALSE ECONOMIC SUCCESS: every non-OK valuation status carries value === null.
{
  const cat = P.declarePrice(P.emptyCatalog(), usdPerToken(1, 6));
  const r = P.resolvePrice(cat, { provider: "openai", model: "gpt-4o-mini", usageUnit: "token" });
  const nonOk = [
    P.valueUsage(null, r),                                   // USAGE_UNKNOWN
    P.valueUsage(tokens(1), { status: "PRICE_RULE_MISSING", rule: null }),
    P.valueUsage(tokens(1), { status: "PRICE_RULE_AMBIGUOUS", rule: null }),
    P.valueUsage(tokens(1), { status: "PRICE_RULE_STALE", rule: null }),
  ];
  check(nonOk.every((x) => x.status !== "OK" && x.value === null && x.basis === null), "13. every non-OK status ⇒ value null + basis null (no false economic success)");
}

console.log(failures === 0 ? "ALL PASS — V5 ECONOMIC CORE PRICE RESOLUTION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
