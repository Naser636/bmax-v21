#!/usr/bin/env node
"use strict";
/*
 * V12.4 cont. (V360 P2+P3) — COGNITIVE DRIVERS RUN (runtime entry). Connects the two top-level cognitive drivers the
 * PRIORITY-1 inventory found self-run only:
 *   P3 cognitive-campaign-driver.runCognitiveCampaign — cognition SELECTS an objective (under POLICY) → ODG's real
 *      campaign-loop executes the derived mission to ACCEPTED.
 *   P2 cognitive-workflow-selection.runCognitiveWorkflow — cognition SELECTS which authorised P15 workflow runs → the
 *      workflow-engine executes it to COMPLETED.
 * Both are DRIVERS whose genuine "consumer" is an invocation entry (ODG triggers them); this bin is that real, repeatable
 * execution path. It also runs the POLICY-deny contrast (deny ⇒ NO mission / NO workflow) so the governance gate is shown.
 * Pure composition of existing engines (cognitive-objective-selection + campaign-loop + workflow-engine); no duplication.
 *
 * Usage: npx tsx runtime/bin/odg-cognitive-drivers-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CAMP = require(path.join(ROOT, "runtime", "core", "cognitive-campaign-driver.js"));
const WF = require(path.join(ROOT, "runtime", "core", "cognitive-workflow-selection.js"));

const gap = (id: string) => [{ id, need: true, declared: true, implemented: false }];
const situation = { inventory: gap("capX") };

const camp = CAMP.runCognitiveCampaign({ situation });
const campDenied = CAMP.runCognitiveCampaign({ situation, policy: { denyList: ["capX"] } });
const wf = WF.runCognitiveWorkflow({ situation });
const wfDenied = WF.runCognitiveWorkflow({ situation, policy: { denyList: ["capX"] } });

process.stdout.write(JSON.stringify({
  ran: "cognitive-drivers",
  P3_campaign: { selected: camp.selected === true, mission: camp.mission ?? null, outcome: camp.outcome ?? camp.status ?? null },
  P3_campaign_policyDeny: { selected: campDenied.selected === true },
  P2_workflow: { selected: wf.selected === true, workflow: wf.workflow ?? null, status: wf.workflowStatus ?? null, executed: wf.executed === true },
  P2_workflow_policyDeny: { selected: wfDenied.selected === true },
}, null, 2) + "\n");

const ok = camp.selected === true && campDenied.selected === false && wf.selected === true && wf.executed === true && wfDenied.selected === false;
process.stdout.write(ok
  ? "\nOK — cognition drove ODG's real campaign-loop (mission) AND P15 workflow-engine (workflow) under POLICY; POLICY-deny ⇒ nothing executed. Drivers connected to a real execution path.\n"
  : "\nPARTIAL — see per-driver status above\n");
process.exit(ok ? 0 : 1);
export {};
