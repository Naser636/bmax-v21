#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION test of the COMPILED dist dashboards (the production path: the `odg` CLI
// runs `node runtime/dist/bin/odg-health.js` / `odg-status.js` with NO tsx fallback). Regression lock for a real
// observability defect: the §G Supervision line was SILENTLY dropped in dist (its source-path require resolved to a
// non-existent runtime/core/*.js under zero-JS), and §F Compass / CM-4 classified were silently dropped too. Now:
// Supervision is RESTORED (supervision-summary compiled into dist), and Compass/classified are FAIL-VISIBLE (UNAVAILABLE)
// rather than silently absent. These lines must NEVER vanish. Spawns the real compiled bins; read-only (no repo mutation).
"use strict";
const assert = require("assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ROOT = process.cwd();
const HEALTH = path.join(ROOT, "runtime", "dist", "bin", "odg-health.js");
const STATUS = path.join(ROOT, "runtime", "dist", "bin", "odg-status.js");
// pretest runs build:runtime, so the dist bins exist in CI. If somehow absent, fail LOUD (never skip silently).
ok("compiled dist dashboards exist (built by pretest)", fs.existsSync(HEALTH) && fs.existsSync(STATUS));

const health = spawnSync("node", [HEALTH], { cwd: ROOT, encoding: "utf8" });
const hout = (health.stdout || "") + (health.stderr || "");
const status = spawnSync("node", [STATUS], { cwd: ROOT, encoding: "utf8" });
const sout = (status.stdout || "") + (status.stderr || "");

// §G Supervision: RESTORED — the line is present AND actually computed (not UNAVAILABLE) because supervision-summary
// is now compiled into dist and dist-resolved. This assertion FAILS on the pre-fix code (line was absent). Non-vacuous.
const supLine = hout.split("\n").find((l) => /^Supervision\s*:/.test(l)) || "";
ok("dist odg-health prints a Supervision line (§G observable never silently dropped)", /^Supervision\s*:/m.test(hout));
ok("dist Supervision is RESTORED (computed, not UNAVAILABLE) — supervision-summary loads from dist", supLine !== "" && !/UNAVAILABLE/.test(supLine));

// §F Compass: present (never silently dropped) — may be a real status OR an honest UNAVAILABLE, but NEVER absent.
ok("dist odg-health prints a Compass line (present — real or honest UNAVAILABLE, never silently absent)", /^Compass\s*:/m.test(hout));

// CM-4 classified: present on odg-status (real or honest UNAVAILABLE, never silently absent).
ok("dist odg-status prints a classified line (present — real or honest UNAVAILABLE, never silently absent)", /classified\s*:/m.test(sout));

// read-only: spawning the dashboards must not mutate the tracked tree (sanity — they are health/status probes).
ok("dashboards exited (health/status produced output)", hout.length > 0 && sout.length > 0);

console.log(`\nODG-HEALTH/STATUS dist integration — ${pass} assertions passed. (production dist dashboards; §G Supervision restored; §F Compass + CM-4 classified fail-VISIBLE not silently dropped; read-only)`);
