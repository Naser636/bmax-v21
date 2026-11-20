#!/usr/bin/env node
"use strict";
/*
 * V327 §5/§7 — INTELLIGENT NATIVE CYCLE (the REAL consumer that wires the built intelligence together). PURE of its own
 * side effects (all execution injected), deterministic. §7: a capability is not finished because its code exists — it must
 * be invoked by its real consumer. routing (#771), execution-policy (#774), policy-build-seam (#776), escalation (#778)
 * and decomposed-execution (#775) were built + tested but ORPHAN. This is their single consumer: for one mission it
 *   (1) SELECTS calibrated-aware (routing re-prioritises, then campaign-controller.selectNextLot — reused),
 *   (2) sizes resources (execution-policy) and executes via native-engineering-cycle through the POLICY build seam,
 *   (3) on a non-accepted hard mission, optionally DECOMPOSES (intermediate verification),
 *   (4) if still failing and the policy is calibrated-low, DELEGATES to the provider (evidence-gated escalation).
 *
 * It is NOT a second orchestrator: native-engineering-cycle remains the engine, campaign-controller.selectNextLot the
 * selector, odg-sovereign-delegation the delegation chain. This only COMPOSES them with the intelligent signals. No new
 * primitive/registry. The independent verifier (inside native-engineering-cycle) still arbitrates acceptance.
 */

const ROUTE = require("./odg-execution-routing.js");
const POLICY = require("./odg-local-model-execution-policy.js");
const SEAM = require("./odg-policy-build-seam.js");
const CYCLE = require("./native-engineering-cycle.js");
const ESC = require("./odg-native-escalation.js");
const DECOMP = require("./odg-decomposed-execution.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** selectIntelligently(register, history, opts) — calibrated-aware selection: REUSES routing (#771) which adjusts
 *  priorities then defers to campaign-controller.selectNextLot. Returns the routing result (baseline vs routed pick). */
function selectIntelligently(register: any, history: any, opts: any = {}): any {
  return ROUTE.prioritizeAndSelect(register, history, opts);
}

/**
 * runIntelligentCycle(opts) -> { ok, mission, policy, executed, accepted, cycleOutcome, decomposition, escalation, note }.
 *   opts: { mission:{id,type,spec, decomposition?}, history, generatorFor:(model)=>generateFile, deps?:{ buildProject?, priorOutcomes? } }.
 * Consumes policy → policy-seam → native-engineering-cycle; on failure optionally decomposition; then evidence-gated escalation.
 */
async function runIntelligentCycle(opts: any): Promise<any> {
  const o = isObj(opts) ? opts : {};
  const m = isObj(o.mission) ? o.mission : {};
  if (typeof m.id !== "string" || !isObj(m.spec) || typeof o.generatorFor !== "function") return freeze({ ok: false, code: "BAD_INPUT", detail: "mission{id,spec,type}, history, generatorFor required" });
  const deps = isObj(o.deps) ? o.deps : {};
  const history = Array.isArray(o.history) ? o.history : [];
  const type = typeof m.type === "string" ? m.type : m.id;

  // (1) resource sizing (policy) + (2) build seam honoring it
  const policy = POLICY.chooseExecutionPolicy(type, history);
  const seam = SEAM.makePolicyBuildSeam({ history, generatorFor: o.generatorFor, taskTypeOf: () => type, buildProject: deps.buildProject });

  // (2) execute via the EXISTING native-engineering-cycle (explore mode, externally authorized) through the policy seam
  let cyc: any;
  try { cyc = await CYCLE.runNativeCycle(m.spec, Array.isArray(deps.priorOutcomes) ? deps.priorOutcomes : [], { build: seam.build }, { mode: "explore", exploreAuthorized: true }); }
  catch (e: any) { cyc = { attempted: true, routedTo: "NATIVE", buildAccepted: false, outcome: "ERROR", reason: String((e && e.message) || e) }; }
  const accepted = cyc && cyc.buildAccepted === true;

  // (3) decomposition on a non-accepted mission that supplies ordered sub-problems (intermediate verification)
  let decomposition: any = null;
  if (!accepted && Array.isArray(m.decomposition) && m.decomposition.length > 0) {
    decomposition = await DECOMP.runDecomposed(m.decomposition, { generateFile: o.generatorFor(policy.model), maxRepair: policy.maxRepair, buildProject: deps.buildProject });
  }
  const solvedByDecomp = decomposition && decomposition.allVerified === true;

  // (4) still failing ⇒ evidence-gated escalation to the provider (no fabricated native success)
  const stillFailing = !accepted && !solvedByDecomp;
  const escalation = stillFailing ? ESC.decideEscalation({ task: { id: m.id, type }, policyResult: policy, localAttemptAccepted: false }) : freeze({ escalate: false, reason: accepted ? "accepted by the independent verifier" : "solved via decomposition", attribution: "ODG_LOCAL_MODEL_EXECUTION", delegation: null });

  return freeze({
    ok: true, mission: m.id,
    policy: freeze({ model: policy.model, maxRepair: policy.maxRepair, tier: policy.tier }),
    executed: "ODG_LOCAL_MODEL_EXECUTION (native-engineering-cycle via policy seam)",
    accepted, cycleOutcome: cyc ? cyc.outcome : null,
    decomposition: decomposition ? freeze({ allVerified: decomposition.allVerified === true, firstFailure: decomposition.firstFailure || null }) : null,
    escalation: freeze({ escalate: escalation.escalate === true, attribution: escalation.attribution, delegationState: escalation.delegation ? escalation.delegation.state : null }),
    note: accepted ? "accepted by the independent verifier (local)" : solvedByDecomp ? "solved by decomposition (intermediate verification)" : escalation.escalate ? "local insufficient + calibrated-low ⇒ delegated to provider (evidence-gated)" : "local insufficient; not calibrated-low ⇒ keep probing (no premature escalation)",
  });
}

const INTELLIGENT_NATIVE_CYCLE_CONTRACT = Object.freeze({
  id: "V327-INTELLIGENT-NATIVE-CYCLE",
  purpose: "§5/§7 — the single REAL consumer that composes the built intelligence (routing+policy+policy-seam+decomposition+escalation) over the EXISTING native-engineering-cycle; closes the orphan-capability gap (built≠used)",
  reuses: Object.freeze(["odg-execution-routing #771 (selection)", "odg-local-model-execution-policy #774 + odg-policy-build-seam #776 (resources)", "native-engineering-cycle (engine) + campaign-controller.selectNextLot (selector)", "odg-decomposed-execution #775 (hard-task localisation)", "odg-native-escalation #778 → sovereign-delegation (provider)"]),
  invariants: Object.freeze([
    "NOT a second orchestrator: native-engineering-cycle is the engine, selectNextLot the selector, sovereign-delegation the chain — this only composes them with the intelligent signals",
    "the INDEPENDENT verifier (inside native-engineering-cycle) still arbitrates acceptance; the policy sizes resources only",
    "order: select (calibrated) → execute (policy seam) → decompose if hard → escalate only if still failing AND calibrated-low (evidence-gated, provider-attributed)",
    "all execution is INJECTED (generatorFor/buildProject) ⇒ deterministic + testable without a live model; no fabricated native success",
    "no new primitive/registry/orchestrator; consumes the previously-orphan built capabilities as their real consumer (§7)",
  ]),
});

module.exports = { selectIntelligently, runIntelligentCycle, INTELLIGENT_NATIVE_CYCLE_CONTRACT };
export {};
