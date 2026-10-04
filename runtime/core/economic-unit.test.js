#!/usr/bin/env node
"use strict";

/*
 * V5 economic primitives. Locks: exact integer arithmetic (no float), cost-unit ≠ asset, no implicit
 * conversion (unit mismatch throws), extensible registry (no hardcoded currencies), OBSERVED vs
 * ESTIMATED basis, gross/fees/net separation (net derived, gross preserved), determinism.
 *
 * Run directly: node runtime/core/economic-unit.test.js
 */
const E = require("./economic-unit");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("V5 — ECONOMIC PRIMITIVES");

// Exact value representation (minor/10^scale), never a float.
{
  const eur = E.quantity("EUR", E.KIND.ASSET, 1099, 2); // 10.99 EUR
  check(E.format(eur) === "10.99 EUR", "exact monetary value formatted without float (10.99)");
  const tok = E.quantity("token", E.KIND.COST_UNIT, 1500, 0);
  check(E.format(tok) === "1500 token", "operational cost unit (tokens) exact");
  check(!/\./.test(JSON.stringify(eur.minor)) && Number.isInteger(eur.minor), "value stored as INTEGER minor units (no float)");
}

// Exact arithmetic, scale alignment.
{
  const a = E.quantity("EUR", E.KIND.ASSET, 1099, 2);     // 10.99
  const b = E.quantity("EUR", E.KIND.ASSET, 1, 1);        // 0.10
  check(E.format(E.add(a, b)) === "11.09 EUR", "exact add across scales (10.99 + 0.10 = 11.09)");
  check(E.format(E.sub(a, b)) === "10.89 EUR", "exact sub across scales (10.99 - 0.10 = 10.89)");
  check(E.compare(a, b) === 1 && E.gte(a, b), "compare / gte exact");
}

// cost-unit ≠ asset; no implicit conversion.
{
  const tok = E.quantity("token", E.KIND.COST_UNIT, 100, 0);
  const eur = E.quantity("EUR", E.KIND.ASSET, 100, 0);
  let threw = false; try { E.add(tok, eur); } catch { threw = true; }
  check(threw, "adding token (COST_UNIT) + EUR (ASSET) THROWS (no implicit conversion / FX)");
  let threw2 = false; try { E.add(E.quantity("token", E.KIND.COST_UNIT, 1, 0), E.quantity("compute", E.KIND.COST_UNIT, 1, 0)); } catch { threw2 = true; }
  check(threw2, "adding two DIFFERENT cost units throws (token ≠ compute)");
}

// Extensible registry — no hardcoded currencies; new asset/unit declarable without engine change.
{
  let reg = E.emptyRegistry();
  reg = E.declareUnit(reg, "EUR", { kind: E.KIND.ASSET, scale: 2, label: "Euro" });
  reg = E.declareUnit(reg, "BTC", { kind: E.KIND.ASSET, scale: 8, asset: { ticker: "BTC", network: "bitcoin" } });
  reg = E.declareUnit(reg, "token", { kind: E.KIND.COST_UNIT, scale: 0 });
  check(E.hasUnit(reg, "EUR") && E.hasUnit(reg, "BTC") && E.hasUnit(reg, "token"), "registry: EUR/BTC/token declarable (extensible, no hardcoded list)");
  check(E.getUnit(reg, "BTC").scale === 8 && E.getUnit(reg, "BTC").asset.network === "bitcoin", "asset identity extensible (BTC scale 8 + network, not just a ticker)");
  check(!E.hasUnit(reg, "USD"), "undeclared unit is simply absent (no default currency)");
  let bad = false; try { E.declareUnit(reg, "X", { kind: "MONEY", scale: 2 }); } catch { bad = true; }
  check(bad, "invalid kind rejected");
}

// Cost measurement: OBSERVED vs ESTIMATED distinct; provider + provenance preserved.
{
  const tok = E.quantity("token", E.KIND.COST_UNIT, 1500, 0);
  const observed = E.costMeasurement(tok, E.BASIS.OBSERVED, { provider: "openai", provenance: "api.usage.total_tokens" });
  const estimated = E.costMeasurement(tok, E.BASIS.ESTIMATED, { provider: "openai", calculationBasis: "prompt-heuristic" });
  check(observed.basis === "OBSERVED" && observed.provider === "openai" && observed.provenance === "api.usage.total_tokens", "OBSERVED cost carries provider + provenance");
  check(estimated.basis === "ESTIMATED" && estimated.basis !== observed.basis, "ESTIMATED distinct from OBSERVED (estimate never certified as real cost)");
  let bad = false; try { E.costMeasurement(tok, "GUESS"); } catch { bad = true; }
  check(bad, "invalid basis rejected");
}

// gross / fees / net kept separate; net derived, gross preserved.
{
  const gross = E.quantity("EUR", E.KIND.ASSET, 10000, 2); // 100.00
  const fee1 = E.quantity("EUR", E.KIND.ASSET, 290, 2);    // 2.90
  const fee2 = E.quantity("EUR", E.KIND.ASSET, 30, 2);     // 0.30
  const v = E.valueComponents(gross, [fee1, fee2]);
  check(E.format(v.gross) === "100.00 EUR", "gross preserved (not overwritten by net)");
  check(E.format(v.net) === "96.80 EUR", "net derived exactly (100.00 - 2.90 - 0.30 = 96.80)");
  check(v.fees.length === 2, "fees kept as separate list");
}

// Determinism.
{
  const mk = () => E.format(E.add(E.quantity("EUR", E.KIND.ASSET, 1099, 2), E.quantity("EUR", E.KIND.ASSET, 1, 1)));
  check(mk() === mk(), "deterministic: same inputs ⇒ same exact result");
}

console.log(failures === 0 ? "ALL PASS — V5 ECONOMIC PRIMITIVES" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
