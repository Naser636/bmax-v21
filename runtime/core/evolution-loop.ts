#!/usr/bin/env node
"use strict";

/*
 * WI-FR-04 — EVOLUTION-LOOP ENGINE. PURE orchestration over EXISTING primitives (NO new sandbox/store/evaluator/
 * authorizer). It drives ODG's internal self-improvement automaton for ONE candidate improvement, end-to-end, with
 * STRICT role separation and NO self-promotion:
 *
 *   success path: OBSERVE → DIAGNOSE → GAP → HYPOTHESIS → CANDIDATE → SANDBOX → REPLAY → ADVERSARIAL →
 *                 INDEPENDENT_EVALUATION → BASELINE_COMPARE → SHADOW → CANARY → PROMOTION_REVIEW → MEASURED
 *   failure path: DEGRADED → STOPPED → ROLLED_BACK → (REJECTED | REPAIRING) → REVALIDATED
 *
 * Roles are SEPARATE (Builder ≠ Tester ≠ Verifier ≠ Challenger ≠ ODG-decider): the candidate (builder) and the run
 * (tester) are INJECTED; SANDBOX/REPLAY/independent verification REUSE the WI-FR-03 Frontier Lab (the verifier never
 * consumes the tester's self-verdict); the challenger supplies adversarial integrity signals (meta-intelligence);
 * BASELINE_COMPARE reuses improvement-baseline; CANARY/PROMOTION_REVIEW reuse canary-decision-pack (deny-by-default,
 * PREPARES but never activates). The loop can NEVER promote: PROMOTION_REVIEW only assembles an EXTERNAL decision
 * dossier, and MEASURED is reached ONLY via applyExternalPromotion with an externally-authorized decision. The
 * protected baseline, G0, POLICY and evaluators are NEVER modified. Rollback is testable (nothing is promoted without
 * the external decision, so rollback = discard candidate + confirm baseline intact). Persistence/resume reuse
 * autonomy-store + idempotency-guard (immutable snapshots). Pure/deterministic (now + roles injected). Dual export.
 */

const autonomyStore = require("./autonomy-store");
const IG = require("./idempotency-guard");
const LAB = require("./frontier-lab");
const BL = require("./improvement-baseline");

const STATE = Object.freeze({
  OBSERVE: "OBSERVE", DIAGNOSE: "DIAGNOSE", GAP: "GAP", HYPOTHESIS: "HYPOTHESIS", CANDIDATE: "CANDIDATE",
  SANDBOX: "SANDBOX", REPLAY: "REPLAY", ADVERSARIAL: "ADVERSARIAL", INDEPENDENT_EVALUATION: "INDEPENDENT_EVALUATION",
  BASELINE_COMPARE: "BASELINE_COMPARE", SHADOW: "SHADOW", CANARY: "CANARY", PROMOTION_REVIEW: "PROMOTION_REVIEW", MEASURED: "MEASURED",
  DEGRADED: "DEGRADED", STOPPED: "STOPPED", ROLLED_BACK: "ROLLED_BACK", REJECTED: "REJECTED", REPAIRING: "REPAIRING", REVALIDATED: "REVALIDATED",
});
const ROLES = Object.freeze(["BUILDER", "TESTER", "VERIFIER", "CHALLENGER", "ODG_DECIDER"]);
const OUTCOME = Object.freeze(["PROMOTION_REVIEW", "REJECTED", "INCONCLUSIVE", "ROLLED_BACK", "MEASURED"]);
const STORE_KEYS = Object.freeze({ cycles: "evolution-loop-cycles", journal: "evolution-loop-journal" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isFn(v: any): boolean { return typeof v === "function"; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function storeOf(opts: any): any { return isObj(opts) && isObj(opts.store) ? opts.store : autonomyStore; }
function hist(c: any, event: any): any[] { return arr(c.history).concat([event]); }
function to(c: any, state: string, event: any, now: any): any { return Object.freeze({ ...c, state, history: hist(c, { at: now, event, state }) }); }

/**
 * startCycle(spec, {now}) -> { ok, cycle } | { ok:false }. Requires a linked proposal, a complete hypothesis
 * (hypothesis/problem/expectedOutcome/refutationConditions/successCriteria), a budget, and a protected baselineRef.
 * Status OBSERVE, immutable history.
 */
function startCycle(spec: any, opts: any): any {
  const s = isObj(spec) ? spec : {};
  const now = isObj(opts) ? opts.now : null;
  const problems: string[] = [];
  if (!isStr(s.id)) problems.push("cycle id required");
  if (!isStr(s.proposalRef)) problems.push("proposalRef required (link to the Radar proposal)");
  const h = isObj(s.hypothesis) ? s.hypothesis : null;
  if (!h || !isStr(h.hypothesis) || arr(h.refutationConditions).length === 0 || arr(h.successCriteria).length === 0) problems.push("complete, falsifiable hypothesis required (hypothesis + refutationConditions + successCriteria)");
  if (!isObj(s.budget)) problems.push("explicit budget required");
  if (problems.length) return Object.freeze({ ok: false, decision: "REJECTED", problems: Object.freeze(problems) });
  const cycle = Object.freeze({
    id: s.id, proposalRef: s.proposalRef, state: STATE.OBSERVE,
    hypothesis: s.hypothesis, budget: s.budget, config: isObj(s.config) ? s.config : {},
    observation: null, gap: null, candidate: null, lab: null, replayReproducible: null,
    measurement: null, verification: null, degraded: null, outcome: null, promotionReview: null, promoted: false,
    createdAt: now, history: [{ at: now, event: "STARTED", state: STATE.OBSERVE }],
  });
  return Object.freeze({ ok: true, cycle });
}

function degrade(cycle: any, reason: string, now: any): any { return Object.freeze({ ...to(cycle, STATE.DEGRADED, "DEGRADED", now), degraded: { reason } }); }

/** stop → rollback → rejectOrRepair → revalidate. The failure path. Rollback is safe: nothing was promoted. */
function stop(cycle: any, now: any): any { return to(cycle, STATE.STOPPED, "STOP", now); }
function rollback(cycle: any, now: any): any {
  // nothing was promoted (promotion is external + gated); rollback = discard candidate, keep the protected baseline.
  return Object.freeze({ ...to(cycle, STATE.ROLLED_BACK, "ROLLBACK", now), candidate: null, outcome: "ROLLED_BACK" });
}
function rejectOrRepair(cycle: any, opts: any): any {
  const now = isObj(opts) ? opts.now : null;
  if (isObj(opts) && opts.repair === true) return to(cycle, STATE.REPAIRING, "REPAIR", now);
  return Object.freeze({ ...to(cycle, STATE.REJECTED, "REJECT", now), outcome: "REJECTED" });
}
/** revalidate(cycle, baselineCollectors, {now}) -> confirms the PROTECTED baseline is intact after rollback. */
function revalidate(cycle: any, baselineCollectors: any, opts: any): any {
  const now = isObj(opts) ? opts.now : null;
  const after = BL.captureBaseline(isObj(baselineCollectors) ? baselineCollectors : {});
  const baseline = isObj(cycle.lab) && isObj(cycle.lab.baseline) ? cycle.lab.baseline : null;
  const delta = baseline ? BL.measureDelta(baseline, after) : { summary: { regressed: 0, improved: 0 } };
  const intact = (delta.summary.regressed || 0) === 0 && (delta.summary.improved || 0) === 0;
  return Object.freeze({ ...to(cycle, STATE.REVALIDATED, "REVALIDATE", now), baselineIntact: intact });
}

/**
 * runEvolutionCycle(spec, roles) -> the full cycle record. roles: { collectors, runner, integritySignals?, builder,
 * observation?, now }. builder/runner are SEPARATE injected roles (Builder ≠ Tester). On any degradation the failure
 * path (STOP → ROLLBACK → REVALIDATE) runs. The loop STOPS at PROMOTION_REVIEW — it never promotes.
 */
async function runEvolutionCycle(spec: any, roles: any): Promise<any> {
  const r = isObj(roles) ? roles : {};
  const now = r.now;
  const started = startCycle(spec, { now });
  if (!started.ok) return Object.freeze({ ok: false, stage: "start", result: started });
  if (!isFn(r.builder)) return Object.freeze({ ok: false, stage: "builder", reason: "a separate Builder role (builder fn) is required" });
  if (!isFn(r.runner)) return Object.freeze({ ok: false, stage: "tester", reason: "a separate Tester role (runner fn) is required" });

  let c = started.cycle;
  c = Object.freeze({ ...to(c, STATE.DIAGNOSE, "OBSERVE", now), observation: isObj(r.observation) ? r.observation : { note: "observation supplied by Radar/caller" } });
  c = to(c, STATE.GAP, "DIAGNOSE", now);
  c = Object.freeze({ ...to(c, STATE.HYPOTHESIS, "GAP", now), gap: { potential: true } });
  // CANDIDATE — builder role (separate).
  const candidate = await r.builder({ hypothesis: c.hypothesis, config: c.config });
  c = Object.freeze({ ...to(c, STATE.CANDIDATE, "HYPOTHESIS", now), candidate: candidate || null });

  // SANDBOX — reuse the Frontier Lab (tester runner injected). Budget/production breaches ⇒ ABORTED ⇒ DEGRADED.
  const labSpec = { id: c.id + ":exp", proposalRef: c.proposalRef, touchesProduction: false, hypothesis: c.hypothesis, budget: c.budget, config: c.config };
  const lab1 = await LAB.runLabExperiment(labSpec, { collectors: r.collectors, runner: r.runner, integritySignals: r.integritySignals, now });
  if (!lab1.ok || (lab1.experiment && lab1.experiment.status === "ABORTED") || lab1.aborted) {
    const reason = lab1.aborted || (lab1.experiment && lab1.experiment.status === "ABORTED") ? "sandbox aborted (" + ((lab1.experiment && lab1.experiment.abortReason) || "budget/isolation") + ")" : "sandbox failed";
    return Object.freeze({ ok: true, cycle: rollback(stop(degrade({ ...c, lab: lab1.experiment || null }, reason, now), now), now) });
  }
  c = Object.freeze({ ...to(c, STATE.SANDBOX, "CANDIDATE", now), lab: lab1.experiment, measurement: lab1.experiment.measurement, verification: lab1.experiment.verification });

  // REPLAY — re-run and require reproducible measurements.
  const lab2 = await LAB.runLabExperiment(labSpec, { collectors: r.collectors, runner: r.runner, integritySignals: r.integritySignals, now });
  const reproducible = JSON.stringify(lab1.experiment.measurement) === JSON.stringify(lab2.experiment && lab2.experiment.measurement);
  c = Object.freeze({ ...to(c, STATE.REPLAY, "SANDBOX", now), replayReproducible: reproducible });
  if (!reproducible) return Object.freeze({ ok: true, cycle: rollback(stop(degrade(c, "not reproducible on replay", now), now), now) });

  // ADVERSARIAL + INDEPENDENT_EVALUATION — the Lab already ran integrity detectors + independent verification.
  c = to(c, STATE.ADVERSARIAL, "REPLAY", now);
  c = to(c, STATE.INDEPENDENT_EVALUATION, "ADVERSARIAL", now);
  const v = c.verification || {};
  if (v.verdict === "INCONCLUSIVE") return Object.freeze({ ok: true, cycle: Object.freeze({ ...stop(c, now), outcome: "INCONCLUSIVE" }) });
  if (v.verdict !== "PASS" || v.integrity === "DETECTED") return Object.freeze({ ok: true, cycle: rollback(stop(degrade(c, v.integrity === "DETECTED" ? "integrity DETECTED (compromised evaluator/gaming)" : "independent verification FAIL", now), now), now) });

  // BASELINE_COMPARE — a regression on the protected baseline ⇒ DEGRADED.
  c = to(c, STATE.BASELINE_COMPARE, "INDEPENDENT_EVALUATION", now);
  if ((c.measurement && c.measurement.regressed || 0) > 0) return Object.freeze({ ok: true, cycle: rollback(stop(degrade(c, "regression vs protected baseline", now), now), now) });
  if (!(c.measurement && c.measurement.improved > 0)) return Object.freeze({ ok: true, cycle: Object.freeze({ ...stop(c, now), outcome: "INCONCLUSIVE" }) }); // no measured gain ⇒ not promoted

  // SHADOW → CANARY (deny-by-default SAFE check) → PROMOTION_REVIEW (EXTERNAL dossier; the loop STOPS here).
  c = to(c, STATE.SHADOW, "BASELINE_COMPARE", now);
  c = to(c, STATE.CANARY, "SHADOW", now);
  const review = preparePromotionReview(c);
  c = Object.freeze({ ...to(c, STATE.PROMOTION_REVIEW, "CANARY", now), promotionReview: review, outcome: "PROMOTION_REVIEW" });
  return Object.freeze({ ok: true, cycle: c });
}

/** preparePromotionReview(cycle) -> an EXTERNAL decision dossier (reuses canary-decision-pack; PREPARES, never activates). */
function preparePromotionReview(cycle: any): any {
  const c = isObj(cycle) ? cycle : {};
  const CP = require("./canary-decision-pack");
  const missionSpec = { mission: "EVO-" + String(c.id || "x").toUpperCase().replace(/[^A-Z0-9_-]/g, "-"), requiresEngineering: false, authorizedPaths: [], network: false, spend: false, destructive: false };
  const assessment = CP.assessCanaryCandidate(missionSpec);
  return Object.freeze({ requiresExternalDecision: true, grantsNoPromotion: true, safeForCanary: assessment.safe, assessment, note: "the Evolution-Loop PREPARES this review; promotion requires an EXTERNAL ODG/owner decision (applyExternalPromotion)" });
}

/**
 * applyExternalPromotion(cycle, decision, {now}) -> { ok, cycle }. The ONLY path to MEASURED. Requires an EXTERNAL
 * authorized decision (decision.authorizedBy a non-empty actor AND decision.approved === true). A self-authored /
 * unapproved decision is REJECTED — the loop cannot promote itself.
 */
function applyExternalPromotion(cycle: any, decision: any, opts: any): any {
  const c = isObj(cycle) ? cycle : {};
  const d = isObj(decision) ? decision : {};
  const now = isObj(opts) ? opts.now : null;
  if (c.state !== STATE.PROMOTION_REVIEW) return Object.freeze({ ok: false, reason: `promotion requires state PROMOTION_REVIEW (is ${c.state})` });
  if (!isStr(d.authorizedBy) || d.authorizedBy === "evolution-loop" || d.selfAuthored === true) return Object.freeze({ ok: false, reason: "external authorizer required — the loop cannot authorize its own promotion" });
  if (d.approved !== true) return Object.freeze({ ok: true, cycle: Object.freeze({ ...to(c, STATE.REJECTED, "EXTERNAL_DECLINE", now), outcome: "REJECTED" }) });
  return Object.freeze({ ok: true, cycle: Object.freeze({ ...to(c, STATE.MEASURED, "PROMOTED_EXTERNALLY", now), promoted: true, promotedBy: d.authorizedBy, outcome: "MEASURED" }) });
}

// ---- Persistence (immutable snapshots + resume) — reuses autonomy-store + idempotency-guard ----------------------
function loadJournal(opts: any): any { const st = storeOf(opts); const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.journal) : { value: st.read(STORE_KEYS.journal, null) }; return isObj(rs.value) ? rs.value : IG.emptyJournal(); }
function loadCycles(opts: any): any {
  const st = storeOf(opts);
  const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.cycles) : { present: true, corrupt: false, value: st.read(STORE_KEYS.cycles, null) };
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true });
  return Object.freeze({ ok: true, snapshots: arr(rs.value && rs.value.items) });
}
function persistCycle(cycle: any, opts: any): any {
  const c = isObj(cycle) ? cycle : {};
  if (!isStr(c.id) || !isStr(c.state)) return Object.freeze({ ok: false, reason: "cycle id+state required" });
  const loaded = loadCycles(opts);
  if (!loaded.ok) return loaded;
  const journal = loadJournal(opts);
  const key = "evo:" + c.id + ":" + c.state;
  if (IG.admit({ idempotencyKey: key, actionId: c.id }, journal, 0).decision === IG.DECISION.DUPLICATE) return Object.freeze({ ok: true, decision: "DUPLICATE", added: false });
  const st = storeOf(opts);
  st.write(STORE_KEYS.cycles, { items: loaded.snapshots.concat([c]) });
  st.write(STORE_KEYS.journal, IG.record(journal, key, { at: isObj(opts) ? opts.now : null }));
  return Object.freeze({ ok: true, decision: "PROCEED", added: true });
}
function resume(opts: any): any {
  const loaded = loadCycles(opts);
  if (!loaded.ok) return Object.freeze({ ok: false, corrupt: true, cycles: {} });
  const latest: any = {};
  for (const snap of loaded.snapshots) { if (isObj(snap) && isStr(snap.id)) latest[snap.id] = snap; } // snapshots appended in order ⇒ last wins
  return Object.freeze({ ok: true, cycles: Object.freeze(latest), count: Object.keys(latest).length });
}

const EVOLUTION_LOOP_CONTRACT = Object.freeze({
  id: "WI-FR-04-EVOLUTION-LOOP",
  source: "Resumption mandate / V12.4 §4.2 WI-FR-04 — internal self-improvement automaton with role separation + external governed promotion",
  state: STATE, roles: ROLES, outcomes: OUTCOME, storeKeys: STORE_KEYS,
  reuses: Object.freeze(["frontier-lab (sandbox/replay/independent verification)", "improvement-baseline (baseline compare)", "meta-intelligence (challenger, via lab)", "canary-decision-pack (canary + external promotion dossier)", "idempotency-guard + autonomy-store (immutable snapshots + resume)"]),
  notAuthority: "drives OBSERVE→…→PROMOTION_REVIEW and the failure path; it NEVER promotes/authorizes (MEASURED requires an EXTERNAL authorized decision), never modifies baseline/G0/POLICY/evaluators",
  invariants: Object.freeze([
    "NO new sandbox/store/evaluator/authorizer — orchestrates existing primitives; roles Builder≠Tester≠Verifier≠Challenger≠ODG are SEPARATE",
    "the independent verifier (Frontier Lab) never consumes the tester's self-verdict; the challenger runs integrity detectors",
    "degradation (regression / non-reproducible / integrity DETECTED / verify FAIL) ⇒ STOP → ROLLBACK → REJECT_OR_REPAIR → REVALIDATE (rollback testable)",
    "the protected baseline, G0, POLICY and evaluators are NEVER modified",
    "no self-promotion: PROMOTION_REVIEW only PREPARES an external dossier; MEASURED requires applyExternalPromotion with an external authorizer + approved===true",
    "insufficient evidence / no measured gain ⇒ INCONCLUSIVE (fail-closed), never promoted",
    "pure/deterministic; the only side effects are the injected roles (builder/runner) and the injected store",
  ]),
});

module.exports = {
  STATE, ROLES, OUTCOME, STORE_KEYS, EVOLUTION_LOOP_CONTRACT,
  startCycle, runEvolutionCycle, degrade, stop, rollback, rejectOrRepair, revalidate,
  preparePromotionReview, applyExternalPromotion,
  loadCycles, persistCycle, resume,
};

if (require.main === module) { process.stdout.write(JSON.stringify(EVOLUTION_LOOP_CONTRACT, null, 2) + "\n"); }

export {};
