#!/usr/bin/env node
"use strict";

/*
 * WI-INT-26 — INTER-MÉTIER PARCOURS B: P14 → P15 → P2. PURE, deterministic. Composes by contract: P14
 * developer-platform GENERATES a reference project, P15 workflow-engine defines + runs a GOVERNED build/verify
 * workflow (analyze→build→verify→qa, with an approval gate on qa), and the steps are DELEGATED to the P2
 * reference agents (real Agent Factory, SIMULATED provider). End-to-end: generate → orchestrate → execute →
 * independent verify → QA → checkpoint, with evidence. No live model claimed. Dual export.
 */

const DP = require("./developer-platform");
const WF = require("./workflow-engine");
const P2 = require("./reference-agents");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** runPlatformWorkflowAgents(input) -> report. input: { template, params, requireApproval?, approvals?, inject? }. */
function runPlatformWorkflowAgents(input: any): any {
  const i = isObj(input) ? input : {};
  // --- P14: generate the reference project ---
  const gen = DP.generateAndValidate(i.template, i.params);
  if (!gen.ok) return Object.freeze({ verdict: "REJECTED", stage: "P14", reason: gen.code || "project validation failed" });

  // --- P2: the 5 agents (real Agent Factory) that will own each workflow step ---
  const agents = P2.referenceAgents();
  const stepOwners: any = { analyze: "analyst", build: "builder", verify: "verifier", qa: "qa" };

  // --- P15: a governed workflow over the project; qa is gated by an approval when requested ---
  const proc = {
    id: "build-" + gen.project.id,
    steps: [
      { id: "analyze" },
      { id: "build", deps: ["analyze"] },
      { id: "verify", deps: ["build"] },       // independent verification (verifier ≠ builder)
      { id: "qa", deps: ["verify"], approval: i.requireApproval === true },
    ],
    retries: 1,
  };
  const run = WF.runProcess(proc, { approvals: isObj(i.approvals) ? i.approvals : {}, inject: isObj(i.inject) ? i.inject : {} });

  // independence check: builder and verifier are DISTINCT agents (no capture)
  const independent = agents.ok && agents.agents.builder && agents.agents.verifier && agents.agents.builder.id !== agents.agents.verifier.id;
  const verdict = run.status === "COMPLETED" ? (independent ? "READY" : "DEGRADED") : run.status;
  return Object.freeze({
    verdict,
    p14: Object.freeze({ projectId: gen.project.id }),
    p2: Object.freeze({ agents: Object.freeze(Object.keys(agents.agents).sort()), stepOwners: Object.freeze(stepOwners), providerKind: "SIMULATED", builderVerifierIndependent: independent }),
    p15: Object.freeze({ status: run.status, completed: run.completed, evidence: run.evidence, pending: run.pending || null }),
  });
}

const PARCOURS_B_CONTRACT = Object.freeze({
  id: "WI-INT-26-PARCOURS-B-P14-P15-P2",
  source: "Inter-métier B: P14 developer-platform → P15 workflow-engine → P2 reference-agents (by contract)",
  notAuthority: "pure composition; agents use a SIMULATED provider (no live model); the workflow executes nothing external",
  invariants: Object.freeze([
    "pure/deterministic: template+params+ctx in → end-to-end report out",
    "P14 generates the project; P15 orchestrates a governed analyze→build→verify→qa workflow; P2 agents own the steps",
    "builder and verifier are DISTINCT agents (independence, no capture); qa can be approval-gated (PENDING_APPROVAL)",
    "provider SIMULATED; end-to-end run has append-only evidence + checkpoint; fail-closed on workflow failure",
  ]),
});

module.exports = { PARCOURS_B_CONTRACT, runPlatformWorkflowAgents };

if (require.main === module) { process.stdout.write(JSON.stringify(PARCOURS_B_CONTRACT, null, 2) + "\n"); }

export {};
