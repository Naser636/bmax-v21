#!/usr/bin/env node
"use strict";
/*
 * odg-cockpit DUAL-PORT PARITY (CTO Track B bin-CLI) — proves the JS rollback port
 * (runtime/bin/odg-cockpit.js) and the compiled-TS default port (runtime/dist/bin/odg-cockpit.js) are
 * observationally identical for the pure, deterministic functions the cockpit renders from
 * (composeModel + renderCockpit). Hermetic: injected `io` readers + fixed nowMs/stamp, NO fs/clock/
 * network/child-process. The existing odg-cockpit.test.js (45 assertions) covers the .js behaviour; this
 * asserts the TS port renders byte-identical output on the same inputs.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const JS = path.join(REPO, "runtime", "bin", "odg-cockpit.js");
const TS = path.join(REPO, "runtime", "dist", "bin", "odg-cockpit.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

ok("both cockpit ports present (js rollback + compiled-TS dist)", fs.existsSync(JS) && fs.existsSync(TS));
const js = require(JS);
const ts = require(TS);
ok("both ports export the same API", JSON.stringify(Object.keys(js).sort()) === JSON.stringify(Object.keys(ts).sort()));

// Deterministic fixture io: a healthy snapshot + one missing (degraded) source + an autonomy-rate.
function mkIo(overrides = {}) {
  const docs = Object.assign({
    "runtime-state.json": { ok: true, value: { runtime: "READY", pipeline: "READY", brain: "READY", converged: false, generatedAt: "2026-10-18T00:00:00.000Z", lastRun: { mission: "M9", status: "SUCCESS", validated: true } } },
    "runtime-status.json": { ok: true, value: { runtime: "READY", foundation: "READY", nextMission: "NEXT_X" } },
    "capability-registry.json": { ok: true, value: { capabilities: ["a", "b", "c"], missingCapabilities: ["x"] } },
    "runtime-mission-queue.json": { ok: true, value: { queue: [{ mission: "Q1", objective: "O1", status: "PENDING" }, { mission: "Q2" }], generatedAt: "2026-10-18T00:00:00.000Z" } },
    "mission-ledger.json": { ok: true, value: { count: 2, entries: [{ mission: "E1", state: "RELEASED", proven: true }, { mission: "E2", state: "CREATED", proven: false }] } },
    "self-diagnostic-report.json": { ok: false, error: "absent" },
    "autonomy-rate.json": { ok: true, value: { mission: "M9", measure: { measurable: true, autonomyPercent: 25, numerator: 2, denominator: 8 }, description: { counts: { odgExecutedVerified: 2, external: 1 } }, attribution: { source: "x" } } },
  }, overrides);
  return {
    json: (name) => docs[name] || { ok: false, error: "absent" },
    activeLog: (tail) => ({ name: "M9.run.log", lines: ["l1", "l2", "l3"].slice(-tail), mtime: 123 }),
  };
}

function compareScenario(label, overrides, opts) {
  const ioJs = mkIo(overrides), ioTs = mkIo(overrides);
  const mJs = js.composeModel(ioJs, opts), mTs = ts.composeModel(ioTs, opts);
  ok(`composeModel identical — ${label}`, JSON.stringify(mJs) === JSON.stringify(mTs));
  const rJs = js.renderCockpit(mJs, { stamp: "s1" }), rTs = ts.renderCockpit(mTs, { stamp: "s1" });
  ok(`renderCockpit identical — ${label}`, rJs === rTs);
}

// 1 — healthy snapshot with a fixed clock (fresh artifacts).
compareScenario("healthy + fresh clock", {}, { tail: 12, nowMs: Date.parse("2026-10-18T00:10:00.000Z") });
// 2 — STALE: clock far ahead of generatedAt.
compareScenario("stale freshness", {}, { tail: 3, nowMs: Date.parse("2027-01-01T00:00:00.000Z") });
// 3 — degraded: several sources missing/malformed.
compareScenario("degraded sources", {
  "capability-registry.json": { ok: false, error: "malformed" },
  "autonomy-rate.json": { ok: false, error: "absent" },
}, { tail: 5, nowMs: null });
// 4 — autonomy not measurable.
compareScenario("autonomy not measurable", {
  "autonomy-rate.json": { ok: true, value: { mission: "M", measure: { measurable: false, reason: "no attribution" } } },
}, { tail: 6, nowMs: null });
// 5 — parseArgs parity.
{
  const argv = ["--once", "--interval=5", "--tail=4", "--iterations=3"];
  ok("parseArgs identical", JSON.stringify(js.parseArgs(argv)) === JSON.stringify(ts.parseArgs(argv)));
}

console.log(`\nodg-cockpit dual-port parity — ${passed} assertions passed.`);
