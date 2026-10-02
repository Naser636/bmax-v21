#!/usr/bin/env node

"use strict";

/*
 * Scope Observer — targeted test (Campaign 04 CTO families 1 & 2: artifact-nonempty + scope-clean).
 *
 * Proves ONLY the two authorized observations. Hermetic: artifact-nonempty uses throwaway temp files;
 * scope-clean uses an injected pre-parsed changed-path list (no real repo mutation). Also proves the
 * extracted changedPathsInScope/trackedFilesInScope primitives keep their prior semantics. Does NOT
 * assert any gate behaviour and is not coupled to SUCCESS.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const so = require("./scope-observer");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// ---- ARTIFACT-NONEMPTY ----
console.log("artifact-nonempty");
const dir = path.join(os.tmpdir(), "odg-scope-observer-test");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const full = path.join(dir, "evidence.json");
const empty = path.join(dir, "empty.json");
const absent = path.join(dir, "nope.json");
fs.writeFileSync(full, JSON.stringify({ x: 1 }));
fs.writeFileSync(empty, "");
try {
  ok("present & non-empty ⇒ ok", so.artifactNonEmpty(full).ok === true);
  ok("empty file ⇒ not ok", so.artifactNonEmpty(empty).ok === false);
  ok("absent file ⇒ not ok", so.artifactNonEmpty(absent).ok === false);
  ok("no path declared ⇒ not ok", so.artifactNonEmpty("").ok === false && so.artifactNonEmpty(null).ok === false);
  ok("never asserts correctness (detail speaks only of presence/size)",
    /present and non-empty/.test(so.artifactNonEmpty(full).detail) && !/correct|valid|semantic/i.test(so.artifactNonEmpty(full).detail));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- SCOPE-CLEAN (injected changed-path lists; no real git mutation) ----
console.log("scope-clean");
const scope = ["src/app/autonomy-loop/**", "runtime/core/**"];
ok("all changes in scope ⇒ clean",
  so.scopeClean(scope, ["src/app/autonomy-loop/marker.ts", "runtime/core/x.js"]).ok === true);
ok("a change outside scope ⇒ NOT clean",
  so.scopeClean(scope, ["src/app/autonomy-loop/marker.ts", "src/other/leak.ts"]).ok === false);
ok("out-of-scope offender is reported",
  /src\/other\/leak\.ts/.test(so.scopeClean(scope, ["src/other/leak.ts"]).detail));
ok("no changes ⇒ trivially clean (same post-commit behaviour as the gate)",
  so.scopeClean(scope, []).ok === true);
ok("empty authorized scope + any change ⇒ NOT clean",
  so.scopeClean([], ["anything.ts"]).ok === false);

// ---- extracted primitives keep prior semantics ----
console.log("extracted primitives");
ok("changedPathsInScope filters to in-scope prefixes",
  JSON.stringify(so.changedPathsInScope(scope, ["runtime/core/a.js", "docs/x.md"])) === JSON.stringify(["runtime/core/a.js"]));
ok("changedPathsInScope normalizes glob tails (/** stripped)",
  so.changedPathsInScope(["runtime/core/**"], ["runtime/core/deep/y.js"]).length === 1);
ok("trackedFilesInScope returns [] for empty scope", so.trackedFilesInScope([]).length === 0);

// ---- FILE-COUNT / FILE-EXISTENCE (git-tracked source) ----
console.log("file-count (git-tracked)");
// Hermetic cases via an injected tracked-provider (no git needed): count logic + params.
const fake = (list) => () => list;
ok("exists (>=1) when tracked files present", so.fileCount("src/app", undefined, fake(["a", "b"])).ok === true);
ok("not exists when no tracked file", so.fileCount("some/empty", undefined, fake([])).ok === false);
ok("exact count correct ⇒ ok", so.fileCount("p", 2, fake(["a", "b"])).ok === true);
ok("exact count incorrect ⇒ not ok", so.fileCount("p", 3, fake(["a", "b"])).ok === false);
ok("exact count 0 with no tracked file ⇒ ok", so.fileCount("p", 0, fake([])).ok === true);
ok("invalid path ('' / null) ⇒ not ok", so.fileCount("", 1, fake(["a"])).ok === false && so.fileCount(null).ok === false);
ok("invalid count (string) ⇒ not ok", so.fileCount("p", "2", fake(["a", "b"])).ok === false);
ok("invalid count (negative) ⇒ not ok", so.fileCount("p", -1, fake(["a"])).ok === false);
ok("detail speaks only of tracked file count, never content/correctness",
  !/content|correct|valid[^e]|semantic/i.test(so.fileCount("p", 2, fake(["a", "b"])).detail));

// Real git-tracked source cases (determinism + NO false positive from untracked/ignored):
const trackedSrcApp = so.trackedFilesInScope(["src/app"]).length; // compute expected, avoid brittleness
ok("real: >=1 tracked file under src/app (tracked source)", so.fileCount("src/app").ok === true && trackedSrcApp >= 1);
ok("real: exact tracked count under src/app matches trackedFilesInScope",
  so.fileCount("src/app", trackedSrcApp).ok === true && so.fileCount("src/app", trackedSrcApp + 1).ok === false);
ok("real: path normalization — 'src/app/**' behaves like 'src/app'",
  so.fileCount("src/app/**").ok === so.fileCount("src/app").ok);
// runtime/generated is git-IGNORED (0 tracked) yet has untracked/ignored files on disk ⇒ proves the
// raw-worktree is excluded: a tracked-source count sees ZERO, so no false positive from ignored files.
ok("real: git-ignored dir with on-disk files ⇒ no tracked file (no raw-worktree false positive)",
  so.fileCount("runtime/generated").ok === false && so.fileCount("runtime/generated", 0).ok === true);

// ---- CONFIG-EQ (A-type, file-backed observation only) ----
console.log("config-eq (file-backed, strict, no coercion)");
const CFG = "runtime/policies/runtime-policies.json"; // real git-tracked config
const ABSENT = "runtime/policies/__does_not_exist__.json";
// Read expected values dynamically from the real file to avoid brittleness.
const realCfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
const realEnabled = realCfg.contractOnDemand.enabled;           // boolean
const realCaps = realCfg.contractOnDemand.capabilities;         // array (ordered)

ok("real file + key + identical value ⇒ PASS", so.configEq(CFG, "contractOnDemand.enabled", realEnabled).ok === true);
ok("value different ⇒ FAIL", so.configEq(CFG, "contractOnDemand.enabled", !realEnabled).ok === false);
ok("type different without coercion ⇒ FAIL (bool vs string)", so.configEq(CFG, "contractOnDemand.enabled", String(realEnabled)).ok === false);
ok("key absent ⇒ FAIL", so.configEq(CFG, "contractOnDemand.doesNotExist", 1).ok === false);
ok("nested dotted path resolves", so.configEq(CFG, "contractOnDemand.enabled", realEnabled).ok === true);
ok("file absent/invalid ⇒ FAIL", so.configEq(ABSENT, "x", 1).ok === false);
ok("structured array — exact order ⇒ PASS", so.configEq(CFG, "contractOnDemand.capabilities", realCaps.slice()).ok === true);
ok("structured array — reversed order ⇒ FAIL", so.configEq(CFG, "contractOnDemand.capabilities", realCaps.slice().reverse()).ok === (realCaps.length <= 1));
ok("structured array — subset ⇒ FAIL", so.configEq(CFG, "contractOnDemand.capabilities", realCaps.slice(0, Math.max(0, realCaps.length - 1))).ok === false);
ok("invalid params (no file) ⇒ FAIL", so.configEq("", "k", 1).ok === false);
ok("invalid params (no key) ⇒ FAIL", so.configEq(CFG, "", 1).ok === false);
ok("invalid params (no expected value) ⇒ FAIL", so.configEq(CFG, "contractOnDemand.enabled").ok === false);
ok("detail speaks only of observed value/match, never a behavioural claim",
  // Behavioural-claim words only (the file path legitimately contains the token "runtime").
  !/\b(governed|is used|uses this|behaviou?r|effectively|respects|honou?rs)\b/i.test(so.configEq(CFG, "contractOnDemand.enabled", realEnabled).detail));

// Environment variable is NEVER consulted: even if an env var mirrors the key, config-eq ignores it.
process.env.CONTRACTONDEMAND_ENABLED = String(realEnabled);
ok("env var never used (key only in env ⇒ FAIL)", so.configEq(CFG, "CONTRACTONDEMAND_ENABLED", realEnabled).ok === false);
delete process.env.CONTRACTONDEMAND_ENABLED;
ok("source performs no process.env access (property/index), only mentions it in a comment",
  !/process\.env[.[]/.test(fs.readFileSync("runtime/core/scope-observer.js", "utf8")));

console.log(`\nSCOPE OBSERVER — ${passed} assertions passed.`);
