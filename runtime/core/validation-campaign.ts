#!/usr/bin/env node
"use strict";

/*
 * WI-VAL-29 — INTEGRATED VALIDATION CAMPAIGN (§8). PURE, deterministic. Runs ALL SEVEN cross-métier pipelines
 * (INT-21..24 + parcours A/B/C) over a CLEAN input AND an ADVERSARIAL input, and checks that each pipeline
 * genuinely DISCRIMINATES (clean ⇒ healthy verdict, adversarial ⇒ degraded verdict). A pipeline whose verdict
 * does NOT change between clean and adversarial is NOT truly integrated (§8). Composes the shipped pipelines by
 * contract; adds no new engine. Dual export.
 */

const INT21 = require("./integration-doc-quality");
const INT22 = require("./integration-agent-governance");
const INT23 = require("./integration-stream-reliability");
const INT24 = require("./integration-inference-cost");
const PA = require("./parcours-build-platform-product");
const PB = require("./parcours-platform-workflow-agents");
const PC = require("./parcours-workflow-stream-reliability");

function healthy(v: any): boolean { return v === "PASS" || v === "READY" || v === "RELIABLE"; }
function degraded(v: any): boolean { return !healthy(v); } // FAIL/REVIEW/DEGRADED/REJECTED/FAILED/PENDING_APPROVAL...

const dataSchema = { fields: [{ name: "vendor", required: true, type: "string" }, { name: "amount", required: true, type: "string" }], keyFields: ["vendor"] };
const slo = { maxLossRate: 0, maxDuplicateRate: 0, maxOrderingViolations: 0 };

// Each probe: { pipeline, cleanVerdict, adversarialVerdict }.
function probes(): any[] {
  return [
    { pipeline: "INT-21 P11→P4→P6",
      clean: INT21.runDocToQuality([{ id: "a", format: "kv", content: "vendor: A\namount: 1" }], { docSchema: { required: ["vendor", "amount"] }, dataSchema }).verdict,
      adversarial: INT21.runDocToQuality([{ id: "a", format: "kv", content: "vendor: A" }, { id: "x", format: "pdf", content: "y" }], { docSchema: { required: ["vendor"] }, dataSchema }).verdict },
    { pipeline: "INT-22 P2→P10→P6",
      clean: INT22.runAgentGovernance({ system: { name: "S", aiRole: "limited" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], claims: [] }).qualityVerdict,
      adversarial: INT22.runAgentGovernance({ system: { name: "S", aiRole: "limited" }, obligations: [{ id: "O1", required: true, evidenceRefs: ["e"] }], benchmarkDigests: ["h"], seenDigests: ["h"] }).qualityVerdict },
    { pipeline: "INT-23 P12→P4→P7",
      clean: INT23.runStreamReliability([{ type: "e", key: "k", payload: { order: 1 } }, { type: "e", key: "k", payload: { order: 2 } }], { slo }).verdict,
      adversarial: INT23.runStreamReliability([{ type: "e", key: "k", idempotencyKey: "d", payload: { order: 1 } }, { type: "e", key: "k", idempotencyKey: "d", payload: { order: 2 } }], { slo }).verdict },
    { pipeline: "INT-24 P13→P9→P6",
      clean: INT24.runInferenceCost({ providers: [{ name: "cpu", kind: "cpu-reference" }], requests: [{ input: "ab" }] }).verdict,
      adversarial: INT24.runInferenceCost({ providers: [{ name: "small", kind: "gpu-simulated", maxUnits: 1 }], requests: [{ input: "abcdef" }] }).verdict },
    { pipeline: "A P5→P14→P1",
      clean: PA.runBuildToProduct({ template: "library-ts", params: { name: "lib" } }).verdict,
      adversarial: PA.runBuildToProduct({ template: "service-ts", params: { name: "svc" } }).verdict },
    { pipeline: "B P14→P15→P2",
      clean: PB.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" } }).verdict,
      adversarial: PB.runPlatformWorkflowAgents({ template: "library-ts", params: { name: "lib" }, inject: { build: "error" } }).verdict },
    { pipeline: "C P15→P12→P7",
      clean: PC.runWorkflowStreamReliability({ slo }).verdict,
      adversarial: PC.runWorkflowStreamReliability({ slo, extraEvents: [{ type: "step.done", key: "emit", idempotencyKey: "d", payload: { order: 9 } }, { type: "step.done", key: "emit", idempotencyKey: "d", payload: { order: 10 } }] }).verdict },
  ];
}

/** runValidationCampaign() -> { total, discriminating, allDiscriminate, pipelines:[...] }. */
function runValidationCampaign(): any {
  const rows = probes().map((p: any) => Object.freeze({
    pipeline: p.pipeline, cleanVerdict: p.clean, adversarialVerdict: p.adversarial,
    cleanHealthy: healthy(p.clean), adversarialDegraded: degraded(p.adversarial),
    discriminates: healthy(p.clean) && degraded(p.adversarial),
  }));
  const discriminating = rows.filter((r: any) => r.discriminates).length;
  return Object.freeze({ total: rows.length, discriminating, allDiscriminate: discriminating === rows.length, pipelines: Object.freeze(rows) });
}

const VALIDATION_CAMPAIGN_CONTRACT = Object.freeze({
  id: "WI-VAL-29-VALIDATION-CAMPAIGN",
  source: "§8 integrated validation over the 7 cross-métier pipelines (clean vs adversarial discrimination)",
  notAuthority: "pure end-to-end validation harness over shipped pipelines; adds no engine; a pipeline must DISCRIMINATE clean vs adversarial to count as integrated",
  invariants: Object.freeze([
    "pure/deterministic: runs each of the 7 pipelines clean + adversarial",
    "a pipeline is integrated only if clean ⇒ healthy verdict AND adversarial ⇒ degraded verdict",
    "exercises end-to-end composition (provenance/evidence/error-handling), not isolated functions",
  ]),
});

module.exports = { VALIDATION_CAMPAIGN_CONTRACT, runValidationCampaign };

if (require.main === module) { process.stdout.write(JSON.stringify(runValidationCampaign(), null, 2) + "\n"); }

export {};
