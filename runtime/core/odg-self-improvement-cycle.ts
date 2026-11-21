#!/usr/bin/env node
"use strict";
/*
 * V360 §3 — INTEGRATED GLOBAL SELF-IMPROVEMENT CYCLE. A thin ORCHESTRATOR that CHAINS existing canonical components into one
 * cycle — it adds NO second engine / scheduler / scoring / graph. It is PURE + deterministic (all live inputs injected) and
 * PROPOSED-only / deny-by-default: it detects a REAL gap and proposes closing it, but never builds, integrates, or measures
 * autonomously.
 *
 * Chain (each stage REUSES a canonical module; the bin supplies the real inputs):
 *   OBSERVE   — radar signals + candidate lessons as CONTEXT (count only)
 *   GAP       — odg-system-coverage (orphans + REGRESSIONS) + odg-v360-compass (nextPriority / drift)  [GROUNDED, real graph]
 *   SELECT    — highest-value NON-BLOCKED gap: a REGRESSION > a compass capability-gap > (else) an owner decision — no new
 *               scoring engine; the compass already ranks, coverage already grounds
 *   LEARN     — the two gap-closing APPROACHES become the options of odg-lesson-decision-loop.closeLoop: it retrieves the
 *               relevant lessons and reports whether learning would change the approach (an UNCONFIRMED radar lesson never
 *               does — structural honesty). This IS the "Radar→Learning→DECISION" step of the cycle.
 *   DESIGN    — a structured PROPOSAL to close the selected gap, using the approach the decision loop chose. PROPOSED-only.
 *   BUILD     — NOT_EXECUTED (owner-gated; exhausted local-model experiments are NOT re-run)
 *   INSPECT   — REQUIRED_INDEPENDENT (builder ≠ validator; evaluator-independence) — recorded, not self-certified
 *   INTEGRATE — OWNER_GATED (deny-by-default; real mission/merge is an external authorization)
 *   MEASURE   — NOT_MEASURED (a real before/after gain needs a real mission result — never fabricated)
 *   FEEDBACK  — the next-step the Boussole consumes; a later run re-detects whether the gap closed (coverage snapshot)
 *
 * HONESTY: when the only remaining gap is an OWNER DECISION, the cycle proposes NOTHING and says so — it never manufactures
 * work. selfAuthorized is always false. No stage mutates state.
 */

const LOOP = require("./odg-lesson-decision-loop.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * runCycle(input, opts?) -> frozen cycle report. input: {
 *   coverage  (odg-system-coverage.buildCoverage result — REQUIRED for a grounded gap),
 *   compass   (odg-v360-compass.buildCompass result     — REQUIRED for nextPriority/owner gates),
 *   signals?  (qualified radar signals, OBSERVE context), lessons? (candidate radar lessons), missionTopic?, now? }
 * opts.closeLoop overrides the decision loop (tests). Deterministic given its inputs.
 */
function runCycle(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const now = typeof i.now === "string" ? i.now : "";
  const coverage = isObj(i.coverage) ? i.coverage : null;
  const compass = isObj(i.compass) ? i.compass : null;
  const closeLoop = typeof o.closeLoop === "function" ? o.closeLoop : LOOP.closeLoop;
  const stages: any[] = [];

  // (1) OBSERVE — radar signals + candidate lessons as CONTEXT only (external never auto-fact).
  stages.push(freeze({ stage: "OBSERVE", status: "CONTEXT", signals: arr(i.signals).length, lessons: arr(i.lessons).length, note: "radar signals + UNCONFIRMED candidate lessons as context — never auto-fact" }));

  // (2) GAP — grounded in the real coverage + compass (no invented gap).
  if (!coverage || !compass) {
    stages.push(freeze({ stage: "GAP", status: "BLOCKED", note: "coverage and/or compass missing — cannot ground a gap; nothing proposed (no fabrication)" }));
    return finalize(stages, null, null, [], "INPUTS_MISSING");
  }
  const regressions = arr(coverage.regressions);
  const compassNext = isObj(compass.nextPriority) ? compass.nextPriority : null;
  const drift = arr(compass.drift);
  stages.push(freeze({ stage: "GAP", status: "DETECTED", regressions: regressions.length, drift: drift.length, orphanCandidates: arr(coverage.orphanCandidates).length, compassNext: compassNext ? compassNext.kind : null, note: "GROUNDED in odg-system-coverage (real require-graph) + odg-v360-compass (V12.4 view)" }));

  // (3) SELECT — highest-value NON-BLOCKED actionable gap. Priority: REGRESSION (a real defect) > compass capability-gap >
  //     owner-decision (not actionable by ODG). No new scoring engine — coverage grounds, compass ranks.
  //     `approaches` are the two gap-closing options (the preferred one FIRST, so it is the decision baseline).
  let gap: any = null; let approaches: string[] = [];
  if (regressions.length > 0) {
    const r = regressions[0];
    gap = freeze({ source: "coverage-regression", kind: r.kind, target: r.module, why: `${r.module}: ${r.from} → ${r.to} (a connectivity regression — real, actionable)` });
    approaches = r.kind === "REMOVED" ? ["confirm-removal-update-boussole", "restore-module"] : ["restore-consumer", "mark-superseded"];
  } else if (drift.length > 0) {
    const d = drift[0];
    gap = freeze({ source: "compass-drift", kind: "DRIFT_NO_CONSUMER", target: d.module || d.id, why: `${d.id}: declared ${d.expected} but no non-test consumer (drift — actionable)` });
    approaches = ["rewire-consumer", "downgrade-boussole-status"];
  } else if (compassNext && compassNext.kind === "capability") {
    gap = freeze({ source: "compass-nextPriority", kind: "CAPABILITY_GAP", target: compassNext.id, why: compassNext.why || "compass next-priority capability gap" });
    approaches = ["connect-consumer", "defer"];
  } else {
    // only an owner decision remains — NOT actionable by ODG. Propose nothing; say so honestly.
    const owner = compassNext && compassNext.kind === "owner-decision" ? compassNext : null;
    stages.push(freeze({ stage: "SELECT", status: "NO_ACTIONABLE_GAP", ownerDecision: owner ? owner.id : null, note: "no non-blocked actionable gap; highest value is an OWNER DECISION — the cycle proposes nothing (never manufactures work)" }));
    return finalize(stages, null, owner, [], "OWNER_DECISION_ONLY");
  }
  stages.push(freeze({ stage: "SELECT", status: "SELECTED", gap, approaches: freeze(approaches), note: "highest-value non-blocked gap (regression > drift > capability-gap); owner decisions are never auto-selected" }));

  // (4) LEARN — the "Radar→Learning→DECISION" step: the two approaches are the decision options; closeLoop retrieves the
  //     relevant lessons and reports whether learning would change the chosen approach. An UNCONFIRMED radar lesson never
  //     does (excellence-gate denies without sealed provenance) — honest. Reuses odg-lesson-decision-loop (real consumer).
  let chosenApproach = approaches[0]; let lessonsRetrieved: string[] = []; let learningInfluenced = false;
  try {
    const cl = closeLoop({ lessons: arr(i.lessons), missionTopic: i.missionTopic, options: approaches, now });
    lessonsRetrieved = arr(cl && cl.lessonsRetrieved).filter((x: any) => typeof x === "string");
    learningInfluenced = (cl && (cl.unconfirmedInfluenced === true || cl.verifiedInfluenced === true)) || false;
    if (cl && cl.decisionChanged === true && typeof cl.verifiedChoice === "string" && approaches.indexOf(cl.verifiedChoice) >= 0) chosenApproach = cl.verifiedChoice;
    else if (cl && typeof cl.baselineChoice === "string" && approaches.indexOf(cl.baselineChoice) >= 0) chosenApproach = cl.baselineChoice;
  } catch { chosenApproach = approaches[0]; }
  stages.push(freeze({ stage: "LEARN", status: "DECISION", lessonsRetrieved: lessonsRetrieved.length, learningInfluenced, chosenApproach, note: "approaches run through odg-lesson-decision-loop.closeLoop; an UNCONFIRMED radar lesson does NOT change the approach (structural honesty); a corroborated+sealed one would" }));

  // (5) DESIGN — a PROPOSAL to close the selected gap using the chosen approach. PROPOSED-only, no write.
  const ACTION: Record<string, string> = {
    "restore-consumer": `RESTORE the dropped consumer of ${gap.target} (re-wire a real, non-test caller)`,
    "mark-superseded": `CONFIRM ${gap.target}'s removal was intentional and mark it SUPERSEDED in the Boussole`,
    "confirm-removal-update-boussole": `CONFIRM ${gap.target}'s removal was intentional and update the snapshot/Boussole`,
    "restore-module": `RESTORE ${gap.target} if its removal was accidental`,
    "rewire-consumer": `RE-WIRE a non-test consumer for ${gap.target} (its declared Boussole status drifted from reality)`,
    "downgrade-boussole-status": `DOWNGRADE ${gap.target}'s Boussole status to match reality (no real consumer yet — honesty over overclaim)`,
    "connect-consumer": `CONNECT capability ${gap.target} to a real consumer, then VERIFY with a non-test consumer (not code-existence)`,
    "defer": `DEFER ${gap.target} (record the dependency; do not manufacture a consumer)`,
  };
  const action = ACTION[chosenApproach] || `address ${gap.target}`;
  const designProposal = freeze({ target: gap.target, chosenApproach, action, alternatives: freeze(approaches.filter((a) => a !== chosenApproach)), status: "PROPOSED", selfAuthorized: false, note: "a design proposal — NOT an execution; closing it is governed below" });
  stages.push(freeze({ stage: "DESIGN", status: "PROPOSED", proposal: designProposal }));

  // (6-9) governed stages — none executed autonomously.
  stages.push(freeze({ stage: "BUILD", status: "NOT_EXECUTED", note: "owner-gated; exhausted local-model build experiments are NOT re-run" }));
  stages.push(freeze({ stage: "INSPECT", status: "REQUIRED_INDEPENDENT", note: "integration REQUIRES independent inspection (builder ≠ validator; evaluator-independence) — never self-certified" }));
  stages.push(freeze({ stage: "INTEGRATE", status: "OWNER_GATED", note: "real mission creation / merge is an external owner authorization (deny-by-default)" }));
  stages.push(freeze({ stage: "MEASURE", status: "NOT_MEASURED", note: "a real before/after gain needs a real mission result — never fabricated" }));

  return finalize(stages, { gap, designProposal }, null, lessonsRetrieved, "PROPOSED");
}

function finalize(stages: any[], result: any, ownerDecision: any, lessonsRetrieved: string[], outcome: string): any {
  return freeze({
    stages: freeze(stages),
    gap: result ? result.gap : null,
    designProposal: result ? result.designProposal : null,
    ownerDecision: ownerDecision ? freeze({ id: ownerDecision.id, dependency: ownerDecision.detail || ownerDecision.why || null }) : null,
    lessonsRetrieved: freeze(lessonsRetrieved),
    build: "NOT_EXECUTED", integrate: "OWNER_GATED", measure: "NOT_MEASURED",
    selfAuthorized: false,
    outcome,   // PROPOSED | OWNER_DECISION_ONLY | INPUTS_MISSING
    feedbackForBoussole: freeze({ proposedTarget: result && result.gap ? result.gap.target : null, verifyNextRun: "a later cycle re-detects (coverage snapshot) whether the gap closed — CONNECTED, still NO_CONSUMER, or a new regression" }),
    note: "INTEGRATED self-improvement cycle: a thin ORCHESTRATOR composing radar/learning + coverage/compass gap-detection + governed design — PROPOSED-only, deny-by-default. GROUNDED gap (no fabrication); BUILD NOT_EXECUTED, INTEGRATE OWNER_GATED, MEASURE NOT_MEASURED; selfAuthorized=false. No second engine/scheduler/scoring/graph. When only an owner decision remains, it proposes nothing.",
  });
}

const SELF_IMPROVEMENT_CYCLE_CONTRACT = Object.freeze({
  id: "V360-SELF-IMPROVEMENT-CYCLE",
  purpose: "§3 — integrated global self-improvement cycle: compose radar+learning, coverage+compass gap-detection, selection, governed design into ONE PROPOSED-only cycle; feed the Boussole; never build/integrate/measure autonomously",
  reuses: Object.freeze([
    "odg-system-coverage.buildCoverage (grounded gap: orphans + REGRESSIONS over the real require-graph)",
    "odg-v360-compass.buildCompass (nextPriority / drift / owner-gates — the ranking already exists)",
    "odg-lesson-decision-loop.closeLoop (the Radar→Learning→DECISION step: approaches as options; unconfirmed lesson never changes the approach)",
  ]),
  invariants: Object.freeze([
    "a thin ORCHESTRATOR that COMPOSES existing canonical components — adds NO second engine / scheduler / scoring / graph / store",
    "PROPOSED-only / deny-by-default: BUILD NOT_EXECUTED, INTEGRATE OWNER_GATED, MEASURE NOT_MEASURED, selfAuthorized=false; no stage mutates",
    "the gap is GROUNDED in the real coverage + compass (never invented); a REGRESSION outranks a drift outranks a capability-gap",
    "when only an OWNER DECISION remains, the cycle proposes NOTHING and says so — it never manufactures work; integration requires INDEPENDENT inspection (builder ≠ validator)",
  ]),
});

module.exports = { runCycle, SELF_IMPROVEMENT_CYCLE_CONTRACT };
export {};
