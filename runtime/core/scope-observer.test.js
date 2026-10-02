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

console.log(`\nSCOPE OBSERVER — ${passed} assertions passed.`);
