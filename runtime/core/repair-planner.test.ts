#!/usr/bin/env node
"use strict";

const RP = require("./repair-planner");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const rootHyp = { id: "h1", evidence: { reproduces: true, isolated: true, corroborated: true, designDefect: true }, nodeId: "n1" };

// root cause + confined change ⇒ PLAN_READY with the full ordered plan.
const ok = RP.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [rootHyp], symptom: "wrong output", allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/core/x.ts"] });
check(ok.plannable === true && ok.verdict === "PLAN_READY", "root cause + confined change ⇒ PLAN_READY");
check(JSON.stringify(ok.steps) === JSON.stringify(RP.PLAN_STEPS), "PLAN_READY emits the full ordered plan (reproduce → ... → rollback-ready)");
check(ok.steps[0] === "REPRODUCE" && ok.steps[ok.steps.length - 1] === "ROLLBACK_READY", "plan starts at REPRODUCE and ends ROLLBACK_READY");
check(ok.rootCause && ok.rootCause.layer === "DESIGN_DEFECT", "root cause carried (DESIGN_DEFECT layer)");
check(ok.workspace.confinedChanges.includes("runtime/core/x.ts") && ok.workspace.rejectedChanges.length === 0, "the in-write-set change is confined");

// no established root cause ⇒ NEEDS_INVESTIGATION (never patch a symptom).
const weak = RP.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [{ id: "w", evidence: { reproduces: false } }], allowedWriteSet: ["runtime/core/"] });
check(weak.plannable === false && weak.verdict === "NEEDS_INVESTIGATION", "no root cause ⇒ NEEDS_INVESTIGATION (never patch a symptom)");
check(weak.steps.length === 0, "unplannable repair emits no steps");

// a change escaping the write-set ⇒ WRITE_SET_VIOLATION (plan blocked, no silent scope expansion).
const escape = RP.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [rootHyp], allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/core/ok.ts", "../etc/passwd", "runtime/governance/ROADMAP.json"] });
check(escape.plannable === false && escape.verdict === "WRITE_SET_VIOLATION", "escaping change ⇒ WRITE_SET_VIOLATION (plan blocked)");
check(escape.workspace.rejectedChanges.includes("../etc/passwd") && escape.workspace.rejectedChanges.includes("runtime/governance/ROADMAP.json"), "escaping paths rejected");
check(escape.steps.length === 0, "a write-set violation emits no plan steps");

// root cause but empty write-set ⇒ NO_WORKSPACE (cannot isolate).
const nows = RP.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [rootHyp], allowedWriteSet: [] });
check(nows.plannable === false && nows.verdict === "NO_WORKSPACE", "root cause but no write-set ⇒ NO_WORKSPACE (cannot isolate)");

// defect kind classified from the signal.
check(ok.defectKind === "LOGIC", "defect kind classified from the signal (reuses rce-signal-collector)");

// contract invariants.
check(/symptom is never repaired directly|NEEDS_INVESTIGATION/i.test(JSON.stringify(RP.REPAIR_PLANNER_CONTRACT.invariants)), "contract: never patch a symptom");
check(/no silent scope expansion|escapes the authorized write-set/i.test(JSON.stringify(RP.REPAIR_PLANNER_CONTRACT.invariants)), "contract: write-set confinement");

if (failures === 0) process.stdout.write("ALL PASS — V5 M-CH3-02 REPAIR PLANNER\n");
process.exit(failures === 0 ? 0 : 1);

export {};
