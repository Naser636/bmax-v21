#!/usr/bin/env node
"use strict";
/*
 * V16.1 — SCENARIO J (V15.0 §45, contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#J): "ODG détecte une
 * stratégie inefficace, arrête les tentatives répétitives, construit une alternative et mesure le résultat."
 *
 * For each REAL task (picked from the V155/V159 bench evidence where the default strategy FAILED) and each trial:
 *  1. DEFAULT — the calibrated policy's choice through the REAL wired caller (odg-intelligent-native-cycle
 *     .runIntelligentCycle + the V15.9 measured overlay: implement ⇒ NO_QUALIFIED ⇒ escalateIfStillFails) until ODG's OWN
 *     stop fires inside native-project-builder (NO_PROGRESS_IDENTICAL_REGENERATION / REPAIR_BUDGET_EXHAUSTED, #885).
 *     The stop reason is read from the builder's outcome (captured through the injectable deps.buildProject seam).
 *  2. SELECT — selectAlternative() applies the rule STATED BELOW (ALTERNATIVE_RULE) to the recorded default outcome.
 *     Canonical options only: odg-decomposed-execution (intermediate verification) or the policy's own max-local tier
 *     (larger model + repair depth). Never the same (model, maxRepair, strategy) as the default.
 *  3. EXECUTE the alternative on the SAME task, same options (temperature 0, seed 42), model code ONLY inside the
 *     native-build sandbox (odg-native-build-sandbox, bwrap — #916). Acceptance = the task's ORIGINAL whole-task
 *     independent test, evaluated in the sandbox (same oracle as the default).
 *  4. MEASURE — pass rate (primary), model calls / repairs, wall time + host loadavg per trial (secondary, confounded:
 *     the host is shared with a concurrent Ollama workload).
 *  5. ESCALATE — only when BOTH failed: odg-native-escalation.decideEscalation (evidence-gated) creates a
 *     sovereign-delegation record in CREATED state. No provider is ever called by this runner.
 * No second orchestrator: the cycle, builder, decomposed-execution, policy and escalation modules are the canonical ones;
 * this file only sequences them and records evidence.
 *
 * Usage: npx tsx runtime/bin/odg-v161-scenario-j-run.ts [--trials N] [--tasks id,id] [--write]   (live, local Ollama)
 *        npx tsx runtime/bin/odg-v161-scenario-j-run.ts --check   (re-derive the committed evidence's summaries/selections)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const IC = require(path.join(ROOT, "runtime", "core", "odg-intelligent-native-cycle.js"));
const POL = require(path.join(ROOT, "runtime", "core", "odg-local-model-execution-policy.js"));
const ESC = require(path.join(ROOT, "runtime", "core", "odg-native-escalation.js"));
const DECOMP = require(path.join(ROOT, "runtime", "core", "odg-decomposed-execution.js"));
const DP = require(path.join(ROOT, "runtime", "core", "decomposition-planner.js"));
const BUILDER = require(path.join(ROOT, "runtime", "core", "native-project-builder.js"));
const NBS = require(path.join(ROOT, "runtime", "core", "odg-native-build-sandbox.js"));
const GEN = require(path.join(ROOT, "runtime", "core", "local-model-generator.js"));
const { HARD_TASKS, HARD_TEST_PRELUDE } = require(path.join(ROOT, "runtime", "bin", "native-hard-corpus.js"));

const OUT_REL = "docs/odg/evidence/V161_SCENARIO_J.json";
const HOST = "http://127.0.0.1:11434";
const OPTIONS = Object.freeze({ temperature: 0, seed: 42, num_predict: 600 });

// ---- the ODG stops and the selection rule (STATED HERE, before any run) ---------------------------------------------
const ODG_STOPS = Object.freeze(["NO_PROGRESS_IDENTICAL_REGENERATION", "REPAIR_BUDGET_EXHAUSTED"]);
// = the policy's NATIVE_MAX_THEN_ESCALATE tier (odg-local-model-execution-policy.calibratedPolicy: MODEL.LARGE, maxRepair 3)
const MAX_LOCAL = Object.freeze({ model: POL.MODEL.LARGE, maxRepair: 3 });
const ALTERNATIVE_RULE = Object.freeze([
  "R0: default ACCEPTED ⇒ NONE (nothing to replace).",
  "R1: default NOT_RUN (no sandbox verdict) ⇒ NOT_RUN — no alternative, no escalation (nothing was measured).",
  "R2: no ODG stop recorded (repairStopReason ∉ {NO_PROGRESS_IDENTICAL_REGENERATION, REPAIR_BUDGET_EXHAUSTED}) ⇒ NONE (fail-closed: the alternative is only triggered by ODG's own stop).",
  "R3: the task offers an INTERMEDIATE ORACLE (≥2 ordered per-file sub-problems, each with its own independent cases) ⇒ DECOMPOSED_INTERMEDIATE_VERIFICATION via odg-decomposed-execution with the SAME model and maxRepair as the default (only the strategy changes: per-file verification, verified files frozen and reused). Basis: V327 §3 — a whole-task verdict cannot localise which part is wrong.",
  "R4: otherwise, if the default was below the policy's max-local tier ⇒ LARGER_MODEL_REPAIR_DEPTH (qwen2.5-coder:7b, maxRepair 3 = NATIVE_MAX_THEN_ESCALATE) on the SAME architecture the default ran (only model + repair depth change).",
  "R5: otherwise ⇒ NO_ALTERNATIVE (local options exhausted) ⇒ evidence-gated escalation decision.",
  "INVARIANT: the alternative never repeats the default (model, maxRepair, strategy) — after NO_PROGRESS_IDENTICAL_REGENERATION an identical retry carries no information.",
]);

function selectAlternative(def: any, task: any, policy: any): any {
  const base = { stopReason: def ? def.stopReason : null };
  if (def && def.accepted === true) return Object.freeze({ ...base, strategy: "NONE", rule: "R0", reason: "default accepted by the independent verifier" });
  if (!def || def.executionStatus === "NOT_RUN") return Object.freeze({ ...base, strategy: "NOT_RUN", rule: "R1", reason: "default produced no sandbox verdict (NOT_RUN) — nothing to compare against" });
  if (!ODG_STOPS.includes(def.stopReason)) return Object.freeze({ ...base, strategy: "NONE", rule: "R2", reason: `no ODG stop recorded (repairStopReason=${def.stopReason}) — fail-closed` });
  const subs = task && task.oracle && Array.isArray(task.oracle.subproblems) ? task.oracle.subproblems : [];
  if (subs.length >= 2) return Object.freeze({ ...base, strategy: "DECOMPOSED_INTERMEDIATE_VERIFICATION", rule: "R3", model: policy.model, maxRepair: policy.maxRepair, reason: `ODG stop ${def.stopReason} on a whole-task verdict; the task offers ${subs.length} independently verifiable sub-problems ⇒ localise the failure (same model ${policy.model}, maxRepair ${policy.maxRepair})` });
  if (!(policy.model === MAX_LOCAL.model && policy.maxRepair >= MAX_LOCAL.maxRepair)) return Object.freeze({ ...base, strategy: "LARGER_MODEL_REPAIR_DEPTH", rule: "R4", model: MAX_LOCAL.model, maxRepair: MAX_LOCAL.maxRepair, reason: `ODG stop ${def.stopReason}; no intermediate oracle; default ${policy.model}/maxRepair ${policy.maxRepair} is below the policy's max-local tier ⇒ ${MAX_LOCAL.model}/maxRepair ${MAX_LOCAL.maxRepair} on the same architecture` });
  return Object.freeze({ ...base, strategy: "NO_ALTERNATIVE", rule: "R5", reason: "default already at the max-local tier and no intermediate oracle ⇒ local options exhausted" });
}

// ---- tasks (picked by evidence) -------------------------------------------------------------------------------------
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
// copied verbatim from runtime/bin/odg-v159-measured-policy-bench.ts (that script runs on require, so it cannot be imported)
const PARSE_RANGE = Object.freeze({
  id: "v159-implement-parse-range", type: "implement",
  role: "Implement a page-range parser.",
  contract: "module.exports = function parseRange(s) — s is a string like \"1-3,5,7-8\"; return the sorted array of UNIQUE integers it denotes (e.g. [1,2,3,5,7,8]); whitespace around parts is allowed; an empty string returns []; a reversed range (\"5-3\"), a non-integer part, or a negative number throws a RangeError.",
  test: (f: any) => typeof f === "function" && eq(f("1-3,5,7-8"), [1, 2, 3, 5, 7, 8]) && eq(f(" 2 , 1-2 "), [1, 2]) && eq(f(""), []) && eq(f("4"), [4]) && ["5-3", "a", "1-x", "-2", "1.5"].every((b) => { try { f(b); return false; } catch (e) { return e instanceof RangeError; } }),
  reference: "module.exports=function parseRange(s){if(s.trim()==='')return[];const out=new Set();for(const raw of s.split(',')){const p=raw.trim();let m;if(/^\\d+$/.test(p)){out.add(Number(p));}else if((m=p.match(/^(\\d+)\\s*-\\s*(\\d+)$/))){const a=Number(m[1]),b=Number(m[2]);if(a>b)throw new RangeError('reversed');for(let i=a;i<=b;i++)out.add(i);}else throw new RangeError('bad part '+p);}return [...out].sort((a,b)=>a-b);}",
  original: "module.exports = function parseRange(s) { return s.split(',').map(Number); }",
});
// the whole-task inputs of the selected hard tasks (the arguments their corpus `test` functions call the entry with)
const HARD_INPUTS: Record<string, string[]> = Object.freeze({
  "rle-codec": ["aaab", "abc", "wwwwwwwww"],
  "csv-typed-validator": ["1,2,3;4,x,6", "1,2;1,2,3", "1,2,3"],
  "range-clamp-pipeline": ["-5,50,150", "10,20", "0,100"],
}) as any;
const SELECTION_EVIDENCE: Record<string, string> = Object.freeze({
  "v159-implement-parse-range": "V159_MEASURED_MODEL_POLICY: qwen2.5-coder:3b FAILED 4/4 (BEFORE+AFTER); V155_OLLAMA_CAPABILITY_REGISTRY impl-ts-parse-range (same task, TS form): ALL three models 0/3 — the task every model failed",
  "rle-codec": "V159_NATIVE_BUILD_ISOLATION (3b, isolated, maxRepair 1): REJECT, repairStopReason REPAIR_BUDGET_EXHAUSTED (family B deep-logic)",
  "csv-typed-validator": "V159_NATIVE_BUILD_ISOLATION (3b, isolated, maxRepair 1): REJECT, repairStopReason REPAIR_BUDGET_EXHAUSTED (family D contracts)",
  "range-clamp-pipeline": "V159_NATIVE_BUILD_ISOLATION (3b, isolated, maxRepair 1): REJECT, repairStopReason REPAIR_BUDGET_EXHAUSTED (family D contracts)",
}) as any;
const isPrim = (v: any) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** loads trusted REFERENCE files (repo corpus code, never model output) with a recording require, so every module's
 *  observed (args → result) on the whole-task inputs becomes that module's intermediate oracle. */
function recordReferenceCalls(files: any[], entry: string, inputs: any[]): Record<string, any[]> {
  const calls: Record<string, any[]> = {}; const cache: Record<string, any> = {};
  const req = (spec: string): any => {
    const key = String(spec).replace(/^\.\//, "");
    if (cache[key]) return cache[key];
    const f = files.find((x: any) => x.path === key); if (!f) throw new Error("reference require of unknown module " + spec);
    const m: any = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("module", "exports", "require", f.ref)(m, m.exports, req);
    const inner = m.exports;
    const wrapped = (...args: any[]) => { const r = inner(...args); (calls[key] = calls[key] || []).push({ args: JSON.parse(JSON.stringify(args)), expect: JSON.parse(JSON.stringify(r)) }); return r; };
    cache[key] = wrapped; return wrapped;
  };
  const top = req(entry); for (const x of inputs) top(x);
  for (const k of Object.keys(calls)) { const seen = new Set<string>(); calls[k] = calls[k].filter((c: any) => { const j = JSON.stringify(c.args); if (seen.has(j)) return false; seen.add(j); return true; }); }
  return calls;
}

function hardTask(id: string): any {
  const t = HARD_TASKS.find((x: any) => x.id === id); if (!t) throw new Error("unknown hard task " + id);
  const arch = t.files.map((f: any) => ({ path: f.path, role: f.path.replace(/\.js$/, ""), contract: f.contract, dependsOn: f.dependsOn || [] }));
  const wholeTestSource = NBS.testSourceFromFn(t.test, "report.js", HARD_TEST_PRELUDE);
  const calls = recordReferenceCalls(t.files, "report.js", HARD_INPUTS[id]);
  const closure = (p: string, acc: Set<string> = new Set()): Set<string> => { const a = arch.find((x: any) => x.path === p); for (const d of (a ? a.dependsOn : [])) closure(d, acc); acc.add(p); return acc; };
  const subproblems = arch.filter((a: any) => Array.isArray(calls[a.path]) && calls[a.path].length > 0).map((a: any) => {
    const need = closure(a.path); const cases = calls[a.path];
    const spec: any = { name: `${id}/${a.path}`, entry: a.path, architecture: arch.filter((x: any) => need.has(x.path)), writeSet: arch.filter((x: any) => need.has(x.path)).map((x: any) => x.path), independentTestCases: cases.map((c: any) => ({ entry: a.path, args: c.args, expect: c.expect })) };
    // odg-repair-feedback compares with ===, so structured repair examples are only meaningful for primitive results
    if (cases.every((c: any) => isPrim(c.expect))) spec.repairExamples = cases.map((c: any) => ({ args: c.args, expect: c.expect }));
    return { id: a.path, spec };
  });
  return { id, type: "implement", family: t.family, selectedBecause: SELECTION_EVIDENCE[id],
    spec: { name: id, architecture: arch, writeSet: arch.map((a: any) => a.path), independentTestSource: wholeTestSource },
    wholeTestSource, entry: "report.js", reference: Object.fromEntries(t.files.map((f: any) => [f.path, f.ref])),
    oracle: { derivation: "per-module (args→result) recorded from the corpus REFERENCE implementation on the whole-task inputs (task-author oracle; never shown as code, BUT expected outputs on these inputs reach repair prompts via repairExamples — see honestLimits)", inputs: HARD_INPUTS[id], subproblems } };
}

function parseRangeTask(): any {
  const src = NBS.testSourceFromFn(PARSE_RANGE.test, "f.js", "var eq = " + String(eq) + ";");
  return { id: PARSE_RANGE.id, type: PARSE_RANGE.type, family: "implement (single file)", selectedBecause: SELECTION_EVIDENCE[PARSE_RANGE.id],
    spec: { name: PARSE_RANGE.id, architecture: [{ path: "f.js", role: PARSE_RANGE.role, contract: PARSE_RANGE.contract }], independentTestSource: src },
    wholeTestSource: src, entry: "f.js", reference: { "f.js": PARSE_RANGE.reference }, broken: { "f.js": PARSE_RANGE.original }, oracle: null };
}

function buildTasks(ids?: string[]): any[] {
  const all = [parseRangeTask(), ...Object.keys(HARD_INPUTS).map(hardTask)];
  return ids && ids.length ? all.filter((t) => ids.includes(t.id)) : all;
}

// ---- strategies -----------------------------------------------------------------------------------------------------
const load1 = (): number[] => os.loadavg().map((x: number) => Math.round(x * 100) / 100);

function defaultPolicy(task: any, ctx: any): any {
  const taskClass = IC.taskClassForMissionType(task.type);
  return ctx.measured !== undefined ? POL.chooseExecutionPolicy(task.type, [], { taskClass, measured: ctx.measured, now: ctx.now }) : POL.chooseExecutionPolicy(task.type, []);
}

async function runDefault(task: any, ctx: any): Promise<any> {
  let captured: any = null; const c0 = ctx.calls(); const t0 = Date.now(); const loadStart = load1();
  const bp = async (spec: any, d: any) => { const bo = await BUILDER.buildProject(spec, { ...d, ...ctx.sandboxDeps }); captured = { spec, bo }; return bo; };
  let cyc: any = null, err: string | null = null;
  try { cyc = await IC.runIntelligentCycle({ mission: { id: task.id, type: task.type, spec: task.spec }, history: [], generatorFor: ctx.generatorFor, deps: { buildProject: bp }, ...(ctx.measured !== undefined ? { measured: ctx.measured, now: ctx.now } : {}) }); }
  catch (e: any) { err = String((e && e.message) || e); }
  const bo = captured ? captured.bo : null;
  return {
    strategy: "DEFAULT_CALIBRATED_POLICY", caller: "odg-intelligent-native-cycle.runIntelligentCycle (measured overlay)",
    model: cyc && cyc.policy ? cyc.policy.model : null, maxRepair: cyc && cyc.policy ? cyc.policy.maxRepair : null, tier: cyc && cyc.policy ? cyc.policy.tier : null,
    plannerStrategy: DP.chooseStrategy(task.spec).strategy, architectureUsed: captured ? captured.spec.architecture.map((a: any) => a.path) : null,
    accepted: !!(cyc && cyc.accepted === true), executionStatus: bo ? bo.executionStatus : "NOT_RUN", executionMode: bo ? bo.executionMode : null,
    firstPassVerified: bo && bo.firstPass ? bo.firstPass.verified === true : null, repairs: bo ? bo.repairs : null,
    stopReason: bo ? bo.repairStopReason : null, stopDecidedBy: bo && ODG_STOPS.includes(bo.repairStopReason) ? "ODG (native-project-builder anti-loop / repair budget)" : null,
    verifyError: bo && bo.verifyError ? String(bo.verifyError).slice(0, 240) : null,
    cycleEscalationWithoutAlternative: cyc && cyc.escalation ? { escalate: cyc.escalation.escalate, delegationState: cyc.escalation.delegationState, note: "what the canonical cycle decides after the default ALONE (V159 behaviour); scenario J supersedes it with the post-alternative decision" } : null,
    modelCalls: ctx.calls() - c0, wallMs: Date.now() - t0, loadavgStart: loadStart, loadavgEnd: load1(), error: err,
  };
}

async function runDecomposedAlt(task: any, alt: any, ctx: any): Promise<any> {
  const c0 = ctx.calls(); const t0 = Date.now(); const loadStart = load1();
  const verified: Record<string, string> = {}; const subs: any[] = [];
  const gen0 = ctx.generatorFor(alt.model);
  // verified files of earlier sub-problems are FROZEN: returned as-is, no model call (compose on proven parts)
  const gen = async (f: any, bc: any) => (Object.prototype.hasOwnProperty.call(verified, f.path) ? { ok: true, content: verified[f.path] } : gen0(f, bc));
  const bp = async (spec: any, d: any) => {
    const bo = await BUILDER.buildProject(spec, { ...d, generateFile: gen, ...ctx.sandboxDeps });
    subs.push({ id: spec.entry, verified: bo.verified, repairs: bo.repairs, stopReason: bo.repairStopReason, executionStatus: bo.executionStatus, structuredRepairExamples: Array.isArray(spec.repairExamples), verifyError: bo.verifyError ? String(bo.verifyError).slice(0, 200) : null });
    if (bo.accepted === true && typeof bo.files[spec.entry] === "string") verified[spec.entry] = bo.files[spec.entry];
    return bo;
  };
  let dr: any = null, err: string | null = null;
  try { dr = await DECOMP.runDecomposed(task.oracle.subproblems, { generateFile: gen, maxRepair: alt.maxRepair, buildProject: bp }); } catch (e: any) { err = String((e && e.message) || e); }
  let whole: any = null;
  if (dr && dr.allVerified === true) {
    const r = NBS.runIsolated(verified, { kind: "source", source: task.wholeTestSource }, { runner: ctx.sandboxDeps.sandboxRunner });
    whole = { status: r.status, verified: r.status === "EXECUTED" ? r.verified === true : null, error: r.verifyError || r.buildError || r.reason || null };
  }
  const notRun = subs.some((s) => s.executionStatus === "NOT_RUN") || (whole && whole.status !== "EXECUTED");
  return {
    strategy: alt.strategy, executor: "odg-decomposed-execution.runDecomposed → native-project-builder.buildProject (per sub-problem, sandboxed)", model: alt.model, maxRepair: alt.maxRepair,
    accepted: !!(whole && whole.verified === true), executionStatus: notRun ? "NOT_RUN" : "EXECUTED",
    subproblems: subs, verifiedCount: dr ? dr.verifiedCount : null, total: dr ? dr.total : null, firstFailure: dr ? dr.firstFailure : null,
    wholeTaskTest: whole || { status: "NOT_EVALUATED", reason: "a required sub-problem failed — the chain stopped (localised failure)" },
    repairs: subs.reduce((a, s) => a + (Number(s.repairs) || 0), 0), modelCalls: ctx.calls() - c0, wallMs: Date.now() - t0, loadavgStart: loadStart, loadavgEnd: load1(), error: err,
  };
}

async function runLargerAlt(task: any, alt: any, def: any, ctx: any): Promise<any> {
  const c0 = ctx.calls(); const t0 = Date.now(); const loadStart = load1();
  const planned = DP.chooseStrategy(task.spec).architecture;   // the architecture the default ran (cycle's planner step)
  const arch = Array.isArray(def.architectureUsed) ? def.architectureUsed.map((p: string) => planned.find((a: any) => a.path === p)).filter(Boolean) : planned;
  const spec = { ...task.spec, architecture: arch, writeSet: arch.map((a: any) => a.path) };
  let bo: any = null, err: string | null = null;
  try { bo = await BUILDER.buildProject(spec, { generateFile: ctx.generatorFor(alt.model), maxRepair: alt.maxRepair, ...ctx.sandboxDeps }); } catch (e: any) { err = String((e && e.message) || e); }
  return {
    strategy: alt.strategy, executor: "native-project-builder.buildProject (sandboxed), policy max-local tier", model: alt.model, maxRepair: alt.maxRepair, architectureUsed: arch.map((a: any) => a.path),
    accepted: !!(bo && bo.accepted === true), executionStatus: bo ? bo.executionStatus : "NOT_RUN", firstPassVerified: bo && bo.firstPass ? bo.firstPass.verified === true : null,
    repairs: bo ? bo.repairs : null, stopReason: bo ? bo.repairStopReason : null, verifyError: bo && bo.verifyError ? String(bo.verifyError).slice(0, 240) : null,
    modelCalls: ctx.calls() - c0, wallMs: Date.now() - t0, loadavgStart: loadStart, loadavgEnd: load1(), error: err,
  };
}

/** one task × one trial: default → ODG stop → select → alternative → (both failed ⇒ evidence-gated escalation record). */
async function runTrial(task: any, trial: number, ctx: any): Promise<any> {
  const policy = defaultPolicy(task, ctx);
  const def = await runDefault(task, ctx);
  const selection = selectAlternative(def, task, policy);
  let alternative: any = null;
  if (selection.strategy === "DECOMPOSED_INTERMEDIATE_VERIFICATION") alternative = await runDecomposedAlt(task, selection, ctx);
  else if (selection.strategy === "LARGER_MODEL_REPAIR_DEPTH") alternative = await runLargerAlt(task, selection, def, ctx);
  let escalation: any;
  const measuredBoth = def.executionStatus === "EXECUTED" && (!alternative || alternative.executionStatus === "EXECUTED");
  if (def.accepted) escalation = { decided: false, reason: "default accepted" };
  else if (!measuredBoth || selection.strategy === "NOT_RUN") escalation = { decided: false, reason: "NOT_RUN — no verdict, no escalation (nothing measured)" };
  else {
    const e = ESC.decideEscalation({ task: { id: task.id, type: task.type }, policyResult: policy, localAttemptAccepted: !!(alternative && alternative.accepted) });
    escalation = { decided: true, escalate: e.escalate === true, attribution: e.attribution, delegationState: e.delegation ? e.delegation.state : null, delegationMissionId: e.delegation ? e.delegation.missionId : null, providerCalled: false, reason: e.reason };
  }
  return { task: task.id, trial, policy: { model: policy.model, maxRepair: policy.maxRepair, tier: policy.tier, escalateIfStillFails: policy.escalateIfStillFails, measuredDecision: policy.measured ? policy.measured.decision || policy.measured.status : null }, default: def, selection, alternative, escalation };
}

// ---- summary (re-derivable from rows) -------------------------------------------------------------------------------
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
function summarize(rows: any[]): any {
  const per: any = {};
  for (const id of [...new Set(rows.map((r) => r.task))]) {
    const ys = rows.filter((r) => r.task === id);
    const d = ys.map((r) => r.default).filter((x) => x.executionStatus === "EXECUTED");
    const a = ys.map((r) => r.alternative).filter((x) => x && x.executionStatus === "EXECUTED");
    per[id] = {
      n: ys.length, stops: ys.map((r) => r.default.stopReason), selected: [...new Set(ys.map((r) => r.selection.strategy))],
      default: { passes: d.filter((x) => x.accepted).length, measured: d.length, modelCallsMean: mean(d.map((x) => x.modelCalls)), repairsMean: mean(d.map((x) => Number(x.repairs) || 0)), wallMsMean: mean(d.map((x) => x.wallMs)) },
      alternative: { passes: a.filter((x) => x.accepted).length, measured: a.length, modelCallsMean: mean(a.map((x) => x.modelCalls)), repairsMean: mean(a.map((x) => Number(x.repairs) || 0)), wallMsMean: mean(a.map((x) => x.wallMs)) },
      escalationRecordsCreated: ys.filter((r) => r.escalation && r.escalation.escalate === true && r.escalation.delegationState === "CREATED").length,
      bothFailed: ys.filter((r) => !r.default.accepted && r.alternative && r.alternative.executionStatus === "EXECUTED" && !r.alternative.accepted).length,
    };
  }
  const D = rows.map((r) => r.default).filter((x) => x.executionStatus === "EXECUTED");
  const A = rows.map((r) => r.alternative).filter((x) => x && x.executionStatus === "EXECUTED");
  return { perTask: per, overall: { trials: rows.length, defaultPasses: D.filter((x) => x.accepted).length, defaultMeasured: D.length, alternativePasses: A.filter((x) => x.accepted).length, alternativeMeasured: A.length,
    odgStops: rows.filter((r) => ODG_STOPS.includes(r.default.stopReason)).length, escalationRecordsCreated: rows.filter((r) => r.escalation && r.escalation.escalate === true).length, providerCalls: 0 } };
}

// ---- live entry -----------------------------------------------------------------------------------------------------
async function live(argv: string[]): Promise<void> {
  const trials = Math.max(2, Number(argv[argv.indexOf("--trials") + 1]) || 2);
  const ids = argv.includes("--tasks") ? String(argv[argv.indexOf("--tasks") + 1]).split(",") : undefined;
  const startedAt = new Date().toISOString();
  const head = cp.execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  let requests = 0;
  const loopbackFetch = async (url: string, init: any): Promise<any> => {
    if (!String(url).startsWith(HOST + "/")) throw new Error("non-loopback URL refused: " + url);
    requests++;
    const body = init && typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (body) body.options = { ...(body.options || {}), seed: OPTIONS.seed, temperature: OPTIONS.temperature };
    return fetch(url, body ? { ...init, body: JSON.stringify(body) } : init);
  };
  const tasks = buildTasks(ids);
  // grader self-test: reference passes, broken fails (in the sandbox; fixed repo strings, not model code)
  const probe = NBS.probeSandbox();
  const graderSelfTest = probe.ok ? tasks.map((t) => {
    const ref = NBS.runIsolated(t.reference, { kind: "source", source: t.wholeTestSource });
    const broken = NBS.runIsolated(t.broken || { ...t.reference, [t.entry]: "module.exports = () => null;" }, { kind: "source", source: t.wholeTestSource });
    const subs = t.oracle ? t.oracle.subproblems.map((s: any) => { const files: any = {}; for (const a of s.spec.architecture) files[a.path] = t.reference[a.path]; const r = NBS.runIsolated(files, NBS.serializableTest(s.spec)); return { id: s.id, cases: s.spec.independentTestCases.length, referencePasses: r.verified === true }; }) : null;
    return { id: t.id, referencePasses: ref.verified === true, brokenFails: broken.status === "EXECUTED" && broken.verified !== true, subproblems: subs };
  }) : null;
  const tagsRes = await loopbackFetch(HOST + "/api/tags", { method: "GET" }).then((r: any) => r.json()).catch(() => null);
  const installed = tagsRes && Array.isArray(tagsRes.models) ? tagsRes.models.map((m: any) => m.name) : [];
  const versionRes = await loopbackFetch(HOST + "/api/version", { method: "GET" }).then((r: any) => r.json()).catch(() => null);
  requests = 0;
  const measured = POL.loadMeasuredRegistry();
  const ctx = { generatorFor: (model: string) => GEN.makeLocalGenerator({ model, host: HOST, timeoutMs: 300000, numPredict: OPTIONS.num_predict, temperature: OPTIONS.temperature }, loopbackFetch), calls: () => requests, sandboxDeps: {}, measured, now: Date.now() };
  const rows: any[] = [];
  const blocked = !probe.ok ? "sandbox unavailable: " + probe.reason : (!installed.includes(MAX_LOCAL.model) || !installed.includes(POL.MODEL.SMALL)) ? "required local models not installed / Ollama unreachable" : (graderSelfTest && !graderSelfTest.every((g: any) => g.referencePasses && g.brokenFails && (!g.subproblems || g.subproblems.every((s: any) => s.referencePasses)))) ? "grader self-test failed" : null;
  if (!blocked) for (const t of tasks) for (let k = 1; k <= trials; k++) {
    const row = await runTrial(t, k, ctx); rows.push(row);
    process.stderr.write(`${t.id} t${k}: default ${row.default.accepted ? "PASS" : "FAIL"} stop=${row.default.stopReason} → ${row.selection.strategy} ${row.alternative ? (row.alternative.accepted ? "PASS" : "FAIL") : "-"} esc=${row.escalation.escalate === true} load=${row.default.loadavgStart[0]}\n`);
  }
  const summary = summarize(rows);
  const out = buildEvidence({ startedAt, head, version: versionRes ? versionRes.version : "NOT_MEASURED", installed, measured, trials, tasks, graderSelfTest, rows, summary, blocked });
  const json = JSON.stringify(out, null, 2) + "\n";
  if (argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT_REL), json);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

function classify(rows: any[], blocked: string | null): string {
  if (blocked) return "NOT_MEASURABLE — " + blocked;
  if (!rows.length || rows.some((r) => r.default.executionStatus !== "EXECUTED" || (r.alternative && r.alternative.executionStatus !== "EXECUTED"))) return "NOT_MEASURABLE — at least one run produced no sandbox verdict";
  return "REAL — live local models (Ollama loopback), model code executed only in the bwrap native-build sandbox, ODG-decided stops, rule-selected alternatives executed and measured on the same tasks";
}

function buildEvidence(x: any): any {
  return {
    schema: "V161_SCENARIO_J_EVIDENCE", scenario: "J — Gestion d'échec (V15.0 §45)",
    ownerText: "ODG détecte une stratégie inefficace, arrête les tentatives répétitives, construit une alternative et mesure le résultat.",
    startedAt: x.startedAt, generatedAt: new Date().toISOString(), head: x.head, note_head: "HEAD of the worktree when measured (the runner lands in the PR commit that adds this file)",
    ollama: { version: x.version, endpoint: HOST + " (loopback only)", installed: x.installed }, options: OPTIONS, trialsPerTask: x.trials, parallelism: 1,
    host: { cpus: os.cpus().length, loadavgAtEnd: load1(), note: "SHARED host — a concurrent agent ran scenario F against the same Ollama; per-trial loadavg is recorded; wall time is confounded" },
    measuredRegistry: x.measured && x.measured.ok ? { source: x.measured.source, sha256: x.measured.sha256, generatedAt: x.measured.generatedAt } : { status: "NOT_MEASURED", reason: x.measured && x.measured.reason },
    odgStops: ODG_STOPS, alternativeRule: ALTERNATIVE_RULE, maxLocalTier: MAX_LOCAL,
    tasks: x.tasks.map((t: any) => ({ id: t.id, type: t.type, family: t.family, selectedBecause: t.selectedBecause, files: t.spec.architecture.map((a: any) => a.path), plannerStrategy: DP.chooseStrategy(t.spec).strategy,
      intermediateOracle: t.oracle ? { derivation: t.oracle.derivation, inputs: t.oracle.inputs, subproblems: t.oracle.subproblems.map((s: any) => ({ id: s.id, files: s.spec.architecture.map((a: any) => a.path), cases: s.spec.independentTestCases.length, structuredRepairExamples: Array.isArray(s.spec.repairExamples) })) } : null })),
    graderSelfTest: x.graderSelfTest, rows: x.rows, summary: x.summary, classification: classify(x.rows, x.blocked),
    honestLimits: [
      "ORACLE PARTLY VISIBLE (#925 inspection): for sub-problems with primitive results the per-module oracle (recorded on the SAME inputs the whole-task acceptance test uses) is passed as repairExamples; on repair, odg-repair-feedback writes 'calling … with (args) returned X but the expected result is Y' into the next prompt. This happened live (rle-codec encode.js, both trials). The default arm got only the generic hint ⇒ the comparison is NOT equal-information and the alternative partly saw expected outputs of acceptance inputs; no gain was claimed (0/8 vs 0/8).",
      "REPAIR_BUDGET_EXHAUSTED with maxRepair 1 means 'one repair attempted and failed', not a deep repair search.",
      "n is SMALL (4 tasks × " + x.trials + " trials); at temperature 0 + seed 42 trials of the same condition are near-deterministic, so trials are close to repeats, not independent samples — no statistical claim",
      "the DECOMPOSED alternative gets MORE verification signal than the default: per-module oracles recorded from the corpus reference implementation (task-author oracle). That extra signal IS the strategy's lever (intermediate verification) but it means the comparison is not equal-information",
      "odg-decomposed-execution threads bo.modules forward, which a SANDBOXED build never returns (model code is never loaded on the host) — the runner therefore freezes verified files through the generator seam; this gap in the canonical module is recorded, not fixed here",
      "odg-repair-feedback compares results with ===, so structured repair examples are only supplied for sub-problems whose results are primitives; others get the generic hint",
      "the LARGER_MODEL alternative reruns the SAME architecture the default ran (for parse-range: the decomposition-planner's generic META split, because the contract contains 'parse'), so model + repair depth are the only changes",
      "wall time is SECONDARY and confounded (shared host, concurrent Ollama workload, model load/eviction); compare strategies on pass rate",
      "escalation creates an in-memory sovereign-delegation record in CREATED state; NO provider was called; nothing was delegated or executed by a provider",
      "provider (Claude Code) wrote this runner and the task oracles; the stops, the selection, the builds and the verdicts are executed by ODG components",
      "VERIFIED in-repo ≠ DEPLOYED; no claim beyond these tasks",
    ],
  };
}

// ---- --check: re-derive summaries and selections from the committed rows -------------------------------------------
function check(): number {
  const ev = JSON.parse(fs.readFileSync(path.join(ROOT, OUT_REL), "utf8"));
  const problems: string[] = [];
  if (JSON.stringify(ev.alternativeRule) !== JSON.stringify(ALTERNATIVE_RULE)) problems.push("selection rule text drifted");
  if (JSON.stringify(summarize(ev.rows)) !== JSON.stringify(ev.summary)) problems.push("summary does not re-derive from rows");
  const tasks = buildTasks();
  for (const r of ev.rows) {
    const t = tasks.find((x) => x.id === r.task); if (!t) { problems.push("unknown task " + r.task); continue; }
    const s = selectAlternative(r.default, t, { model: r.policy.model, maxRepair: r.policy.maxRepair });
    if (s.strategy !== r.selection.strategy || s.rule !== r.selection.rule) problems.push(`selection for ${r.task} t${r.trial} does not re-derive (${s.strategy} vs ${r.selection.strategy})`);
    const bothFailed = !r.default.accepted && r.alternative && r.alternative.executionStatus === "EXECUTED" && !r.alternative.accepted;
    if (bothFailed !== (r.escalation.escalate === true) && r.policy.escalateIfStillFails === true) problems.push(`escalation for ${r.task} t${r.trial} inconsistent with both-fail`);
  }
  if (problems.length) { process.stdout.write("CHECK FAILED\n" + problems.join("\n") + "\n"); return 1; }
  process.stdout.write(`CHECK OK (${ev.rows.length} rows; ${ev.classification.split(" — ")[0]})\n`);
  return 0;
}

module.exports = { ODG_STOPS, ALTERNATIVE_RULE, MAX_LOCAL, selectAlternative, buildTasks, recordReferenceCalls, runTrial, runDefault, summarize, classify, check };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) process.exit(check());
  live(argv).then(() => process.exit(0)).catch((e) => { process.stderr.write("scenario J error: " + String((e && e.stack) || e) + "\n"); process.exit(1); });
}
export {};
