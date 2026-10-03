#!/usr/bin/env node

/*
 * Mission Lifecycle — RUNTIME STATE VERIFICATION test (P0-078).
 *
 * TESTED != RUNTIME VERIFIED. The sibling mission-lifecycle.test.js proves toC03Records against FIXTURE
 * transitions. This file proves the end-to-end RUNTIME path: it drives the REAL computeLifecycle against
 * the REAL authority files (state-machine / constitution / policies, copied into a throwaway cwd) and a
 * controlled evidence chain, and asserts that the state the runtime ASSERTS is a faithful, deterministic
 * function of the canonical evidence — AND that the verification actually DETECTS a real divergence.
 *
 * It is the committed guard for P0-078's question: "can we demonstrate that what the runtime asserts as
 * state is the canonical applicable state, and that verification would detect a real divergence?"
 *
 * Deterministic (no wall-clock, no network): same evidence => same runtime state.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..", "..");
const M = "VERIFY_PROBE";

let passed = 0;
function ok(name, cond, extra) { assert.ok(cond, name + (extra ? "  " + extra : "")); console.log("  ok -", name, extra || ""); passed += 1; }

function wj(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function cp(sandbox, rel) { const d = path.join(sandbox, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(REPO, rel), d); }

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-verify-"));
const cwd0 = process.cwd();

try {
  // Real authority (read by governance-kernel + mission-lifecycle), plus a real-shaped contract.
  cp(sandbox, "runtime/governance/state-machine.json");
  cp(sandbox, "runtime/constitution/runtime-constitution.json");
  cp(sandbox, "runtime/policies/runtime-policies.json");
  wj(path.join(sandbox, `runtime/missions/${M}.json`), { mission: M, objectives: [{ id: "o1", done_when: "probe" }] });

  const G = (f) => path.join(sandbox, "runtime/generated", f);
  function writeFullEvidence() {
    wj(G("mission-plan.json"), { mission: M, objectives: [{ id: "o1" }] });
    wj(G("decision.json"), { decision: "PROCEED" });
    wj(G("patch-plan.json"), { status: "READY", patches: [{ objectiveId: "o1" }] });
    wj(G("patch-execution.json"), { executed: [{ objectiveId: "o1", status: "EXECUTED", evidence: "e" }] });
    wj(G("mission-report.json"), { mission: M, validated: true, status: "PROVEN" });
  }

  process.chdir(sandbox);
  const LC = require("./mission-lifecycle"); // the REAL module, reading sandbox cwd

  console.log("Case 1 — full evidence drives the runtime to RELEASED with real-evidence C03 records");
  writeFullEvidence();
  const full = LC.computeLifecycle(M);
  ok("runtime achieved = RELEASED under full evidence", full.achieved === "RELEASED", "(achieved=" + full.achieved + ")");
  ok("one C03 record per transition (runtime-produced)", Array.isArray(full.c03Transitions) && full.c03Transitions.length === full.transitions.length);
  ok("confirmed advances are VERIFIED and carry >=1 evidence_ref",
    full.c03Transitions.filter((r) => r.record && r.record.verification_status === "VERIFIED").length > 0 &&
    full.c03Transitions.filter((r) => r.record && r.record.verification_status === "VERIFIED").every((r) => r.record.evidence_refs.length >= 1));
  ok("C03 evidence_refs are the REAL on-disk evidence strings (not fixtures)",
    full.c03Transitions.some((r) => /mission-plan|patch-plan|patch-execution|mission-report|contract/.test(JSON.stringify(r.record.evidence_refs))));
  ok("every produced record passes the real validator", full.c03Transitions.every((r) => r.ok === true));

  console.log("Case 2 — DIVERGENCE DETECTION: remove the validation evidence, runtime state must drop honestly");
  fs.rmSync(G("mission-report.json"));
  const diverged = LC.computeLifecycle(M);
  ok("runtime DROPS below RELEASED when validation evidence is gone", diverged.achieved !== "RELEASED", "(achieved=" + diverged.achieved + ")");
  const blocked = diverged.transitions.find((t) => !t.ok);
  ok("the blocked transition is recorded (not skipped) and names the missing evidence",
    !!blocked && /not validated/i.test(blocked.evidence), blocked ? "(" + blocked.from + "->" + blocked.to + ": " + blocked.evidence + ")" : "");
  ok("the blocked C03 record is honestly UNVERIFIED (never fabricated VERIFIED)",
    diverged.c03Transitions.some((r) => r.record && r.record.verification_status === "UNVERIFIED"));

  console.log("Case 3 — FIDELITY: a foreign-mission report cannot satisfy this mission's VALIDATED");
  wj(G("mission-report.json"), { mission: "SOMEONE_ELSE", validated: true });
  ok("foreign-mission report does NOT let runtime claim RELEASED", LC.computeLifecycle(M).achieved !== "RELEASED");

  console.log("Case 4 — FIDELITY: validated:false is never upgraded");
  wj(G("mission-report.json"), { mission: M, validated: false });
  ok("validated:false does NOT advance runtime to RELEASED", LC.computeLifecycle(M).achieved !== "RELEASED");

  console.log("Case 5 — DETERMINISM: identical evidence yields identical runtime state");
  writeFullEvidence();
  ok("same evidence => identical lifecycle", JSON.stringify(LC.computeLifecycle(M)) === JSON.stringify(LC.computeLifecycle(M)));
} finally {
  process.chdir(cwd0);
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\nMISSION LIFECYCLE RUNTIME VERIFICATION — ${passed} assertions passed.`);
