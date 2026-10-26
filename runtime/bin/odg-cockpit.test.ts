#!/usr/bin/env node
// @ts-nocheck — L5 bin test migration: runs under tsx unchanged; suppresses tsc typechecking (NOT strict typing) — migration debt.
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
  "autonomy-rate.json": J({ mission: "DEMO", measure: { measurable: true, autonomyPercent: 50, numerator: 1, denominator: 2, reason: null }, description: { counts: { odgExecutedVerified: 1, external: 1, humanMandatory: 0, blockedFailed: 0, notExecuted: 0, unknownOrUnverified: 0 } }, attribution: { source: "objective-attribution.json" } }),
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

// 1b. S2 — autonomy signal + attribution + result buckets + next decision (all read-only)
ok("autonomy composed measurable", m.autonomy && m.autonomy.measurable === true);
ok("autonomy % rendered with ODG verified n/d", /AUTONOMY 50% \(ODG verified 1\/2\)/.test(rendered));
ok("attribution separates ODG-verified from external(provider)", m.autonomy.attribution.odgVerified === 1 && m.autonomy.attribution.external === 1 && /external=1/.test(rendered));
ok("result buckets PROVEN/NOT-RUN/BLOCKED composed", m.tasks.proven === 2 && m.tasks.notRun === 2 && m.tasks.blocked === 0);
ok("result buckets rendered", /TASKS\s+PROVEN=2 · NOT-RUN\(queue\)=2 · BLOCKED=0/.test(rendered));
ok("next decision rendered", /NEXT DECISION\s+NEXT_X/.test(rendered));

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
ok("absent autonomy-rate ⇒ shown as not available, not fabricated", empty.autonomy === null && /AUTONOMY \(no autonomy-rate\.json/.test(emptyRender));

// 3b. HONESTY — a non-measurable autonomy signal is rendered as a REASON, never as a number.
const nonMeasurable = { ...full, "autonomy-rate.json": J({ mission: "DEMO2", measure: { measurable: false, autonomyPercent: null, numerator: null, denominator: null, reason: "no patch-execution artifact (executed[] absent)" }, description: { counts: {} }, attribution: { source: null } }) };
const nmModel = C.composeModel(ioFrom(nonMeasurable, activeLog), {});
const nmRender = C.renderCockpit(nmModel, {});
ok("non-measurable autonomy ⇒ reason, never a number", nmModel.autonomy.measurable === false && /AUTONOMY not measurable — no patch-execution/.test(nmRender) && !/AUTONOMY \d/.test(nmRender));
ok("non-measurable autonomy surfaces the next blocker", /next blocker: no patch-execution/.test(nmRender));

// 3c. verified-autonomy 0 with no attribution ⇒ honest blocker naming the missing artifact
const zeroVerified = { ...full, "autonomy-rate.json": J({ mission: "DEMO3", measure: { measurable: true, autonomyPercent: 0, numerator: 0, denominator: 3, reason: null }, description: { counts: { odgExecutedVerified: 0, unknownOrUnverified: 3 } }, attribution: { source: null } }) };
const zvRender = C.renderCockpit(C.composeModel(ioFrom(zeroVerified, activeLog), {}), {});
ok("verified-autonomy 0 names the missing attribution artifact", /AUTONOMY 0% \(ODG verified 0\/3\)/.test(zvRender) && /next blocker: verified-autonomy 0 — objective-attribution\.json not persisted/.test(zvRender));

// 4. staleness honesty (clock far past generatedAt)
const stale = C.composeModel(ioFrom(full, activeLog), { nowMs: Date.parse("2027-01-01T00:00:00Z"), staleMs: 3600000 });
ok("stale artifact flagged when clock supplied", stale.freshness.state === "STALE");
ok("stale flag surfaced in render", /STALE/.test(C.renderCockpit(stale, {})));

// 5. read-only static invariant — the cockpit CODE performs NO exec/spawn/fetch/write.
// Scan code only (strip block + line comments) so descriptive prose ("never spawns a child
// process") cannot trip the check; the invariant is about actual calls, not documentation.
const rawSrc = fs.readFileSync(path.join(__dirname, "..", "dist", "bin", "odg-cockpit.js"), "utf8"); // ZERO-JS: inspect the compiled dist port
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

// 8. REAL-ARTIFACT execution path + dispatcher routing + runtime read-only invariant (Track I acceptance).
//    These exercise the live `require.main` path against the repository's ACTUAL runtime/generated
//    artifacts (not fixtures) and the official `odg` dispatcher — a runtime proof, not a static grep.
const { execSync } = require("child_process");
const crypto = require("crypto");
const repoRoot = path.resolve(__dirname, "..", "..");
const gen = path.join(repoRoot, "runtime", "generated");
const SOURCES = ["runtime-state.json", "runtime-status.json", "capability-registry.json",
  "runtime-mission-queue.json", "mission-ledger.json", "self-diagnostic-report.json"];
const hashSources = () => SOURCES.map((f) => {
  try { return f + ":" + crypto.createHash("sha256").update(fs.readFileSync(path.join(gen, f))).digest("hex"); }
  catch { return f + ":absent"; }
}).join("|");

const beforeHash = hashSources();

// 8a — direct real-artifact --once render
const direct = execSync("node runtime/dist/bin/odg-cockpit.js --once", { cwd: repoRoot, encoding: "utf8" });
ok("real-artifact --once renders ODG COCKPIT / HEALTH / ACTIVE RUN LOG",
  /ODG COCKPIT/.test(direct) && /HEALTH /.test(direct) && /ACTIVE RUN LOG/.test(direct));

// 8b — official dispatcher routes `odg cockpit`
const routed = execSync("bash runtime/bin/odg cockpit --once", { cwd: repoRoot, encoding: "utf8" });
ok("dispatcher routes `odg cockpit --once` to the cockpit", /ODG COCKPIT/.test(routed) && /ACTIVE RUN LOG/.test(routed));

// 8c — dispatcher help advertises the cockpit (usage branch, exit 1 → tolerate with || true)
const help = execSync("bash runtime/bin/odg __unknown__ 2>&1 || true", { cwd: repoRoot, encoding: "utf8" });
ok("dispatcher help advertises `odg cockpit`", /odg cockpit/.test(help));

// 8d — runtime read-only invariant: a live render mutates none of the cockpit's real sources
ok("live real-artifact render mutated no cockpit source (read-only)", hashSources() === beforeHash);

// --- EFFICIENCY (Lot A) — reliable sources rendered, everything else honest UNKNOWN ----------------
{
  // (a) with duration + incidents present ⇒ measured; provider cost stays UNKNOWN (never fabricated).
  const effFull = {
    ...full,
    "pipeline-checkpoint.json": J({ startedAt: "2026-10-09T00:00:00.000Z", completedAt: "2026-10-09T00:00:03.500Z" }),
    "autonomy/self-diagnostic-incidents.json": J({ incidents: { a: { attempts: 2, status: "OPEN" }, b: { attempts: 1, status: "OPEN" }, c: { attempts: 3, status: "FROZEN" } } }),
  };
  const me = C.composeModel(ioFrom(effFull, activeLog), { tail: 5 });
  ok("efficiency: last-run duration measured from checkpoint (3.5s)", me.efficiency.lastRunMs === 3500);
  ok("efficiency: human/external interventions reused from autonomy (0/1 of 2)", me.efficiency.humanInterventions.human === 0 && me.efficiency.humanInterventions.external === 1 && me.efficiency.humanInterventions.of === 2);
  ok("efficiency: repeated-work counts (recurring 2, frozen 1)", me.efficiency.repeatedWork.recurring === 2 && me.efficiency.repeatedWork.frozen === 1);
  ok("efficiency: provider cost is UNKNOWN (no paid provider ran — never fabricated)", me.efficiency.providerCost === "UNKNOWN");
  const txt = C.renderCockpit(me, { stamp: "s" });
  ok("efficiency: EFFICIENCY line rendered with duration + UNKNOWN cost", /EFFICIENCY last-run=3\.50s/.test(txt) && /provider-cost=UNKNOWN/.test(txt));
  // (b) with NEITHER source ⇒ duration + repeated-work show UNKNOWN (no fabrication, not flagged degraded).
  const mu = C.composeModel(ioFrom(full, activeLog), {});
  ok("efficiency: absent checkpoint ⇒ lastRunMs null (UNKNOWN)", mu.efficiency.lastRunMs === null);
  ok("efficiency: absent incident store ⇒ repeatedWork null (UNKNOWN)", mu.efficiency.repeatedWork === null);
  ok("efficiency: optional inputs absent are NOT marked degraded", !mu.degraded.some((d) => /pipeline-checkpoint|self-diagnostic-incidents/.test(d)));
  ok("efficiency: render shows UNKNOWN for missing duration/repeated-work", /EFFICIENCY last-run=UNKNOWN/.test(C.renderCockpit(mu, { stamp: "s" })) && /repeated-work UNKNOWN/.test(C.renderCockpit(mu, { stamp: "s" })));
}

console.log(`\nALL PASS — odg cockpit (${passed} assertions)`);
process.exit(0);
