#!/usr/bin/env node
"use strict";
/* Tests for odg-strategy-mode-selector (V16.4 §4). OFFLINE, deterministic: the committed V155 registry + synthetic
 * mission records. Covers every mode branch, NOT_MEASURED ⇒ uncertainty, provider never executable without budget AND
 * authorization, hybrid needs disjoint write-sets, the failure chain is bounded and non-repeating, and the additive
 * wiring into chooseExecutionPolicy leaves existing callers byte-identical. */
const SEL = require("./odg-strategy-mode-selector.js");
const POL = require("./odg-local-model-execution-policy.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const measured = POL.loadMeasuredRegistry();
const NOW = Date.parse(measured.generatedAt) + 3600 * 1000;
const ctx = { measured, now: NOW };
const pass = (model: string) => ({ model, maxRepair: 1, accepted: true, source: "test#pass" });
const fail = (model: string, maxRepair = 1) => ({ model, maxRepair, accepted: false, source: "test#fail" });
const part = (id: string, extra: any = {}) => ({ id, writeSet: [`m/${id}.js`], writeSetSource: "test#ws", independentCheck: true, independentCheckSource: "test#cases", taskClass: "implement", taskClassSource: "test#tc", ...extra });
const decomp = { strategy: "DECOMPOSED", source: "test#planner" };

// NATIVE — registry-qualified class
const nat = SEL.selectStrategyMode({ id: "n1", taskClass: "bugfix", taskClassSource: "test#tc" }, ctx);
check("NATIVE: bugfix (7b QUALIFIED in V155) ⇒ NATIVE €0", nat.mode === "NATIVE" && nat.parts[0].qualification === "QUALIFIED_MEASURED" && nat.parts[0].localModel === "qwen2.5-coder:7b" && nat.perModeAssessment.NATIVE.costEur === 0);
check("NATIVE: no provider involvement ⇒ no budget/authorization required (risk not HIGH)", nat.budgetRequired === false && nat.authorizationRequired === false && nat.delegationRecords.length === 0);
check("NATIVE: risk NOT_MEASURED ⇒ uncertainty MEDIUM (never LOW)", nat.uncertainty.level === "MEDIUM" && nat.inputs.risk.status === "NOT_MEASURED");
const natLow = SEL.selectStrategyMode({ id: "n2", taskClass: "bugfix", taskClassSource: "t", risk: "LOW", riskSource: "t" }, ctx);
check("NATIVE with cited risk LOW ⇒ uncertainty LOW", natLow.uncertainty.level === "LOW");

// NOT_MEASURED ⇒ €0 probe + HIGH uncertainty, never default-filled
const nm = SEL.selectStrategyMode({ id: "u1" }, ctx);
check("NOT_MEASURED taskClass ⇒ NATIVE probe with uncertainty HIGH", nm.mode === "NATIVE" && nm.parts[0].qualification === "NOT_MEASURED" && nm.uncertainty.level === "HIGH" && nm.parts[0].taskClass.status === "NOT_MEASURED");
const unk = SEL.selectStrategyMode({ id: "u2", taskClass: "no-such-class", taskClassSource: "t" }, ctx);
check("unknown class ⇒ NOT_MEASURED (registry not usable), not a number", unk.parts[0].qualification === "NOT_MEASURED" && unk.uncertainty.level === "HIGH");
const noReg = SEL.selectStrategyMode({ id: "u3", taskClass: "bugfix", taskClassSource: "t" }, { now: NOW });
check("no registry supplied ⇒ NOT_MEASURED", noReg.parts[0].qualification === "NOT_MEASURED");
const expired = SEL.selectStrategyMode({ id: "u4", taskClass: "bugfix", taskClassSource: "t" }, { measured, now: NOW + 90 * 86400000 });
check("expired registry ⇒ NOT_MEASURED (fail-closed)", expired.parts[0].qualification === "NOT_MEASURED");

// PROVIDER — class NO_QUALIFIED, single part
const prov = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, ctx);
check("PROVIDER: implement single part with an OBSERVED local failure ⇒ PROVIDER record", prov.mode === "PROVIDER" && prov.parts[0].qualification === "NOT_QUALIFIED_OBSERVED");
check("PROVIDER: authorizationRequired + budgetRequired, NOT executable, never launched", prov.authorizationRequired && prov.budgetRequired && !prov.providerExecutable && prov.launchedBySelector === false && prov.perModeAssessment.PROVIDER.cost === "UNKNOWN");
check("PROVIDER: one deny-by-default delegation record in CREATED state", prov.delegationRecords.length === 1 && prov.delegationRecords[0].state === "CREATED" && prov.delegationRecords[0].authority === "ODG");
const budget = { currency: "EUR", ceiling: 5, enforcedBy: "test-ceiling", evidenceRef: "t" };
const pb = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerBudget: budget });
check("budget alone ⇒ budgetRequired false but still NOT executable (no authorization)", pb.budgetRequired === false && pb.providerExecutable === false && pb.authorizationRequired === true);
const pa = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerAuthorization: { by: "OWNER", missionId: "p1", scope: "PROVIDER_DELEGATION", evidenceRef: "t" } });
check("authorization alone ⇒ still NOT executable (budget UNKNOWN)", pa.providerExecutable === false && pa.budgetRequired === true);
const pab = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerBudget: budget, providerAuthorization: { by: "OWNER", missionId: "p1", scope: "PROVIDER_DELEGATION", evidenceRef: "t" } });
check("budget + bound OWNER authorization ⇒ providerExecutable, still launchedBySelector=false, record CREATED (not AUTHORIZED)", pab.providerExecutable === true && pab.launchedBySelector === false && pab.delegationRecords[0].state === "CREATED");
const wrongAuth = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerBudget: budget, providerAuthorization: { by: "PROVIDER", missionId: "p1", scope: "PROVIDER_DELEGATION", evidenceRef: "t" } });
check("provider self-authorization refused (by≠OWNER)", wrongAuth.providerExecutable === false);
const otherMission = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerBudget: budget, providerAuthorization: { by: "OWNER", missionId: "p2", scope: "PROVIDER_DELEGATION", evidenceRef: "t" } });
check("authorization bound to another mission refused", otherMission.providerExecutable === false);
const badBudget = SEL.selectStrategyMode({ id: "p1", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, { ...ctx, providerBudget: { currency: "EUR", ceiling: 0 } });
check("unverifiable budget ⇒ cost UNKNOWN", badBudget.budgetRequired === true && badBudget.perModeAssessment.PROVIDER.cost === "UNKNOWN");

// observed evidence precedence
const obsFail = SEL.selectStrategyMode({ id: "o1", taskClass: "bugfix", taskClassSource: "t", observations: [fail("qwen2.5-coder:3b")] }, ctx);
check("observed 3b failure but QUALIFIED 7b untried ⇒ still QUALIFIED_MEASURED (7b) ⇒ NATIVE", obsFail.mode === "NATIVE" && obsFail.parts[0].qualification === "QUALIFIED_MEASURED" && obsFail.parts[0].localModel === "qwen2.5-coder:7b");
const obsFail7 = SEL.selectStrategyMode({ id: "o2", taskClass: "bugfix", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, ctx);
check("observed 7b failure ⇒ NOT_QUALIFIED_OBSERVED ⇒ PROVIDER", obsFail7.mode === "PROVIDER" && obsFail7.parts[0].qualification === "NOT_QUALIFIED_OBSERVED");
const obsPass = SEL.selectStrategyMode({ id: "o3", taskClass: "implement", taskClassSource: "t", observations: [pass("qwen2.5-coder:3b")] }, ctx);
check("observed ACCEPT overrides class NO_QUALIFIED ⇒ NATIVE", obsPass.mode === "NATIVE" && obsPass.parts[0].qualification === "QUALIFIED_OBSERVED");
const notRun = SEL.selectStrategyMode({ id: "o4", taskClass: "implement", taskClassSource: "t", observations: [{ model: "qwen2.5-coder:3b", accepted: false, executionStatus: "NOT_RUN", source: "t" }] }, ctx);
check("NOT_RUN observation is ignored (not a failure) ⇒ PROBATION_PROBE", notRun.parts[0].qualification === "PROBATION_PROBE");

// weak evidence is never treated harsher than no evidence (canonical V159: local probe first, escalate if it still fails)
const weak = SEL.selectStrategyMode({ id: "w1", taskClass: "implement", taskClassSource: "t" }, ctx);
check("NO_QUALIFIED class with PROBATION model, no observed failure ⇒ NATIVE PROBATION_PROBE (not PROVIDER), escalateAfterFailure", weak.mode === "NATIVE" && weak.parts[0].qualification === "PROBATION_PROBE" && weak.parts[0].escalateAfterFailure === true && weak.delegationRecords.length === 0);
check("PROBATION-only evidence raises uncertainty (never LOW)", weak.uncertainty.level !== "LOW" && weak.uncertainty.because.some((b: string) => /PROBATION/.test(b)));
const fSens = SEL.selectStrategyMode({ id: "fs", decomposition: decomp, parts: ["A", "B", "C"].map((x) => part(x)) }, ctx);
check("sensitivity: F-like parts labelled 'implement', no observation ⇒ NATIVE probe, not PROVIDER", fSens.mode === "NATIVE" && fSens.parts.every((p: any) => p.qualification === "PROBATION_PROBE"));
const missFail = SEL.selectStrategyMode({ id: "mf", decomposition: decomp, parts: [part("a"), part("b")], missionObservations: [fail("qwen2.5-coder:3b")] }, ctx);
check("unlocalised mission-level OBSERVED failure applies to every part ⇒ PROVIDER", missFail.mode === "PROVIDER" && missFail.parts.every((p: any) => p.qualification === "NOT_QUALIFIED_OBSERVED"));
const missFailLoc = SEL.selectStrategyMode({ id: "mf2", decomposition: decomp, parts: [part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b")], missionObservations: [fail("qwen2.5-coder:3b")] }, ctx);
check("mission failure localised by part evidence ⇒ not attributed to unobserved parts", missFailLoc.parts[1].qualification === "PROBATION_PROBE");

// HYBRID
const hm = (parts: any[], extra: any = {}) => ({ id: "h1", decomposition: decomp, parts, ...extra });
const hyb = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { observations: [fail("qwen2.5-coder:7b", 3)] }), part("c", { taskClass: "bugfix" })]), ctx);
check("HYBRID: decomposable + disjoint + mixed qualification ⇒ HYBRID", hyb.mode === "HYBRID" && hyb.rule === "M4");
check("HYBRID: native parts local, unqualified via per-part delegation records", JSON.stringify(hyb.perModeAssessment.HYBRID.nativeParts) === '["a","c"]' && JSON.stringify(hyb.perModeAssessment.HYBRID.delegatedParts) === '["b"]' && hyb.delegationRecords.length === 1 && hyb.delegationRecords[0].missionId === "h1::b");
check("HYBRID: budget + authorization required, not executable, not launched", hyb.authorizationRequired && hyb.budgetRequired && !hyb.providerExecutable && hyb.launchedBySelector === false);
const overlap = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { writeSet: ["m/a.js"], observations: [fail("qwen2.5-coder:7b", 3)] })]), ctx);
check("HYBRID refused on overlapping write-sets ⇒ PROVIDER", overlap.mode === "PROVIDER" && overlap.perModeAssessment.HYBRID.refusedBecause.some((r: string) => /overlap/.test(r)));
const unknownWs = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { writeSet: undefined, observations: [fail("qwen2.5-coder:7b", 3)] })]), ctx);
check("HYBRID refused on UNKNOWN write-set (fail-closed) ⇒ PROVIDER", unknownWs.mode === "PROVIDER" && unknownWs.inputs.writeSetDisjoint === false);
const placeholder = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { writeSet: ["runtime/core/<x>.ts"], observations: [fail("qwen2.5-coder:7b", 3)] })]), ctx);
check("placeholder write-set ⇒ UNKNOWN ⇒ no HYBRID", placeholder.mode !== "HYBRID" && placeholder.parts[1].writeSet.status === "NOT_MEASURED");
const noIndep = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { independentCheck: false, observations: [fail("qwen2.5-coder:7b", 3)] })]), ctx);
check("HYBRID refused without per-part independent checks", noIndep.mode === "PROVIDER");
const mono = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { observations: [fail("qwen2.5-coder:7b", 3)] })], { decomposition: { strategy: "MONOLITHIC", source: "t" } }), ctx);
check("HYBRID refused when the planner verdict is MONOLITHIC", mono.mode === "PROVIDER");
const allLocal = SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b", { taskClass: "bugfix" })]), ctx);
check("all parts local ⇒ NATIVE (not HYBRID)", allLocal.mode === "NATIVE");
const noneLocal = SEL.selectStrategyMode(hm([part("a", { observations: [fail("qwen2.5-coder:7b", 3)] }), part("b", { observations: [fail("qwen2.5-coder:3b")] })]), ctx);
check("no part local ⇒ PROVIDER (not HYBRID)", noneLocal.mode === "PROVIDER");
const computedPlanner = SEL.selectStrategyMode({ id: "h2", parts: [part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b"), part("c"), part("d")] }, ctx);
check("planner computed by decomposition-planner when not recorded (4 files ⇒ DECOMPOSED)", computedPlanner.inputs.planner.value === "DECOMPOSED" && /decomposition-planner/.test(computedPlanner.inputs.planner.source));

// DECISION_REQUIRED
const prop = SEL.selectStrategyMode({ id: "d1", taskClass: "bugfix", taskClassSource: "t", authorizationState: "PROPOSED" }, ctx);
check("DECISION_REQUIRED: PROPOSED mission (M0), tentative kept", prop.mode === "DECISION_REQUIRED" && prop.tentativeMode === "NATIVE" && prop.rule === "M0" && prop.authorizationRequired);
const auth = SEL.selectStrategyMode({ id: "d1", taskClass: "bugfix", taskClassSource: "t", authorizationState: "AUTHORIZED" }, ctx);
check("AUTHORIZED mission ⇒ tentative stands", auth.mode === "NATIVE");
const risky = SEL.selectStrategyMode({ id: "d2", risk: "HIGH", riskSource: "t" }, ctx);
check("DECISION_REQUIRED: risk HIGH + uncertainty HIGH (M1)", risky.mode === "DECISION_REQUIRED" && risky.rule === "M1");
const riskyKnown = SEL.selectStrategyMode({ id: "d3", taskClass: "bugfix", taskClassSource: "t", risk: "HIGH", riskSource: "t" }, ctx);
check("risk HIGH with known qualification ⇒ NATIVE but authorizationRequired", riskyKnown.mode === "NATIVE" && riskyKnown.authorizationRequired === true);
const late = SEL.selectStrategyMode({ id: "d4", taskClass: "bugfix", taskClassSource: "t", deadlineMs: 1000, deadlineSource: "t", observations: [{ ...pass("qwen2.5-coder:7b"), wallMs: 5000 }] }, ctx);
check("DECISION_REQUIRED: deadline shorter than measured local wall (M3)", late.mode === "DECISION_REQUIRED" && late.rule === "M3");
const ok = SEL.selectStrategyMode({ id: "d5", taskClass: "bugfix", taskClassSource: "t", deadlineMs: 10000, deadlineSource: "t", observations: [{ ...pass("qwen2.5-coder:7b"), wallMs: 5000 }] }, ctx);
check("deadline met ⇒ NATIVE", ok.mode === "NATIVE");

// determinism + frozen + rules declared
check("deterministic", JSON.stringify(SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b")]), ctx)) === JSON.stringify(SEL.selectStrategyMode(hm([part("a", { observations: [pass("qwen2.5-coder:3b")] }), part("b")]), ctx)));
check("frozen output + rules declared in output", Object.isFrozen(hyb) && Array.isArray(hyb.rules) && hyb.rules.length >= 10);
check("garbage input does not throw", (() => { try { SEL.selectStrategyMode(null, null); SEL.selectStrategyMode(42, "x"); return true; } catch { return false; } })());

// ---- nextStrategyAfterFailure ------------------------------------------------------------------------------------
const N = SEL.nextStrategyAfterFailure;
const d3b = { mode: "NATIVE", strategy: "DEFAULT", model: "qwen2.5-coder:3b", maxRepair: 1 };
check("F0 accepted ⇒ no change", N(d3b, { accepted: true }).next === null);
check("F1 NOT_RUN ⇒ no change", N(d3b, { executionStatus: "NOT_RUN", stopReason: "REPAIR_BUDGET_EXHAUSTED" }).next === null);
check("F2 no ODG stop ⇒ no change", N(d3b, { accepted: false, stopReason: "SOMETHING_ELSE" }).next === null);
const s1 = N(d3b, { accepted: false, stopReason: "REPAIR_BUDGET_EXHAUSTED", intermediateOracle: true });
check("F3 stop + intermediate oracle ⇒ DECOMPOSED same model/maxRepair", s1.next.strategy === "DECOMPOSED_INTERMEDIATE_VERIFICATION" && s1.next.model === "qwen2.5-coder:3b" && s1.next.maxRepair === 1 && s1.rule === "F3");
const s1b = N(d3b, { accepted: false, stopReason: "NO_PROGRESS_IDENTICAL_REGENERATION" });
check("F4 stop, no oracle, below max tier ⇒ 7b/maxRepair 3", s1b.next.strategy === "LARGER_MODEL_REPAIR_DEPTH" && s1b.next.model === "qwen2.5-coder:7b" && s1b.next.maxRepair === 3);
const s2 = N({ ...s1.next, tried: s1.tried }, { accepted: false, parts: [{ id: "a", verified: true }, { id: "b", verified: false, stopReason: "REPAIR_BUDGET_EXHAUSTED" }], decomposable: true, disjoint: true });
check("F5 mixed per-part evidence + decomposable + disjoint ⇒ HYBRID", s2.next.mode === "HYBRID" && JSON.stringify(s2.next.nativeParts) === '["a"]');
const s2b = N({ ...s1.next, tried: s1.tried }, { accepted: false, parts: [{ id: "a", verified: true }, { id: "b", verified: false, stopReason: "REPAIR_BUDGET_EXHAUSTED" }], decomposable: true, disjoint: false });
check("F5 mixed but NOT disjoint ⇒ never HYBRID", s2b.next.mode !== "HYBRID");
const s2c = N({ ...s1b.next, tried: s1b.tried }, { accepted: false, stopReason: "NO_PROGRESS_IDENTICAL_REGENERATION" });
check("after max local tier fails (no per-part evidence) ⇒ PROVIDER", s2c.next.mode === "PROVIDER");
const s3 = N({ ...s2.next, tried: s2.tried }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" });
check("F6 HYBRID failed ⇒ PROVIDER", s3.next.mode === "PROVIDER");
const s4 = N({ ...s3.next, tried: s3.tried }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" });
check("F6 PROVIDER failed ⇒ DECISION_REQUIRED (terminal)", s4.next.mode === "DECISION_REQUIRED");
// bounded + non-repeating under arbitrary repeated failure
let cur: any = { ...d3b }; const seen: string[] = [SEL.strategyKey(cur)]; let steps = 0;
for (;;) { const r = N(cur, { stopReason: "REPAIR_BUDGET_EXHAUSTED", intermediateOracle: true, parts: [{ id: "a", verified: true }, { id: "b", verified: false }], decomposable: true, disjoint: true }); if (!r.next) break; seen.push(SEL.strategyKey(r.next)); steps++; if (r.next.mode === "DECISION_REQUIRED" || steps > 20) break; cur = { ...r.next, tried: r.tried }; }
check("chain terminates within MAX_CHAIN and never repeats a strategy", steps <= SEL.MAX_CHAIN && new Set(seen).size === seen.length && seen[seen.length - 1] === "DECISION_REQUIRED");
let term: any = { mode: "DECISION_REQUIRED" }; let loops = 0;
for (let i = 0; i < 10; i++) { const r = N(term, { stopReason: "REPAIR_BUDGET_EXHAUSTED" }); if (r.next === null) break; loops++; term = { ...r.next, tried: r.tried }; }
check("terminal: DECISION_REQUIRED ⇒ next null on the first call (repeated calls never loop)", loops === 0 && N({ mode: "DECISION_REQUIRED" }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" }).rule === "F7");
check("terminal: DECISION_REQUIRED already in tried ⇒ next null", N({ mode: "PROVIDER", tried: ["DECISION_REQUIRED"] }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" }).next === null);
const capped = N({ mode: "NATIVE", strategy: "X", model: "m", maxRepair: 1, tried: ["a", "b", "c", "d", "e", "f"] }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" });
check("tried ≥ MAX_CHAIN ⇒ DECISION_REQUIRED", capped.next.mode === "DECISION_REQUIRED");
const already = N({ ...d3b, tried: ["NATIVE:LARGER_MODEL_REPAIR_DEPTH:qwen2.5-coder:7b:3"] }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" });
check("never returns an already-tried strategy", already.next.mode === "PROVIDER");

// ---- additive wiring into chooseExecutionPolicy ------------------------------------------------------------------
const h = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: "t", verified: true })), ...Array(f).fill(0).map(() => ({ missionType: "t", verified: false }))];
const plain = JSON.stringify(POL.chooseExecutionPolicy("t", h(18, 2)));
const plainM = JSON.stringify(POL.chooseExecutionPolicy("t", h(18, 2), { taskClass: "bugfix", measured, now: NOW }));
const withSm = POL.chooseExecutionPolicy("t", h(18, 2), { strategyMode: { mission: { id: "w", taskClass: "implement", taskClassSource: "t", observations: [fail("qwen2.5-coder:7b", 3)] }, ctx } });
const withSmM = POL.chooseExecutionPolicy("t", h(18, 2), { taskClass: "bugfix", measured, now: NOW, strategyMode: { mission: { id: "w", taskClass: "bugfix", taskClassSource: "t" }, ctx } });
const { strategyMode: sm1, ...rest1 } = withSm; const { strategyMode: sm2, ...rest2 } = withSmM;
check("wiring: absent strategyMode ⇒ no strategyMode field (byte-identical callers)", !("strategyMode" in JSON.parse(plain)) && !("strategyMode" in JSON.parse(plainM)));
check("wiring: opt-in strategyMode leaves the policy fields unchanged (calibrated path)", JSON.stringify(rest1) === plain);
check("wiring: opt-in strategyMode leaves the policy fields unchanged (measured path)", JSON.stringify(rest2) === plainM);
check("wiring: attaches the selector's decision", sm1.mode === "PROVIDER" && sm2.mode === "NATIVE");

process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};
