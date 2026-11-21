#!/usr/bin/env node
"use strict";
/* Tests for odg-self-improvement-cycle (V360 §3). Injected coverage/compass/closeLoop ⇒ deterministic, zero fs/network.
 * Proves: grounded gap (no fabrication), SELECT priority (regression > drift > capability > owner), PROPOSED-only governed
 * stages (BUILD NOT_EXECUTED / INTEGRATE OWNER_GATED / MEASURE NOT_MEASURED / selfAuthorized=false), and that an
 * owner-decision-only state proposes NOTHING (never manufactures work). */
const M = require("./odg-self-improvement-cycle.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// injected decision loop (no memory): baseline = first option; unconfirmed lessons never change the approach.
const closeLoop = (inp: any) => ({ lessonsRetrieved: (inp.lessons || []).map((_: any, k: number) => "lesson:" + k), baselineChoice: inp.options[0], verifiedChoice: inp.options[0], unconfirmedInfluenced: false, verifiedInfluenced: false, decisionChanged: false, outcome: "NOT_MEASURED" });
const stageOf = (r: any, s: string) => r.stages.find((x: any) => x.stage === s);

function main(): void {
  // (A) a REGRESSION is the highest-value actionable gap → DESIGN proposes RESTORE (first approach, learning doesn't change it).
  const covReg = { regressions: [{ module: "frontier-radar", from: "CONNECTED", to: "NO_CONSUMER", kind: "LOST_CONSUMER" }], drift: [], orphanCandidates: ["x"] };
  const compassCap = { nextPriority: { kind: "capability", id: "cap-z", why: "open" }, drift: [] };
  const a = M.runCycle({ coverage: covReg, compass: compassCap, signals: [{}], lessons: [{}, {}], missionTopic: { domain: "agent" }, now: "2026-11-21" }, { closeLoop });
  check("OBSERVE: signals + lessons as context", stageOf(a, "OBSERVE").signals === 1 && stageOf(a, "OBSERVE").lessons === 2);
  check("GAP grounded in coverage+compass (detected, not invented)", stageOf(a, "GAP").status === "DETECTED" && stageOf(a, "GAP").regressions === 1);
  check("SELECT: a REGRESSION outranks the compass capability-gap, with 2 approaches", a.gap.source === "coverage-regression" && a.gap.target === "frontier-radar" && stageOf(a, "SELECT").approaches.length === 2);
  check("LEARN: closeLoop retrieved lessons; UNCONFIRMED does NOT change the approach (restore-consumer)", stageOf(a, "LEARN").lessonsRetrieved === 2 && stageOf(a, "LEARN").learningInfluenced === false && stageOf(a, "LEARN").chosenApproach === "restore-consumer");
  check("DESIGN: PROPOSED-only proposal to RESTORE the dropped consumer", a.designProposal.status === "PROPOSED" && a.designProposal.selfAuthorized === false && a.designProposal.chosenApproach === "restore-consumer" && /RESTORE/.test(a.designProposal.action));
  check("governed stages: BUILD NOT_EXECUTED, INTEGRATE OWNER_GATED, MEASURE NOT_MEASURED", a.build === "NOT_EXECUTED" && a.integrate === "OWNER_GATED" && a.measure === "NOT_MEASURED");
  check("INSPECT required-independent (builder ≠ validator)", stageOf(a, "INSPECT").status === "REQUIRED_INDEPENDENT");
  check("selfAuthorized=false; outcome PROPOSED", a.selfAuthorized === false && a.outcome === "PROPOSED");
  check("feedback for Boussole names the proposed target + re-detect plan", a.feedbackForBoussole.proposedTarget === "frontier-radar" && /re-detect/.test(a.feedbackForBoussole.verifyNextRun));

  // (A2) a CORROBORATED+SEALED learning (injected) DOES change the approach (decisionChanged → verifiedChoice).
  const clVerified = (inp: any) => ({ lessonsRetrieved: ["L"], baselineChoice: inp.options[0], verifiedChoice: inp.options[1], unconfirmedInfluenced: false, verifiedInfluenced: true, decisionChanged: true, outcome: "NOT_MEASURED" });
  const av = M.runCycle({ coverage: covReg, compass: compassCap, lessons: [{}], now: "x" }, { closeLoop: clVerified });
  check("LEARN: a verified learning CHANGES the approach (mark-superseded) — before/after observable", stageOf(av, "LEARN").learningInfluenced === true && av.designProposal.chosenApproach === "mark-superseded");

  // (B) no regression, no drift, compass capability-gap → SELECT the capability gap (CONNECT proposal).
  const b = M.runCycle({ coverage: { regressions: [], drift: [], orphanCandidates: [] }, compass: compassCap, now: "2026-11-21" }, { closeLoop });
  check("SELECT: capability-gap chosen when no regression/drift", b.gap.source === "compass-nextPriority" && b.gap.target === "cap-z" && /CONNECT/.test(b.designProposal.action));

  // (C) drift outranks a capability-gap.
  const c = M.runCycle({ coverage: { regressions: [], drift: [], orphanCandidates: [] }, compass: { nextPriority: { kind: "capability", id: "cap-z", why: "open" }, drift: [{ id: "learning-decision-loop", module: "odg-lesson-decision-loop", expected: "CONNECTED" }] }, now: "x" }, { closeLoop });
  check("SELECT: a DRIFT outranks a capability-gap", c.gap.source === "compass-drift" && c.gap.target === "odg-lesson-decision-loop" && /RE-WIRE/.test(c.designProposal.action));

  // (D) ONLY an owner decision remains → propose NOTHING (never manufacture work).
  const d = M.runCycle({ coverage: { regressions: [], drift: [], orphanCandidates: [] }, compass: { nextPriority: { kind: "owner-decision", id: "deferred-activation", detail: "owner must authorize DEFERRED→READY" }, drift: [] }, now: "x" }, { closeLoop });
  check("owner-decision-only ⇒ NO gap proposed, outcome OWNER_DECISION_ONLY", d.gap === null && d.designProposal === null && d.outcome === "OWNER_DECISION_ONLY");
  check("owner decision surfaced (not acted on)", d.ownerDecision && d.ownerDecision.id === "deferred-activation");
  check("SELECT stage records NO_ACTIONABLE_GAP (honest)", stageOf(d, "SELECT").status === "NO_ACTIONABLE_GAP");

  // (E) missing inputs ⇒ BLOCKED, no fabrication.
  const e = M.runCycle({ now: "x" }, { closeLoop });
  check("missing coverage/compass ⇒ GAP BLOCKED, nothing proposed (no fabrication)", e.outcome === "INPUTS_MISSING" && e.gap === null && stageOf(e, "GAP").status === "BLOCKED");

  // frozen + contract
  check("frozen result", Object.isFrozen(a) && Object.isFrozen(a.stages));
  check("contract: thin orchestrator (no 2nd engine); PROPOSED-only governed; grounded gap; owner⇒propose-nothing",
    /adds NO second engine/i.test(JSON.stringify(M.SELF_IMPROVEMENT_CYCLE_CONTRACT.invariants)) &&
    /PROPOSED-only/.test(JSON.stringify(M.SELF_IMPROVEMENT_CYCLE_CONTRACT.invariants)) &&
    /GROUNDED/.test(JSON.stringify(M.SELF_IMPROVEMENT_CYCLE_CONTRACT.invariants)) &&
    /never manufactures work/.test(JSON.stringify(M.SELF_IMPROVEMENT_CYCLE_CONTRACT.invariants)) &&
    /odg-system-coverage/.test(JSON.stringify(M.SELF_IMPROVEMENT_CYCLE_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-self-improvement-cycle (V360 §3: integrated cycle composing radar/learning + coverage/compass gap-detection + governed design; SELECT regression>drift>capability>owner; PROPOSED-only [BUILD NOT_EXECUTED / INTEGRATE OWNER_GATED / MEASURE NOT_MEASURED / selfAuthorized=false]; owner-decision-only ⇒ proposes nothing; grounded, no fabrication; no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
