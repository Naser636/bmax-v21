#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Tests objective-fidelity against the four mandated scenarios: a legitimately complete
// mission (ACCEPT), a false-completion claim (REJECT_FALSE_COMPLETION), a blocked dependency (carried forward, not
// complete), a deliberately incomplete output (INCOMPLETE), plus silent-narrowing drift and fail-closed input. The
// contract must reject false completion WITHOUT blocking genuine acceptance.
"use strict";
const assert = require("assert");
const F = require("./objective-fidelity.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const CONTRACT = {
  objectiveId: "OBJ-CODING-CAP",
  statement: "Make ODG perform the widest feasible range of software-engineering tasks with verified success.",
  requiredOutcomes: [
    { id: "repair-loop", acceptance: "end-to-end repair, live-proven" },
    { id: "test-gen", acceptance: "test generation, live-proven" },
    { id: "eval-family", acceptance: "sealed corpus, real checker" },
  ],
  constraints: ["€0 default spend", "no external send"],
  nonGoals: ["claim universal coding capability"],
};

// (1) LEGITIMATE completion ⇒ ACCEPT (no false negative).
const done = [
  { outcomeId: "repair-loop", state: "VERIFIED", evidence: "PR#120 live node --test ACCEPTED/ABSTAINED" },
  { outcomeId: "test-gen", state: "VERIFIED", evidence: "PR#121 live proof" },
  { outcomeId: "eval-family", state: "VERIFIED", evidence: "PR#123 accuracy 1.0 on 13 cases" },
];
const acc = F.evaluateCompletionClaim(CONTRACT, { status: "COMPLETE", deliverables: done });
ok("legitimate completion ⇒ ACCEPT (not blocked)", acc.decision === "ACCEPT" && acc.verdict === "COMPLETE");
ok("assessCompletion COMPLETE lists all satisfied", F.assessCompletion(CONTRACT, done).verdict === "COMPLETE" && F.assessCompletion(CONTRACT, done).satisfied.length === 3);

// (2) FALSE completion: claims COMPLETE but one outcome only IMPLEMENTED_UNVERIFIED ⇒ REJECT_FALSE_COMPLETION.
const falseClaim = [
  { outcomeId: "repair-loop", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "test-gen", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "eval-family", state: "IMPLEMENTED_UNVERIFIED", evidence: "" },
];
const rej = F.evaluateCompletionClaim(CONTRACT, { status: "COMPLETE", deliverables: falseClaim });
ok("false completion ⇒ REJECT_FALSE_COMPLETION", rej.decision === "REJECT_FALSE_COMPLETION" && rej.unsatisfied.some(u => u.id === "eval-family"));

// (3) VERIFIED-without-evidence must NOT satisfy (a test count is not acceptance).
const noEvidence = [
  { outcomeId: "repair-loop", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "test-gen", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "eval-family", state: "VERIFIED", evidence: "" },
];
const ne = F.evaluateCompletionClaim(CONTRACT, { status: "COMPLETE", deliverables: noEvidence });
ok("VERIFIED but NO evidence ⇒ REJECT_FALSE_COMPLETION", ne.decision === "REJECT_FALSE_COMPLETION" && /NO evidence/.test(ne.unsatisfied.find(u => u.id === "eval-family").reason));

// (4) BLOCKED dependency ⇒ INCOMPLETE + carried forward with unblock action (not falsely complete).
const blocked = [
  { outcomeId: "repair-loop", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "test-gen", state: "VERIFIED", evidence: "ok" },
  { outcomeId: "eval-family", state: "BLOCKED", evidence: "", unblock: "install a diverse corpus" },
];
const bl = F.assessCompletion(CONTRACT, blocked);
ok("blocked dependency ⇒ INCOMPLETE + carryForward+unblock", bl.verdict === "INCOMPLETE" && bl.carryForward.some(c => c.id === "eval-family" && /corpus/.test(c.unblock)));

// (5) deliberately INCOMPLETE output (missing deliverable) ⇒ INCOMPLETE, not ACCEPT.
const partial = [{ outcomeId: "repair-loop", state: "VERIFIED", evidence: "ok" }];
ok("missing deliverables ⇒ INCOMPLETE", F.assessCompletion(CONTRACT, partial).verdict === "INCOMPLETE");
ok("honest non-COMPLETE claim ⇒ ACKNOWLEDGE_INCOMPLETE (not rejected)", F.evaluateCompletionClaim(CONTRACT, { status: "IN_PROGRESS", deliverables: partial }).decision === "ACKNOWLEDGE_INCOMPLETE");

// (6) DRIFT: proposing only 2 of 3 mandatory outcomes with no authorization ⇒ SILENT_NARROWING.
const drift = F.detectDrift(CONTRACT, ["repair-loop", "test-gen"]);
ok("silent narrowing detected", drift.verdict === "SILENT_NARROWING" && drift.silentlyNarrowed.includes("eval-family"));
// authorized + evidence-backed scope change ⇒ AUTHORIZED_SCOPE_CHANGE (not silent).
const authDrift = F.detectDrift(CONTRACT, ["repair-loop", "test-gen"], [{ outcomeId: "eval-family", authorized: true, evidence: "owner deferred to next quarter, ticket #9" }]);
ok("authorized scope change ⇒ not silent narrowing", authDrift.verdict === "AUTHORIZED_SCOPE_CHANGE" && authDrift.silentlyNarrowed.length === 0);
// full scope ⇒ FAITHFUL.
ok("full proposed scope ⇒ FAITHFUL", F.detectDrift(CONTRACT, ["repair-loop", "test-gen", "eval-family"]).verdict === "FAITHFUL");

// (7) fail-closed.
ok("fail-closed: no required outcomes", F.assessCompletion({ objectiveId: "x", statement: "y", requiredOutcomes: [] }, []).code === "INVALID_INPUT");
ok("fail-closed: not a contract", F.detectDrift(null, []).code === "INVALID_INPUT");

console.log(`\nOBJECTIVE-FIDELITY suite — ${pass} assertions passed. (ACCEPT genuine / REJECT false completion / evidence-required / carry-forward blocked / anti-silent-narrowing; fail-closed)`);
