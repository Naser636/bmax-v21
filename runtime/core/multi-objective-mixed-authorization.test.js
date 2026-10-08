#!/usr/bin/env node
"use strict";

/*
 * C3 (review N4 remediation) — a genuine MULTI-OBJECTIVE mission with MIXED authorization is REACHABLE
 * from the REAL semantic entrypoint and behaves correctly in a SINGLE execution: one authorized
 * objective advances, one unauthorized (sensitive) objective stays fail-closed BLOCKED.
 *
 * Exam N3 reported this as unreachable (the gateway "flattens to one objective"). This test proves the
 * REAL path does decompose and does mix authorization — so NO code change is warranted; it only pins the
 * behaviour against regression. It drives the REAL odg-objective.decide() (gateway.compile → Mission
 * Synthesizer decompose) + the REAL applyAuthorization seam. Pure: no disk writes, no provider, no git.
 *
 * Run: node runtime/core/multi-objective-mixed-authorization.test.js
 */
const assert = require("assert");
const path = require("path");
const obj = require(path.join(__dirname, "..", "bin", "odg-objective.js"));

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok - ${label}`);
  else { failures++; console.log(`  FAIL - ${label}`); }
}

const NOW = 1_000_000_000_000;
const SENTENCE =
  "1. edit the config file to add a flag 2. integrate the feature branch into main";

console.log("C3 — multi-objective + mixed authorization (REAL entrypoint)");

// 1 — REACHABILITY: the real compile path yields TWO governed objectives (not a flattened single one).
const d = obj.decide(SENTENCE, {});
check(d.action === "EXECUTE" && d.status === "READY_DRY_RUN", "clean READY_DRY_RUN projection");
check(Array.isArray(d.contract.objectives) && d.contract.objectives.length === 2, "decomposed into 2 governed objectives");
const caps = (d.result.objectives || []).map((o) => o.capability.chosen.capability);
check(caps[0] === "Governed Source Edit", "obj1 resolves to Governed Source Edit (local-reversible)");
check(caps[1] === "Governed Git Branch Integration", "obj2 resolves to Governed Git Branch Integration (sensitive)");

// 2 — MIXED AUTHORIZATION in ONE execution: a grant for obj1 only.
const grant = {
  capability: "Governed Source Edit",
  mission: d.mission,
  scope: {
    authorized_paths: ["runtime/generated"],
    edits: [{ target: "runtime/generated/examiner-c3.flag", content: "flag\n" }],
  },
  expiresAt: 2_000_000_000_000,
  execute: true,
  human: true,
  issuer: "examiner-c3",
};

const res = obj.applyAuthorization(d, grant, NOW);

// obj1 (Source Edit) is AUTHORIZED and bound as an engineering edit ⇒ it will advance.
const sourceAuth = res.authorizations.find((a) => a.capability === "Governed Source Edit");
check(!!sourceAuth && sourceAuth.engineering === true, "obj1 authorized + bound as engineering (advances)");
check(Array.isArray(d.contract.authorized_paths) && d.contract.authorized_paths.includes("runtime/generated"),
  "obj1 grant scope bound onto the contract authorized_paths");
check(Array.isArray(d.contract.objectives[0].patch) && d.contract.objectives[0].patch.length === 1,
  "obj1 concrete edit bound onto the objective (ready to apply)");

// obj2 (Git) has NO grant ⇒ fail-closed HARD blocker (sensitive) ⇒ it stays BLOCKED.
const gitBlock = res.blockers.find((b) => b.capability === "Governed Git Branch Integration");
check(!!gitBlock, "obj2 (sensitive, no grant) is a fail-closed blocker (stays BLOCKED)");

// The mission still has at least one authorized objective ⇒ run() ROUTES (does not global-BLOCK); the
// unauthorized sibling remains blocked ⇒ the honest terminal is PARTIAL, never a false SUCCESS.
check(res.authorizations.length >= 1 && res.blockers.length >= 1,
  "one authorized + one blocked in the SAME decision (⇒ routes to an honest PARTIAL, not a global BLOCK)");

assert.ok(true);
console.log(failures === 0 ? "ALL PASS — C3 MULTI-OBJECTIVE MIXED AUTHORIZATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
