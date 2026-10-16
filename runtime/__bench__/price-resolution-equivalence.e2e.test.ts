#!/usr/bin/env node
/*
 * LOT price-resolution — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, pure, deterministic (no clock/I/O/money/network). build:runtime compiles
 * runtime/core/price-resolution.ts → dist; its dep ./economic-unit (dual-ported) is compiled alongside.
 * Observed Quantities are plain economic-unit data (built from the historical economic-unit), accepted by
 * both modules' isQuantity. Every branch's result object is compared BYTE-IDENTICAL.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/price-resolution-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "price-resolution.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "price-resolution.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT price-resolution — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/price-resolution.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/price-resolution.js emitted");

const E = require(path.join(REPO, "runtime", "core", "economic-unit.js")) as any;
delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["PRICE_RESOLUTION_CONTRACT", "RESOLUTION_STATUS", "VALUATION_STATUS", "VALUATION_BASIS", "priceRule", "emptyCatalog", "declarePrice", "findRule", "resolvePrice", "valueUsage", "valueFromCatalog", "explainValuation"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.PRICE_RESOLUTION_CONTRACT, ts.PRICE_RESOLUTION_CONTRACT), "PRICE_RESOLUTION_CONTRACT byte-identical");
check(EQ(js.RESOLUTION_STATUS, ts.RESOLUTION_STATUS) && EQ(js.VALUATION_STATUS, ts.VALUATION_STATUS) && EQ(js.VALUATION_BASIS, ts.VALUATION_BASIS), "status/basis enums byte-identical");

const spec = { id: "token-eur", version: 1, provider: "anthropic", model: null, usageUnit: "token", currency: "EUR", rateMinor: 3, rateScale: 6, provenance: "pricing sheet 2026", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
// priceRule validation parity (built rule + throw on malformed)
check(EQ(js.priceRule(spec), ts.priceRule(spec)), "priceRule(valid) byte-identical frozen rule");
for (const bad of [{ ...spec, id: "" }, { ...spec, version: 0 }, { ...spec, rateMinor: 1.5 }, { ...spec, provenance: "" }, { ...spec, usageUnit: "" }]) {
  let ej = false, et = false; try { js.priceRule(bad); } catch { ej = true; } try { ts.priceRule(bad); } catch { et = true; }
  check(ej === true && et === true, `priceRule rejects malformed (${Object.keys(bad).find((k) => (bad as any)[k] !== (spec as any)[k])}) — both throw`);
}

// catalog: declarePrice (append-only), findRule
const catJs = js.declarePrice(js.emptyCatalog(), spec);
const catTs = ts.declarePrice(ts.emptyCatalog(), spec);
check(EQ(catJs, catTs), "declarePrice appends rule — catalog byte-identical");
check(EQ(js.findRule(catJs, "token-eur", 1), ts.findRule(catTs, "token-eur", 1)) && js.findRule(catJs, "token-eur", 1).id === "token-eur", "findRule(exact) byte-identical");
{ let ej = false, et = false; try { js.declarePrice(catJs, spec); } catch { ej = true; } try { ts.declarePrice(catTs, spec); } catch { et = true; } check(ej && et, "declarePrice (id,version) duplicate ⇒ throws (append-only, both)"); }

// resolvePrice branches
const q = { provider: "anthropic", usageUnit: "token", asOf: "2026-06-01" };
check(EQ(js.resolvePrice(catJs, q), ts.resolvePrice(catTs, q)) && js.resolvePrice(catJs, q).status === "OK", "resolvePrice OK (single applicable) byte-identical");
check(EQ(js.resolvePrice(catJs, { usageUnit: "gpu-hour" }), ts.resolvePrice(catTs, { usageUnit: "gpu-hour" })) && js.resolvePrice(catJs, { usageUnit: "gpu-hour" }).status === "PRICE_RULE_MISSING", "resolvePrice MISSING byte-identical");
check(EQ(js.resolvePrice(catJs, { ...q, asOf: "2030-01-01" }), ts.resolvePrice(catTs, { ...q, asOf: "2030-01-01" })) && js.resolvePrice(catJs, { ...q, asOf: "2030-01-01" }).status === "PRICE_RULE_STALE", "resolvePrice STALE byte-identical");
// ambiguity: a second wildcard-provider rule equally applicable
const cat2j = js.declarePrice(catJs, { ...spec, id: "token-eur-any", provider: null });
const cat2t = ts.declarePrice(catTs, { ...spec, id: "token-eur-any", provider: null });
check(EQ(js.resolvePrice(cat2j, q), ts.resolvePrice(cat2t, q)) && js.resolvePrice(cat2j, q).status === "PRICE_RULE_AMBIGUOUS", "resolvePrice AMBIGUOUS byte-identical");

// valueUsage branches (EXACT derived / observed-0 → derived-0 / unknown / mismatch / overflow)
const resOkJs = js.resolvePrice(catJs, q), resOkTs = ts.resolvePrice(catTs, q);
const obs = E.quantity("token", E.KIND.COST_UNIT, 1000, 0);
check(EQ(js.valueUsage(obs, resOkJs), ts.valueUsage(obs, resOkTs)) && js.valueUsage(obs, resOkJs).status === "OK" && js.valueUsage(obs, resOkJs).basis === "DERIVED", "valueUsage OK ⇒ DERIVED exact value byte-identical");
const obs0 = E.quantity("token", E.KIND.COST_UNIT, 0, 0);
{ const r = js.valueUsage(obs0, resOkJs); check(EQ(r, ts.valueUsage(obs0, resOkTs)) && r.status === "OK" && r.value && r.value.minor === 0, "observed 0 × known rate ⇒ genuine DERIVED 0 (not UNKNOWN), byte-identical"); }
check(EQ(js.valueUsage(null, resOkJs), ts.valueUsage(null, resOkTs)) && js.valueUsage(null, resOkJs).status === "USAGE_UNKNOWN" && js.valueUsage(null, resOkJs).value === null, "usage absent ⇒ USAGE_UNKNOWN value:null (never 0) byte-identical");
const obsWrong = E.quantity("gpu-hour", E.KIND.COST_UNIT, 5, 0);
check(EQ(js.valueUsage(obsWrong, resOkJs), ts.valueUsage(obsWrong, resOkTs)) && js.valueUsage(obsWrong, resOkJs).status === "USAGE_UNIT_MISMATCH", "unit mismatch ⇒ USAGE_UNIT_MISMATCH byte-identical");
const obsHuge = E.quantity("token", E.KIND.COST_UNIT, Number.MAX_SAFE_INTEGER, 0);
check(EQ(js.valueUsage(obsHuge, resOkJs), ts.valueUsage(obsHuge, resOkTs)) && js.valueUsage(obsHuge, resOkJs).status === "VALUATION_OVERFLOW", "overflow ⇒ VALUATION_OVERFLOW (never lossy) byte-identical");
// non-OK resolution propagates (value null)
check(EQ(js.valueUsage(obs, js.resolvePrice(catJs, { usageUnit: "gpu-hour" })), ts.valueUsage(obs, ts.resolvePrice(catTs, { usageUnit: "gpu-hour" }))), "non-OK resolution ⇒ propagated UNKNOWN byte-identical");

// valueFromCatalog + explainValuation
check(EQ(js.valueFromCatalog(catJs, q, obs), ts.valueFromCatalog(catTs, q, obs)), "valueFromCatalog (resolve+value) byte-identical");
check(js.explainValuation(js.valueFromCatalog(catJs, q, obs)) === ts.explainValuation(ts.valueFromCatalog(catTs, q, obs)) && /DERIVED/.test(js.explainValuation(js.valueFromCatalog(catJs, q, obs))), "explainValuation deterministic derivation string byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT price-resolution EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
