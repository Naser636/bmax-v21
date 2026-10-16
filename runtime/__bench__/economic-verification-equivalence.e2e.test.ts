#!/usr/bin/env node
/*
 * LOT economic-verification — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, pure, deterministic (no clock/I/O/money/network). build:runtime compiles
 * runtime/core/economic-verification.ts → dist; dep ./price-resolution (dual-ported V64) compiled alongside.
 * Facts are synthetic; every verdict/finding branch's result object is compared BYTE-IDENTICAL, incl. the
 * "no false economic success" invariants (UNKNOWN-never-0 → GAP; non-OK valuation with a value → VIOLATION;
 * deny-by-default UNKNOWN; precedence FAILED>INCOMPLETE>VERIFIED>UNKNOWN; verdictConsistent integrity).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/economic-verification-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "economic-verification.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "economic-verification.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT economic-verification — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/economic-verification.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/economic-verification.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["VERDICT", "PRECEDENCE", "SEVERITY", "FINDING", "ECONOMIC_VERIFICATION_CONTRACT", "verifyEconomics", "verdictConsistent"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.ECONOMIC_VERIFICATION_CONTRACT, ts.ECONOMIC_VERIFICATION_CONTRACT) && EQ(js.VERDICT, ts.VERDICT) && EQ(js.FINDING, ts.FINDING), "CONTRACT + VERDICT + FINDING frozen byte-identical");

const conserved = { total: 100, available: 40, reserved: 10, committed: 20, spent: 30 };
const imbalance = { total: 100, available: 40, reserved: 10, committed: 20, spent: 5 };
const V = (facts: any) => [js.verifyEconomics(facts), ts.verifyEconomics(facts)];

// deny-by-default
{ const [a, b] = V({}); check(EQ(a, b) && a.verdict === "UNKNOWN", "no facts ⇒ UNKNOWN (deny-by-default) byte-identical"); }
// VERIFIED: ledger conserved + OBSERVED w/ provenance + DERIVED valuation OK
{
  const facts = { metering: { snapshot: conserved, valuation: { status: "OK", basis: "DERIVED", value: { unit: "EUR", kind: "ASSET", minor: 3000, scale: 6 } } }, observation: { basis: "OBSERVED", quantities: [{ unit: "token" }], provenance: "metering@commit" } };
  const [a, b] = V(facts); check(EQ(a, b) && a.verdict === "VERIFIED" && a.proofs.includes("LEDGER_CONSERVED") && a.proofs.includes("DERIVED_VALUATION_OK") && a.proofs.includes("OBSERVED_WITH_PROVENANCE"), "VERIFIED (3 proofs, no violation/gap) byte-identical");
}
// FAILED: ledger imbalance dominates
{ const [a, b] = V({ metering: { snapshot: imbalance } }); check(EQ(a, b) && a.verdict === "FAILED" && a.violations.includes("LEDGER_IMBALANCE"), "FAILED ledger imbalance (precedence) byte-identical"); }
// FAILED: spend without observation
{ const [a, b] = V({ metering: { spent: true, snapshot: conserved } }); check(EQ(a, b) && a.verdict === "FAILED" && a.violations.includes("SPEND_WITHOUT_OBSERVATION"), "FAILED spend-without-observation byte-identical"); }
// FAILED: OBSERVED without provenance
{ const [a, b] = V({ observation: { basis: "OBSERVED", quantities: [{ unit: "token" }] } }); check(EQ(a, b) && a.verdict === "FAILED" && a.violations.includes("MISSING_PROVENANCE"), "FAILED missing-provenance byte-identical"); }
// INCOMPLETE: honest GAP — missing price (UNKNOWN, value null)
{ const [a, b] = V({ metering: { valuation: { status: "PRICE_RULE_MISSING", value: null } } }); check(EQ(a, b) && a.verdict === "INCOMPLETE" && a.gaps.includes("MISSING_PRICE"), "INCOMPLETE missing-price (honest GAP) byte-identical"); }
// INCOMPLETE: NOT_OBSERVED usage
{ const [a, b] = V({ observation: { basis: "ABSENT", quantities: [] } }); check(EQ(a, b) && a.verdict === "INCOMPLETE" && a.gaps.includes("NOT_OBSERVED"), "INCOMPLETE NOT_OBSERVED byte-identical"); }
// VIOLATION: non-OK valuation that carries a value (fabricated UNKNOWN) ⇒ VALUATION_INCONSISTENT
{ const [a, b] = V({ metering: { valuation: { status: "PRICE_RULE_MISSING", value: { minor: 5 } } } }); check(EQ(a, b) && a.verdict === "FAILED" && a.violations.includes("VALUATION_INCONSISTENT"), "FAILED non-OK valuation with a value (UNKNOWN must never be a number) byte-identical"); }
// VIOLATION: ambiguous price + unit mismatch + overflow
for (const [st, code] of [["PRICE_RULE_AMBIGUOUS", "AMBIGUOUS_PRICE"], ["USAGE_UNIT_MISMATCH", "UNIT_MISMATCH"], ["VALUATION_OVERFLOW", "VALUATION_OVERFLOW"]] as any[]) {
  const [a, b] = V({ metering: { valuation: { status: st, value: null } } });
  check(EQ(a, b) && a.verdict === "FAILED" && a.violations.includes(code), `FAILED valuation ${st} ⇒ ${code} byte-identical`);
}
// VIOLATION: OK status but inconsistent basis/value
{ const [a, b] = V({ metering: { valuation: { status: "OK", basis: "DERIVED", value: null } } }); check(EQ(a, b) && a.violations.includes("VALUATION_INCONSISTENT"), "FAILED OK-status-but-null-value inconsistency byte-identical"); }

// verdictConsistent — evidence integrity
const genuine = js.verifyEconomics({ metering: { snapshot: conserved } });
check(js.verdictConsistent(genuine) === true && ts.verdictConsistent(genuine) === true, "verdictConsistent: a genuine record is self-consistent (both)");
const forged = { verdict: "VERIFIED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] };
check(js.verdictConsistent(forged) === false && ts.verdictConsistent(forged) === false, "verdictConsistent: forged VERIFIED-with-violations rejected (both)");
check(js.verdictConsistent({ verdict: "VERIFIED", violations: [], gaps: [], proofs: [] }) === false && ts.verdictConsistent({ verdict: "VERIFIED", violations: [], gaps: [], proofs: [] }) === false, "verdictConsistent: VERIFIED with no proof rejected (both)");
check(js.verdictConsistent(null) === false && ts.verdictConsistent({}) === false, "verdictConsistent: malformed ⇒ false (both)");

console.log(failures === 0 ? "ALL PASS — LOT economic-verification EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
