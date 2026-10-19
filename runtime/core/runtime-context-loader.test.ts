#!/usr/bin/env node
// @ts-nocheck — L5 test bucket: runs under tsx; suppresses tsc typecheck (not strict typing).
"use strict";

/*
 * REFRESH_RUNTIME_CONTEXT_ON_STALENESS — deterministic test for the staleness-aware loader.
 * Root cause fixed: runtime-context.json stayed frozen (2026-07-27) because loadRuntimeContext regenerated
 * only on cache MISS, never on a STALE cache. This proves: fresh ⇒ no regen; stale ⇒ regen; missing ⇒ gen;
 * corrupt ⇒ regen; injected clock ⇒ deterministic; regen-failure ⇒ throw (no false success); .js ≡ .ts parity.
 * No real project-context-engine spawn (injected spawn seam); no real clock (injected now).
 */
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const JS = require("./runtime-context-loader.js");
const TS = require("./runtime-context-loader.ts");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const NOW = Date.parse("2026-10-19T00:00:00.000Z");
const HOUR = 3600_000, DAY = 24 * HOUR;
const FRESH = { project: { files: 10, directories: 3 }, generatedAt: "2026-10-18T18:00:00.000Z" }; // 6h old
const STALE = { project: { files: 10, directories: 3 }, generatedAt: "2026-07-27T03:09:24.783Z" }; // ~3 months
const REGEN = { project: { files: 999, directories: 99 }, generatedAt: "2026-10-19T00:00:00.000Z" }; // written by fake spawn

const FILE = path.join("runtime", "generated", "runtime-context.json");

// Run loadRuntimeContext in a temp cwd. `seed`=initial cache content (null ⇒ absent). Returns {ran, spawned, result|error}.
function run(mod, seed, opts) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcl-stale-"));
  try {
    process.chdir(dir);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (seed !== null) fs.writeFileSync(FILE, typeof seed === "string" ? seed : JSON.stringify(seed));
    let spawned = 0;
    const fakeSpawn = (_cmd, _args, _o) => { spawned += 1; if (opts.spawnFails) return { status: 1 }; fs.writeFileSync(FILE, JSON.stringify(REGEN)); return { status: 0 }; };
    let result, error = null;
    try { result = mod.loadRuntimeContext("M", { now: NOW, maxAgeMs: DAY, spawn: fakeSpawn, ...opts }); }
    catch (e) { error = e.message; }
    return { spawned, result, error };
  } finally {
    process.chdir(prev);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

console.log("runtime-context-loader — isStale (pure, injected clock)");
ok("fresh (6h < 24h) ⇒ NOT stale", JS.isStale(FRESH, NOW, DAY) === false && TS.isStale(FRESH, NOW, DAY) === false);
ok("old (3mo > 24h) ⇒ STALE", JS.isStale(STALE, NOW, DAY) === true && TS.isStale(STALE, NOW, DAY) === true);
ok("absent generatedAt ⇒ NOT stale (indeterminate ⇒ keep cache; bench-compat invariant)", JS.isStale({ project: {} }, NOW, DAY) === false && TS.isStale({ project: {} }, NOW, DAY) === false);
ok("invalid date string ⇒ NOT stale", JS.isStale({ generatedAt: "not-a-date" }, NOW, DAY) === false);
ok("non-object ⇒ stale (unusable)", JS.isStale(null, NOW, DAY) === true && TS.isStale(null, NOW, DAY) === true);
ok("non-positive policy ⇒ NOT stale", JS.isStale(STALE, NOW, 0) === false && JS.isStale(STALE, NOW, -1) === false);
ok("injected clock is deterministic (boundary: exactly maxAgeMs ⇒ not stale, +1ms ⇒ stale)",
  JS.isStale({ generatedAt: new Date(NOW - DAY).toISOString() }, NOW, DAY) === false &&
  JS.isStale({ generatedAt: new Date(NOW - DAY - 1).toISOString() }, NOW, DAY) === true);

console.log("runtime-context-loader — loadRuntimeContext regeneration decision");
for (const [name, mod] of [["JS", JS], ["TS", TS]]) {
  ok(`${name}: fresh cache ⇒ NO regeneration, returns cached`, (() => { const r = run(mod, FRESH, {}); return r.spawned === 0 && r.error === null && r.result.project.files === 10; })());
  ok(`${name}: STALE cache ⇒ regenerates, returns fresh`, (() => { const r = run(mod, STALE, {}); return r.spawned === 1 && r.error === null && r.result.project.files === 999; })());
  ok(`${name}: MISSING cache ⇒ generates`, (() => { const r = run(mod, null, {}); return r.spawned === 1 && r.result.project.files === 999; })());
  ok(`${name}: CORRUPT cache ⇒ regenerates`, (() => { const r = run(mod, "{not json", {}); return r.spawned === 1 && r.error === null; })());
  ok(`${name}: absent generatedAt ⇒ NO regeneration (keeps cache)`, (() => { const r = run(mod, { project: { files: 7, directories: 2 } }, {}); return r.spawned === 0 && r.result.project.files === 7; })());
  ok(`${name}: regeneration FAILS ⇒ throws (no false success)`, (() => { const r = run(mod, STALE, { spawnFails: true }); return r.spawned === 1 && r.error === "Unable to generate RuntimeContext."; })());
}

console.log("runtime-context-loader — .js ≡ .ts parity on the NEW staleness path");
for (const [label, seed, fails] of [["fresh", FRESH, false], ["stale", STALE, false], ["missing", null, false], ["regen-fail", STALE, true]]) {
  const j = run(JS, seed, { spawnFails: fails }), t = run(TS, seed, { spawnFails: fails });
  ok(`parity (${label}): identical spawned + outcome`, j.spawned === t.spawned && j.error === t.error && JSON.stringify(j.result) === JSON.stringify(t.result));
}

console.log(`\nRUNTIME-CONTEXT-LOADER — ${passed} assertions passed.`);
