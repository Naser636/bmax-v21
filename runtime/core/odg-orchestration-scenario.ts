#!/usr/bin/env node
"use strict";

/*
 * V240 Phase-1 (CM-V237-ORCHESTRATION) — MULTI-EXECUTOR ORCHESTRATION SCENARIO on the REAL components. PURE, deterministic.
 * It does NOT build a second orchestrator: odg-mission-orchestrator (V167) ALREADY composes dep-planner + provider-
 * capability-contract + evaluator-independence + delegate-isolation into the dispatcher. This harness DRIVES that real
 * dispatcher (+ campaign-controller for the parent/children register and resume, + odg-program-continuity for proof
 * validity) through the Phase-3.4 parent→children adversarial battery, proving the properties the directive requires:
 * isolation, least-privilege permissions, INDEPENDENT evaluation (producer ≠ validator, no self-certification), evidence
 * discipline, parent-closes-only-when-children-admit, blocked≠freeze, resume-without-redo, and idempotence.
 *
 * HONEST BOUNDARY: executors are bounded HERMETIC stand-ins; this is an INTEGRATED DEMONSTRATION on real components, NOT
 * live production and NOT a claim of operational unattended orchestration. ODG remains the sole authority — an executor
 * cannot grant itself permissions, write out of scope, or validate its own work. Dual export.
 */

const ORCH = require("./odg-mission-orchestrator.js");   // V167 — the REAL dispatcher (checkPermission/checkWorkerScope/independentQualityGate/aggregateEvidence)
const CC = require("./campaign-controller.js");          // real register: parent/children deps + selection + resume (no 2nd scheduler)
const PC = require("./odg-program-continuity.js");       // V237 — resume-time proof validity (V235/V236)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// an authorized executor fully declares its capability/permissions/side-effects; a refused one over-reaches or self-authorizes.
const EXEC_AUTHORIZED = Object.freeze({ id: "exec-auth", provenance: "roster", capabilities: ["code"], permissions: ["write:scope"], sideEffects: [] });
const EXEC_OVERREACH = Object.freeze({ id: "exec-over", provenance: "roster", capabilities: ["code"], permissions: ["write:prod"], sideEffects: [] });
const EXEC_SELF_AUTH = Object.freeze({ id: "exec-self", provenance: "roster", capabilities: ["code"], permissions: ["write:scope"], sideEffects: [], selfAuthorizes: true });

function run(opts?: any): any {
  const o = isObj(opts) ? opts : {};

  // CASE — least-privilege permissions (provider-capability-contract via orchestrator.checkPermission).
  const permAuthorized = ORCH.checkPermission(EXEC_AUTHORIZED, "code", ["write:scope"]);
  const permOverreach = ORCH.checkPermission(EXEC_OVERREACH, "code", ["write:scope"]);           // needs write:prod, not granted ⇒ DENY
  const permUndeclared = ORCH.checkPermission(EXEC_AUTHORIZED, "deploy", ["write:scope"]);         // capability not declared ⇒ DENY
  const permSelfAuth = ORCH.checkPermission(EXEC_SELF_AUTH, "code", ["write:scope"]);              // self-authorizing ⇒ DENY

  // CASE — scope isolation (delegate-isolation via orchestrator.checkWorkerScope).
  const scopeInBounds = ORCH.checkWorkerScope([{ rel: "runtime/core/child.ts" }], ["runtime/core/child.ts"]);
  const scopeOutOfBounds = ORCH.checkWorkerScope([{ rel: "runtime/core/other.ts" }], ["runtime/core/child.ts"]); // writes unowned file ⇒ REFUSED

  // CASE — INDEPENDENT evaluation (evaluator-independence via orchestrator.independentQualityGate).
  const deliv = { evidence: ["ran child, tests green"] };
  const evalIndependent = ORCH.independentQualityGate(deliv, { builder: { id: "b", model: "m1" }, verifier: { id: "v", model: "m2" } });    // ADMIT
  const evalSelfCert = ORCH.independentQualityGate(deliv, { builder: { id: "same", model: "m1" }, verifier: { id: "same", model: "m1" } }); // producer==validator ⇒ REJECT
  const evalSharedCritical = ORCH.independentQualityGate(deliv, { builder: { id: "b", model: "shared" }, verifier: { id: "v", model: "shared" } }); // shared model ⇒ COMPROMISED ⇒ REJECT
  const evalNoEvidence = ORCH.independentQualityGate({ evidence: [] }, { builder: { id: "b", model: "m1" }, verifier: { id: "v", model: "m2" } }); // no evidence ⇒ REJECT

  // CASE — parent closes ONLY when every mandatory child is ADMITted (orchestrator.aggregateEvidence).
  const childAdmit = (id: string) => ({ id, gate: ORCH.independentQualityGate({ evidence: ["did " + id] }, { builder: { id: id + "-b", model: "m" + id }, verifier: { id: id + "-v", model: "mv" + id } }) });
  const childReject = (id: string) => ({ id, gate: ORCH.independentQualityGate({ evidence: [] }, { builder: { id: id + "-b", model: "m" + id }, verifier: { id: id + "-v", model: "mv" + id } }) });
  const aggAllGood = ORCH.aggregateEvidence([childAdmit("C1"), childAdmit("C2"), childAdmit("C3")]);
  const aggOneBad = ORCH.aggregateEvidence([childAdmit("C1"), childReject("C2"), childAdmit("C3")]);
  const parentClosesAllGood = aggAllGood.rejected === 0 && aggAllGood.accepted === 3; // aggregateEvidence returns COUNTS
  const parentBlockedOneBad = aggOneBad.rejected === 1;

  // CASE — deps / blocked≠freeze / resume-no-redo over the REAL campaign-controller + program-continuity (parent P→children).
  const register = { version: "orchestration", items: [
    { id: "C1", status: "READY", deps: [], priority: 1 },
    { id: "C2", status: "READY", deps: [], priority: 1 },                       // independent
    { id: "BLKCHILD", status: "BLOCKED", deps: [], blockReason: "owner-gated executor" },
    { id: "C3", status: "READY", deps: ["BLKCHILD"], priority: 2 },             // depends on a blocked child ⇒ inadmissible
    { id: "P", status: "READY", deps: ["C1", "C2"], priority: 3 },
  ] };
  const executed: string[] = [];
  // drive two steps, interrupt, then resume — ACCEPTED children must not re-run; blocked child must not freeze C1/C2.
  for (let i = 0; i < 2; i++) { const s = CC.selectNextLot(register); if (!s.lot) break; executed.push(s.lot.id); CC.advance(register, s.lot.id, { status: "ACCEPTED", evidence: "did " + s.lot.id }); }
  const acceptedBeforeResume = register.items.filter((x: any) => x.status === "ACCEPTED").map((x: any) => x.id);
  const reExecuted: string[] = [];
  let guard = 0;
  while (guard++ < 20) { const s = CC.selectNextLot(register); if (!s.lot) break; if (acceptedBeforeResume.includes(s.lot.id)) reExecuted.push(s.lot.id); CC.advance(register, s.lot.id, { status: "ACCEPTED", evidence: "did " + s.lot.id }); }
  const byId = new Map(register.items.map((x: any) => [x.id, x]));
  const blockedNotFreeze = (byId.get("BLKCHILD") as any).status === "BLOCKED" && (byId.get("C1") as any).status === "ACCEPTED" && (byId.get("C2") as any).status === "ACCEPTED";
  const parentInadmissibleWhileChildBlocked = true; // C3 depends on BLKCHILD; proven below that P only closes after its own deps
  const parentClosedAfterDeps = (byId.get("P") as any).status === "ACCEPTED" && ["C1", "C2"].every((c) => (byId.get(c) as any).status === "ACCEPTED");
  const c3StaysOpen = ["READY", "IN_PROGRESS"].includes((byId.get("C3") as any).status);  // never admissible (dep blocked)

  // CASE — resume proof validity (program-continuity: a child whose component changed ⇒ requiresRevalidation).
  const fp = require("./odg-cartography-reconcile.js").fingerprint, T0 = Date.UTC(2026, 10, 16), P = (s: string) => "runtime/core/" + s;
  const contProgram = { objective: "orchestration", boussoleRef: "V12.4",
    missions: [{ id: "C1", status: "ACCEPTED", deps: [], evidence: "did C1", observation: { claim: "C1 done", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "old", scope: [P("child.ts")], method: "exec" }, componentPaths: [P("child.ts")] }],
    prevSnapshot: { commit: "old", entries: [{ id: "c", path: P("child.ts"), digest: fp("v1") }] },
    currSnapshot: { commit: "new", entries: [{ id: "c", path: P("child.ts"), digest: fp("v2") }] } };
  const dossier = PC.buildDossier(contProgram, { asOfEpochMs: T0 + 86400000, currentCommit: "new" });
  const obsoleteProofFlagged = dossier.mustRevalidate.some((m: any) => m.id === "C1");

  const verdicts = Object.freeze({
    permissionLeastPrivilege: permAuthorized.allowed === true && permOverreach.allowed !== true && permUndeclared.allowed !== true && permSelfAuth.allowed !== true,
    isolationEnforced: scopeInBounds.admitted === true && scopeOutOfBounds.admitted === false,
    independentEvalNoSelfCert: evalIndependent.decision === "ADMIT" && evalSelfCert.decision === "REJECT" && evalSharedCritical.decision === "REJECT" && evalNoEvidence.decision === "REJECT",
    parentClosesOnlyWhenChildrenAdmit: parentClosesAllGood && parentBlockedOneBad,
    blockedChildNotFreeze: blockedNotFreeze,
    parentClosedAfterDeps, dependentChildBlockedStaysOpen: c3StaysOpen,
    resumeNoRedo: reExecuted.length === 0,
    obsoleteProofRevalidated: obsoleteProofFlagged,
  });
  const allHold = Object.values(verdicts).every((v) => v === true);

  return Object.freeze({
    maturity: "INTEGRATED_DEMONSTRATION_ON_REAL_COMPONENTS (hermetic executors; NOT live production, NOT operational unattended orchestration)",
    verdicts, allHold,
    note: "drives the REAL odg-mission-orchestrator (checkPermission/checkWorkerScope/independentQualityGate/aggregateEvidence) + campaign-controller + odg-program-continuity through the parent→children battery: least-privilege permissions, scope isolation, independent evaluation (no self-cert / no shared-critical-dep), evidence discipline, parent-closes-only-when-children-admit, blocked≠freeze, resume-without-redo, obsolete-proof revalidation. No 2nd orchestrator.",
  });
}

function demonstrate(): any { return run({}); }

const ORCHESTRATION_SCENARIO_CONTRACT = Object.freeze({
  id: "V240-ORCHESTRATION-SCENARIO",
  purpose: "Phase-1 — parent→children multi-executor orchestration on the REAL odg-mission-orchestrator (+ campaign-controller + program-continuity); no 2nd orchestrator",
  invariants: Object.freeze([
    "drives the REAL odg-mission-orchestrator — builds NO second orchestrator/engine, no 10th primitive",
    "least-privilege permissions (overreach/undeclared/self-authorizing executor DENIED) + scope isolation (out-of-scope write REFUSED)",
    "INDEPENDENT evaluation: producer ≠ validator, self-certification and shared critical dependency ⇒ REJECT; no evidence ⇒ REJECT; parent closes only when every child ADMITted",
    "blocked child never freezes independent children; resume never re-executes ACCEPTED; obsolete proof ⇒ requiresRevalidation; HERMETIC executors ⇒ INTEGRATED demonstration, NOT live production",
  ]),
});

module.exports = { run, demonstrate, ORCHESTRATION_SCENARIO_CONTRACT };
export {};
