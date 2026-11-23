#!/usr/bin/env node
"use strict";
/*
 * V16.4 §4 — STRATEGY-MODE SELECTOR (MODE NATIF / HYBRIDE / FOURNISSEUR). PURE, deterministic, fail-closed. Closes the
 * §7 gap "absence de mode hybride dans le sélecteur" (CP8 odgCapabilityAudit #3: "'hybrid' is not an option").
 *
 * NOT a second engine / router / orchestrator. It COMPOSES the canonical components and only CHOOSES a mode:
 *   - odg-local-model-execution-policy.chooseExecutionPolicy (+ its V15.9 measured overlay ⇒ odg-model-router.selectMeasured
 *     over the committed V155 capability registry) for per-part local qualification — no second router;
 *   - decomposition-planner.chooseStrategy for the decomposability verdict (or the verdict the evidence recorded);
 *   - odg-writeset-contention.computeLayerContention for write-set disjointness (UNKNOWN ⇒ conflict, fail-closed);
 *   - odg-sovereign-delegation.createMission for every provider hand-off — a deny-by-default RECORD in CREATED state.
 * It AUTHORIZES NOTHING, LAUNCHES NOTHING and calls no model/provider. Provider cost is UNKNOWN unless a verifiable budget
 * object is supplied; even then the provider is never launched by this module (ODG's sovereign-delegation chain gates it).
 *
 * Modes: NATIVE (ODG local models, €0) | HYBRID (ODG keeps piloting: measured-qualified parts local, unqualified parts
 * via delegation records, ODG integrates + independent validation) | PROVIDER (whole mission via a delegation record) |
 * DECISION_REQUIRED (the evidence cannot select without an owner decision). Every input carries provenance: an evidence
 * citation or NOT_MEASURED (never default-filled); NOT_MEASURED raises the declared uncertainty.
 */

const POL = require("./odg-local-model-execution-policy.js");
const DP = require("./decomposition-planner.js");
const WS = require("./odg-writeset-contention.js");
const SD = require("./odg-sovereign-delegation.js");
const ROUTER = require("./odg-model-router.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }

const MODES = freeze({ NATIVE: "NATIVE", HYBRID: "HYBRID", PROVIDER: "PROVIDER", DECISION_REQUIRED: "DECISION_REQUIRED" });
const QUAL = freeze({
  QUALIFIED_OBSERVED: "QUALIFIED_OBSERVED",           // this exact part/mission was ACCEPTED by a local model (observed)
  QUALIFIED_MEASURED: "QUALIFIED_MEASURED",           // class-level registry: a QUALIFIED local model exists (V155)
  NOT_QUALIFIED_OBSERVED: "NOT_QUALIFIED_OBSERVED",   // observed local failures only, and no larger QUALIFIED model untried
  PROBATION_PROBE: "PROBATION_PROBE",                 // class NO_QUALIFIED but a PROBATION local model exists and nothing failed on THIS task ⇒ €0 local probe, escalate if it still fails (V159 policy)
  NOT_QUALIFIED_MEASURED: "NOT_QUALIFIED_MEASURED",   // class-level registry: NO_QUALIFIED_LOCAL_MODEL and no PROBATION model
  UNAVAILABLE: "UNAVAILABLE",                         // registry reports every local model unavailable
  NOT_MEASURED: "NOT_MEASURED",                       // no observation and no usable class measurement
});
const LOCAL_OK = new Set([QUAL.QUALIFIED_OBSERVED, QUAL.QUALIFIED_MEASURED, QUAL.PROBATION_PROBE, QUAL.NOT_MEASURED]); // NOT_MEASURED ⇒ €0 PROBE (canonical)
const MAX_LOCAL = freeze({ model: POL.MODEL.LARGE, maxRepair: 3 }); // = policy NATIVE_MAX_THEN_ESCALATE tier (V161 J maxLocalTier)
const MODEL_RANK: Record<string, number> = { "qwen2.5:0.5b": 1, [POL.MODEL.SMALL]: 2, [POL.MODEL.LARGE]: 3 };
const ODG_STOPS = freeze(["NO_PROGRESS_IDENTICAL_REGENERATION", "REPAIR_BUDGET_EXHAUSTED"]);
const MAX_CHAIN = 6; // bound on strategy changes per mission (ladder length) — never an unbounded retry loop

const RULES = freeze([
  "Q1 a part with an OBSERVED local ACCEPT (same contract) ⇒ QUALIFIED_OBSERVED (model = the accepting model)",
  "Q2 a part with OBSERVED local failures only ⇒ QUALIFIED_MEASURED if the registry has a QUALIFIED model strictly larger than every model tried, else NOT_QUALIFIED_OBSERVED",
  "Q2b a mission-level local failure that no part-level observation localises counts as an observed failure of every part (PROVIDER only after an OBSERVED local failure on that task/part)",
  "Q3 no part observation ⇒ class registry via chooseExecutionPolicy measured overlay (selectMeasured): LOCAL ⇒ QUALIFIED_MEASURED; NO_QUALIFIED_LOCAL_MODEL with a PROBATION model ⇒ PROBATION_PROBE (€0 local probe first, escalate-after-failure — weak evidence is never treated harsher than none); NO_QUALIFIED without PROBATION ⇒ NOT_QUALIFIED_MEASURED; UNAVAILABLE ⇒ UNAVAILABLE; absent taskClass / unusable registry ⇒ NOT_MEASURED",
  "Q4 NOT_MEASURED is never default-filled: it is treated as a €0 local PROBE (canonical policy PROBE tier) and raises uncertainty to HIGH",
  "M0 mission.authorizationState supplied and ≠ AUTHORIZED ⇒ DECISION_REQUIRED (the selector never authorizes); the evidence-derived choice is reported as tentativeMode",
  "M1 risk HIGH ⇒ authorizationRequired for every mode; risk HIGH with uncertainty HIGH ⇒ DECISION_REQUIRED",
  "M2 whole mission observed ACCEPTED locally, or every part LOCAL_OK (QUALIFIED_* or NOT_MEASURED probe) ⇒ NATIVE (€0)",
  "M3 a supplied deadline shorter than the measured local wall time ⇒ DECISION_REQUIRED (speed vs paid-provider trade-off is an owner decision)",
  "M4 ≥1 LOCAL_OK part AND ≥1 non-local part AND decomposable (planner DECOMPOSED + ≥2 parts each with an independent check) AND write-sets disjoint (odg-writeset-contention, UNKNOWN ⇒ conflict) ⇒ HYBRID: local parts native, others via delegation records, ODG integrates + independent validation",
  "M5 otherwise (some part not locally qualified) ⇒ PROVIDER: one deny-by-default delegation RECORD (CREATED); HYBRID refused reasons are reported",
  "C1 local cost = €0 (loopback Ollama); provider cost = UNKNOWN unless a verifiable budget {currency, ceiling>0, enforcedBy, evidenceRef} is supplied ⇒ budgetRequired",
  "C2 a provider part ALWAYS has authorizationRequired=true; providerExecutable only with a verifiable budget AND an OWNER authorization bound to this mission id; the selector NEVER launches a provider",
  "U1 uncertainty HIGH if any part qualification is NOT_MEASURED; else MEDIUM if risk is NOT_MEASURED or a multi-part write-set is UNKNOWN; else LOW",
  "F0..F7 strategy change on failure: see nextStrategyAfterFailure (ODG stop only; never repeats a tried strategy; bounded by MAX_CHAIN)",
]);

// ---- provenance helpers -------------------------------------------------------------------------------------------
function cited(value: any, source: string): any { return freeze({ value, source }); }
function nm(why: string): any { return freeze({ value: null, status: "NOT_MEASURED", reason: why }); }

function normObs(o: any): any {
  return freeze({ model: isStr(o && o.model) ? o.model : null, maxRepair: isNum(o && o.maxRepair) ? o.maxRepair : null,
    strategy: isStr(o && o.strategy) ? o.strategy : "DEFAULT", accepted: !!(o && o.accepted === true),
    executed: !(o && o.executionStatus === "NOT_RUN"), wallMs: isNum(o && o.wallMs) ? o.wallMs : null,
    source: isStr(o && o.source) ? o.source : "UNCITED" });
}

function implicitParts(m: any): any[] {
  const ps = arr(m.parts);
  if (ps.length) return ps;
  return [{ id: String(m.id), taskClass: m.taskClass, taskClassSource: m.taskClassSource, writeSet: m.writeSet, writeSetSource: m.writeSetSource, observations: m.observations, independentCheck: false }];
}

/** classify one part's local qualification (Q1–Q4). */
function qualifyPart(p: any, ctx: any, missionFailures: any[] = []): any {
  const own = arr(p.observations).map(normObs).filter((o: any) => o.executed);
  const obs = own.length ? own : missionFailures;   // Q2b: unlocalised mission-level failures apply to every part
  const tc = isStr(p.taskClass) ? cited(p.taskClass, p.taskClassSource || "UNCITED") : nm("no taskClass in the evidence record");
  let measured: any = null;
  if (tc.value !== null) {
    const pol = POL.chooseExecutionPolicy(tc.value, [], { taskClass: tc.value, measured: ctx.measured, now: ctx.now });
    measured = pol.measured;
  }
  const regDecision = measured && measured.status === "CONSULTED" ? measured.decision : null;
  const regModel = measured && measured.status === "CONSULTED" ? measured.qualifiedModel : null;
  const regSource = measured && measured.status === "CONSULTED" ? `${measured.source || "registry"}#registry.models[*].perClass.${tc.value} (sha256 ${String(measured.sha256 || "?").slice(0, 12)})` : null;
  let probation: string[] = [];
  if (regDecision === "NO_QUALIFIED_LOCAL_MODEL" && isObj(ctx.measured) && isObj(ctx.measured.registry)) {
    const sel = ROUTER.selectMeasured({ taskClass: tc.value, registry: ctx.measured.registry });
    probation = sel && sel.ok ? arr(sel.probationCandidates).map(String) : [];
  }
  const pass = obs.find((o: any) => o.accepted);
  let status: string, model: any = null, basis: string;
  if (pass) { status = QUAL.QUALIFIED_OBSERVED; model = pass.model; basis = `Q1 observed ACCEPT by ${pass.model} (${pass.source})`; }
  else if (obs.length) {
    const triedMax = Math.max(...obs.map((o: any) => MODEL_RANK[String(o.model)] || 0));
    if (regDecision === "LOCAL" && (MODEL_RANK[String(regModel)] || 0) > triedMax) { status = QUAL.QUALIFIED_MEASURED; model = regModel; basis = `Q2 observed failures with smaller models only; registry QUALIFIED ${regModel} untried (${regSource})`; }
    else { status = QUAL.NOT_QUALIFIED_OBSERVED; basis = `Q2${own.length ? "" : "b mission-level"} ${obs.length} observed local failure(s) (${[...new Set(obs.map((o: any) => o.source))].join("; ")}); no larger QUALIFIED model untried`; }
  } else if (regDecision === "LOCAL") { status = QUAL.QUALIFIED_MEASURED; model = regModel; basis = `Q3 registry QUALIFIED ${regModel} for '${tc.value}' (${regSource})`; }
  else if (regDecision === "NO_QUALIFIED_LOCAL_MODEL" && probation.length) { status = QUAL.PROBATION_PROBE; model = null; basis = `Q3 registry NO_QUALIFIED_LOCAL_MODEL for '${tc.value}' but PROBATION ${probation.join(",")} and no observed failure on this task/part ⇒ €0 local PROBE, escalate if it still fails (${regSource})`; }
  else if (regDecision === "NO_QUALIFIED_LOCAL_MODEL") { status = QUAL.NOT_QUALIFIED_MEASURED; basis = `Q3 registry NO_QUALIFIED_LOCAL_MODEL for '${tc.value}' (${regSource})`; }
  else if (regDecision === "UNAVAILABLE") { status = QUAL.UNAVAILABLE; basis = "Q3 registry: every local model UNAVAILABLE"; }
  else { status = QUAL.NOT_MEASURED; basis = `Q4 ${tc.value === null ? "no taskClass" : `registry not usable (${measured ? measured.reason : "not consulted"})`} and no observation ⇒ NOT_MEASURED ⇒ €0 PROBE`; }
  const ws = Array.isArray(p.writeSet) && p.writeSet.length && p.writeSet.every((x: any) => isStr(x) && !/[<>]/.test(x))
    ? cited(freeze(p.writeSet.slice()), p.writeSetSource || "UNCITED") : nm(Array.isArray(p.writeSet) ? "write-set contains placeholders/empty ⇒ UNKNOWN" : "no write-set in the evidence record ⇒ UNKNOWN");
  return freeze({ id: String(p.id), taskClass: tc, writeSet: ws, independentCheck: p.independentCheck === true ? cited(true, p.independentCheckSource || "UNCITED") : nm("no independent per-part check recorded"),
    qualification: status, localModel: model, basis, escalateAfterFailure: status === QUAL.PROBATION_PROBE || status === QUAL.NOT_MEASURED, observations: freeze(obs), registryDecision: regDecision });
}

function budgetCheck(b: any): any {
  if (!isObj(b)) return freeze({ ok: false, reason: "no budget object supplied ⇒ provider cost UNKNOWN" });
  const ok = isStr(b.currency) && isNum(b.ceiling) && b.ceiling > 0 && isStr(b.enforcedBy) && isStr(b.evidenceRef);
  return freeze(ok ? { ok: true, currency: b.currency, ceiling: b.ceiling, enforcedBy: b.enforcedBy, evidenceRef: b.evidenceRef }
    : { ok: false, reason: "budget object not verifiable (needs currency, ceiling>0, enforcedBy, evidenceRef) ⇒ provider cost UNKNOWN" });
}
function authCheck(a: any, missionId: string): any {
  if (!isObj(a)) return freeze({ ok: false, reason: "no provider authorization supplied" });
  const ok = a.by === "OWNER" && a.missionId === missionId && a.scope === "PROVIDER_DELEGATION" && isStr(a.evidenceRef);
  return freeze(ok ? { ok: true, by: a.by, evidenceRef: a.evidenceRef, note: "declared authorization object — not cryptographically verified here; the sovereign-delegation chain still gates" }
    : { ok: false, reason: "authorization not bound (needs by=OWNER, missionId match, scope=PROVIDER_DELEGATION, evidenceRef)" });
}

function delegationRecord(missionId: string, partId: string | null, why: string): any {
  const id = partId ? `${missionId}::${partId}` : missionId;
  return SD.createMission({ id, objective: `provider delegation for "${id}" — selected by the strategy-mode selector: ${why}`,
    reason: "deny-by-default strategy-mode selection (V16.4 §4): record only; ODG authorizes/issues contract/verifies/accepts; provider never self-authorizes; no provider called" });
}

/**
 * selectStrategyMode(mission, ctx) → frozen { mode, tentativeMode, rationale, perModeAssessment, fallbackChain,
 *   authorizationRequired, budgetRequired, providerExecutable, launchedBySelector:false, parts, uncertainty, inputs,
 *   delegationRecords, rules }. ctx: { measured (loadMeasuredRegistry envelope), now (ms), providerBudget?, providerAuthorization? }.
 */
function selectStrategyMode(mission: any, ctx: any = {}): any {
  const m = isObj(mission) ? mission : {};
  const c = isObj(ctx) ? ctx : {};
  const id = isStr(m.id) ? m.id : "mission";
  const missionObs = arr(m.missionObservations).map(normObs).filter((o: any) => o.executed);
  const missionPass = missionObs.find((o: any) => o.accepted) || null;
  const rawParts = implicitParts(m);
  const localised = rawParts.some((p: any) => arr(p.observations).map(normObs).some((o: any) => o.executed));
  const unlocalisedFailures = !missionPass && !localised ? missionObs.filter((o: any) => !o.accepted) : [];
  const parts = rawParts.map((p: any) => qualifyPart(p, c, unlocalisedFailures));
  const multi = parts.length >= 2;

  // decomposability (planner verdict recorded in evidence, else computed by the canonical planner)
  let planner: any;
  if (isObj(m.decomposition) && isStr(m.decomposition.strategy)) planner = cited(m.decomposition.strategy, m.decomposition.source || "UNCITED");
  else {
    const arch = implicitParts(m).map((p: any) => ({ path: arr(p.writeSet)[0] || String(p.id), role: String(p.role || ""), contract: String(p.contract || m.contract || ""), dependsOn: arr(p.dependsOn) }));
    planner = cited(DP.chooseStrategy({ name: String(m.name || id), architecture: arch }).strategy, "decomposition-planner.chooseStrategy (computed)");
  }
  const allIndependent = parts.every((p: any) => p.independentCheck.value === true);
  const decomposable = planner.value === "DECOMPOSED" && multi && allIndependent;

  // write-set disjointness (canonical contention detector; UNKNOWN ⇒ conflict)
  const cont = WS.computeLayerContention([parts.map((p: any) => p.id)], parts.map((p: any) => ({ id: p.id, authorizedPaths: p.writeSet.value === null ? undefined : p.writeSet.value })));
  const anyUnknownWs = parts.some((p: any) => p.writeSet.value === null);
  const disjoint = cont.ok === true && cont.anyContention === false && !anyUnknownWs;

  const risk = ["LOW", "MEDIUM", "HIGH"].includes(m.risk) ? cited(m.risk, m.riskSource || "UNCITED") : nm("no risk level in the evidence record");
  const deadline = isNum(m.deadlineMs) && m.deadlineMs > 0 ? cited(m.deadlineMs, m.deadlineSource || "UNCITED") : freeze({ value: null, status: "NOT_SUPPLIED" });
  const localWall = [...missionObs, ...parts.flatMap((p: any) => p.observations)].map((o: any) => o.wallMs).filter(isNum);
  const localWallMs = localWall.length ? Math.max(...localWall) : null;
  const budget = budgetCheck(c.providerBudget);
  const auth = authCheck(c.providerAuthorization, id);

  // uncertainty (U1)
  const nmParts = parts.filter((p: any) => p.qualification === QUAL.NOT_MEASURED).map((p: any) => p.id);
  const uncertaintyWhy: string[] = [];
  if (nmParts.length && !missionPass) uncertaintyWhy.push(`part qualification NOT_MEASURED: ${nmParts.join(",")}`);
  const probParts = parts.filter((p: any) => p.qualification === QUAL.PROBATION_PROBE).map((p: any) => p.id);
  if (probParts.length) uncertaintyWhy.push(`PROBATION-only local evidence (weak): ${probParts.join(",")}`);
  if (risk.value === null) uncertaintyWhy.push("risk NOT_MEASURED");
  if (multi && anyUnknownWs) uncertaintyWhy.push("multi-part write-set UNKNOWN");
  const uncertainty = nmParts.length && !missionPass ? "HIGH" : uncertaintyWhy.length ? "MEDIUM" : "LOW";

  const localParts = parts.filter((p: any) => LOCAL_OK.has(p.qualification));
  const nonLocal = parts.filter((p: any) => !LOCAL_OK.has(p.qualification));
  const hybridRefused: string[] = [];
  if (!multi) hybridRefused.push("single part (nothing to split)");
  if (multi && planner.value !== "DECOMPOSED") hybridRefused.push(`planner verdict ${planner.value}`);
  if (multi && !allIndependent) hybridRefused.push("not every part has an independent check");
  if (multi && !disjoint) hybridRefused.push(anyUnknownWs ? "write-set UNKNOWN ⇒ not provably disjoint" : "write-sets overlap");
  if (!localParts.length) hybridRefused.push("no locally-qualified part");
  if (!nonLocal.length) hybridRefused.push("no part needs delegation");

  // tentative mode from evidence (M2..M5)
  let tentative: string, rule: string, why: string;
  if (missionPass) { tentative = MODES.NATIVE; rule = "M2"; why = `whole mission observed ACCEPTED locally by ${missionPass.model} (${missionPass.source}) ⇒ NATIVE (€0)`; }
  else if (!nonLocal.length) { tentative = MODES.NATIVE; rule = "M2"; why = `every part LOCAL_OK (${parts.map((p: any) => `${p.id}:${p.qualification}`).join(", ")}) ⇒ NATIVE (€0)${nmParts.length ? " — NOT_MEASURED parts run as a €0 PROBE, uncertainty HIGH" : ""}${probParts.length ? ` — PROBATION_PROBE parts (${probParts.join(",")}) escalate if they still fail` : ""}`; }
  else if (decomposable && disjoint && localParts.length) { tentative = MODES.HYBRID; rule = "M4"; why = `decomposable (${planner.value}, ${parts.length} parts with independent checks) + disjoint write-sets; local: ${localParts.map((p: any) => p.id).join(",")}; delegated: ${nonLocal.map((p: any) => p.id).join(",")} ⇒ HYBRID (ODG pilots + integrates + independent validation)`; }
  else { tentative = MODES.PROVIDER; rule = "M5"; why = `not locally qualified: ${nonLocal.map((p: any) => `${p.id}:${p.qualification}`).join(", ")}; HYBRID refused (${hybridRefused.join("; ")}) ⇒ PROVIDER record`; }
  if (tentative === MODES.NATIVE && deadline.value !== null && localWallMs !== null && localWallMs > deadline.value) { tentative = MODES.DECISION_REQUIRED; rule = "M3"; why = `deadline ${deadline.value}ms < measured local wall ${localWallMs}ms ⇒ owner decision`; }

  let mode = tentative;
  if (isStr(m.authorizationState) && m.authorizationState !== "AUTHORIZED") { mode = MODES.DECISION_REQUIRED; rule = "M0"; why = `mission state ${m.authorizationState} ≠ AUTHORIZED ⇒ DECISION_REQUIRED (tentative ${tentative}: ${why})`; }
  else if (risk.value === "HIGH" && uncertainty === "HIGH") { mode = MODES.DECISION_REQUIRED; rule = "M1"; why = `risk HIGH with uncertainty HIGH ⇒ DECISION_REQUIRED (tentative ${tentative})`; }

  const providerInvolved = mode === MODES.PROVIDER || mode === MODES.HYBRID || (mode === MODES.DECISION_REQUIRED && (tentative === MODES.PROVIDER || tentative === MODES.HYBRID));
  const delegationRecords = mode === MODES.PROVIDER ? [delegationRecord(id, null, why)]
    : mode === MODES.HYBRID ? nonLocal.map((p: any) => delegationRecord(id, p.id, `part ${p.id} ${p.qualification}`)) : [];
  const authorizationRequired = providerInvolved || mode === MODES.DECISION_REQUIRED || risk.value === "HIGH";
  const budgetRequired = providerInvolved && !budget.ok;
  const providerExecutable = (mode === MODES.PROVIDER || mode === MODES.HYBRID) && budget.ok && auth.ok;

  const ladder = fallbackLadder(mode === MODES.DECISION_REQUIRED ? tentative : mode, { decomposable, disjoint });
  const perModeAssessment = freeze({
    NATIVE: freeze({ feasible: !nonLocal.length || !!missionPass, costEur: 0, costSource: "loopback Ollama 127.0.0.1:11434 (V159/V161 evidence ollama.endpoint) — no paid call", localParts: freeze(localParts.map((p: any) => p.id)), blockedParts: freeze(nonLocal.map((p: any) => `${p.id}:${p.qualification}`)) }),
    HYBRID: freeze({ applicable: decomposable && disjoint && localParts.length > 0 && nonLocal.length > 0, refusedBecause: freeze(hybridRefused.slice()), nativeParts: freeze(localParts.map((p: any) => p.id)), delegatedParts: freeze(nonLocal.map((p: any) => p.id)), integration: "ODG integrates + independent validation (held-out / sandbox verdict), provider never self-accepts" }),
    PROVIDER: freeze({ applicable: nonLocal.length > 0, cost: budget.ok ? freeze({ currency: budget.currency, ceiling: budget.ceiling }) : "UNKNOWN", budget, authorization: auth, executable: budget.ok && auth.ok, launchedBySelector: false }),
    DECISION_REQUIRED: freeze({ triggered: mode === MODES.DECISION_REQUIRED, rule: mode === MODES.DECISION_REQUIRED ? rule : null }),
  });
  return freeze({
    missionId: id, mode, tentativeMode: tentative, rule, rationale: why,
    perModeAssessment, fallbackChain: ladder,
    authorizationRequired, budgetRequired, providerExecutable, launchedBySelector: false,
    uncertainty: freeze({ level: uncertainty, because: freeze(uncertaintyWhy) }),
    parts: freeze(parts.map((p: any) => freeze({ id: p.id, qualification: p.qualification, localModel: p.localModel, basis: p.basis, escalateAfterFailure: p.escalateAfterFailure, taskClass: p.taskClass, writeSet: p.writeSet, independentCheck: p.independentCheck }))),
    inputs: freeze({ planner, decomposable, writeSetDisjoint: disjoint, contention: cont.ok ? freeze({ anyContention: cont.anyContention, unknownWriteSet: anyUnknownWs }) : nm(String(cont.code)), risk, deadline, localWallMsMax: localWallMs === null ? nm("no measured local wall time") : cited(localWallMs, "max of cited observations"), missionObservations: missionObs.length }),
    delegationRecords: freeze(delegationRecords.map((r: any) => freeze({ missionId: r.missionId, state: r.state, authority: r.authority }))),
    rules: RULES,
  });
}

// ---- strategy change on failure ------------------------------------------------------------------------------------
function key(s: any): string {
  if (!isObj(s)) return "NONE";
  if (s.mode === MODES.NATIVE) return `NATIVE:${s.strategy || "DEFAULT"}:${s.model || "?"}:${isNum(s.maxRepair) ? s.maxRepair : "?"}`;
  return String(s.mode);
}
function fallbackLadder(from: string, f: any): any {
  const order = [MODES.NATIVE, MODES.HYBRID, MODES.PROVIDER, MODES.DECISION_REQUIRED];
  const start = Math.max(0, order.indexOf(from));
  const out = order.slice(start).filter((md) => md !== MODES.HYBRID || (f.decomposable && f.disjoint) || md === from);
  return freeze(out.slice(0, MAX_CHAIN));
}

/**
 * nextStrategyAfterFailure(prev, failureEvidence) → frozen { next, rule, reason, tried, bounded }.
 * prev: { mode, strategy?, model?, maxRepair?, tried?: string[] }. failureEvidence: { accepted?, executionStatus?,
 * stopReason?, parts?: [{id, verified, stopReason?}], intermediateOracle?: boolean, decomposable?, disjoint? }.
 * F0 accepted ⇒ none. F1 NOT_RUN ⇒ none (nothing measured). F2 no ODG stop (self or any part) ⇒ none (fail-closed, as V161 J R2).
 * F3 NATIVE DEFAULT + intermediate oracle ⇒ NATIVE DECOMPOSED_INTERMEDIATE_VERIFICATION, same model/maxRepair (J R3).
 * F4 NATIVE below the max local tier ⇒ NATIVE LARGER_MODEL_REPAIR_DEPTH (7b, maxRepair 3) (J R4).
 * F5 per-part evidence mixed (≥1 verified, ≥1 failed/unrun) + decomposable + disjoint ⇒ HYBRID; else PROVIDER record.
 * F6 HYBRID failed ⇒ PROVIDER; PROVIDER failed ⇒ DECISION_REQUIRED. Never a tried key; ≥ MAX_CHAIN ⇒ DECISION_REQUIRED.
 * F7 prev is DECISION_REQUIRED (or it was already tried) ⇒ next=null — TERMINAL; repeated calls never loop.
 */
function nextStrategyAfterFailure(prev: any, failureEvidence: any): any {
  const p = isObj(prev) ? prev : {};
  const f = isObj(failureEvidence) ? failureEvidence : {};
  const tried = [...new Set([...arr(p.tried).map(String), key(p)])];
  const done = (next: any, rule: string, reason: string) => freeze({ next: next ? freeze(next) : null, rule, reason, tried: freeze(tried), bounded: tried.length <= MAX_CHAIN });
  if (p.mode === MODES.DECISION_REQUIRED || arr(p.tried).map(String).includes(MODES.DECISION_REQUIRED)) return done(null, "F7", "DECISION_REQUIRED already reached ⇒ TERMINAL (no further strategy; owner decision)");
  if (f.accepted === true) return done(null, "F0", "accepted ⇒ nothing to change");
  if (f.executionStatus === "NOT_RUN") return done(null, "F1", "NOT_RUN ⇒ nothing was measured ⇒ no strategy change on non-evidence");
  const partsEv = arr(f.parts);
  const stopped = ODG_STOPS.includes(f.stopReason) || partsEv.some((x: any) => ODG_STOPS.includes(x && x.stopReason));
  if (!stopped) return done(null, "F2", "no ODG stop recorded ⇒ no change (the change is triggered only by ODG's own stop)");
  if (tried.length >= MAX_CHAIN) return done({ mode: MODES.DECISION_REQUIRED }, "F6", `chain bound ${MAX_CHAIN} reached ⇒ DECISION_REQUIRED`);

  const candidates: Array<[any, string, string]> = [];
  const below = (MODEL_RANK[String(p.model)] || 0) < MODEL_RANK[MAX_LOCAL.model] || (isNum(p.maxRepair) && p.maxRepair < MAX_LOCAL.maxRepair);
  const verified = partsEv.filter((x: any) => x && x.verified === true).map((x: any) => String(x.id));
  const failed = partsEv.filter((x: any) => !(x && x.verified === true)).map((x: any) => String(x && x.id));
  const mixed = verified.length > 0 && failed.length > 0;
  if (p.mode === MODES.NATIVE) {
    if ((p.strategy || "DEFAULT") === "DEFAULT" && f.intermediateOracle === true)
      candidates.push([{ mode: MODES.NATIVE, strategy: "DECOMPOSED_INTERMEDIATE_VERIFICATION", model: p.model, maxRepair: p.maxRepair }, "F3", "ODG stop + intermediate oracle ⇒ decomposed per-part verification, same model/maxRepair (V161 J R3)"]);
    if (mixed && f.decomposable === true && f.disjoint === true)
      candidates.push([{ mode: MODES.HYBRID, nativeParts: verified, delegatedParts: failed }, "F5", `per-part evidence: verified ${verified.join(",")} / not ${failed.join(",")} + decomposable + disjoint ⇒ HYBRID`]);
    if (below && !mixed)
      candidates.push([{ mode: MODES.NATIVE, strategy: "LARGER_MODEL_REPAIR_DEPTH", model: MAX_LOCAL.model, maxRepair: MAX_LOCAL.maxRepair }, "F4", `ODG stop below the max local tier ⇒ ${MAX_LOCAL.model}/maxRepair ${MAX_LOCAL.maxRepair} (V161 J R4)`]);
    candidates.push([{ mode: MODES.PROVIDER }, "F5", "local options exhausted ⇒ PROVIDER delegation RECORD (budget + authorization required; never launched)"]);
  } else if (p.mode === MODES.HYBRID) candidates.push([{ mode: MODES.PROVIDER }, "F6", "HYBRID failed ⇒ whole-mission PROVIDER record"]);
  candidates.push([{ mode: MODES.DECISION_REQUIRED }, "F6", "no untried strategy left ⇒ DECISION_REQUIRED (terminal)"]);
  for (const [n, r, why] of candidates) if (!tried.includes(key(n))) return done(n, r, why);
  return done(null, "F7", "every candidate already tried ⇒ TERMINAL");
}

const STRATEGY_MODE_SELECTOR_CONTRACT = freeze({
  id: "V164-STRATEGY-MODE-SELECTOR",
  purpose: "V16.4 §4 sélecteur de stratégie — choose NATIVE / HYBRID / PROVIDER / DECISION_REQUIRED from canonical evidence; §7 hybrid gap",
  reuses: freeze(["odg-local-model-execution-policy.chooseExecutionPolicy measured overlay (→ odg-model-router.selectMeasured, V155 registry)", "decomposition-planner.chooseStrategy", "odg-writeset-contention.computeLayerContention", "odg-sovereign-delegation.createMission (deny-by-default record)"]),
  invariants: freeze([
    "chooses only: AUTHORIZES nothing, LAUNCHES nothing, calls no model and no provider",
    "every input is evidence-cited or NOT_MEASURED; NOT_MEASURED is never default-filled and raises uncertainty",
    "provider ⇒ authorizationRequired always; budgetRequired unless a verifiable budget object; providerExecutable needs budget AND bound OWNER authorization; launchedBySelector=false",
    "HYBRID only when decomposable (planner DECOMPOSED + ≥2 parts with independent checks) AND write-sets disjoint (UNKNOWN ⇒ conflict) AND ≥1 local + ≥1 delegated part",
    "strategy change only on an ODG stop; never repeats a tried strategy; bounded by MAX_CHAIN; PURE/deterministic/frozen",
  ]),
});

module.exports = { selectStrategyMode, nextStrategyAfterFailure, qualifyPart, MODES, QUAL, RULES, ODG_STOPS, MAX_LOCAL, MAX_CHAIN, STRATEGY_MODE_SELECTOR_CONTRACT, strategyKey: key };
export {};
