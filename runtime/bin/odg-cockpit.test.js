#!/usr/bin/env node
"use strict";

/*
 * odg cockpit — regression test (Track I). Exercises the PURE composition/render with injected
 * fixtures (valid / malformed / missing / empty / stale), the read-only static invariant (no
 * exec/spawn/fetch/write), and the bounded refresh/termination of the loop. No network, no fs writes,
 * no child process. Run: node runtime/bin/odg-cockpit.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const C = require("./odg-cockpit.js");

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log("  ok -", name); passed += 1; };

// --- fixture io -----------------------------------------------------------------------------------
function ioFrom(map, log) {
  return {
    json: (name) => (name in map ? map[name] : { ok: false, error: "absent" }),
    activeLog: () => log ?? { name: null, lines: [], note: "no run logs" },
  };
}
const J = (value) => ({ ok: true, value });

const full = {
  "runtime-state.json": J({ generatedAt: "2026-10-09T00:00:00Z", status: "READY", runtime: "READY", converged: false, pipeline: "READY", brain: "READY", nextMission: "NEXT_X" }),
  "runtime-status.json": J({ runtime: "READY", foundation: "READY", nextMission: "NEXT_X" }),
  "capability-registry.json": J({ capabilities: [1, 2, 3], missingCapabilities: [{ id: "M1" }, { id: "M2" }] }),
  "runtime-mission-queue.json": J({ generatedAt: "2026-10-09T00:00:00Z", queue: [{ mission: "Q1", status: "PENDING" }, { mission: "Q2", status: "PENDING", objective: "o" }] }),
  "mission-ledger.json": J({ count: 3, entries: [{ mission: "A", state: "ARCHIVED", proven: true }, { mission: "B", state: "RELEASED", proven: true }] }),
  "self-diagnostic-report.json": J({ summary: "NO_DIVERGENCE", converged: true, divergences: [], incident: null, mode: "PREPARE_NOT_APPLY" }),
};
const activeLog = { name: "MISSION_X.run.log", lines: [">>> Validation Engine OK", "PIPELINE SUCCESS"], mtime: 1 };

// 1. composition from valid sources
const m = C.composeModel(ioFrom(full, activeLog), { tail: 5, nowMs: Date.parse("2026-10-09T00:10:00Z") });
ok("composes health from state/status", m.health.runtime === "READY" && m.health.foundation === "READY" && m.health.brain === "READY");
ok("composes progress counts", m.progress.ready === 3 && m.progress.missing === 2 && m.progress.missions === 3);
ok("last mission + next", m.progress.last.startsWith("B") && m.progress.next === "NEXT_X");
ok("queue pending composed", m.queue.length === 2 && m.queue[1].includes("Q2 / o"));
ok("recent ledger composed with proven mark", m.recentLedger.some((e) => e.includes("A → ARCHIVED ✓")));
ok("diagnostic composed", m.diagnostic.summary === "NO_DIVERGENCE" && m.diagnostic.divergences === 0);
ok("active log tail composed", m.activeLog.name === "MISSION_X.run.log" && m.activeLog.lines.length === 2);
ok("no degraded sources when all valid", m.degraded.length === 0);
const rendered = C.renderCockpit(m, { stamp: "refresh 1/1" });
ok("render is a non-empty string with sections", /ODG COCKPIT/.test(rendered) && /HEALTH/.test(rendered) && /ACTIVE RUN LOG/.test(rendered));

// 2. malformed inputs ⇒ flagged degraded, never throws
const malformed = { ...full, "mission-ledger.json": { ok: false, error: "malformed" } };
let threw = false;
let mm;
try { mm = C.composeModel(ioFrom(malformed, activeLog), {}); } catch { threw = true; }
ok("malformed source does not throw", !threw);
ok("malformed source flagged degraded", mm.degraded.some((d) => d.startsWith("mission-ledger.json:malformed")));
ok("malformed ledger ⇒ empty recent, not crash", mm.recentLedger.length === 0);

// 3. all sources missing ⇒ graceful UNKNOWN/N/A/none
const empty = C.composeModel(ioFrom({}, { name: null, lines: [], note: "no run logs" }), {});
ok("missing sources ⇒ UNKNOWN health", empty.health.runtime === "UNKNOWN");
ok("missing sources ⇒ N/A last + none queue/ledger", empty.progress.last === "N/A" && empty.queue.length === 0 && empty.recentLedger.length === 0);
const emptyRender = C.renderCockpit(empty, {});
ok("render of empty model shows (none) and no run log", /QUEUE/.test(emptyRender) && /\(none\)/.test(emptyRender) && /ACTIVE RUN LOG : \(none\)/.test(emptyRender));

// 4. staleness honesty (clock far past generatedAt)
const stale = C.composeModel(ioFrom(full, activeLog), { nowMs: Date.parse("2027-01-01T00:00:00Z"), staleMs: 3600000 });
ok("stale artifact flagged when clock supplied", stale.freshness.state === "STALE");
ok("stale flag surfaced in render", /STALE/.test(C.renderCockpit(stale, {})));

// 5. read-only static invariant — the cockpit CODE performs NO exec/spawn/fetch/write.
// Scan code only (strip block + line comments) so descriptive prose ("never spawns a child
// process") cannot trip the check; the invariant is about actual calls, not documentation.
const rawSrc = fs.readFileSync(path.join(__dirname, "odg-cockpit.js"), "utf8");
const codeOnly = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const forbidden of ["child_process", "spawn", "execSync", "exec(", "fetch(", "http://", "https://", "writeFileSync", "appendFileSync", "createWriteStream"]) {
  ok(`code contains no '${forbidden}'`, !codeOnly.includes(forbidden));
}
// And the only fs operations used are reads (defense-in-depth: assert no fs write APIs anywhere).
ok("code uses only fs read APIs", !/fs\.(write|append|mkdir|rm|unlink|rmdir|rename|copyFile|createWriteStream)/.test(codeOnly));

// 6. bounded refresh + termination (injected fake scheduler — synchronous, no timers)
let outCount = 0;
const pending = [];
const ctl = C.runLoop(ioFrom(full, activeLog), { tail: 5, iterations: 3, interval: 1 },
  () => { outCount += 1; }, () => 0, (fn) => pending.push(fn));
while (pending.length) { pending.shift()(); }
ok("refresh loop renders exactly `iterations` times then stops", outCount === 3 && ctl.count() === 3);
// stop() halts an in-flight loop
let out2 = 0; const pend2 = [];
const ctl2 = C.runLoop(ioFrom(full, activeLog), { tail: 5, iterations: Infinity, interval: 1 },
  () => { out2 += 1; }, () => 0, (fn) => pend2.push(fn));
ctl2.stop();
while (pend2.length) { pend2.shift()(); }
ok("stop() terminates the unbounded loop", out2 === 1);

// 7. parseArgs
const a = C.parseArgs(["--once", "--tail=20", "--interval=5"]);
ok("parseArgs: --once ⇒ 1 iteration, tail/interval parsed", a.iterations === 1 && a.tail === 20 && a.interval === 5);

console.log(`\nALL PASS — odg cockpit (${passed} assertions)`);
process.exit(0);
