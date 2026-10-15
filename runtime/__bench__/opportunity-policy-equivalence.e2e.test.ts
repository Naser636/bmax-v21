#!/usr/bin/env node
/*
 * LOT opportunity-policy — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no fs/network/clock): build:runtime compiles
 * runtime/core/opportunity-policy.ts → runtime/dist/core/opportunity-policy.js; build-dist-closure
 * co-locates its dep (economic-unit.js — a TS port) in dist/core. Every function is pure ⇒ BYTE-IDENTICAL.
 * Quantities are minted via the historical economic-unit (identical shape both the .js and .ts consume).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/opportunity-policy-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "opportunity-policy.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "opportunity-policy.js");
const EU = require(path.join(REPO, "runtime", "core", "economic-unit.js")) as any;

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT opportunity-policy — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/opportunity-policy.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/opportunity-policy.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "economic-unit.js")), "prerequisite: dep economic-unit.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["classify", "classifyOne", "classifyField", "computeDerived", "STATUS", "VERDICT"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
for (const c of ["STATUS", "VERDICT"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);

const qEUR = (minor: number) => EU.quantity("EUR", EU.KIND.ASSET, minor, 2);
const OBS = [
  { url: "https://x/a", field: "revenue", status: "OBSERVED", http_status: 200, content_hash: "h1", raw: "1000", quantity: qEUR(100000), fetched_at: "2026-01-01" },
  { url: "https://x/b", field: "cost", status: "OBSERVED", http_status: 200, content_hash: "h2", raw: "400", quantity: qEUR(40000), fetched_at: "2026-01-01" },
  { url: "https://x/c", field: "bad", status: "OBSERVED", http_status: 503, content_hash: "h3" },
];

// classifyField — OBSERVED / rejected-source / unknown-missing.
check(EQ(js.classifyField({ name: "revenue", source_url: "https://x/a" }, OBS), ts.classifyField({ name: "revenue", source_url: "https://x/a" }, OBS)), "classifyField OBSERVED BYTE-IDENTICAL");
check(EQ(js.classifyField({ name: "bad", source_url: "https://x/c" }, OBS), ts.classifyField({ name: "bad", source_url: "https://x/c" }, OBS)), "classifyField rejected-source (non-2xx) BYTE-IDENTICAL");
check(EQ(js.classifyField({ name: "missing", source_url: "https://x/z" }, OBS), ts.classifyField({ name: "missing", source_url: "https://x/z" }, OBS)), "classifyField no-observation ⇒ UNKNOWN BYTE-IDENTICAL");

// computeDerived — exact sub over OBSERVED; unit mismatch; missing inputs; unsupported op.
const observedByName = { revenue: { quantity: qEUR(100000) }, cost: { quantity: qEUR(40000) }, usd: { quantity: EU.quantity("USD", EU.KIND.ASSET, 5000, 2) } };
check(EQ(js.computeDerived({ name: "margin", op: "sub", of: ["revenue", "cost"] }, observedByName), ts.computeDerived({ name: "margin", op: "sub", of: ["revenue", "cost"] }, observedByName)), "computeDerived sub exact CALCULATED BYTE-IDENTICAL");
check(EQ(js.computeDerived({ name: "x", op: "add", of: ["revenue", "usd"] }, observedByName), ts.computeDerived({ name: "x", op: "add", of: ["revenue", "usd"] }, observedByName)), "computeDerived unit-mismatch ⇒ UNKNOWN BYTE-IDENTICAL");
check(EQ(js.computeDerived({ name: "y", op: "sub", of: ["revenue", "absent"] }, observedByName), ts.computeDerived({ name: "y", op: "sub", of: ["revenue", "absent"] }, observedByName)), "computeDerived missing input ⇒ UNKNOWN BYTE-IDENTICAL");
check(EQ(js.computeDerived({ name: "z", op: "mul", of: ["revenue", "cost"] }, observedByName), ts.computeDerived({ name: "z", op: "mul", of: ["revenue", "cost"] }, observedByName)), "computeDerived unsupported op ⇒ UNKNOWN BYTE-IDENTICAL");

// classifyOne / classify — PROVEN, CANDIDATE, REJECTED.
const proven = { id: "op1", identity: { name: "Acme" }, fields: [{ name: "revenue", source_url: "https://x/a" }, { name: "cost", source_url: "https://x/b" }], derived: [{ name: "margin", op: "sub", of: ["revenue", "cost"] }], inferred: [{ name: "growth", assumption: "10%/yr" }] };
const candidate = { id: "op2", fields: [{ name: "revenue", source_url: "https://x/z" }] };
const rejected = { id: "op3", fields: [{ name: "bad", source_url: "https://x/c" }] };
for (const [label, opp] of [["PROVEN", proven], ["CANDIDATE", candidate], ["REJECTED", rejected]] as Array<[string, any]>) {
  check(EQ(js.classifyOne(opp, OBS, { evidence_ref: "E1" }), ts.classifyOne(opp, OBS, { evidence_ref: "E1" })), `classifyOne ${label} BYTE-IDENTICAL (full chain)`);
}
const all = js.classify([proven, candidate, rejected], OBS, {});
const allT = ts.classify([proven, candidate, rejected], OBS, {});
check(EQ(all, allT), "classify() aggregate + counts BYTE-IDENTICAL");
check(all.counts.proven === 1 && all.counts.candidate === 1 && all.counts.rejected === 1 && all.counts.observedFields === 2 && all.counts.calculatedFields === 1, "classify counts: proven/candidate/rejected/observed/calculated correct");
check(all.results[0].verification_status === "PROVEN" && all.results[0].calculations[0].status === "CALCULATED", "PROVEN opportunity carries CALCULATED derived margin");

console.log(failures === 0 ? "ALL PASS — LOT opportunity-policy EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
