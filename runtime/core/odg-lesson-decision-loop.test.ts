#!/usr/bin/env node
"use strict";
/* Tests for odg-lesson-decision-loop (V360 §1 close-the-loop). UNCONFIRMED radar lesson ⇒ no auto-change; corroborated+sealed
 * learning ⇒ decision changes (before/after); outcome NOT_MEASURED (never fabricated). Deterministic, zero network. */
const M = require("./odg-lesson-decision-loop.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
// a candidate radar lesson whose principle equals an option (so it COULD influence if it were verified)
const lessons = [{ id: "lesson:discovery:x", principle: "approach-B", domain: "agent", confidence: 0.85, validationStatus: "UNCONFIRMED", reuseHistory: [] }];
const options = ["approach-A", "approach-B"];

function main(): void {
  // (1) UNCONFIRMED radar lesson ⇒ retrieved but does NOT change the decision (gate denies: no seal).
  const u = M.closeLoop({ lessons, missionTopic: { domain: "agent", keyword: "approach", mission: "M1" }, options, now: "2026-11-21" });
  check("lesson retrieved for the mission (loop step: retrieval)", u.lessonsRetrieved.length >= 1);
  check("UNCONFIRMED radar lesson ⇒ NOT applied, decision NOT influenced (honest: unconfirmed never auto-changes)", u.unconfirmedApplied === false && u.unconfirmedInfluenced === false && u.baselineChoice === "approach-A");
  check("outcome NOT_MEASURED (no real mission result ⇒ never a fabricated gain)", u.outcome === "NOT_MEASURED");

  // (2) a CORROBORATED + SEALED learning whose practice ∈ options ⇒ decision CHANGES (before/after influence observable).
  const v = M.closeLoop({ lessons, missionTopic: { domain: "agent", mission: "M1" }, options, verifiedPractice: "approach-B", corroboratedBy: ["export.arxiv.org", "api.github.com"], now: "2026-11-21" });
  check("CORROBORATED+SEALED learning ⇒ applied + decision INFLUENCED (baseline approach-A → approach-B)", v.verifiedApplied === true && v.verifiedInfluenced === true && v.verifiedChoice === "approach-B" && v.decisionChanged === true);
  check("even with a verified learning, real-world gain stays NOT_MEASURED (needs a real mission)", v.outcome === "NOT_MEASURED");

  // (3) a verified practice NOT among the options ⇒ no change (decideWithLearning only picks an available option).
  const nc = M.closeLoop({ lessons, missionTopic: { domain: "agent" }, options, verifiedPractice: "approach-Z", now: "2026-11-21" });
  check("verified practice not in options ⇒ decision unchanged (no forced influence)", nc.decisionChanged === false && nc.verifiedChoice === "approach-A");

  // frozen + contract
  check("frozen result", Object.isFrozen(v));
  check("contract: unconfirmed never auto-changes; verified+sealed does; gain NOT_MEASURED; reuses excellence-gate + bridge; no 2nd engine",
    /UNCONFIRMED radar lesson does NOT auto-change/.test(JSON.stringify(M.LESSON_DECISION_LOOP_CONTRACT.invariants)) &&
    /NOT_MEASURED/.test(JSON.stringify(M.LESSON_DECISION_LOOP_CONTRACT.invariants)) &&
    /excellence-gate/.test(JSON.stringify(M.LESSON_DECISION_LOOP_CONTRACT.reuses)) &&
    /no second decision/.test(JSON.stringify(M.LESSON_DECISION_LOOP_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-lesson-decision-loop (V360 §1: Radar→Learning→DECISION→MEASURE; UNCONFIRMED lesson⇒no auto-change, CORROBORATED+SEALED⇒decision changes [before/after], outcome NOT_MEASURED [never fabricated]; reuses excellence-gate + bridge + evidence-provenance, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
