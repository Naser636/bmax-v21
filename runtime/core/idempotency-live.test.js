#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 5 — LIVE idempotency/CAS on the patch-executor WRITE path. Order is
 * ACTION-CONTRACT ADMISSION → IDEMPOTENCY/CAS → MUTATION. Proven end-to-end against the REAL
 * patch-executor: PROCEED→write+record; DUPLICATE replay→zero new mutation; CONFLICT (stale CAS)→zero
 * mutation; admission DENY fires BEFORE idempotency; legacy (no key)→unguarded, no journal. Opt-in.
 *
 * Run directly: node runtime/core/idempotency-live.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = process.cwd();
const PE = path.join(REPO, "runtime", "core", "patch-executor.js");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const VALID_TRANSITION = (vb) => ({
  state_before: { v: vb }, action: { do: "write" }, observed_effect: { wrote: true },
  state_after: { v: vb + 1 }, state_version_before: vb, state_version_after: vb + 1,
  difference: { v: { before: vb, after: vb + 1 } }, evidence_refs: [], verification_status: "RECORDED",
});
const EDIT = [{ target: "runtime/work/out.js", content: "module.exports=1;\n" }];

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idem-live-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
  return dir;
}
function setPlan(dir, plan) { fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify(plan)); }
function run(dir) { spawnSync("node", [PE], { cwd: dir, encoding: "utf8" }); return JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8")).executed[0]; }
function wrote(dir) { return fs.existsSync(path.join(dir, "runtime", "work", "out.js")); }
function rmOut(dir) { fs.rmSync(path.join(dir, "runtime", "work", "out.js"), { force: true }); }

console.log("V5 STAGE 5 — LIVE IDEMPOTENCY/CAS (patch-executor)");

// PROCEED → write + record; replay (DUPLICATE) → zero new mutation.
{
  const d = sandbox();
  setPlan(d, { mission: "M", authorizedPaths: ["runtime/work/**"], patches: [{ action: "O", objectiveId: "O", idempotencyKey: "k1", edits: EDIT }] });
  const r1 = run(d);
  check(r1.status === "APPLIED" && wrote(d), "first run (keyed) ⇒ PROCEED ⇒ APPLIED + file written");
  check(fs.existsSync(path.join(d, "runtime", "generated", "idempotency-journal.json")), "journal persisted after a keyed APPLIED");
  rmOut(d);
  const r2 = run(d);
  check(r2.status === "DUPLICATE" && !wrote(d), "replay same key ⇒ DUPLICATE ⇒ ZERO new mutation");
  check(r2.reconciled && r2.reconciled.status === "APPLIED", "DUPLICATE reconciles to the prior APPLIED result");
  fs.rmSync(d, { recursive: true, force: true });
}

// CONFLICT: admission ALLOWs (full Action Contract) then compare-and-set is stale ⇒ zero mutation, FAILED.
{
  const d = sandbox();
  setPlan(d, {
    mission: "M", authorizedPaths: ["runtime/work/**"], stateVersion: 9,
    patches: [{ action: "O", objectiveId: "O", edits: EDIT, actionContract: {
      authority: { id: "A" }, contract: { id: "C" }, policy: "LOCAL_FIRST", reversibility: "R0",
      idempotencyKey: "kc", expectedTransition: VALID_TRANSITION(3), // state_version_before 3 vs current 9
    } }],
  });
  const r = run(d);
  check(r.status === "FAILED" && !wrote(d) && /idempotency CONFLICT/.test(r.error || ""), "ALLOW then stale compare-and-set ⇒ CONFLICT ⇒ zero mutation, FAILED");
  fs.rmSync(d, { recursive: true, force: true });
}

// PROCEED with matching compare-and-set ⇒ writes.
{
  const d = sandbox();
  setPlan(d, {
    mission: "M", authorizedPaths: ["runtime/work/**"], stateVersion: 3,
    patches: [{ action: "O", objectiveId: "O", edits: EDIT, actionContract: {
      authority: { id: "A" }, contract: { id: "C" }, policy: "LOCAL_FIRST", reversibility: "R0",
      idempotencyKey: "km", expectedTransition: VALID_TRANSITION(3), // matches current 3
    } }],
  });
  const r = run(d);
  check(r.status === "APPLIED" && wrote(d), "ALLOW + matching compare-and-set ⇒ PROCEED ⇒ APPLIED");
  fs.rmSync(d, { recursive: true, force: true });
}

// Admission DENY fires BEFORE idempotency (incomplete Action Contract ⇒ no authority) ⇒ zero mutation.
{
  const d = sandbox();
  setPlan(d, { mission: "M", authorizedPaths: ["runtime/work/**"], patches: [{ action: "O", objectiveId: "O", edits: EDIT, actionContract: { idempotencyKey: "kd", expectedTransition: VALID_TRANSITION(0) } }] });
  const r = run(d);
  check(r.status === "FAILED" && !wrote(d) && /action gate DENY/.test(r.error || ""), "admission DENY precedes idempotency ⇒ zero mutation (no DENY→WRITE)");
  fs.rmSync(d, { recursive: true, force: true });
}

// Legacy: no idempotencyKey ⇒ unguarded, writes, NO journal file (byte-for-byte legacy behaviour).
{
  const d = sandbox();
  setPlan(d, { mission: "M", authorizedPaths: ["runtime/work/**"], patches: [{ action: "O", objectiveId: "O", edits: EDIT }] });
  const r = run(d);
  check(r.status === "APPLIED" && wrote(d) && !fs.existsSync(path.join(d, "runtime", "generated", "idempotency-journal.json")), "legacy no-key ⇒ APPLIED, no journal file (unguarded, no false promise)");
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — V5 STAGE 5 LIVE IDEMPOTENCY/CAS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
