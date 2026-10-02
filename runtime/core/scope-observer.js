#!/usr/bin/env node

"use strict";

/*
 * Scope Observer — Campaign 04 (CTO decision P0-CURRENT-034, families 1 & 2).
 *
 * SINGLE shared implementation of the working-tree scope primitives and the evidence-integrity
 * predicate. The Validation Engine delegates to this module (behavior-preserving) so there is NO
 * second concurrent implementation of the scope / evidence logic. This module adds exactly the two
 * AUTHORIZED observations:
 *
 *   artifactNonEmpty(path)  — ARTIFACT-NONEMPTY: the declared artifact EXISTS and is NON-EMPTY.
 *                             Reuses the Validation Engine's evidence-integrity predicate. It
 *                             proves existence + non-emptiness ONLY — NEVER semantic correctness.
 *   scopeClean(paths)       — SCOPE-CLEAN: no working-tree change lies OUTSIDE the authorized scope.
 *                             Reuses the same git porcelain + prefix logic and the SAME moment of
 *                             observation as the Validation Engine.
 *
 * It is NOT a proof engine, is NOT coupled to SUCCESS, performs NO done_when text interpretation,
 * and introduces NO keyword mapping. git-backed functions accept an optional pre-parsed changed-path
 * list / stat function so the pure logic is testable without mutating a real repository.
 *
 * NOTE (moment of observation): scopeClean reads `git status --porcelain` at call time — the SAME
 * context as the gate. After a commit the porcelain is empty ⇒ scopeClean is trivially clean; this
 * matches the existing gate behaviour and does NOT by itself prove that engineering was performed.
 */

const fs = require("fs");
const { execFileSync } = require("child_process");

// Raw working-tree changes via git porcelain (status code stripped), same parse as the gate used.
function gitChangedPaths() {
  let porcelain = "";
  try {
    porcelain = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  } catch {
    return [];
  }
  return porcelain
    .split(/\r?\n/)
    .map((l) => l.slice(3).trim()) // strip the 2-char status + space
    .filter(Boolean);
}

// Normalize authorized paths (drop glob tails like /** or *) to a prefix set.
function normalizePrefixes(authorizedPaths) {
  return (Array.isArray(authorizedPaths) ? authorizedPaths : [])
    .map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
    .filter((p) => p.length > 0);
}

// Verbatim semantics of the Validation Engine's former private changedPathsInScope() closure.
function changedPathsInScope(authorizedPaths, changedPaths) {
  const changed = Array.isArray(changedPaths) ? changedPaths : gitChangedPaths();
  const prefixes = normalizePrefixes(authorizedPaths);
  return changed.filter((f) => prefixes.some((pre) => f.startsWith(pre)));
}

// Verbatim semantics of the Validation Engine's former private trackedFilesInScope() closure.
function trackedFilesInScope(authorizedPaths) {
  const prefixes = normalizePrefixes(authorizedPaths);
  if (prefixes.length === 0) return [];
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", "--", ...prefixes], { encoding: "utf8" });
  } catch {
    return [];
  }
  return tracked.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// ARTIFACT-NONEMPTY (CTO decision family 1): existence + non-emptiness of the declared artifact
// ONLY. Reuses the evidence-integrity predicate (fs stat size > 0). Never asserts correctness.
function artifactNonEmpty(p, statFn) {
  const stat = typeof statFn === "function" ? statFn : (x) => fs.statSync(x);
  if (typeof p !== "string" || !p) return { ok: false, detail: "no artifact path declared" };
  try {
    const size = stat(p).size;
    return size > 0
      ? { ok: true, detail: `artifact present and non-empty (${p}, ${size} bytes)` }
      : { ok: false, detail: `artifact is empty (${p})` };
  } catch {
    return { ok: false, detail: `artifact absent (${p})` };
  }
}

// SCOPE-CLEAN (CTO decision family 2): no working-tree change lies OUTSIDE the authorized scope.
// Reuses the same porcelain + prefix logic and the same moment of observation as the gate.
function scopeClean(authorizedPaths, changedPaths) {
  const changed = Array.isArray(changedPaths) ? changedPaths : gitChangedPaths();
  const inScope = new Set(changedPathsInScope(authorizedPaths, changed));
  const outOfScope = changed.filter((f) => !inScope.has(f));
  return outOfScope.length === 0
    ? { ok: true, detail: `no change outside authorized scope (${changed.length} changed, all in scope)` }
    : { ok: false, detail: `change(s) outside authorized scope: ${outOfScope.join(", ")}` };
}

// FILE-COUNT / FILE-EXISTENCE (CTO decision family 3, source FIXED to git-tracked).
// Positive existence / exact count of GIT-TRACKED files under a path. Raw-worktree is explicitly
// EXCLUDED (untracked/ignored files never count) so the observation is deterministic for a committed
// state. Reuses trackedFilesInScope (git ls-files) — no new engine. Proves existence/number ONLY,
// never content or semantic conformance. Absence "on disk" clauses are NOT handled here (they use the
// existing raw-fs existence probes); tracked-vs-ignored classification is out of scope.
//
//   count omitted ⇒ ok iff ≥1 tracked file exists under path.
//   count given   ⇒ ok iff exactly `count` tracked files exist under path.
// trackedProvider is injectable (defaults to the real git-tracked lookup) for hermetic tests.
function fileCount(p, count, trackedProvider) {
  if (typeof p !== "string" || !p) return { ok: false, detail: "no path declared" };
  if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) {
    return { ok: false, detail: `invalid count parameter: ${JSON.stringify(count)}` };
  }
  const provider = typeof trackedProvider === "function" ? trackedProvider : (x) => trackedFilesInScope([x]);
  const tracked = provider(p);
  const n = Array.isArray(tracked) ? tracked.length : 0;
  if (count === undefined) {
    return n >= 1
      ? { ok: true, detail: `${n} tracked file(s) under ${p}` }
      : { ok: false, detail: `no tracked file under ${p}` };
  }
  return n === count
    ? { ok: true, detail: `exactly ${count} tracked file(s) under ${p}` }
    : { ok: false, detail: `expected exactly ${count} tracked file(s) under ${p}, found ${n}` };
}

module.exports = {
  gitChangedPaths,
  changedPathsInScope,
  trackedFilesInScope,
  artifactNonEmpty,
  scopeClean,
  fileCount,
};
