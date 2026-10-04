#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — ECONOMIC VERIFICATION. Proves the independent economic verdict on FACTS produced by the
 * REAL live-cost-metering + price-resolution engines (no mocks): pipeline success ≠ economic success.
 *   - a clean SPENT run with provenanced OBSERVED usage + a well-formed DERIVED valuation ⇒ VERIFIED;
 *   - a missing / stale price, or NOT_OBSERVED usage ⇒ INCOMPLETE (honest GAP, never a fabricated value);
 *   - a broken ledger, a spend with no observation, missing provenance, an ambiguous / unit-mismatched /
 *     overflowed / inconsistent valuation ⇒ FAILED (no false economic success);
 *   - no economic facts ⇒ UNKNOWN (deny-by-default).
 * Deterministic / pure. Run directly: node runtime/core/economic-verification.test.js
 */
const V = require("./economic-verification");
const M = require("./live-cost-metering");
const P = require("./price-resolution");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const validSpec = (amount = 1000) => ({ budget: { allocations: [{ bucket: "provider", unit: "token", kind: "COST_UNIT", amount, scale: 0 }] } });
function outcome(classification, tokens, unit = "token", provenance = "fake:usage") {
  const observation = tokens == null
    ? { basis: "ABSENT", quantities: [], provenance: null }
    : { basis: "OBSERVED", quantities: [{ unit, kind: "COST_UNIT", minor: tokens, scale: 0 }], provenance };
  return { provider: "fake", classification, observation };
}
const exec = (cls, tokens, unit, prov) => () => outcome(cls, tokens, unit, prov);

const okCatalog = P.declarePrice(P.emptyCatalog(), { id: "tok", version: 1, usageUnit: "token", currency: "EUR", rateMinor: 2, rateScale: 6, provenance: "test:catalog" });

console.log("V5 — ECONOMIC VERIFICATION");

// 1 — clean SPENT run, provenanced OBSERVED usage, well-formed DERIVED valuation ⇒ VERIFIED.
{
  const o = outcome("OK", 300);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: okCatalog, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "VERIFIED", "provenanced observed usage + conserved ledger + DERIVED valuation ⇒ VERIFIED");
  check(r.proofs.includes("LEDGER_CONSERVED") && r.proofs.includes("OBSERVED_WITH_PROVENANCE") && r.proofs.includes("DERIVED_VALUATION_OK"), "all three positive proofs present");
  check(r.violations.length === 0 && r.gaps.length === 0, "no violations, no gaps");
}

// 2 — missing price (no rule) ⇒ INCOMPLETE gap, value stays null (never fabricated).
{
  const cat = P.declarePrice(P.emptyCatalog(), { id: "cpu", version: 1, usageUnit: "compute-ms", currency: "EUR", rateMinor: 5, rateScale: 3, provenance: "t" });
  const o = outcome("OK", 300);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: cat, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "INCOMPLETE" && r.gaps.includes("MISSING_PRICE"), "missing price ⇒ INCOMPLETE (MISSING_PRICE gap)");
  check(r.violations.length === 0, "a missing price is NOT a violation (honest UNKNOWN)");
}

// 3 — stale price (as-of outside effective period) ⇒ INCOMPLETE gap.
{
  const cat = P.declarePrice(P.emptyCatalog(), { id: "tok", version: 1, usageUnit: "token", currency: "EUR", rateMinor: 2, rateScale: 6, effectiveFrom: "2020-01-01", effectiveTo: "2020-12-31", provenance: "t" });
  const o = outcome("OK", 300);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: cat, priceQuery: { asOf: "2026-01-01" }, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "INCOMPLETE" && r.gaps.includes("STALE_PRICE"), "stale price ⇒ INCOMPLETE (STALE_PRICE gap)");
}

// 4 — NOT_OBSERVED usage (absent) ⇒ INCOMPLETE gap (never a fabricated 0).
{
  const o = outcome("OK", null);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: okCatalog, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "INCOMPLETE" && r.gaps.includes("NOT_OBSERVED"), "absent usage ⇒ INCOMPLETE (NOT_OBSERVED gap)");
  check(r.violations.length === 0, "absent usage is a gap, not a violation");
}

// 5 — ambiguous price ⇒ FAILED (catalog defect: equal-priority rules).
{
  let cat = P.declarePrice(P.emptyCatalog(), { id: "a", version: 1, usageUnit: "token", currency: "EUR", rateMinor: 2, rateScale: 6, provenance: "t" });
  cat = P.declarePrice(cat, { id: "b", version: 1, usageUnit: "token", currency: "EUR", rateMinor: 3, rateScale: 6, provenance: "t" });
  const o = outcome("OK", 300);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: cat, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "FAILED" && r.violations.includes("AMBIGUOUS_PRICE"), "ambiguous price ⇒ FAILED (AMBIGUOUS_PRICE violation)");
}

// 6 — missing provenance on a genuine OBSERVED observation ⇒ FAILED.
{
  const o = outcome("OK", 300, "token", null); // OBSERVED but provenance null
  // Force an OBSERVED basis with a null provenance (the metering path keeps the observation verbatim).
  o.observation = { basis: "OBSERVED", quantities: [{ unit: "token", kind: "COST_UNIT", minor: 300, scale: 0 }], provenance: null };
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: okCatalog, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "FAILED" && r.violations.includes("MISSING_PROVENANCE"), "OBSERVED usage without provenance ⇒ FAILED");
}

// 7 — ledger imbalance (fabricated snapshot) ⇒ FAILED.
{
  const metering = { spent: false, observed: null, snapshot: { total: 1000, available: 800, reserved: 0, committed: 0, spent: 100 }, valuation: null };
  const r = V.verifyEconomics({ metering });
  check(r.verdict === "FAILED" && r.violations.includes("LEDGER_IMBALANCE"), "total ≠ sum of parts ⇒ FAILED (LEDGER_IMBALANCE)");
}

// 8 — spend recorded with no observation behind it ⇒ FAILED (fabricated spend).
{
  const metering = { spent: true, observed: null, snapshot: { total: 1000, available: 700, reserved: 0, committed: 0, spent: 300 }, valuation: null };
  const r = V.verifyEconomics({ metering });
  check(r.verdict === "FAILED" && r.violations.includes("SPEND_WITHOUT_OBSERVATION"), "SPENT with no observation ⇒ FAILED");
}

// 9 — a non-OK valuation that carries a value (fabricated amount) ⇒ FAILED (VALUATION_INCONSISTENT).
{
  const metering = { spent: false, observed: null, snapshot: null, valuation: { status: "PRICE_RULE_MISSING", basis: null, value: { unit: "EUR", kind: "ASSET", minor: 5, scale: 2 } } };
  const r = V.verifyEconomics({ metering });
  check(r.verdict === "FAILED" && r.violations.includes("VALUATION_INCONSISTENT"), "UNKNOWN valuation carrying a number ⇒ FAILED");
}

// 10 — no economic facts at all ⇒ UNKNOWN (deny-by-default).
{
  const r = V.verifyEconomics({});
  check(r.verdict === "UNKNOWN", "no facts ⇒ UNKNOWN (deny-by-default, never VERIFIED)");
  const r2 = V.verifyEconomics();
  check(r2.verdict === "UNKNOWN", "undefined facts ⇒ UNKNOWN");
}

// 11 — a genuine observed ZERO priced by a rule ⇒ DERIVED 0 valuation + VERIFIED (observed-0, not UNKNOWN).
{
  const o = outcome("OK", 0);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: okCatalog, execute: () => o });
  const r = V.verifyEconomics({ metering, observation: o.observation });
  check(r.verdict === "VERIFIED" && r.proofs.includes("DERIVED_VALUATION_OK"), "observed 0 × rate ⇒ DERIVED 0 is a VERIFIED economic fact, not a gap");
}

// 12 — determinism: same facts ⇒ byte-identical verdict record.
{
  const o = outcome("OK", 250);
  const metering = M.meterProviderCall({ spec: validSpec(1000), catalog: okCatalog, execute: () => o });
  const run = () => V.verifyEconomics({ metering, observation: o.observation });
  check(JSON.stringify(run()) === JSON.stringify(run()), "deterministic: same facts ⇒ identical verdict");
}

// 13 — pipeline-OK but economically INCOMPLETE: a provider OK run with no catalog ⇒ no valuation, but the
//      observed usage + conserved ledger still VERIFIED; with absent usage it is INCOMPLETE — proving the
//      economic verdict is INDEPENDENT of the provider's OK/pipeline success.
{
  const oOk = outcome("OK", 300);
  const mNoCat = M.meterProviderCall({ spec: validSpec(1000), execute: () => oOk }); // no catalog ⇒ valuation null
  const rNoCat = V.verifyEconomics({ metering: mNoCat, observation: oOk.observation });
  check(rNoCat.verdict === "VERIFIED", "provider OK + provenanced usage + conserved ledger (no catalog) ⇒ VERIFIED");
  const oAbsent = outcome("OK", null);
  const mAbsent = M.meterProviderCall({ spec: validSpec(1000), execute: () => oAbsent });
  const rAbsent = V.verifyEconomics({ metering: mAbsent, observation: oAbsent.observation });
  check(rAbsent.verdict === "INCOMPLETE", "provider still OK but usage NOT_OBSERVED ⇒ economically INCOMPLETE (independent of pipeline)");
}

console.log(failures === 0 ? "ALL PASS — ECONOMIC VERIFICATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
