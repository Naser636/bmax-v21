#!/usr/bin/env node
"use strict";

/*
 * V5 Decision A — LIVE reality CAS on the patch-executor WRITE path. Order:
 * ADMISSION → IDEMPOTENCY → REALITY READ + compare-and-set → WRITE → REALITY TRANSITION → EVIDENCE.
 * Proven against the REAL patch-executor: first opted-in write ⇒ APPLIED + authentic reality version
 * (sha256 of real content) + persisted; stale version ⇒ CONFLICT + ZERO mutation; matching ⇒ write +
 * version increment; admission DENY precedes reality (no DENY→WRITE); legacy ⇒ unchanged + no store.
 *
 * Run directly: node runtime/core/artifact-state-live.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const A = require("./artifact-state");

const REPO = process.cwd();
const PE = path.join(REPO, "runtime", "core", "patch-executor.js");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "as-live-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
  return dir;
}
function setPlan(dir, patch) { fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify({ mission: "AS", authorizedPaths: ["runtime/work/**"], patches: [patch] })); }
function run(dir) { spawnSync("node", [PE], { cwd: dir, encoding: "utf8" }); return JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8")).executed[0]; }
const OUT = "runtime/work/out.js";
function content(dir) { try { return fs.readFileSync(path.join(dir, OUT), "utf8"); } catch { return null; } }
function storeExists(dir) { return fs.existsSync(path.join(dir, "runtime", "generated", "artifact-state.json")); }

console.log("V5 DECISION A — LIVE REALITY CAS (patch-executor)");

// Sequential lifecycle in ONE sandbox: v1 (expect 0) → stale (expect 0, actual 1) → match (expect 1).
{
  const dir = sandbox();
  setPlan(dir, { action: "O", objectiveId: "O", realityCas: true, edits: [{ target: OUT, content: "v1\n", expectedVersion: 0 }] });
  const r1 = run(dir);
  check(r1.status === "APPLIED" && content(dir) === "v1\n", "first opted-in write (expect v0) ⇒ APPLIED + file written");
  check(Array.isArray(r1.reality) && r1.reality[0].version === 1 && r1.reality[0].contentHash === A.hashContent("v1\n"), "reality version 1 recorded with AUTHENTIC content hash");
  check(storeExists(dir), "artifact-state.json persisted");

  setPlan(dir, { action: "O", objectiveId: "O", realityCas: true, edits: [{ target: OUT, content: "STALE\n", expectedVersion: 0 }] });
  const r2 = run(dir);
  check(r2.status === "FAILED" && /reality CONFLICT/.test(r2.error || ""), "stale expectedVersion (0 vs current 1) ⇒ reality CONFLICT, FAILED");
  check(content(dir) === "v1\n", "CONFLICT ⇒ ZERO mutation (file still v1, not overwritten to STALE)");

  setPlan(dir, { action: "O", objectiveId: "O", realityCas: true, edits: [{ target: OUT, content: "v2\n", expectedVersion: 1 }] });
  const r3 = run(dir);
  check(r3.status === "APPLIED" && content(dir) === "v2\n" && r3.reality[0].version === 2, "matching expectedVersion (1) ⇒ APPLIED, reality version 1→2");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Persistence across runs: version survives reload (store on disk, not caller-supplied).
{
  const dir = sandbox();
  setPlan(dir, { action: "O", objectiveId: "O", realityCas: true, edits: [{ target: OUT, content: "a\n", expectedVersion: 0 }] });
  run(dir);
  const reloaded = A.load(path.join(dir, "runtime", "generated", "artifact-state.json"));
  check(A.read(reloaded, OUT).version === 1 && A.read(reloaded, OUT).contentHash === A.hashContent("a\n"), "reality version persisted on disk (authentic, reload-stable)");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Admission DENY precedes reality: an explicit Action Contract with realityCas but NO authority ⇒ DENY,
// zero mutation, and NO reality transition (no DENY→WRITE, no reality side effect).
{
  const dir = sandbox();
  setPlan(dir, { action: "O", objectiveId: "O", actionContract: { realityCas: true, expectedTransition: { state_before: { v: 1 }, action: { d: 1 }, observed_effect: { d: 1 }, state_after: { v: 2 }, state_version_before: 1, state_version_after: 2, difference: { v: { before: 1, after: 2 } }, evidence_refs: [], verification_status: "RECORDED" } }, edits: [{ target: OUT, content: "x\n", expectedVersion: 0 }] });
  const r = run(dir);
  check(r.status === "FAILED" && /action gate DENY/.test(r.error || ""), "admission DENY (no authority) precedes reality ⇒ FAILED");
  check(content(dir) === null && !storeExists(dir), "DENY ⇒ zero mutation AND no reality transition");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Legacy (no realityCas) ⇒ APPLIED, no artifact-state store (recorded ≠ protected; no false promise).
{
  const dir = sandbox();
  setPlan(dir, { action: "O", objectiveId: "O", edits: [{ target: OUT, content: "x\n" }] });
  const r = run(dir);
  check(r.status === "APPLIED" && content(dir) === "x\n" && !storeExists(dir) && r.reality === undefined, "legacy no-realityCas ⇒ APPLIED, no reality store, no reality field");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — V5 DECISION A LIVE REALITY CAS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
