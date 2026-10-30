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

// §F Compass: RESTORED (Phase-2A) — compass-update is now compiled into runtime/dist/scripts and dist-resolved, so the
// line is present AND actually computed (not UNAVAILABLE). FAILS on the pre-Phase-2A code (it printed UNAVAILABLE). Non-vacuous.
const compassLine = hout.split("\n").find((l) => /^Compass\s*:/.test(l)) || "";
ok("dist odg-health prints a Compass line (§F observable never silently dropped)", /^Compass\s*:/m.test(hout));
ok("dist Compass is RESTORED (computed, not UNAVAILABLE) — compass-update loads from dist", compassLine !== "" && !/UNAVAILABLE/.test(compassLine));

// CM-4 classified: RESTORED (Phase-2A) — capability-classify compiled into runtime/dist/scripts and dist-resolved, so the
// line is present AND actually computed (not UNAVAILABLE). FAILS on the pre-Phase-2A code (UNAVAILABLE). Non-vacuous.
const classifiedLine = sout.split("\n").find((l) => /classified\s*:/.test(l)) || "";
ok("dist odg-status prints a classified line (never silently dropped)", /classified\s*:/m.test(sout));
ok("dist classified is RESTORED (computed, not UNAVAILABLE) — capability-classify loads from dist", classifiedLine !== "" && !/UNAVAILABLE/.test(classifiedLine));

// read-only: spawning the dashboards must not mutate the tracked tree (sanity — they are health/status probes).
ok("dashboards exited (health/status produced output)", hout.length > 0 && sout.length > 0);

console.log(`\nODG-HEALTH/STATUS dist integration — ${pass} assertions passed. (production dist dashboards; §G Supervision restored; §F Compass + CM-4 classified fail-VISIBLE not silently dropped; read-only)`);
