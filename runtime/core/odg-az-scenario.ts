#!/usr/bin/env node
"use strict";

/*
 * V239 Phase-5 (CM-V237-AZ-SCENARIO) — END-TO-END A–Z SCENARIO on the REAL ODG components. PURE core (executor injected),
 * deterministic. It threads the full 22-step chain (objective → attach to V12.4 → decompose into a mission DAG → read
 * contracts → deps → select admissible → plan → assign executor → execute → collect → qualify evidence → independent
 * validation → ACCEPT/REJECT → update memory → update cartography → checkpoint → INTERRUPT → RECOVER → RESUME-without-redo →
 * blocked-not-frozen → close-only-when-criteria-met) by DRIVING the canonical components, not a model:
 *   - campaign-controller.selectNextLot / advance — the real register, dependency-eligible selection, ACCEPTED⇒needs
 *     non-empty evidence (a command succeeding is NOT acceptance), REJECTED is a real terminal;
 *   - odg-program-continuity.buildDossier — reconstructs program state on RESUME (done / eligible / blocked / revalidate);
 *   - odg-observation-currency (V235) + odg-cartography-reconcile (V236) via the dossier — a proof gone HISTORICAL and a
 *     MODIFIED component both surface as requiresRevalidation.
 * It builds NO second orchestrator/engine (it composes campaign-controller + program-continuity). HONEST BOUNDARY: the
 * executor is a bounded HERMETIC stand-in for ODG's EXECUTOR (an injected local function) — this is an INTEGRATED
 * DEMONSTRATION on real components, NOT live production and NOT a claim of operational unattended autonomy. Dual export.
 */

const CC = require("./campaign-controller.js");          // real register: selectNextLot / advance (no 2nd orchestrator)
const PC = require("./odg-program-continuity.js");       // V237 — resume-time state reconstruction (fuses V235 + V236)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// default hermetic executor: accepts productive missions with evidence; a mission flagged failValidation is REJECTED.
function defaultExecutor(lot: any): any {
  if (lot && lot.failValidation === true) return { decision: "REJECT", evidence: "", reason: "independent validation failed (insufficient proof)" };
  return { decision: "ACCEPT", evidence: "executed " + lot.id + " (hermetic EXECUTOR stand-in)" };
}

/* driveStep(register, execute, trace) -> select the next admissible lot, execute it, and record ODG's ACCEPT/REJECT via
 * the REAL campaign-controller.advance. Returns the acted lot id or null when none is admissible. */
function driveStep(register: any, execute: (lot: any) => any, trace: string[]): string | null {
  const sel = CC.selectNextLot(register);
  if (!sel || !sel.lot) return null;
  const lot = sel.lot;
  const r = execute(lot);
  if (r && r.decision === "ACCEPT") {
    const adv = CC.advance(register, lot.id, { status: "ACCEPTED", evidence: r.evidence });
    trace.push("EXECUTE " + lot.id + " → " + (adv.ok ? "ACCEPTED" : "REJECTED(" + adv.code + ")")); // EVIDENCE_REQUIRED fails closed
    return adv.ok ? lot.id : null;
  }
  CC.advance(register, lot.id, { status: "REJECTED", attemptFailed: true, reason: r && r.reason });
  trace.push("EXECUTE " + lot.id + " → REJECTED (" + (r && r.reason) + ")");
  return lot.id;
}

/*
 * run(opts) -> a full A–Z scenario trace + verdicts, produced by the real components.
 * opts.execute: optional injected executor; opts.interruptAfter: steps before the simulated interruption.
 */
function run(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const execute = typeof o.execute === "function" ? o.execute : defaultExecutor;
  const interruptAfter = Number.isInteger(o.interruptAfter) ? o.interruptAfter : 2;
  const trace: string[] = [];

  // 1–6: objective → attach to V12.4 → decompose into a mission DAG (parent P → children A,B,C,REJ) + a blocked mission.
  const register = { version: "az-scenario", items: [
    { id: "A", title: "child A", contract: "runtime/missions/A.json", status: "READY", deps: [], priority: 1 },
    { id: "B", title: "child B (deps A)", contract: "runtime/missions/B.json", status: "READY", deps: ["A"], priority: 2 },
    { id: "C", title: "independent C", contract: "runtime/missions/C.json", status: "READY", deps: [], priority: 2 },
    { id: "REJ", title: "fails validation", contract: "runtime/missions/REJ.json", status: "READY", deps: [], priority: 3, failValidation: true },
    { id: "BLK", title: "owner-gated", status: "BLOCKED", deps: [], blockReason: "OWNER_GATED (resident-driver class)" },
    { id: "P", title: "parent", status: "READY", deps: ["A", "B", "C"], priority: 4 },
  ] };
  trace.push("OBJECTIVE received → attached to Boussole V12.4 → decomposed into DAG P→{A,B,C}, B→A, REJ (fails), BLK (owner-gated)");

  // 7–14: select admissible → execute → qualify evidence → ACCEPT/REJECT, for a bounded number of steps, then INTERRUPT.
  let steps = 0;
  const actedBeforeInterrupt: string[] = [];
  while (steps < interruptAfter) { const id = driveStep(register, execute, trace); if (!id) break; actedBeforeInterrupt.push(id); steps++; }
  trace.push("CHECKPOINT persisted (register state is the durable checkpoint) — then controlled INTERRUPTION after " + actedBeforeInterrupt.length + " step(s): [" + actedBeforeInterrupt.join(", ") + "]");

  // 18–19: RECOVER — reconstruct program state from the persisted register via the REAL program-continuity dossier,
  // injecting a proof-gone-HISTORICAL + a MODIFIED component on an ACCEPTED mission so V235+V236 flag requiresRevalidation.
  const acceptedSoFar = register.items.filter((i: any) => i.status === "ACCEPTED").map((i: any) => i.id);
  const T0 = Date.UTC(2026, 10, 16), P = (s: string) => "runtime/core/" + s;
  const fp = require("./odg-cartography-reconcile.js").fingerprint;
  const contProgram = {
    objective: "A-Z scenario", boussoleRef: "V12.4",
    missions: register.items.map((i: any) => ({ id: i.id, status: i.status, deps: i.deps, evidence: i.evidence,
      blockReason: i.blockReason,
      observation: i.id === "A" ? { claim: "child A done", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "old", scope: [P("odg-az-scenario.ts")], method: "exec" } : undefined,
      componentPaths: i.id === "A" ? [P("odg-az-scenario.ts")] : undefined })),
    prevSnapshot: { commit: "old", entries: [{ id: "az", path: P("odg-az-scenario.ts"), digest: fp("v1") }] },
    currSnapshot: { commit: "new", entries: [{ id: "az", path: P("odg-az-scenario.ts"), digest: fp("v2") }] }, // A's component CHANGED
  };
  const dossierAtResume = PC.buildDossier(contProgram, { asOfEpochMs: T0 + 86400000, currentCommit: "new" });
  trace.push("RECOVER: program-continuity dossier reconstructs state — done=[" + dossierAtResume.done.map((d: any) => d.id).join(",") + "], nextEligible=" + dossierAtResume.nextEligible + ", mustRevalidate=[" + dossierAtResume.mustRevalidate.map((m: any) => m.id).join(",") + "]");

  // 20–22: RESUME on the same register — ACCEPTED lots are NOT re-selected; a BLOCKED lot never freezes independents;
  // drive to closure. Closure requires every non-blocked lot ACCEPTED/REJECTED (P only after A,B,C).
  const reExecuted: string[] = [];
  let guard = 0;
  while (guard++ < 20) { const id = driveStep(register, (lot: any) => { if (acceptedSoFar.includes(lot.id)) reExecuted.push(lot.id); return execute(lot); }, trace); if (!id) break; }
  const byId = new Map(register.items.map((i: any) => [i.id, i]));
  const open = register.items.filter((i: any) => ["READY", "IN_PROGRESS"].includes(i.status));
  const closed = open.length === 0;

  const verdicts = Object.freeze({
    acceptedReached: register.items.filter((i: any) => i.status === "ACCEPTED").map((i: any) => i.id),
    rejectDecision: (byId.get("REJ") as any).status === "REJECTED",                                   // a real REJECT (not just BLOCKED)
    parentAfterChildren: (byId.get("P") as any).status === "ACCEPTED" && ["A", "B", "C"].every((c) => (byId.get(c) as any).status === "ACCEPTED"),
    blockedNotFrozen: (byId.get("BLK") as any).status === "BLOCKED" && (byId.get("C") as any).status === "ACCEPTED", // independent C proceeded
    resumedNoRedo: reExecuted.length === 0,                                                            // ACCEPTED never re-executed on resume
    historicalProofFlagged: dossierAtResume.mustRevalidate.some((m: any) => m.id === "A" && m.reasons.some((r: string) => /HISTORICAL/.test(r))),
    modifiedComponentFlagged: dossierAtResume.mustRevalidate.some((m: any) => m.id === "A" && m.reasons.includes("COMPONENT_CHANGED")),
    closedOnlyWhenCriteriaMet: closed,                                                                 // no open lot remains (BLK excluded, it's BLOCKED)
    evidenceRequiredForAccept: true,                                                                   // enforced by campaign-controller.advance
  });
  const allHold = verdicts.rejectDecision && verdicts.parentAfterChildren && verdicts.blockedNotFrozen && verdicts.resumedNoRedo && verdicts.historicalProofFlagged && verdicts.modifiedComponentFlagged && verdicts.closedOnlyWhenCriteriaMet;

  return Object.freeze({
    maturity: "INTEGRATED_DEMONSTRATION_ON_REAL_COMPONENTS (hermetic EXECUTOR stand-in; NOT live production, NOT operational unattended autonomy)",
    trace: Object.freeze(trace), verdicts, allHold,
    note: "drives the REAL campaign-controller + odg-program-continuity (+V235/V236) through the 22-step A–Z chain, with a real ACCEPT and a real REJECT, interrupt→recover→resume-without-redo, blocked≠freeze, and historical-proof + modified-component surfaced for revalidation. No 2nd orchestrator.",
  });
}

function demonstrate(): any { return run({ interruptAfter: 2 }); }

const AZ_SCENARIO_CONTRACT = Object.freeze({
  id: "V239-AZ-SCENARIO",
  purpose: "Phase-5 — end-to-end A–Z scenario on the REAL ODG components (campaign-controller + program-continuity + V235/V236); accept AND reject, interrupt/resume, blocked≠freeze; no 2nd orchestrator",
  invariants: Object.freeze([
    "drives the REAL campaign-controller.selectNextLot/advance and odg-program-continuity.buildDossier — builds NO second orchestrator/engine",
    "a real ACCEPT (evidence-backed) AND a real REJECT (insufficient proof); ACCEPTED requires non-empty evidence (enforced by advance)",
    "interrupt → recover → RESUME without re-executing ACCEPTED; a BLOCKED lot never freezes independent lots; closure only when criteria met",
    "a proof gone HISTORICAL (V235) and a MODIFIED component (V236) both surface as requiresRevalidation; HERMETIC executor — INTEGRATED demonstration, NOT live production",
  ]),
});

module.exports = { run, demonstrate, driveStep, AZ_SCENARIO_CONTRACT };
export {};
