#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V17 §2–§4 — MÉTIER PARCOURS E2E ORCHESTRATOR. PURE, deterministic, fail-closed. The 15 trades are VERIFIED
 * as guards (parity 15/15 via metier-benchmark-multidim) but the full OPERATIONAL parcours was never demonstrated
 * end-to-end: réception → identification → résolution de capacité → permission → exécution → résultat → assurance
 * indépendante → décision/clôture → traçabilité, with fail-closed récupération at each step. This orchestrator COMPOSES
 * the EXISTING métier guards (no new business logic, no parallel architecture) behind one governed parcours. It mutates
 * no canonical register and performs no commercial activity — a run yields a guard verdict + an audit record only.
 *
 * Fail-closed terminal stages (each traceable): INVALID_REQUEST / UNKNOWN_METIER / PERMISSION_REFUSED /
 * CAPABILITY_UNAVAILABLE / DUPLICATE / EXECUTION_FAILED / INVALID_RESULT / ASSURANCE_FAILED / CLOSURE_FAILED, and the
 * success terminal CLOSED (carrying the guard's ADMIT/REJECT decision). Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function fn(v: any): boolean { return typeof v === "function"; }

// Métier → real canonical guard registry. Each entry RESOLVES an EXISTING guard (lazy require — no new logic) and
// declares the LEGITIMATE per-métier variations (§6): `decisionOf` maps the guard's NATIVE verdict → ADMIT/REJECT, and
// `assure` is a GENUINELY INDEPENDENT verifier (a necessary-condition cross-check via a DIFFERENT code path than the
// guard's own verdict — not a re-run of the same guard, which would only prove reproducibility). A métier without its
// own `assure` falls back to the reproducibility default (weaker — honestly a lower assurance level).
// Extensible per §4; P3 (supply-chain) + P8 (release/semver) are wired + demonstrated E2E.
const P8_RANK: any = Object.freeze({ none: 0, patch: 1, minor: 2, major: 3, downgrade: -1, invalid: -2 });
const METIER_GUARDS: any = Object.freeze({
  P3: Object.freeze({
    metier: "P3", domain: "security / supply-chain",
    resolve: () => require("./p3-dependency-trust-gate.js").vetDependency,
    inputNote: "payload = a dependency { name, version, license, integrity }",
    decisionOf: (v: any) => (v && v.decision) || null,
    // INDEPENDENT: an ADMIT must satisfy the necessary safety conditions, recomputed via the guard module's OTHER
    // exports (isExactPin / typosquatOf) — a different path than vetDependency's aggregate verdict. REJECT is always safe.
    assure: (v: any, payload: any) => {
      if (!v || v.decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const G = require("./p3-dependency-trust-gate.js"); const p = payload || {};
      const ok = G.isExactPin(p.version) && !G.typosquatOf(p.name) && typeof p.integrity === "string" && p.integrity.length > 0;
      return { ok, reason: ok ? "ADMIT satisfies independent necessary conditions (pinned, not typosquat, has integrity)" : "ADMIT contradicts a necessary safety condition (unpinned / typosquat / no integrity) — independent assurance FAILED" };
    },
  }),
  P8: Object.freeze({
    metier: "P8", domain: "release / SemVer governance",
    resolve: () => require("./p8-semver-enforcement.js").enforce,
    inputNote: "payload = { oldContract, newContract } (versions carried inside the contracts)",
    decisionOf: (v: any) => (v && v.ok === true ? "ADMIT" : (v && (v.verdict === "SEMVER_VIOLATION" || v.verdict === "INVALID_VERSION") ? "REJECT" : null)),
    // INDEPENDENT: an ADMIT (compliant bump) must satisfy rank(actualBump) >= rank(requiredBump), recomputed via the
    // module's requiredBump/actualBump exports — a DIFFERENT path than enforce's own verdict branch.
    assure: (v: any, payload: any) => {
      if (!v || v.ok !== true) return { ok: true, reason: "REJECT/violation is safe (no assurance burden)" };
      const G = require("./p8-semver-enforcement.js"); const p = payload || {};
      const req = G.requiredBump(p.oldContract, p.newContract);
      const act = G.actualBump(p.oldContract && p.oldContract.version, p.newContract && p.newContract.version);
      const ok = (P8_RANK[act] || -2) >= (P8_RANK[req] || 0) && P8_RANK[act] > 0;
      return { ok, reason: ok ? `ADMIT independently confirmed: actual ${act} ≥ required ${req}` : `ADMIT contradicts the independent bump check (actual ${act} < required ${req}) — assurance FAILED` };
    },
  }),
  P9: Object.freeze({
    metier: "P9", domain: "finops / unit economics",
    resolve: () => require("./p9-unit-economics.js").unitEconomics,
    inputNote: "payload = { observedCostEur, attempts, successes, maxCostPerSuccessEur }",
    // decisionOf needs the budget threshold (in the payload) ⇒ it takes (verdict, payload). ADMIT = a viable unit economic
    // within the declared budget; else REJECT.
    decisionOf: (econ: any, payload: any) => {
      const G = require("./p9-unit-economics.js"); const p = payload || {};
      if (!econ || typeof econ !== "object") return null;
      return (econ.viable === true && G.withinUnitBudget(econ, p.maxCostPerSuccessEur)) ? "ADMIT" : "REJECT";
    },
    // INDEPENDENT: recompute cost-per-success by RAW arithmetic (observedCostEur / successes) — a different path than
    // unitEconomics — and confirm an ADMIT truly satisfies successes>0 AND recomputed ≤ budget.
    assure: (econ: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const p = payload || {};
      const successes = Math.max(0, Math.floor(Number(p.successes) || 0));
      const cost = Math.max(0, Number(p.observedCostEur) || 0);
      const budget = Number(p.maxCostPerSuccessEur);
      const recomputed = successes > 0 ? cost / successes : null;
      const ok = successes > 0 && recomputed !== null && isFinite(budget) && recomputed <= budget;
      return { ok, reason: ok ? `ADMIT independently confirmed: recomputed €${recomputed.toFixed(4)}/success ≤ €${budget}` : "ADMIT contradicts the independent unit-cost recomputation (zero successes or over budget) — assurance FAILED" };
    },
  }),
  // ----- V20 BATCH 01 -----
  P1: Object.freeze({
    metier: "P1", domain: "quality / semantic-regression",
    resolve: () => require("./p1-semantic-regression-guard.js").assess,
    inputNote: "payload = { statedTestsPass, before:[{input,observedOutput}], after:[{input,observedOutput}] }",
    decisionOf: (v: any) => (v && v.safe === true ? "ADMIT" : "REJECT"),
    // INDEPENDENT: SAFE requires BOTH stated-tests-pass AND behaviour-preserved. Recompute behaviour preservation by a
    // DIRECT output-set comparison (my own map, not captureBaseline/compareToBaseline) ⇒ catches a SAFE that hides a
    // changed or missing output.
    assure: (v: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const p = payload || {}; const key = (s: any) => JSON.stringify(s && s.input); const val = (s: any) => JSON.stringify(s && s.observedOutput);
      const before = Array.isArray(p.before) ? p.before : []; const after = Array.isArray(p.after) ? p.after : [];
      const afterMap: any = {}; for (const s of after) afterMap[key(s)] = val(s);
      const changedOrMissing = before.some((s: any) => !(key(s) in afterMap) || afterMap[key(s)] !== val(s));
      const ok = p.statedTestsPass === true && before.length > 0 && !changedOrMissing;
      return { ok, reason: ok ? "ADMIT independently confirmed: tests pass AND every baseline output reproduced" : "ADMIT contradicts the independent output comparison (a baseline output changed/missing, or tests not passing) — assurance FAILED" };
    },
  }),
  P12: Object.freeze({
    metier: "P12", domain: "resilience / circuit-breaker",
    resolve: () => require("./p12-circuit-breaker.js").evaluateBreaker,
    inputNote: "payload = { state, outcomes:[SUCCESS|FAIL|SLOW], config:{ failureThreshold, minSamples } }",
    decisionOf: (v: any) => (v && v.admit === true ? "ADMIT" : "REJECT"),
    // INDEPENDENT: recompute failureRate = (FAIL+SLOW)/n by a DIRECT count (not the guard's burnRate path). An ADMIT (the
    // breaker lets the call through) must NOT coincide with a tripped condition (n ≥ minSamples AND rate ≥ threshold).
    assure: (v: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT/OPEN is safe (no assurance burden)" };
      const p = payload || {}; const o = Array.isArray(p.outcomes) ? p.outcomes : []; const cfg = (p.config && typeof p.config === "object") ? p.config : {};
      const n = o.length; const fails = o.filter((x: any) => x === "FAIL" || x === "SLOW").length;
      const rate = n > 0 ? fails / n : 0; const thr = typeof cfg.failureThreshold === "number" ? cfg.failureThreshold : 0.5; const minS = typeof cfg.minSamples === "number" ? cfg.minSamples : 5;
      const tripped = n >= minS && rate >= thr;
      return { ok: !tripped, reason: tripped ? `ADMIT contradicts the independent failure-rate check (rate ${rate.toFixed(2)} ≥ ${thr} over ${n} ≥ ${minS} calls — breaker should be OPEN) — assurance FAILED` : `ADMIT independently confirmed: failure rate ${rate.toFixed(2)} not tripping over ${n} calls` };
    },
  }),
  P4: Object.freeze({
    metier: "P4", domain: "data / distribution drift",
    // input adapter (legitimate input-contract variation): assessDrift takes (reference, current, opts) positionally.
    resolve: () => { const G = require("./p4-distribution-drift.js"); return (payload: any) => G.assessDrift(payload && payload.reference, payload && payload.current, payload && payload.opts); },
    inputNote: "payload = { reference:[...], current:[...], opts? }",
    decisionOf: (v: any) => (v && v.gate === "PASS" ? "ADMIT" : "REJECT"),
    // INDEPENDENT: cross-check with a DIFFERENT statistic than PSI — the total-variation distance (max |refFreq−curFreq|)
    // over the value histograms. An ADMIT (no significant drift) must not coincide with a gross TV distance.
    assure: (v: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const p = payload || {}; const ref = Array.isArray(p.reference) ? p.reference : []; const cur = Array.isArray(p.current) ? p.current : [];
      if (ref.length === 0 || cur.length === 0) return { ok: false, reason: "ADMIT with an empty distribution — assurance FAILED" };
      const hist = (a: any[]) => { const h: any = {}; for (const x of a) h[String(x)] = (h[String(x)] || 0) + 1 / a.length; return h; };
      const hr = hist(ref); const hc = hist(cur); const keys = new Set([...Object.keys(hr), ...Object.keys(hc)]);
      let tv = 0; for (const k of keys) tv = Math.max(tv, Math.abs((hr[k] || 0) - (hc[k] || 0)));
      const ok = tv <= 0.5;   // conservative independent bound; a gross shift (e.g. all-1 → all-9) gives tv=1.0
      return { ok, reason: ok ? `ADMIT independently confirmed: total-variation ${tv.toFixed(2)} ≤ 0.5 (distinct metric from PSI)` : `ADMIT contradicts the independent total-variation check (TV ${tv.toFixed(2)} > 0.5) — assurance FAILED` };
    },
  }),
  // ----- V21 BATCH 02 -----
  P2: Object.freeze({
    metier: "P2", domain: "AI / reliability (pass@k)",
    resolve: () => { const G = require("./p2-passk-reliability.js"); return (payload: any) => G.passAtK(payload && payload.rolloutsByTask); },
    inputNote: "payload = { rolloutsByTask: { taskId:[bool,…] }, threshold }",
    decisionOf: (report: any, payload: any) => { const G = require("./p2-passk-reliability.js"); return G.reliable(report, payload && payload.threshold) ? "ADMIT" : "REJECT"; },
    // INDEPENDENT: recompute pass@k from the RAW rollouts (own loop, not passAtK/reliable). ADMIT ⟹ recomputed ≥ threshold.
    assure: (report: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const p = payload || {}; const m = (p.rolloutsByTask && typeof p.rolloutsByTask === "object") ? p.rolloutsByTask : {};
      const ids = Object.keys(m).filter((id) => Array.isArray(m[id]) && m[id].length > 0);
      if (ids.length === 0) return { ok: false, reason: "ADMIT with no rollouts — assurance FAILED" };
      const k = Math.min(...ids.map((id) => m[id].length));
      const allPass = ids.filter((id) => m[id].slice(0, k).every((x: any) => x === true)).length;
      const recomputed = allPass / ids.length; const thr = typeof p.threshold === "number" ? p.threshold : 0.9;
      const ok = recomputed >= thr;
      return { ok, reason: ok ? `ADMIT independently confirmed: recomputed pass@${k} ${recomputed.toFixed(3)} ≥ ${thr}` : `ADMIT contradicts the independent pass@k recomputation (${recomputed.toFixed(3)} < ${thr}) — assurance FAILED` };
    },
  }),
  P10: Object.freeze({
    metier: "P10", domain: "regulatory / serious-incident deadline",
    resolve: () => require("./p10-serious-incident-deadline.js").assessIncidentDeadline,
    inputNote: "payload = { incident:{ category, awareDate 'YYYY-MM-DD' }, reportedDate 'YYYY-MM-DD', activities }",
    decisionOf: (v: any) => (v && v.verdict === "REPORTED_ON_TIME" ? "ADMIT" : "REJECT"),
    // INDEPENDENT: recompute the due date by DIRECT UTC day arithmetic (Date.UTC + ms — NOT addDaysUTC) and confirm an
    // ADMIT truly reported on/before it. Deterministic (fixed date strings, no Date.now).
    assure: (v: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT/overdue is safe (no assurance burden)" };
      const p = payload || {}; const incident = (p.incident && typeof p.incident === "object") ? p.incident : {};
      const parse = (s: any) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
      const aware = parse(incident.awareDate); const reported = parse(p.reportedDate); const days = typeof v.deadlineDays === "number" ? v.deadlineDays : NaN;
      if (!isFinite(aware) || !isFinite(reported) || !isFinite(days)) return { ok: false, reason: "ADMIT with un-recomputable dates — assurance FAILED" };
      const due = aware + days * 86400000;
      const ok = reported <= due;
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      return { ok, reason: ok ? `ADMIT independently confirmed: reported ${iso(reported)} ≤ recomputed due ${iso(due)} (direct UTC arithmetic)` : `ADMIT contradicts the independent deadline recomputation (reported ${iso(reported)} > due ${iso(due)}) — assurance FAILED` };
    },
  }),
  P13: Object.freeze({
    metier: "P13", domain: "sustainability / software carbon intensity",
    resolve: () => require("./p13-software-carbon-intensity.js").carbonIntensity,
    inputNote: "payload = { benchmark:{ totalUnits, kind }, factors:{ energyPerUnitKWh, pue, gridCarbonIntensityGco2PerKWh, embodiedGco2, lifespanUnits }, maxGco2PerUnit }",
    decisionOf: (res: any, payload: any) => { const G = require("./p13-software-carbon-intensity.js"); return (res && res.viable === true && G.withinCarbonBudget(res, payload && payload.maxGco2PerUnit).within === true) ? "ADMIT" : "REJECT"; },
    // INDEPENDENT: recompute SCI/unit from the RAW factors (own arithmetic, NOT carbonIntensity). ADMIT ⟹ recomputed ≤ budget.
    assure: (res: any, payload: any, decision: any) => {
      if (decision !== "ADMIT") return { ok: true, reason: "REJECT/over-budget is safe (no assurance burden)" };
      const p = payload || {}; const b = (p.benchmark && typeof p.benchmark === "object") ? p.benchmark : {}; const f = (p.factors && typeof p.factors === "object") ? p.factors : {};
      const R = Number(b.totalUnits); const e = Number(f.energyPerUnitKWh); const pue = Number(f.pue); const grid = Number(f.gridCarbonIntensityGco2PerKWh); const emb = Number(f.embodiedGco2); const life = Number(f.lifespanUnits); const budget = Number(p.maxGco2PerUnit);
      if (!(R > 0) || !isFinite(e) || !isFinite(pue) || !isFinite(grid) || !isFinite(emb) || !(life > 0) || !isFinite(budget)) return { ok: false, reason: "ADMIT with un-recomputable carbon factors — assurance FAILED" };
      const sci = ((R * e * pue) * grid + emb * (R / life)) / R;   // (E×I + M) / R from raw factors
      const ok = sci <= budget;
      return { ok, reason: ok ? `ADMIT independently confirmed: recomputed SCI ${sci.toFixed(4)} gCO2/unit ≤ ${budget}` : `ADMIT contradicts the independent SCI recomputation (${sci.toFixed(4)} > ${budget}) — assurance FAILED` };
    },
  }),
});

const STAGE = Object.freeze({ INVALID_REQUEST: "INVALID_REQUEST", UNKNOWN_METIER: "UNKNOWN_METIER", PERMISSION_REFUSED: "PERMISSION_REFUSED", CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE", DUPLICATE: "DUPLICATE", EXECUTION_FAILED: "EXECUTION_FAILED", INVALID_RESULT: "INVALID_RESULT", ASSURANCE_FAILED: "ASSURANCE_FAILED", CLOSURE_FAILED: "CLOSURE_FAILED", CLOSED: "CLOSED" });

function safe(thunk: any): any { try { return { ok: true, value: thunk() }; } catch (e: any) { return { ok: false, error: String((e && e.message) || e) }; } }

/**
 * runParcours(request, deps) -> outcome. request = { metier, payload, requestId?, declaredSynthetic? }.
 * deps: { guards? (registry override for tests), permissions:{ canExecute(metier)->bool }, assure?(verdict,metier)->{ok,reason},
 *         seenDigests?:Set, digest?(request)->string, audit?(record)->{ok}, now? }.
 * The default digest is a stable JSON of {metier,payload}. The default assurance re-runs the resolved guard and requires
 * an identical decision (independent-of-the-first-run reproducibility check). Pure given the injected seams.
 */
function runParcours(request: any, deps: any = {}): any {
  const now = isStr(deps.now) ? deps.now : "unknown";
  const trail: any[] = [];
  const audit = (rec: any) => { trail.push(rec); if (fn(deps.audit)) { const r = safe(() => deps.audit(rec)); return r.ok && r.value && r.value.ok === true; } return true; };
  const done = (stage: string, extra: any = {}) => { const rec = Object.freeze({ at: now, stage, metier: (request && request.metier) || null, ...extra }); const persisted = audit(rec); return Object.freeze({ stage: persisted ? stage : STAGE.CLOSURE_FAILED, metier: (request && request.metier) || null, ...extra, traceable: persisted, auditTrail: Object.freeze(trail.slice()) }); };

  // (1) RÉCEPTION — well-formed request.
  if (!isObj(request) || !isStr(request.metier) || !isObj(request.payload)) return done(STAGE.INVALID_REQUEST, { reason: "request must be { metier:string, payload:object }" });

  // (2) IDENTIFICATION — known métier in the guard registry.
  const registry = isObj(deps.guards) ? deps.guards : METIER_GUARDS;
  const entry = registry[request.metier];
  if (!entry) return done(STAGE.UNKNOWN_METIER, { reason: `no canonical guard registered for métier ${request.metier}` });

  // (3) PERMISSION — deny-by-default.
  const canExec = deps.permissions && fn(deps.permissions.canExecute) ? safe(() => deps.permissions.canExecute(request.metier)) : { ok: true, value: false };
  if (!canExec.ok || canExec.value !== true) return done(STAGE.PERMISSION_REFUSED, { reason: "métier execution not permitted (deny-by-default)" });

  // (4) RÉSOLUTION DE CAPACITÉ — resolve the real guard fn (absent / throw ⇒ unavailable).
  const resolved = safe(() => entry.resolve());
  if (!resolved.ok || !fn(resolved.value)) return done(STAGE.CAPABILITY_UNAVAILABLE, { reason: `guard for ${request.metier} could not be resolved${resolved.ok ? "" : ": " + resolved.error}` });
  const guard = resolved.value;

  // (5) DÉDUPLICATION — stable digest of {metier,payload}.
  const digest = fn(deps.digest) ? safe(() => deps.digest(request)).value : JSON.stringify({ m: request.metier, p: request.payload });
  if (deps.seenDigests instanceof Set && digest != null && deps.seenDigests.has(digest)) return done(STAGE.DUPLICATE, { reason: "identical request already processed (idempotent)", digest });

  // (6) EXÉCUTION — run the real guard (partial/throw ⇒ fail-closed).
  const exec = safe(() => guard(request.payload));
  if (!exec.ok) return done(STAGE.EXECUTION_FAILED, { reason: `guard threw: ${exec.error}` });
  const verdict = exec.value;

  // (7) RÉSULTAT — map the guard's NATIVE verdict → ADMIT/REJECT via the métier's decisionOf(verdict, payload) (the
  //     payload is passed because some métiers decide against a threshold carried in the request, e.g. P9's budget).
  const decisionOf = fn(entry.decisionOf) ? entry.decisionOf : (v: any) => (v && v.decision) || null;
  const decision = isObj(verdict) ? decisionOf(verdict, request.payload) : null;
  if (decision !== "ADMIT" && decision !== "REJECT") return done(STAGE.INVALID_RESULT, { reason: "guard verdict did not map to an ADMIT/REJECT decision" });

  // (8) ASSURANCE INDÉPENDANTE — prefer (a) an explicit injected deps.assure, else (b) the métier's own INDEPENDENT
  //     assurer (necessary-condition cross-check via a different code path), else (c) the reproducibility default
  //     (weaker — honestly labelled). Any failure ⇒ fail-closed, never CLOSED.
  const reproDefault = (v: any) => { const again = safe(() => guard(request.payload)); return { ok: again.ok && isObj(again.value) && decisionOf(again.value, request.payload) === decision, reason: again.ok ? "decision reproduced" : `re-run threw: ${again.error}`, level: "reproducibility" }; };
  const chosen = fn(deps.assure) ? deps.assure : (fn(entry.assure) ? entry.assure : reproDefault);
  const assuranceLevel = fn(deps.assure) ? "injected" : (fn(entry.assure) ? "independent" : "reproducibility");
  const assured = safe(() => chosen(verdict, request.payload, decision));
  if (!assured.ok || !assured.value || assured.value.ok !== true) return done(STAGE.ASSURANCE_FAILED, { reason: (assured.value && assured.value.reason) || "independent assurance failed", decision });

  // (9) DÉCISION / CLÔTURE — record the audit; dedup-mark; return the decision. (Read-only parcours: no state to roll
  //     back; a closure whose audit cannot persist is CLOSURE_FAILED, fail-closed.)
  if (deps.seenDigests instanceof Set && digest != null) deps.seenDigests.add(digest);
  return done(STAGE.CLOSED, { decision, admit: decision === "ADMIT", verdict, assurance: assuranceLevel, digest, synthetic: request.declaredSynthetic === true });
}

const METIER_PARCOURS_CONTRACT = Object.freeze({
  id: "V124-METIER-PARCOURS",
  source: "CTO V17 §2–§4 — end-to-end métier parcours over the existing guards",
  reuses: Object.freeze(["the existing métier guards (p3-dependency-trust-gate.vetDependency, …) — composes, adds no business logic", "a permission seam (deny-by-default)", "independent assurance (default: reproduce the decision)", "an audit seam (traceability)"]),
  notAuthority: "runs ONE governed parcours over a real guard; mutates no canonical register; performs no commercial activity; a run yields a guard verdict + audit record only",
  invariants: Object.freeze([
    "fail-closed terminal stages: invalid request / unknown métier / permission refused / capability unavailable / duplicate / execution failed / invalid result / assurance failed / closure failed — each traceable",
    "permission is deny-by-default (no canExecute ⇒ refused)",
    "independent assurance must pass (default: the guard decision reproduces) before CLOSED",
    "idempotent: an identical {métier,payload} request is DUPLICATE, not re-executed",
    "pure/read-only parcours: composes existing guards, modifies no register, invents no data; synthetic requests are flagged and unblock nothing canonical",
  ]),
});

module.exports = { METIER_GUARDS, STAGE, runParcours, METIER_PARCOURS_CONTRACT };

if (require.main === module) {
  const clean = { name: "left-pad", version: "1.3.0", license: "MIT", integrity: "sha512-abc" };
  const bad = { name: "reakt", version: "^1.0.0" };
  const perms = { canExecute: () => true };
  const okRun = runParcours({ metier: "P3", payload: clean, declaredSynthetic: true }, { permissions: perms, now: "demo" });
  const badRun = runParcours({ metier: "P3", payload: bad, declaredSynthetic: true }, { permissions: perms, now: "demo" });
  process.stdout.write(JSON.stringify({ ...METIER_PARCOURS_CONTRACT, demo: { clean: { stage: okRun.stage, decision: okRun.decision }, typosquat: { stage: badRun.stage, decision: badRun.decision } } }, null, 2) + "\n");
}

export {};
