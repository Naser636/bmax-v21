#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 2 — LIVE action gate on the Patch Executor WRITE path (observe-then-enforce).
 * Unit: patch→Action-Contract compile + admission modes. End-to-end: spawn the REAL patch-executor in a
 * throwaway cwd and assert ALLOW executes, DENY/ESCALATE block with ZERO mutation, legacy stays compatible,
 * and authorized_paths never becomes authority.
 *
 * Run directly: node runtime/core/action-gate-live.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { compileActionContract, admitPatchEdit } = require("./patch-action-contract");

const REPO = process.cwd();
const PE = path.join(REPO, "runtime", "core", "patch-executor.js");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const VALID_TRANSITION = {
  state_before: { v: 1 }, action: { do: "write" }, observed_effect: { wrote: true },
  state_after: { v: 2 }, state_version_before: 1, state_version_after: 2,
  difference: { v: { before: 1, after: 2 } }, evidence_refs: [], verification_status: "RECORDED",
};
const FULL_CONTRACT = {
  authority: { id: "AUTH-1" }, contract: { id: "C-1" }, policy: "LOCAL_FIRST",
  reversibility: "R0", expectedTransition: VALID_TRANSITION, risk: "LOW",
};

console.log("V5 STAGE 2 — LIVE ACTION GATE (patch-executor)");

// ---- Unit: compiler truthfulness --------------------------------------------------------------
{
  const ac = compileActionContract({ action: "OBJ1" }, { target: "runtime/work/x.js" }, { authorizedPaths: ["runtime/work/**"] });
  check(ac.authority === undefined, "legacy patch ⇒ NO authority compiled (authority not invented)");
  check(Array.isArray(ac.scope) && ac.scope.length === 1 && ac.authority === undefined, "authorized_paths populates SCOPE, never AUTHORITY");
  check(ac.actionClass === "WRITE" && ac.reversibility === "R1" && ac.target === "runtime/work/x.js" && ac.principal === "odg-runtime", "derivable fields truthful (class/reversibility/target/principal)");
}

// ---- Unit: admission modes --------------------------------------------------------------------
check(admitPatchEdit({ action: "O" }, { target: "runtime/work/x.js" }, { authorizedPaths: ["runtime/work/**"] }).enforced === false, "legacy patch ⇒ OBSERVE (enforced:false)");
{
  const a = admitPatchEdit({ action: "O" }, { target: "runtime/work/x.js" }, { authorizedPaths: ["runtime/work/**"] });
  check(a.decision === "DENY", "legacy patch ⇒ gate DENY (no authority) even with target in authorized_paths");
}
{
  const a = admitPatchEdit({ action: "O", actionContract: FULL_CONTRACT }, { target: "runtime/work/x.js" }, { authorizedPaths: ["runtime/work/**"] });
  check(a.enforced === true && a.decision === "ALLOW", "explicit full Action Contract ⇒ ENFORCE + ALLOW");
}
{
  const a = admitPatchEdit({ action: "O", actionContract: { ...FULL_CONTRACT, reversibility: "R4" } }, { target: "runtime/work/x.js" }, { authorizedPaths: ["runtime/work/**"] });
  check(a.enforced === true && a.decision === "ESCALATE", "explicit contract + R4 ⇒ ENFORCE + ESCALATE");
}
check(admitPatchEdit({ action: "O" }, { target: "x" }, { authorizedPaths: [], enforceActionGate: true }).enforced === true, "plan.enforceActionGate ⇒ ENFORCE legacy patch");
check(admitPatchEdit({ action: "O" }, { target: "x" }, {}, { ODG_ENFORCE_ACTION_GATE: "1" }).enforced === true, "env ODG_ENFORCE_ACTION_GATE=1 ⇒ ENFORCE");

// ---- End-to-end: real patch-executor ----------------------------------------------------------
function runExecutor(patches, planExtra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pe-live-"));
  try {
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"),
      JSON.stringify({ mission: "LIVE", authorizedPaths: ["runtime/work/**"], patches, ...(planExtra || {}) }));
    spawnSync("node", [PE], { cwd: dir, encoding: "utf8" });
    const exec = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8"));
    const wrote = fs.existsSync(path.join(dir, "runtime", "work", "out.js"));
    return { entry: exec.executed[0], wrote };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const EDIT = [{ target: "runtime/work/out.js", content: "module.exports=1;\n" }];

// 1 — legacy WRITE (no contract) ⇒ OBSERVE: file written, APPLIED, admission recorded (enforced:false).
{
  const r = runExecutor([{ action: "OBJ1", objectiveId: "OBJ1", edits: EDIT }]);
  check(r.wrote === true && r.entry.status === "APPLIED", "legacy WRITE still executes (backward compatible)");
  check(Array.isArray(r.entry.admission) && r.entry.admission[0].decision === "DENY" && r.entry.admission[0].enforced === false, "legacy WRITE records truthful OBSERVE admission (DENY, enforced:false)");
}
// 2 — ENFORCE (plan flag) legacy no authority ⇒ DENY ⇒ NO mutation, FAILED.
{
  const r = runExecutor([{ action: "OBJ1", objectiveId: "OBJ1", edits: EDIT }], { enforceActionGate: true });
  check(r.wrote === false && r.entry.status === "FAILED" && /action gate DENY/.test(r.entry.error || ""), "ENFORCE + no authority ⇒ DENY, zero mutation, FAILED");
}
// 3 — ENFORCE via explicit full Action Contract ⇒ ALLOW ⇒ file written, APPLIED.
{
  const r = runExecutor([{ action: "OBJ1", objectiveId: "OBJ1", actionContract: FULL_CONTRACT, edits: EDIT }]);
  check(r.wrote === true && r.entry.status === "APPLIED" && r.entry.admission[0].decision === "ALLOW" && r.entry.admission[0].enforced === true, "explicit valid Action Contract ⇒ ALLOW ⇒ executes (enforced)");
}
// 4 — ENFORCE + irreversible (R4) ⇒ ESCALATE ⇒ NO mutation, FAILED.
{
  const r = runExecutor([{ action: "OBJ1", objectiveId: "OBJ1", actionContract: { ...FULL_CONTRACT, reversibility: "R4" }, edits: EDIT }]);
  check(r.wrote === false && /action gate ESCALATE/.test(r.entry.error || ""), "explicit contract + R4 ⇒ ESCALATE ⇒ zero mutation");
}
// 5 — authorized_paths never grants authority: ENFORCE legacy whose target IS authorized ⇒ still DENY, no write.
{
  const r = runExecutor([{ action: "OBJ1", objectiveId: "OBJ1", edits: EDIT }], { enforceActionGate: true });
  check(r.wrote === false, "target inside authorized_paths does NOT grant authority (still DENY under enforcement)");
}

console.log(failures === 0 ? "ALL PASS — V5 STAGE 2 LIVE ACTION GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
