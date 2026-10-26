#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * RUNTIME-PATHS CONTRACT (ZERO-JS L-iii) — runtime/core/runtime-paths.ts is now the SOLE port. Replaces the
 * dual-port equivalence bench. coreDir/repoRoot take a module __dirname as an ARGUMENT; the KEY correctness
 * property is that a dist-layout dirname maps BACK to the canonical runtime/core / repo root (so repo-relative
 * data files + sibling executors resolve against the real source tree, never dist).
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "runtime-paths.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("exports coreDir + repoRoot", typeof m.coreDir === "function" && typeof m.repoRoot === "function");

const FAKE_REPO = path.join(path.sep, "x", "y", "bmax");
const SOURCE_CORE = path.join(FAKE_REPO, "runtime", "core");
const DIST_CORE = path.join(FAKE_REPO, "runtime", "dist", "core");

ok("coreDir(source) is identity", m.coreDir(SOURCE_CORE) === SOURCE_CORE);
ok("coreDir(dist) maps BACK to runtime/core", m.coreDir(DIST_CORE) === SOURCE_CORE);
ok("repoRoot(source) === repoRoot(dist) === repo root", m.repoRoot(SOURCE_CORE) === FAKE_REPO && m.repoRoot(DIST_CORE) === FAKE_REPO);
// Stable/total on unrelated inputs (never throws).
let threw = false; try { m.coreDir(path.join(path.sep, "tmp", "whatever")); m.repoRoot(path.join(path.sep, "tmp", "whatever")); } catch { threw = true; }
ok("coreDir/repoRoot total on unrelated dirs (no throw)", threw === false);

console.log(`\nRUNTIME-PATHS CONTRACT — ${passed} assertions passed.`);
