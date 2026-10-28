#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves objective-fidelity is APPLIED to the real mission cycle: assessMissionFidelity
// maps canonical mission-plan + mission-report artifacts to a fidelity verdict, and the final-report close stage
// exposes + invokes it. Covers the mandated rejection conditions (missing outcome, unmet DoD, failed gate, false
// completion) and genuine acceptance; proves final-report.fidelityVerdictSection is wired (on the real path).
"use strict";
const assert = require("assert");
const V = require("./mission-fidelity-verdict.js");
const FR = require("./final-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const plan = { mission: "M1", definitionOfDone: ["build passes", "tests green", "report generated"] };
const goodChecks = { buildGate: true, typescriptGate: true, objectiveCoverage: true, noFailedActions: true, evidenceIntegrity: true, noGammaFalseSuccess: true };

// (1) genuinely validated + all DoD met ⇒ ACCEPT / COMPLETE (no false negative).
{
  const report = { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: plan.definitionOfDone, unmet: [], checks: goodChecks };
  const v = V.assessMissionFidelity(plan, report);
  ok("validated + all DoD met ⇒ ACCEPT/COMPLETE", v.ok && v.decision === "ACCEPT" && v.verdict === "COMPLETE");
}

// (2) claims validated but an unmet DoD item ⇒ REJECT_FALSE_COMPLETION.
{
  const report = { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: plan.definitionOfDone, unmet: ["tests green"], checks: goodChecks };
  const v = V.assessMissionFidelity(plan, report);
  ok("validated but unmet DoD ⇒ REJECT_FALSE_COMPLETION", v.decision === "REJECT_FALSE_COMPLETION" && v.verdict === "INCOMPLETE");
}

// (3) claims validated but a mandatory evidence gate failed ⇒ REJECT_FALSE_COMPLETION (no trustworthy evidence).
{
  const report = { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: plan.definitionOfDone, unmet: [], checks: { ...goodChecks, buildGate: false } };
  const v = V.assessMissionFidelity(plan, report);
  ok("failed gate ⇒ REJECT_FALSE_COMPLETION + gateFailures lists it", v.decision === "REJECT_FALSE_COMPLETION" && v.gateFailures.includes("buildGate"));
}

// (4) a required outcome missing from the report (DoD longer than what's satisfied) ⇒ not COMPLETE.
{
  const report = { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: ["build passes", "tests green", "report generated"], unmet: ["report generated"], checks: goodChecks };
  const v = V.assessMissionFidelity(plan, report);
  ok("missing/unmet required outcome ⇒ INCOMPLETE", v.verdict === "INCOMPLETE" && v.unsatisfied.length >= 1);
}

// (5) honest in-progress (not claiming validated) ⇒ ACKNOWLEDGE_INCOMPLETE, not a false rejection of a non-claim.
{
  const report = { mission: "M1", validated: false, status: "IN_PROGRESS", definitionOfDone: plan.definitionOfDone, unmet: ["tests green"], checks: goodChecks };
  const v = V.assessMissionFidelity(plan, report);
  ok("in-progress ⇒ ACKNOWLEDGE_INCOMPLETE", v.decision === "ACKNOWLEDGE_INCOMPLETE" && v.verdict === "INCOMPLETE");
}

// (6) APPLIED ON THE REAL CLOSE STAGE: final-report exposes + invokes the fidelity cross-check.
{
  ok("final-report exports fidelityVerdictSection (wired on the close path)", typeof FR.fidelityVerdictSection === "function");
  const report = { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: plan.definitionOfDone, unmet: ["tests green"], checks: goodChecks };
  const section = FR.fidelityVerdictSection(plan, report);
  ok("final-report fidelity section REJECTS false completion in its output", section.verdict && section.verdict.decision === "REJECT_FALSE_COMPLETION" && section.lines.some(l => /FALSE-COMPLETION REJECTED/.test(l)));
  const good = FR.fidelityVerdictSection(plan, { mission: "M1", validated: true, status: "VALIDATED", definitionOfDone: plan.definitionOfDone, unmet: [], checks: goodChecks });
  ok("final-report fidelity section ACCEPTS a genuine completion", good.verdict.decision === "ACCEPT");
}

// (7) fail-closed.
ok("fail-closed: non-object plan/report", V.assessMissionFidelity(null, {}).code === "INVALID_INPUT" && V.assessMissionFidelity({}, null).code === "INVALID_INPUT");

console.log(`\nMISSION-FIDELITY-VERDICT suite — ${pass} assertions passed. (objective-fidelity APPLIED at close; REJECT false completion on unmet DoD/failed gate; ACCEPT genuine; wired into final-report; fail-closed)`);
