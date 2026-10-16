#!/usr/bin/env node
/*
 * LOT live-cost-metering — EQUIVALENCE (historical .js vs compiled .ts). FINANCE/§6B, SIMULATION/ACCOUNTING
 * ONLY: PURE, deterministic given an INJECTED provider `execute` — NO real provider / network / money /
 * settlement / clock / I/O (the module "invents NO money"; SPENDs only a REAL OBSERVED usage, and ledgers in
 * → ledger snapshot out). build:runtime compiles the .ts → dist; its deps economic-unit/budget-contract/
 * price-resolution are dual-ported and cost-accounting/budget-ledger are co-located UNMODIFIED. Both modules
 * are driven with IDENTICAL (spec, execute, catalog) inputs across the full decision matrix and compared
 * BYTE-IDENTICAL — proving the cost-metering contract (meter only on a valid budget, spend only a real
 * observation, no fictive spend, no implicit unit/scale conversion, no overspend, additive evidence-only
 * DERIVED valuation) is preserved exactly.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/live-cost-metering-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "live-cost-metering.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "live-cost-metering.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT live-cost-metering — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
const P = require(path.join(REPO, "runtime", "dist", "core", "price-resolution.js")) as any;
for (const x of ["LIVE_COST_METERING_CONTRACT", "meterProviderCall", "observationOf", "deriveValuation"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.LIVE_COST_METERING_CONTRACT, ts.LIVE_COST_METERING_CONTRACT), "LIVE_COST_METERING_CONTRACT descriptor byte-identical");

const validSpec = (amount = 1000, bucket = "provider", unit = "token") => ({
  budget: { allocations: [{ bucket, unit, kind: "COST_UNIT", amount, scale: 0 }] },
});
const outcome = (classification: any, tokens: any, unit = "token") => {
  const observation = tokens == null
    ? { basis: "ABSENT", quantities: [], provenance: null }
    : { basis: "OBSERVED", quantities: [{ unit, kind: "COST_UNIT", minor: tokens, scale: 0 }], provenance: "fake:usage" };
  return { provider: "fake", classification, observation };
};
const okCatalog = P.declarePrice(P.emptyCatalog(), { id: "tok", version: 1, usageUnit: "token", currency: "EUR", rateMinor: 2, rateScale: 6, provenance: "test:catalog" });

// Drive BOTH modules with identical args; the injected `execute` is a pure closure (deterministic, no effect).
const meter = (args: any) => {
  const jr = js.meterProviderCall({ ...args, execute: args.mk() });
  const tr = ts.meterProviderCall({ ...args, execute: args.mk() });
  return { jr, tr, eq: EQ(jr, tr) };
};
const mkOut = (cls: any, tok: any, unit?: any) => () => outcome(cls, tok, unit);

// Decision matrix — each case: identical inputs ⇒ byte-identical result + the expected decision.
const cases: Array<[string, any, string]> = [
  ["SPENT (observed 300 within ceiling)", { spec: validSpec(1000), mk: () => mkOut("OK", 300) }, "SPENT"],
  ["NO_SPEND_PROVIDER_NOT_OK (classification FAILED)", { spec: validSpec(1000), mk: () => mkOut("FAILED", 300) }, "NO_SPEND_PROVIDER_NOT_OK"],
  ["NO_SPEND_NO_OBSERVATION (OK but absent usage)", { spec: validSpec(1000), mk: () => mkOut("OK", null) }, "NO_SPEND_NO_OBSERVATION"],
  ["NO_SPEND_ZERO_USAGE (observed 0)", { spec: validSpec(1000), mk: () => mkOut("OK", 0) }, "NO_SPEND_ZERO_USAGE"],
  ["BUDGET_ABSENT (no budget ⇒ provider runs, nothing metered)", { spec: {}, mk: () => mkOut("OK", 300) }, "BUDGET_ABSENT"],
  ["BUDGET_MALFORMED (provider NOT invoked)", { spec: { budget: { allocations: [{ bucket: "nope", unit: "", amount: -5 }] } }, mk: () => mkOut("OK", 10) }, "BUDGET_MALFORMED"],
  ["NO_SPEND_UNIT_MISMATCH (compute-ms vs token)", { spec: validSpec(1000, "provider", "token"), mk: () => mkOut("OK", 200, "compute-ms") }, "NO_SPEND_UNIT_MISMATCH"],
  ["EXHAUSTED (observed 99999 > ceiling)", { spec: validSpec(1000), mk: () => mkOut("OK", 99999) }, "EXHAUSTED"],
  ["REFUSED_EXHAUSTED (zero ceiling ⇒ no call)", { spec: validSpec(0), mk: () => mkOut("OK", 1) }, "REFUSED_EXHAUSTED"],
  ["NO_BUCKET (valid budget, missing bucket)", { spec: validSpec(1000, "token"), bucket: "provider", mk: () => mkOut("OK", 10) }, "NO_BUCKET"],
];
for (const [label, args, want] of cases) {
  const { jr, eq } = meter(args);
  check(eq, `${label}: byte-identical`);
  check(jr.decision === want, `${label} ⇒ ${want}`);
}

// Provider throws ⇒ NO_SPEND_PROVIDER_ERROR, reservation recovered (error string present ⇒ compare fields).
{
  const jr = js.meterProviderCall({ spec: validSpec(1000), execute: () => { throw new Error("boom"); } });
  const tr = ts.meterProviderCall({ spec: validSpec(1000), execute: () => { throw new Error("boom"); } });
  check(EQ(jr, tr) && jr.decision === "NO_SPEND_PROVIDER_ERROR" && jr.spent === false, "provider throws ⇒ NO_SPEND_PROVIDER_ERROR byte-identical (no fictive spend)");
}

// ADDITIVE evidence-only valuation — supplied catalog ⇒ DERIVED value; dormant (null) without a catalog.
{
  const a = { spec: validSpec(1000), catalog: okCatalog, mk: () => mkOut("OK", 300) };
  const { jr, eq } = meter(a);
  check(eq, "SPENT + supplied rule: byte-identical");
  check(jr.decision === "SPENT" && jr.snapshot.spent === 300, "spend meters tokens-as-tokens (300), untouched by valuation");
  check(jr.valuation && jr.valuation.status === "OK" && jr.valuation.basis === "DERIVED" && jr.valuation.value.minor === 600 && jr.valuation.value.scale === 6, "DERIVED valuation = 300×2/10^6 = 0.000600 EUR (evidence-only)");
  const dormant = meter({ spec: validSpec(1000), mk: () => mkOut("OK", 300) });
  check(dormant.jr.valuation === null, "no catalog ⇒ valuation dormant (null), byte-for-byte prior behaviour");
}

// helper parity: observationOf + deriveValuation
check(EQ(js.observationOf({ observation: { basis: "OBSERVED", quantities: [], provenance: null } }), ts.observationOf({ observation: { basis: "OBSERVED", quantities: [], provenance: null } })), "observationOf byte-identical");
check(EQ(js.observationOf({}), ts.observationOf({})) && js.observationOf({}).basis === "ABSENT", "observationOf (missing) ⇒ ABSENT byte-identical (never fabricated)");

console.log(failures === 0 ? "ALL PASS — LOT live-cost-metering EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
