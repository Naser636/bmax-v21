#!/usr/bin/env node
"use strict";

/*
 * WI-FR-03 — FRONTIER LAB (isolated experimentation engine). PURE orchestration over EXISTING primitives (NO new
 * sandbox, NO new store, NO new evaluator, NO authorizer). It lets ODG TEST a Frontier Radar proposal in isolation,
 * reproducibly, with INDEPENDENT verification, BEFORE any integration decision — and it can NEVER promote or
 * authorize anything (Aucune expérience ne peut autoriser sa propre promotion).
 *
 * Eight capabilities: (1) EXPERIMENT REGISTRY — unique id, proposalRef, status + immutable history; (2) HYPOTHESIS
 * ENGINE — explicit hypothesis/problem/expected-outcome/refutation-conditions/preregistered success-criteria (an
 * unfalsifiable experiment is REJECTED); (3) BASELINE ENGINE — immutable before-state via improvement-baseline;
 * (4) EXPERIMENT EXECUTOR — isolated via an INJECTED runner, explicit budget (maxMs/maxCalls/maxCostEur), safe-stop
 * on overrun, NO production effect; (5) MEASUREMENT ENGINE — raw results + baseline/intervention delta via
 * improvement-baseline (reproducible); (6) INDEPENDENT VERIFICATION — SEPARATE from the executor, re-checks the
 * PREREGISTERED criteria + runs meta-intelligence integrity detectors, never trusting the executor's self-report,
 * PASS/FAIL/INCONCLUSIVE; (7) EXPERIMENT EVIDENCE — hypothesis/baseline/config/raw/measures/verification/decision/
 * provenance; (8) EXPERIMENT DECISION — PROMISING/REJECTED/INCONCLUSIVE/READY_FOR_REVIEW (terminal; grants no
 * promotion). Fail-closed on any uncertainty. Separation executor≠verifier is structural (two functions, the
 * verifier never receives the executor's verdict). Pure/deterministic (no clock/random; now + runner injected).
 * REUSE: improvement-baseline, meta-intelligence, idempotency-guard, autonomy-store. Dual export.
 */

const autonomyStore = require("./autonomy-store");
const IG = require("./idempotency-guard");
const BL = require("./improvement-baseline");
const MI = require("./meta-intelligence");

const STATUS = Object.freeze({ REGISTERED: "REGISTERED", BASELINED: "BASELINED", EXECUTED: "EXECUTED", VERIFIED: "VERIFIED", DECIDED: "DECIDED", ABORTED: "ABORTED" });
const ORDER = Object.freeze({ REGISTERED: 0, BASELINED: 1, EXECUTED: 2, VERIFIED: 3, DECIDED: 4, ABORTED: 4 });
const VERDICTS = Object.freeze(["PASS", "FAIL", "INCONCLUSIVE"]);
const DECISIONS = Object.freeze(["PROMISING", "REJECTED", "INCONCLUSIVE", "READY_FOR_REVIEW"]);
const STORE_KEYS = Object.freeze({ experiments: "frontier-lab-experiments", journal: "frontier-lab-journal" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function storeOf(opts: any): any { return isObj(opts) && isObj(opts.store) ? opts.store : autonomyStore; }
function histAppend(exp: any, event: any): any { return (arr(exp.history)).concat([event]); }

function compare(actual: any, op: any, value: any): boolean {
  switch (op) {
    case ">=": return isNum(actual) && isNum(value) && actual >= value;
    case ">": return isNum(actual) && isNum(value) && actual > value;
    case "<=": return isNum(actual) && isNum(value) && actual <= value;
    case "<": return isNum(actual) && isNum(value) && actual < value;
    case "==": case "===": return actual === value;
    case "!=": case "!==": return actual !== value;
    default: return false;
  }
}
// evaluate a criterion { metric, field?: "after"|"delta"|"direction", op, value } against a measurement.
function evalCriterion(crit: any, measurement: any): any {
  const c = isObj(crit) ? crit : {};
  const m = isObj(measurement) && isObj(measurement.metrics) ? measurement.metrics[c.metric] : null;
  if (!m) return { metric: c.metric, measured: false, met: false };
  const field = isStr(c.field) ? c.field : "after";
  const actual = field === "direction" ? m.direction : m[field];
  return { metric: c.metric, measured: actual !== undefined && actual !== null, met: compare(actual, c.op, c.value), actual };
}

/**
 * (1)+(2) registerExperiment(spec, {now}) -> { ok, experiment } | { ok:false, decision:"REJECTED" }. HYPOTHESIS ENGINE:
 * refuses an incomplete/unfalsifiable preregistration (no hypothesis/expectedOutcome/refutationConditions/successCriteria),
 * a missing budget, or touchesProduction !== false (no production effect allowed). Status REGISTERED, immutable history.
 */
function registerExperiment(spec: any, opts: any): any {
  const s = isObj(spec) ? spec : {};
  const now = isObj(opts) ? opts.now : null;
  const h = isObj(s.hypothesis) ? s.hypothesis : null;
  const problems: string[] = [];
  if (!isStr(s.id)) problems.push("id required");
  if (!isStr(s.proposalRef)) problems.push("proposalRef required (link to the Radar proposal)");
  if (!h) problems.push("hypothesis block required");
  else {
    if (!isStr(h.hypothesis)) problems.push("explicit hypothesis required");
    if (!isStr(h.problem)) problems.push("problem statement required");
    if (!isStr(h.expectedOutcome)) problems.push("expected outcome required");
    if (arr(h.refutationConditions).length === 0) problems.push("at least one refutation condition required (unfalsifiable experiment refused)");
    if (arr(h.successCriteria).length === 0) problems.push("preregistered success criteria required");
  }
  if (!isObj(s.budget) || !(isNum(s.budget.maxMs) || isNum(s.budget.maxCalls) || isNum(s.budget.maxCostEur))) problems.push("explicit budget (maxMs/maxCalls/maxCostEur) required");
  if (s.touchesProduction !== false) problems.push("touchesProduction must be explicitly false (the Lab never touches production)");
  if (problems.length) return Object.freeze({ ok: false, decision: "REJECTED", problems: Object.freeze(problems) });
  const experiment = {
    id: s.id, proposalRef: s.proposalRef, status: STATUS.REGISTERED,
    hypothesis: Object.freeze({ ...h, refutationConditions: Object.freeze(arr(h.refutationConditions)), successCriteria: Object.freeze(arr(h.successCriteria)) }),
    budget: Object.freeze({ maxMs: s.budget.maxMs ?? null, maxCalls: s.budget.maxCalls ?? null, maxCostEur: s.budget.maxCostEur ?? null }),
    touchesProduction: false,
    config: isObj(s.config) ? s.config : {},
    baseline: null, raw: null, measurement: null, verification: null, evidence: null, decision: null,
    createdAt: now,
    history: [{ at: now, event: "REGISTERED" }],
  };
  return Object.freeze({ ok: true, experiment });
}

/** (3) recordBaseline(experiment, collectors, {now}) -> BASELINE ENGINE (immutable). Fail-closed: must be REGISTERED. */
function recordBaseline(experiment: any, collectors: any, opts: any): any {
  const e = isObj(experiment) ? experiment : {};
  const now = isObj(opts) ? opts.now : null;
  if (e.status !== STATUS.REGISTERED) return Object.freeze({ ok: false, reason: `baseline requires status REGISTERED (is ${e.status})` });
  if (e.baseline) return Object.freeze({ ok: false, reason: "baseline already set — immutable (cannot re-baseline)" });
  const baseline = Object.freeze(BL.captureBaseline(isObj(collectors) ? collectors : {}));
  return Object.freeze({ ok: true, experiment: Object.freeze({ ...e, status: STATUS.BASELINED, baseline, history: histAppend(e, { at: now, event: "BASELINED" }) }) });
}

/**
 * (4) runExperiment(experiment, {runner, now}) -> EXPERIMENT EXECUTOR. Isolated via the INJECTED runner (the only I/O
 * boundary). Fail-closed: must be BASELINED; runner must be a function; enforces the budget; a production-touching or
 * over-budget run is ABORTED (never EXECUTED). The runner returns { afterSignals, raw, cost:{ms,calls,costEur}, productionTouched? }.
 */
async function runExperiment(experiment: any, opts: any): Promise<any> {
  const e = isObj(experiment) ? experiment : {};
  const o = isObj(opts) ? opts : {};
  const now = o.now;
  if (e.status !== STATUS.BASELINED) return Object.freeze({ ok: false, reason: `run requires status BASELINED (is ${e.status})` });
  if (typeof o.runner !== "function") return Object.freeze({ ok: false, reason: "no injected runner — isolated execution not possible (fail-closed)" });
  let out: any;
  try { out = await o.runner({ config: e.config, budget: e.budget }); }
  catch (err: any) { return Object.freeze({ ok: true, experiment: Object.freeze({ ...e, status: STATUS.ABORTED, abortReason: "runner threw: " + (err && err.message ? err.message : String(err)), history: histAppend(e, { at: now, event: "ABORTED", reason: "runner-threw" }) }) }); }
  const cost = isObj(out) && isObj(out.cost) ? out.cost : {};
  const b = e.budget;
  const over = (isNum(b.maxMs) && isNum(cost.ms) && cost.ms > b.maxMs) || (isNum(b.maxCalls) && isNum(cost.calls) && cost.calls > b.maxCalls) || (isNum(b.maxCostEur) && isNum(cost.costEur) && cost.costEur > b.maxCostEur);
  if (over) return Object.freeze({ ok: true, experiment: Object.freeze({ ...e, status: STATUS.ABORTED, abortReason: "budget exceeded", cost, history: histAppend(e, { at: now, event: "ABORTED", reason: "budget-exceeded" }) }) });
  if (out && out.productionTouched === true) return Object.freeze({ ok: true, experiment: Object.freeze({ ...e, status: STATUS.ABORTED, abortReason: "runner reported a production side-effect (isolation breached)", history: histAppend(e, { at: now, event: "ABORTED", reason: "production-touched" }) }) });
  return Object.freeze({ ok: true, experiment: Object.freeze({ ...e, status: STATUS.EXECUTED, raw: isObj(out) ? (out.raw !== undefined ? out.raw : null) : null, afterSignals: isObj(out) ? (out.afterSignals || {}) : {}, cost, history: histAppend(e, { at: now, event: "EXECUTED" }) }) });
}

/** (5) measure(experiment) -> MEASUREMENT ENGINE via improvement-baseline.measureDelta (reproducible). Pure. */
function measure(experiment: any): any {
  const e = isObj(experiment) ? experiment : {};
  if (e.status !== STATUS.EXECUTED) return Object.freeze({ ok: false, reason: `measure requires status EXECUTED (is ${e.status})` });
  const senseMap = isObj(e.config) && isObj(e.config.sense) ? e.config.sense : undefined;
  const delta = BL.measureDelta(e.baseline, { signals: e.afterSignals }, senseMap);
  const sum = isObj(delta.summary) ? delta.summary : {};
  return Object.freeze({ ok: true, measurement: Object.freeze({ metrics: delta.metrics, improved: sum.improved, regressed: sum.regressed, flat: sum.flat, unmeasured: sum.unmeasured }) });
}

/**
 * (6) verifyIndependently(experiment, measurement, {integritySignals}) -> INDEPENDENT VERIFICATION. SEPARATE from the
 * executor: it recomputes the verdict from the PREREGISTERED criteria + the measurement + integrity detectors, and
 * NEVER consumes any executor self-verdict. Verdict PASS/FAIL/INCONCLUSIVE; fail-closed on uncertainty.
 */
function verifyIndependently(experiment: any, measurement: any, opts: any): any {
  const e = isObj(experiment) ? experiment : {};
  const m = isObj(measurement) ? measurement : {};
  const o = isObj(opts) ? opts : {};
  const succ = arr(e.hypothesis && e.hypothesis.successCriteria).map((c: any) => evalCriterion(c, m));
  const refu = arr(e.hypothesis && e.hypothesis.refutationConditions).map((c: any) => evalCriterion(c, m));
  const complete = succ.every((r: any) => r.measured) && refu.every((r: any) => r.measured);
  const integrity = MI.assessIntegrity(isObj(o.integritySignals) ? o.integritySignals : {}); // metric-gaming / evaluator-capture / benchmark-contamination
  const refuted = refu.some((r: any) => r.met);
  const allSuccessMet = succ.length > 0 && succ.every((r: any) => r.measured && r.met);

  let verdict: string;
  if (!complete) verdict = "INCONCLUSIVE";                       // incomplete results ⇒ cannot conclude
  else if (integrity.overall === "DETECTED") verdict = "FAIL";    // hard integrity evidence (tampered/gamed) ⇒ FAIL
  else if (refuted) verdict = "FAIL";                            // a refutation condition is met ⇒ hypothesis refuted
  else if (allSuccessMet) verdict = "PASS";                     // every preregistered success criterion met
  else verdict = "FAIL";                                        // measured but criteria not met ⇒ not supported
  const report = Object.freeze({
    verdict, complete, allSuccessMet, refuted,
    integrity: integrity.overall,
    successChecks: Object.freeze(succ), refutationChecks: Object.freeze(refu),
    note: "verification is INDEPENDENT of the executor; preregistered criteria + integrity detectors only",
  });
  return report;
}

/** (7) buildEvidence(experiment, {now}) -> EXPERIMENT EVIDENCE bundle (immutable). Requires measurement+verification set. */
function buildEvidence(experiment: any, opts: any): any {
  const e = isObj(experiment) ? experiment : {};
  const now = isObj(opts) ? opts.now : null;
  return Object.freeze({
    experimentId: e.id, proposalRef: e.proposalRef,
    hypothesis: e.hypothesis, baseline: e.baseline, config: e.config,
    raw: e.raw, measures: e.measurement, verification: e.verification, decision: e.decision,
    provenance: Object.freeze({ model: "frontier-lab/1", builtAt: now, synthetic: false }),
  });
}

/**
 * (8) decide(experiment) -> EXPERIMENT DECISION. PROMISING | REJECTED | INCONCLUSIVE | READY_FOR_REVIEW. Terminal:
 * grantsNoPromotion — the Lab can NEVER promote/authorize; READY_FOR_REVIEW hands off to external governance.
 */
function decide(experiment: any): any {
  const e = isObj(experiment) ? experiment : {};
  const v = isObj(e.verification) ? e.verification : {};
  let decision: string;
  if (e.status === STATUS.ABORTED) decision = "INCONCLUSIVE";
  else if (!v.complete) decision = "INCONCLUSIVE";
  else if (v.verdict === "FAIL") decision = "REJECTED";
  else if (v.verdict === "INCONCLUSIVE") decision = "INCONCLUSIVE";
  else if (v.verdict === "PASS") decision = (v.integrity === "SUSPECTED") ? "PROMISING" : "READY_FOR_REVIEW";
  else decision = "INCONCLUSIVE";                                // fail-closed
  return Object.freeze({ decision, grantsNoPromotion: true, authorizesIntegration: false, note: "the Frontier Lab decides, it NEVER promotes or authorizes; READY_FOR_REVIEW requires external governance" });
}

/**
 * runLabExperiment(spec, {collectors, runner, integritySignals, now}) -> full experiment record (register → baseline →
 * run → measure → verify → evidence → decide). The E2E orchestrator. Returns the experiment with evidence+decision, or
 * a short-circuit at the first fail-closed stage.
 */
async function runLabExperiment(spec: any, opts: any): Promise<any> {
  const o = isObj(opts) ? opts : {};
  const reg = registerExperiment(spec, { now: o.now });
  if (!reg.ok) return Object.freeze({ ok: false, stage: "register", result: reg });
  const bl = recordBaseline(reg.experiment, o.collectors, { now: o.now });
  if (!bl.ok) return Object.freeze({ ok: false, stage: "baseline", result: bl });
  const run = await runExperiment(bl.experiment, { runner: o.runner, now: o.now });
  if (!run.ok) return Object.freeze({ ok: false, stage: "run", result: run });
  let exp = run.experiment;
  if (exp.status === STATUS.ABORTED) { const d = decide(exp); return Object.freeze({ ok: true, aborted: true, experiment: Object.freeze({ ...exp, decision: d, evidence: buildEvidence({ ...exp, decision: d }, { now: o.now }) }) }); }
  const meas = measure(exp);
  if (!meas.ok) return Object.freeze({ ok: false, stage: "measure", result: meas });
  exp = Object.freeze({ ...exp, status: STATUS.VERIFIED, measurement: meas.measurement });
  const verification = verifyIndependently(exp, meas.measurement, { integritySignals: o.integritySignals });
  exp = Object.freeze({ ...exp, verification });
  const decision = decide(exp);
  const evidence = buildEvidence(Object.freeze({ ...exp, decision }), { now: o.now });
  return Object.freeze({ ok: true, experiment: Object.freeze({ ...exp, status: STATUS.DECIDED, decision, evidence, history: histAppend(exp, { at: o.now, event: "DECIDED", decision: decision.decision }) }) });
}

// ---- Persistence (immutable history + resume) — reuses autonomy-store + idempotency-guard (NO new store) ----------
function loadJournal(opts: any): any { const st = storeOf(opts); const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.journal) : { value: st.read(STORE_KEYS.journal, null) }; return isObj(rs.value) ? rs.value : IG.emptyJournal(); }
function loadExperiments(opts: any): any {
  const st = storeOf(opts);
  const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.experiments) : { present: true, corrupt: false, value: st.read(STORE_KEYS.experiments, null) };
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true, reason: "experiment store corrupt — fail-closed" });
  return Object.freeze({ ok: true, snapshots: arr(rs.value && rs.value.items) });
}
/** persistExperiment(exp, opts) -> idempotent snapshot append keyed by id:status (immutable history across the store). */
function persistExperiment(experiment: any, opts: any): any {
  const e = isObj(experiment) ? experiment : {};
  if (!isStr(e.id) || !isStr(e.status)) return Object.freeze({ ok: false, reason: "experiment id+status required" });
  const loaded = loadExperiments(opts);
  if (!loaded.ok) return loaded;
  const journal = loadJournal(opts);
  const key = "exp:" + e.id + ":" + e.status;
  const dec = IG.admit({ idempotencyKey: key, actionId: e.id }, journal, 0);
  if (dec.decision === IG.DECISION.DUPLICATE) return Object.freeze({ ok: true, decision: "DUPLICATE", added: false });
  const st = storeOf(opts);
  st.write(STORE_KEYS.experiments, { items: loaded.snapshots.concat([e]) });
  st.write(STORE_KEYS.journal, IG.record(journal, key, { at: isObj(opts) ? opts.now : null }));
  return Object.freeze({ ok: true, decision: "PROCEED", added: true });
}
/** resume(opts) -> latest snapshot per experiment id (the reprise mechanism). Corrupt store ⇒ fail-closed. */
function resume(opts: any): any {
  const loaded = loadExperiments(opts);
  if (!loaded.ok) return Object.freeze({ ok: false, corrupt: true, experiments: {} });
  const latest: any = {};
  for (const snap of loaded.snapshots) {
    if (!isObj(snap) || !isStr(snap.id)) continue;
    const cur = latest[snap.id];
    const ord = (s: any): number => ((ORDER as any)[s] ?? -1);
    if (!cur || ord(snap.status) >= ord(cur.status)) latest[snap.id] = snap;
  }
  return Object.freeze({ ok: true, experiments: Object.freeze(latest), count: Object.keys(latest).length });
}

const FRONTIER_LAB_CONTRACT = Object.freeze({
  id: "WI-FR-03-FRONTIER-LAB",
  source: "Resumption mandate WI-FR-03 — isolated, reproducible, independently-verified experimentation engine",
  status: STATUS, verdicts: VERDICTS, decisions: DECISIONS, storeKeys: STORE_KEYS,
  reuses: Object.freeze(["improvement-baseline (baseline+delta)", "meta-intelligence (integrity)", "idempotency-guard (idempotent immutable history)", "autonomy-store (durable store)"]),
  notAuthority: "runs experiments in isolation and decides PROMISING/REJECTED/INCONCLUSIVE/READY_FOR_REVIEW; it NEVER promotes, authorizes, bypasses POLICY, or touches production",
  invariants: Object.freeze([
    "NO new sandbox/store/evaluator/authorizer — orchestrates existing primitives; the injected runner is the sole isolation boundary",
    "an unfalsifiable / incompletely-preregistered experiment is REJECTED (hypothesis+refutation+success-criteria+budget required)",
    "the baseline is immutable; execution enforces explicit budgets (over-budget ⇒ ABORTED) and NO production effect",
    "verification is INDEPENDENT of the executor (separate function; never consumes the executor's verdict); integrity detectors run",
    "synthetic/unverified results are never presented as real/proof; fail-closed on uncertainty (⇒ INCONCLUSIVE)",
    "no experiment can authorize its own promotion — READY_FOR_REVIEW requires external governance (grantsNoPromotion)",
    "pure/deterministic; the only side effects are the injected runner and the injected store (default autonomy-store)",
  ]),
});

module.exports = {
  STATUS, VERDICTS, DECISIONS, STORE_KEYS, FRONTIER_LAB_CONTRACT,
  registerExperiment, recordBaseline, runExperiment, measure, verifyIndependently, buildEvidence, decide, runLabExperiment,
  loadExperiments, persistExperiment, resume,
};

if (require.main === module) { process.stdout.write(JSON.stringify(FRONTIER_LAB_CONTRACT, null, 2) + "\n"); }

export {};
