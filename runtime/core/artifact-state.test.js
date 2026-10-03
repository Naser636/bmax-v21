#!/usr/bin/env node
"use strict";

/*
 * V5 Decision A — artifact/resource reality-state store. Locks: canonical identity (stable/distinct,
 * path-escape rejected), read, initial version, versioned transition tied to real content, compare-and-set
 * match/stale, zero change on CONFLICT, provenance, persistence round-trip, determinism, invalid inputs.
 *
 * Run directly: node runtime/core/artifact-state.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const A = require("./artifact-state");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("V5 DECISION A — ARTIFACT/RESOURCE REALITY STATE");

// Canonical identity: stable, distinct, path-escape rejected (never a path-as-identity escape).
check(A.canonicalId("runtime/work/a.js") === "runtime/work/a.js", "canonical id = normalized repo-relative path");
check(A.canonicalId("runtime/work/../work/a.js") === "runtime/work/a.js", "equivalent paths normalize to the SAME identity (stable)");
check(A.canonicalId("runtime/work/a.js") !== A.canonicalId("runtime/work/b.js"), "distinct targets ⇒ distinct identities");
check(A.canonicalId("/etc/passwd") === null && A.canonicalId("../x") === null, "absolute / '..' escape ⇒ rejected (not an identity)");
check(A.hashContent("x\n") === A.hashContent("x\n") && A.hashContent("x\n") !== A.hashContent("y\n"), "content hash deterministic + content-sensitive");

// Initial write: untracked artifact is version 0 → first transition (expected 0) ⇒ version 1.
{
  const m0 = A.emptyModel();
  check(A.currentVersion(m0, "runtime/work/a.js") === 0 && A.read(m0, "runtime/work/a.js") === null, "untracked artifact ⇒ version 0, read null");
  const r = A.transition(m0, "runtime/work/a.js", { expectedPreviousVersion: 0, content: "v1\n", provenance: "run-1" });
  check(r.ok && r.artifact.version === 1 && r.artifact.contentHash === A.hashContent("v1\n") && r.artifact.provenance === "run-1", "first write (CAS 0) ⇒ version 1, contentHash of real content, provenance");
}

// Valid sequential transition ⇒ version increments; content hash tracks reality.
{
  let m = A.transition(A.emptyModel(), "runtime/work/a.js", { expectedPreviousVersion: 0, content: "v1\n" }).model;
  const r2 = A.transition(m, "runtime/work/a.js", { expectedPreviousVersion: 1, content: "v2\n", provenance: "run-2" });
  check(r2.ok && r2.artifact.version === 2 && r2.artifact.contentHash === A.hashContent("v2\n"), "CAS match (1) ⇒ version 1→2, new content hash");
}

// Compare-and-set STALE ⇒ CONFLICT, zero change.
{
  let m = A.transition(A.emptyModel(), "runtime/work/a.js", { expectedPreviousVersion: 0, content: "v1\n" }).model; // v1
  m = A.transition(m, "runtime/work/a.js", { expectedPreviousVersion: 1, content: "v2\n" }).model; // v2
  const stale = A.transition(m, "runtime/work/a.js", { expectedPreviousVersion: 1, content: "vX\n" }); // expects 1, actual 2
  check(stale.ok === false && stale.decision === "CONFLICT", "stale compare-and-set ⇒ CONFLICT");
  check(A.read(stale.model, "runtime/work/a.js").version === 2 && A.read(stale.model, "runtime/work/a.js").contentHash === A.hashContent("v2\n"), "CONFLICT ⇒ ZERO change (version + contentHash unchanged)");
}

// expectedPreviousVersion required; invalid identity/content rejected.
{
  const m = A.emptyModel();
  check(!A.transition(m, "runtime/work/a.js", { content: "x" }).ok, "missing expectedPreviousVersion ⇒ REJECTED (CAS mandatory)");
  check(!A.transition(m, "/abs/x", { expectedPreviousVersion: 0, content: "x" }).ok, "invalid identity (absolute) ⇒ REJECTED");
  check(!A.transition(m, "runtime/work/a.js", { expectedPreviousVersion: 0 }).ok, "no content/contentHash ⇒ REJECTED");
  // A brand-new artifact with a non-zero expected version ⇒ CONFLICT (expected a prior state that does not exist).
  check(A.transition(m, "runtime/work/new.js", { expectedPreviousVersion: 3, content: "x" }).decision === "CONFLICT", "new artifact with expected>0 ⇒ CONFLICT");
}

// Persistence round-trip + determinism.
{
  const seq = () => A.transition(A.transition(A.emptyModel(), "runtime/work/a.js", { expectedPreviousVersion: 0, content: "v1\n" }).model, "runtime/work/a.js", { expectedPreviousVersion: 1, content: "v2\n" }).model;
  check(JSON.stringify(seq()) === JSON.stringify(seq()), "deterministic: same sequence ⇒ identical model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "as-"));
  try {
    const file = path.join(dir, "artifact-state.json");
    const m = seq();
    A.save(file, m);
    check(JSON.stringify(A.load(file)) === JSON.stringify(m), "persistence round-trip: save → load identical");
    check(A.read(A.load(file), "runtime/work/a.js").version === 2, "reloaded artifact keeps version");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  check(JSON.stringify(A.load(path.join("no", "such.json"))) === JSON.stringify(A.emptyModel()), "load of missing file ⇒ empty model");
}

// Boundary: reality store reuses C03 and is not the epistemic/governance/projection layers.
{
  const src = fs.readFileSync(path.join(__dirname, "artifact-state.js"), "utf8");
  check(/require\(["']\.\/state-transition["']\)/.test(src), "reality store REUSES the C03 validator");
  check(!/require\(["']\.\/world-model["']\)/.test(src) && !/require\(["']\.\/runtime-model["']\)/.test(src) && !/require\(["']\.\/mission-lifecycle["']\)/.test(src), "reality store does NOT import world-model / runtime-model / mission-lifecycle (distinct layer)");
}

console.log(failures === 0 ? "ALL PASS — V5 ARTIFACT REALITY STATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
