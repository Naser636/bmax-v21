#!/usr/bin/env node
/*
 * LOT finance-paper — EQUIVALENCE (historical .js vs compiled .ts). Offline, pure, SIMULATION/PAPER-ONLY
 * (no broker/order/execution/network). build:runtime compiles runtime/core/finance-paper.ts → dist (deps
 * economic-unit + finance-sim co-located). Serializable results compared byte-identical. The fail-closed
 * decisions gate (source.ok + decisionsAllowed) and the fictitious-order cost kernel are exercised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/finance-paper-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "finance-paper.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "finance-paper.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT finance-paper — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["CODE", "runGovernedPaper", "paperTradeFromSource"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(js.paperTrade === undefined && ts.paperTrade === undefined, "paperTrade stays MODULE-PRIVATE (no bypass of the gated entries)");
check(EQ(js.CODE, ts.CODE), "CODE enum byte-identical");

const px = (minor: number) => ({ price: { minor, scale: 2 }, source: "fixture" });
const okSource = { ok: true, decisionsAllowed: true, provenance: ["fixture"], series: [px(100), px(110), px(105), px(120), px(130)].map((b, i) => ({ t: i + 1, ...b })) };
const params = { window: 2 };
const opts = { feeBps: 10, slippageBps: 5 };

// fail-closed decisions gate
check(EQ(js.runGovernedPaper({ ok: false }, params, opts), ts.runGovernedPaper({ ok: false }, params, opts)) && js.runGovernedPaper({ ok: false }, params, opts).code === "DECISIONS_BLOCKED", "runGovernedPaper source-not-ok ⇒ BLOCKED byte-identical");
check(EQ(js.runGovernedPaper({ ok: true, decisionsAllowed: false, code: "STALE" }, params, opts), ts.runGovernedPaper({ ok: true, decisionsAllowed: false, code: "STALE" }, params, opts)) && js.runGovernedPaper({ ok: true, decisionsAllowed: false, code: "STALE" }, params, opts).reason === "STALE", "runGovernedPaper stale (decisionsAllowed=false) ⇒ BLOCKED, reason preserved byte-identical");
check(EQ(js.runGovernedPaper({ ok: true, decisionsAllowed: true }, params, opts), ts.runGovernedPaper({ ok: true, decisionsAllowed: true }, params, opts)) && js.runGovernedPaper({ ok: true, decisionsAllowed: true }, params, opts).code === "DECISIONS_BLOCKED", "runGovernedPaper no-series ⇒ BLOCKED byte-identical");

// governed paper happy path — fictitious orders + integer P&L, executed:false
const gJ = js.runGovernedPaper(okSource, params, opts), gT = ts.runGovernedPaper(okSource, params, opts);
check(EQ(gJ, gT), "runGovernedPaper(valid source) byte-identical");
check(gJ.ok === true && gJ.mode === "GOVERNED_PAPER" && gJ.executed === false && Array.isArray(gJ.orders) && gJ.orders.every((o: any) => o.fictitious === true), "governed paper ⇒ fictitious orders only, executed:false");
check(gJ.assumptions.feeBps === 10 && /ASSUMPTIONS/.test(gJ.assumptions.note), "fees/slippage labelled ASSUMPTIONS (not real costs)");

// paperTradeFromSource gated adapter parity
check(EQ(js.paperTradeFromSource({ ok: false }, [1], opts), ts.paperTradeFromSource({ ok: false }, [1], opts)), "paperTradeFromSource source-not-ok ⇒ BLOCKED byte-identical");
check(EQ(js.paperTradeFromSource(okSource, js.runGovernedPaper(okSource, params, opts).positions, opts), ts.paperTradeFromSource(okSource, ts.runGovernedPaper(okSource, params, opts).positions, opts)), "paperTradeFromSource(valid) byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT finance-paper EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
