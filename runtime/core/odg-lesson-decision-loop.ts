#!/usr/bin/env node
"use strict";
/*
 * V360 §1 — RADAR → LEARNING → DECISION → MEASURE loop (close the loop). Deterministic output (the verified-path seal uses
 * an INJECTED revision — no git/network). Connects retrieved radar
 * lessons (odg-radar-learning-bridge) to a REAL decision via the canonical excellence-gate — NO new decision engine:
 *   retrieve relevant lessons → (a) an UNCONFIRMED radar lesson does NOT auto-change the decision (excellence-gate denies:
 *   no sealed provenance ⇒ not applied) — honest; (b) a CORROBORATED + SEALED learning DOES change it
 *   (gateLearningReuse admits ⇒ decideWithLearning picks its practice), demonstrating the before/after decision-influence.
 * The real-world OUTCOME gain stays NOT_MEASURED (a measured gain requires a real mission result — never fabricated).
 *
 * Reuses: odg-radar-learning-bridge.retrieveLessonsForMission, excellence-gate.gateLearningReuse + decideWithLearning,
 * evidence-provenance.stampProvenance (legitimate content-digest seal — the UNDERLYING fact is not fabricated; a synthetic
 * scenario is labelled synthetic). No second decision/learning engine, no parallel memory.
 */

const BRIDGE = require("./odg-radar-learning-bridge.js");
const GATE = require("./excellence-gate.js");
const PROV = require("./evidence-provenance.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * closeLoop(input, opts?) -> frozen loop result. input: { lessons (candidate radar lessons), missionTopic, options:string[],
 *   verifiedPractice? (a corroborated practice ∈ options), corroboratedBy?, registry?, reviewer?, now? }.
 * Demonstrates: retrieval → unconfirmed-no-influence → verified-influence (before/after) → outcome NOT_MEASURED.
 */
function closeLoop(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const o = isObj(opts) ? opts : {};
  const now = typeof i.now === "string" ? i.now : "";
  const options = arr(i.options).filter((x: any) => typeof x === "string");

  // (1) retrieve the relevant radar lessons for this mission (reuse the bridge).
  const retrieved = BRIDGE.retrieveLessonsForMission(arr(i.lessons), i.missionTopic, { k: o.k, at: now });

  // (2) baseline decision (no learning).
  const baseline = GATE.decideWithLearning(options, null);

  // (3) UNCONFIRMED radar lesson ⇒ excellence-gate denies (no sealed provenance) ⇒ NOT applied ⇒ decision NOT influenced.
  const top = retrieved.selected[0] || null;
  let unconfirmed: any = { chosen: baseline.chosen, influencedByLearning: false };
  let unconfirmedApplied = false;
  if (top && options.indexOf(String(top.principle)) >= 0) {
    const lr = GATE.gateLearningReuse({ learning: { id: top.id, practice: top.principle, claims: [] /* no sealed provenance ⇒ fail-closed */ }, registry: arr(i.registry), now, reviewer: i.reviewer });
    unconfirmedApplied = lr.applied === true;
    unconfirmed = GATE.decideWithLearning(options, lr);
  }

  // (4) CORROBORATED + SEALED learning ⇒ gateLearningReuse admits ⇒ decideWithLearning picks its practice (decision changes).
  let verified: any = { chosen: baseline.chosen, influencedByLearning: false };
  let verifiedApplied = false;
  // NOTE (independent inspection, honesty): verifiedPractice is a CALLER-ASSERTED corroborated practice — it is NEVER a
  // retrieved radar lesson. The seal proves the excellence-gate MECHANISM (sealed + excellence-admitted ⇒ decision changes);
  // corroboratedBy is RECORDED, not independently re-verified here. Revision is injected ⇒ hermetic (no git spawn).
  if (typeof i.verifiedPractice === "string" && options.indexOf(i.verifiedPractice) >= 0) {
    const sealed = PROV.stampProvenance({ practice: i.verifiedPractice, corroboratedBy: arr(i.corroboratedBy) }, { revision: { available: false, commit: null, treeDirty: null } });
    const lr = GATE.gateLearningReuse({ learning: { id: "verified:" + i.verifiedPractice, practice: i.verifiedPractice, claims: [], provenanceSealed: sealed }, registry: arr(i.registry), now, reviewer: i.reviewer });
    verifiedApplied = lr.applied === true;
    verified = GATE.decideWithLearning(options, lr);
  }

  const decisionChanged = verified.chosen !== baseline.chosen;
  return freeze({
    lessonsRetrieved: freeze(retrieved.selected.map((l: any) => l.id)),
    baselineChoice: baseline.chosen,
    unconfirmedApplied, unconfirmedInfluenced: unconfirmed.influencedByLearning === true,   // expected false — honest
    verifiedApplied, verifiedChoice: verified.chosen, verifiedInfluenced: verified.influencedByLearning === true,
    decisionChanged,
    outcome: "NOT_MEASURED",   // a real before/after GAIN requires a real mission result — never fabricated
    note: "Radar→Learning→DECISION loop via excellence-gate: an UNCONFIRMED radar lesson does NOT auto-change the decision (gate denies, no seal); a CORROBORATED+SEALED learning DOES (decision-influence measured before/after). Real-world outcome GAIN = NOT_MEASURED (needs a real mission result, never fabricated).",
  });
}

const LESSON_DECISION_LOOP_CONTRACT = Object.freeze({
  id: "V360-LESSON-DECISION-LOOP",
  purpose: "§1 — close Radar→Learning→DECISION→MEASURE: retrieved lessons influence a real decision via the canonical excellence-gate; before/after decision-influence measured; real-world gain stays NOT_MEASURED (never fabricated)",
  reuses: Object.freeze(["odg-radar-learning-bridge.retrieveLessonsForMission", "excellence-gate.gateLearningReuse + decideWithLearning (the canonical reuse-proof decision)", "evidence-provenance.stampProvenance (seal for the verified path)"]),
  invariants: Object.freeze([
    "an UNCONFIRMED radar lesson does NOT auto-change a decision — excellence-gate denies reuse without sealed provenance (fail-closed, honest)",
    "only a CORROBORATED + SEALED learning (gate-admitted) changes the decision; the before/after decision-influence is observable",
    "the real-world OUTCOME gain is NOT_MEASURED unless a real mission result exists — never a fabricated measured improvement",
    "PURE/deterministic/frozen; reuses excellence-gate + the bridge + evidence-provenance; no second decision/learning engine, no parallel memory",
  ]),
});

module.exports = { closeLoop, LESSON_DECISION_LOOP_CONTRACT };
export {};
