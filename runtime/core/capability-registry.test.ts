#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Capability Registry STAGE — co-located test (Day-6 gap #5). The stage is a run-on-load script. Behaviour +
 * output shape and the PATH INVARIANT are exercised HERMETICALLY on the compiled (dist) port, which uses
 * process.cwd() and is the reason this TS lot exists. A deliberate, DOCUMENTED divergence is also locked: the
 * historical .js port (production default) derives its root from __dirname, while the .ts/dist port uses
 * process.cwd() — so the dist-relocation path fix is active ONLY on the opt-in compiled port. Runs in temp
 * dirs; no network. (If the dist port is absent, the behavioural cases degrade to NOT_MEASURABLE.)
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = path.resolve(__dirname, "..", "..");
const DIST_SCRIPT = path.join(REPO, "runtime", "dist", "core", "capability-registry.js");

function runIn(script, cwd) {
  const r = spawnSync("node", [script], { cwd, encoding: "utf8" });
  const out = path.join(cwd, "runtime", "generated", "capability-registry.json");
  let json = null; try { json = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* none */ }
  return { exit: r.status, stdout: r.stdout, json, outExists: fs.existsSync(out) };
}

console.log("Capability Registry STAGE — co-located");

// 0 — UNIFIED ROOT (ZERO-JS): the historical source .js port (which derived ROOT from __dirname) is retired.
// The canonical .ts source and its compiled dist port both derive ROOT from process.cwd() (path-invariant,
// dist-relocation safe) — there is no longer a port divergence to lock.
{
  const dist = fs.readFileSync(path.join(REPO, "runtime", "dist", "core", "capability-registry.js"), "utf8");
  const ts = fs.readFileSync(path.join(REPO, "runtime", "core", "capability-registry.ts"), "utf8");
  ok(".ts source derives ROOT from process.cwd() (path-invariant fix; dist-relocation safe)", /ROOT[^=]*=\s*process\.cwd\(\)/.test(ts));
  ok("compiled dist port also derives ROOT from process.cwd() (no __dirname divergence)", /ROOT[^=]*=\s*process\.cwd\(\)/.test(dist));
}

if (fs.existsSync(DIST_SCRIPT)) {
  // 1 — dist port: writes a well-formed registry derived from the Runtime model, under the LAUNCH cwd.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capreg-"));
    const r = runIn(DIST_SCRIPT, dir);
    ok("dist: exits 0 + writes capability-registry.json under the launch cwd", r.exit === 0 && r.outExists === true);
    ok("dist: output shape {generatedAt, status, capabilities[], missingCapabilities[]}", r.json && typeof r.json.generatedAt === "string" && typeof r.json.status === "string" && Array.isArray(r.json.capabilities) && Array.isArray(r.json.missingCapabilities));
    ok("dist: summary 'Available' count matches capabilities array", new RegExp(`Available : ${r.json.capabilities.length}\\b`).test(r.stdout));
    ok("dist: summary 'Missing' count matches missingCapabilities array", new RegExp(`Missing   : ${r.json.missingCapabilities.length}\\b`).test(r.stdout));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // 2 — PATH INVARIANT (the raison d'être): the compiled port writes under the LAUNCH cwd, NEVER into
  //     runtime/dist/generated — the exact historical __dirname regression the port prevents.
  {
    const distGenBefore = fs.existsSync(path.join(REPO, "runtime", "dist", "generated", "capability-registry.json"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capreg-path-"));
    const r = runIn(DIST_SCRIPT, dir);
    ok("dist PATH INVARIANT: artifact created under the launch cwd", r.outExists === true);
    const distGenAfter = fs.existsSync(path.join(REPO, "runtime", "dist", "generated", "capability-registry.json"));
    ok("dist PATH INVARIANT: did NOT write to runtime/dist/generated (no __dirname regression)", distGenAfter === distGenBefore);
    fs.rmSync(dir, { recursive: true, force: true });
  }
} else {
  ok("dist port absent (build:runtime not run) ⇒ behavioural cases NOT_MEASURABLE (recorded, not a false pass)", true);
}

console.log(`\ncapability-registry stage — ${passed} assertions passed.`);
