#!/usr/bin/env node
"use strict";
/*
 * V327 §2/§3 — POLICY-CONFIGURED BUILD SEAM. Deterministic, fail-closed. Connects the calibrated resource policy
 * (odg-local-model-execution-policy, #774) to the EXISTING native-engineering-cycle, which consumes a caller-supplied
 * `deps.build(specWithArch)` seam. Today callers hardcode the model + maxRepair (e.g. odg-native-explore: 3b, maxRepair 1);
 * this makes the seam ADAPT per task class from REAL calibrated-P evidence — cheap for reliable classes, more repair / the
 * larger model for hard ones — WITHOUT touching the cycle (no duplication, no second orchestrator).
 *
 * It composes odg-local-model-execution-policy (resource choice) + native-project-builder.buildProject (the build + the
 * INDEPENDENT verifier). It builds no engine and authorizes nothing: the independent verifier still arbitrates acceptance;
 * the policy only sizes resources. The chosen policy is attached to the outcome (executionPolicy) for honest tracing.
 */

const POLICY = require("./odg-local-model-execution-policy.js");
const BUILDER = require("./native-project-builder.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * makePolicyBuildSeam(cfg) -> { build, policyFor }. cfg:
 *   { history: calibrated-P history (tagged by task type), generatorFor: (model)=>generateFile,
 *     taskTypeOf?: (spec)=>string (default spec.name|spec.class), buildProject?=BUILDER.buildProject }.
 * `build(specWithArch)` is the seam native-engineering-cycle calls: it derives {model, maxRepair} from the policy over
 * the task's calibrated history, builds via buildProject with that generator + maxRepair, and returns the build outcome
 * augmented with `executionPolicy`. Fail-closed: a missing generatorFor ⇒ the seam refuses (returns an un-accepted outcome).
 */
function makePolicyBuildSeam(cfg: any): any {
  const c = isObj(cfg) ? cfg : {};
  const history = Array.isArray(c.history) ? c.history : [];
  const buildProject = typeof c.buildProject === "function" ? c.buildProject : BUILDER.buildProject;
  const taskTypeOf = typeof c.taskTypeOf === "function" ? c.taskTypeOf : (spec: any) => (spec && (spec.type || spec.class || spec.name)) || null;

  function policyFor(spec: any): any { return POLICY.chooseExecutionPolicy(taskTypeOf(spec), history, isObj(c.policyOpts) ? c.policyOpts : {}); }

  async function build(specWithArch: any): Promise<any> {
    const pol = policyFor(specWithArch);
    const tag = { model: pol.model, maxRepair: pol.maxRepair, tier: pol.tier, escalateIfStillFails: pol.escalateIfStillFails, quality: pol.quality, pForPlanner: pol.pForPlanner };
    if (typeof c.generatorFor !== "function") return Object.freeze({ accepted: false, buildOk: false, verified: false, repairs: null, error: "NO_GENERATOR_FACTORY", executionPolicy: tag });
    const gen = c.generatorFor(pol.model);
    let bo: any;
    try { bo = await buildProject(specWithArch, { generateFile: gen, maxRepair: pol.maxRepair }); }
    catch (e: any) { return Object.freeze({ accepted: false, buildOk: false, verified: false, repairs: null, error: String((e && e.message) || e), executionPolicy: tag }); }
    return Object.freeze({ ...(isObj(bo) ? bo : {}), executionPolicy: tag });
  }

  return { build, policyFor };
}

const POLICY_BUILD_SEAM_CONTRACT = Object.freeze({
  id: "V327-POLICY-BUILD-SEAM",
  purpose: "§2/§3 — make the EXISTING native-engineering-cycle's build seam ADAPT its {model, maxRepair} from REAL calibrated-P evidence per task class, instead of a hardcoded cheap default — a caller-level connection, no cycle change, no duplication",
  reuses: Object.freeze(["native-engineering-cycle consumes this as deps.build (not modified)", "odg-local-model-execution-policy.chooseExecutionPolicy (resource choice — not reimplemented)", "native-project-builder.buildProject (build + the INDEPENDENT verifier arbitrates acceptance)"]),
  invariants: Object.freeze([
    "resources ADAPT per task class from calibrated evidence: reliable ⇒ cheap (3b, maxRepair 1); hard ⇒ more repair / larger model (per the measured policy)",
    "the INDEPENDENT verifier still arbitrates acceptance — the policy sizes resources only; authorizes nothing",
    "the chosen policy is attached (executionPolicy) for honest tracing; builds NO engine, modifies the cycle NOT at all",
    "fail-closed: no generatorFor ⇒ an un-accepted outcome (never a fabricated success); buildProject throw ⇒ un-accepted",
    "deterministic given injected generatorFor + buildProject (testable); PURE of its own side effects",
  ]),
});

module.exports = { makePolicyBuildSeam, POLICY_BUILD_SEAM_CONTRACT };
export {};
