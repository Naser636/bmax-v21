#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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
const { execFileSync } = require("child_process");
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

// ---- PATH-BOUNDARY escape (OWASP agentic T6/T3): a sibling of an authorized prefix MUST NOT be admitted ----
ok("sibling DIRECTORY of an authorized prefix is OUT of scope (runtime/coreEVIL ⊄ runtime/core)",
  so.scopeClean(["runtime/core/**"], ["runtime/coreEVIL/leak.ts"]).ok === false);
ok("suffix SIBLING of an authorized concrete file is OUT of scope (src/app.js.bak ⊄ src/app.js)",
  so.scopeClean(["src/app.js"], ["src/app.js.bak"]).ok === false);
ok("exact concrete-file match is IN scope (boundary fix keeps legitimate case)",
  so.scopeClean(["src/app.js"], ["src/app.js"]).ok === true);
ok("true descendant of a dir prefix is IN scope (boundary fix keeps legitimate case)",
  so.scopeClean(["runtime/core/**"], ["runtime/core/x.ts"]).ok === true);
ok("changedPathsInScope excludes the sibling escape but keeps the real descendant",
  JSON.stringify(so.changedPathsInScope(["runtime/core"], ["runtime/coreEVIL/x.ts", "runtime/core/x.ts"]))
    === JSON.stringify(["runtime/core/x.ts"]));

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

// Real git-tracked source cases via a HERMETIC temporary git fixture — reproducible EVERYWHERE (real
// repo AND clean archive), with NO dependency on the outer working tree. Uses REAL `git init`/`git add`
// (git results are never mocked), covers the git-repo path AND the no-git path, and cleans up ONLY its
// own throwaway fixtures (never the user repository). This replaces the former assertions that depended
// on the process being launched from inside a live repo (they failed in a bare archive — a test-harness
// reproducibility gap, not a product defect: `trackedFilesInScope` runs real `git ls-files`).
console.log("file-count (real git — temp fixture)");
const soOriginalCwd = process.cwd();
const gitFix = fs.mkdtempSync(path.join(os.tmpdir(), "odg-scope-git-"));
const noGitFix = fs.mkdtempSync(path.join(os.tmpdir(), "odg-scope-nogit-"));
try {
  // A real git working tree: two tracked files under src/app, plus a git-IGNORED dir carrying on-disk
  // files (mirrors the real runtime/generated case — ignored ⇒ 0 tracked, so no raw-worktree false positive).
  const g = (args) => execFileSync("git", args, { cwd: gitFix, encoding: "utf8" });
  g(["init", "-q"]);
  g(["config", "user.email", "odg@test.local"]);
  g(["config", "user.name", "odg-test"]);
  fs.mkdirSync(path.join(gitFix, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(gitFix, "src", "app", "one.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(gitFix, "src", "app", "two.ts"), "export const b = 2;\n");
  fs.writeFileSync(path.join(gitFix, ".gitignore"), "ignored/\n");
  fs.mkdirSync(path.join(gitFix, "ignored"), { recursive: true });
  fs.writeFileSync(path.join(gitFix, "ignored", "junk.txt"), "transient on-disk artifact\n");
  g(["add", "src/app", ".gitignore"]); // staged ⇒ listed by `git ls-files` (no commit needed)

  process.chdir(gitFix);
  const trackedSrcApp = so.trackedFilesInScope(["src/app"]).length; // real `git ls-files -- src/app`
  ok("git fixture: exactly 2 tracked files under src/app", trackedSrcApp === 2);
  ok("git fixture: >=1 tracked file under src/app ⇒ exists", so.fileCount("src/app").ok === true && trackedSrcApp >= 1);
  ok("git fixture: exact tracked count matches trackedFilesInScope",
    so.fileCount("src/app", trackedSrcApp).ok === true && so.fileCount("src/app", trackedSrcApp + 1).ok === false);
  ok("git fixture: path normalization — 'src/app/**' behaves like 'src/app'",
    so.fileCount("src/app/**").ok === so.fileCount("src/app").ok && so.fileCount("src/app/**", 2).ok === true);
  ok("git fixture: git-ignored dir with on-disk files ⇒ 0 tracked (no raw-worktree false positive)",
    so.fileCount("ignored").ok === false && so.fileCount("ignored", 0).ok === true);

  // No-git path: outside any git working tree `git ls-files` fails and is CAUGHT ⇒ 0 tracked (graceful,
  // no throw, no false positive). Proves the primitive is environment-honest, never a mocked git result.
  fs.mkdirSync(path.join(noGitFix, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(noGitFix, "src", "app", "untracked.ts"), "export const c = 3;\n");
  process.chdir(noGitFix);
  ok("no-git path: `git ls-files` unavailable ⇒ 0 tracked, fileCount not-ok (graceful, no false positive)",
    so.trackedFilesInScope(["src/app"]).length === 0 && so.fileCount("src/app").ok === false);
} finally {
  process.chdir(soOriginalCwd);
  fs.rmSync(gitFix, { recursive: true, force: true });
  fs.rmSync(noGitFix, { recursive: true, force: true });
}

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
