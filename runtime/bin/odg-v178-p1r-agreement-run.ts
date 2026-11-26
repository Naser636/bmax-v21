#!/usr/bin/env node
"use strict";
/*
 * V19 V178-P1-R — re-attempt of V178-P1 (CLOSED_FAIL 3/6, #1016/#1019) with ONE measured changed input (RB-REATTEMPT-CHANGED-INPUT):
 * the selection rule XSEL-2 (exact text: XSEL2_RULE, revision 2) = XSEL-1 ranking + execution-agreement tie-break over probes derived from VISIBLE args only
 * (runtime/core/odg-execution-agreement.ts, #1017, Radar C-03 CodeT). Same model, same pre-declared (temperature, seed) schedule,
 * same budgets (≤ 20 model calls), same full host-graded oracle, same threshold (PASS ⇔ ≥ 4/6). Candidate CODE is persisted
 * (P1 gap: only hashes were kept). Control arms (descriptive, never the verdict): t0 alone; XSEL-1's choice in this same run.
 * Fork of runtime/bin/odg-v178-p1-multi-candidate-run.ts (P1's runner is left untouched). Writes ONLY its declared OUT.
 *   npx tsx runtime/bin/odg-v178-p1r-agreement-run.ts docs/odg/evidence/V178_P1R_AGREEMENT_RESULT.json
 */
const fs = require("fs");
const path = require("path");
const PIPE = require("../core/odg-native-design-pipeline.js");
const AGREE = require("../core/odg-execution-agreement.js");   // XSEL-2 tie-break (#1017, Radar C-03)
const B = require("../core/odg-local-model-benchmark.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v178-p1r-agreement-run.ts";
const SCENARIO = "V178-P1-R";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const OUT = "docs/odg/evidence/V178_P1R_AGREEMENT_RESULT.json";
const INSPECTION = "docs/odg/evidence/V178_P1R_CONTRACT_INSPECTION.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const BASELINE_SOURCE = "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json";
const MODEL = "qwen2.5-coder:7b";
const pt = (temperature: number, seed: number) => Object.freeze({ model: MODEL, temperature, seed });
/* SAMPLE-1 schedule — PRE-REGISTERED. Trial k: the V155-comparable point (t0, seed 42) + 3 sampled points with trial-specific
 * seeds. The t0 point is identical in every trial (deterministic ⇒ sent once per task, reused: no budget spent). */
const SCHEDULE = Object.freeze([
  Object.freeze([pt(0, 42), pt(0.6, 1101), pt(0.8, 2101), pt(1.0, 3101)]),
  Object.freeze([pt(0, 42), pt(0.6, 1102), pt(0.8, 2102), pt(1.0, 3102)]),
  Object.freeze([pt(0, 42), pt(0.6, 1103), pt(0.8, 2103), pt(1.0, 3103)]),
]);
const POINTS = Object.freeze(SCHEDULE.flat().filter((p: any, i: number, a: any[]) => a.findIndex((q: any) => JSON.stringify(q) === JSON.stringify(p)) === i));
const BUDGETS = Object.freeze({
  model: MODEL, taskClass: "implement", taskSetFile: "runtime/core/odg-local-model-benchmark-tasks.v2.json", n: 4, trials: 3, schedule: SCHEDULE,
  numPredict: 512, maxModelCalls: 20, maxWarmupCalls: 1, warmupNumPredict: 16, warmupTimeoutMs: 180000, wallMs: 1800000,
  perCallTimeout: Object.freeze({ rule: "ADAPT-1", minMs: 60000, maxMs: 300000, safetyFactor: 3, overheadMs: 15000, charsPerToken: 3 }),
  hostIdleFactor: 0.75, seed: 42, temperature: 0,
});
const THRESHOLDS = Object.freeze({ baseline: { passes: 3, n: 6, source: BASELINE_SOURCE + "#registry.models[qwen2.5-coder:7b].perClass.implement.passRate" }, passMinPasses: 4, n: 6 });
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
const sha256 = PIPE.sha256;

function implementTasks(taskSet: any): any[] { return (taskSet && taskSet.ok ? taskSet.tasks : []).filter((t: any) => t.taskClass === BUDGETS.taskClass); }
function baselineOf(root: string): any {
  const r = readJson(path.join(root, BASELINE_SOURCE));
  const m = r && r.registry ? (r.registry.models || []).find((x: any) => x.id === MODEL) : null;
  const pr = m && m.perClass && m.perClass.implement ? m.perClass.implement.passRate : null;
  return pr ? { passes: pr.passes, n: pr.n, value: pr.value, source: THRESHOLDS.baseline.source } : null;
}
function defaultRunner(program: string): any { return B.defaultCodeRunner(program); }
/* visibleResults(task, code, run) — compile (strict TS / JS parse) + the VISIBLE cases executed in the sandbox; host grades
 * each visible case separately (B.gradeObservations on a one-case task). Hidden cases never enter this program. */
function visibleResults(task: any, code: string | null, run: any, visible: number[]): any {
  const cc = B.compileCheck(code, task.lang);
  if (cc.applicable === false) return { compileOk: false, measured: false, caseResults: {}, reason: cc.reason };
  if (!cc.ok) return { compileOk: false, measured: true, caseResults: {}, reason: cc.reason };
  const cases = visible.map((i) => task.cases[i]);
  const nonce = "ODG" + require("crypto").randomBytes(16).toString("hex") + ":";
  const r = run(B.hiddenTestProgram(cc.js, { ...task, cases }, nonce), nonce) || {};
  if (!r.ran) return { compileOk: true, measured: false, caseResults: {}, reason: r.reason || "sandbox unavailable" };
  const obs = r.exitOk ? B.parseResult(r.stdout, nonce) : null;
  const caseResults: any = {};
  visible.forEach((ci, k) => { caseResults[ci] = Array.isArray(obs) && obs.length === cases.length ? B.gradeObservations({ ...task, cases: [task.cases[ci]] }, [obs[k]]).pass === true : false; });
  return { compileOk: true, measured: true, caseResults };
}

/* probeSignatures(task, code, run, probes) — XSEL-2: run the candidate on probe inputs DERIVED from VISIBLE args only (no
 * expected values, hidden cases never consulted) and return one output signature per probe ("T" = threw, "V:<json>"). */
function probeSignatures(task: any, code: string | null, run: any, probes: any[][]): string[] | null {
  if (!probes.length) return [];
  const cc = B.compileCheck(code, task.lang); if (!cc.ok) return null;
  const nonce = "ODG" + require("crypto").randomBytes(16).toString("hex") + ":";
  const r = run(B.hiddenTestProgram(cc.js, { ...task, cases: probes.map((args: any[]) => ({ args, expect: null })) }, nonce), nonce) || {};
  if (!r.ran || !r.exitOk) return null;
  const obs = B.parseResult(r.stdout, nonce);
  if (!Array.isArray(obs) || obs.length !== probes.length) return null;
  return obs.map((o: any) => AGREE.outputSignature({ threw: !(o && o.ok === true), value: o && o.undef ? undefined : o && o.value }));
}

const XSEL2_RULE = "XSEL-2 (V19 P1-R, revision 2): X = XSEL-1 ranking over ALL candidates (TAMPER-1 excluded → visible passes desc → compileOk desc → codeLines asc → sha256 asc); M = the candidates tied at X's top visible-pass count; each member of M gets its signature vector over probes derived from VISIBLE args only (a member whose probe run is not measurable forms its OWN singleton cluster — never dropped); clusters by identical vector; if |M| ≤ 1, a single cluster (unanimous ⇒ no information) or a tie for the largest cluster ⇒ X's choice; else the strictly largest cluster wins and, within it, the member with the best X rank (candidate id / schedule position never decisive); hidden cases never consulted";

/* xsel2Choose(x1, sigById) — PURE XSEL-2 decision over an XSEL-1 result (ranking/reasons) and per-candidate probe signatures. */
function xsel2Choose(x1: any, sigById: Record<string, string[] | null>): any {
  const reasons = Array.isArray(x1 && x1.reasons) ? x1.reasons : [];
  if (!reasons.length) return { chosen: null, decidedBy: "none", visibleMax: [], clusters: [] };
  const top = reasons[0].visiblePassed;
  const M = reasons.filter((r: any) => r.visiblePassed === top).map((r: any) => r.id);
  const rank = (id: string) => x1.ranking.indexOf(id);
  const key = (id: string) => Array.isArray(sigById[id]) ? "S:" + (sigById[id] as string[]).join("|") : "NULL:" + id;
  const by = new Map<string, string[]>(); for (const id of M) { const k = key(id); if (!by.has(k)) by.set(k, []); (by.get(k) as string[]).push(id); }
  const clusters = [...by.entries()].map(([k, ids]) => ({ key: k.startsWith("NULL:") ? "NOT_MEASURED" : k.slice(2), members: ids.slice().sort((a, b) => rank(a) - rank(b)), size: ids.length }))
    .sort((a, b) => b.size - a.size || rank(a.members[0]) - rank(b.members[0]));
  if (M.length <= 1) return { chosen: x1.chosen, decidedBy: "xsel1(single visible-max)", visibleMax: M, clusters };
  if (clusters.length === 1) return { chosen: x1.chosen, decidedBy: "xsel1(unanimous agreement — no information)", visibleMax: M, clusters };
  if (clusters[0].size === clusters[1].size) return { chosen: x1.chosen, decidedBy: "xsel1(agreement tie)", visibleMax: M, clusters };
  return { chosen: clusters[0].members[0], decidedBy: "agreement", visibleMax: M, clusters };
}

/* selectXsel2(cands, split, task, run) — XSEL-1 over all candidates, then xsel2Choose with probe signatures for the visible-max set. */
function selectXsel2(cands: any[], split: any, task: any, run: any): any {
  const x1 = PIPE.selectByExecution(cands, split.visible);
  const probes = AGREE.deriveProbeInputs(split.visible.map((i: number) => task.cases[i].args));
  const top = x1.reasons && x1.reasons[0] ? x1.reasons[0].visiblePassed : null;
  const M = (x1.reasons || []).filter((r: any) => r.visiblePassed === top).map((r: any) => r.id);
  const sigById: Record<string, string[] | null> = {};
  for (const id of M) { const c = cands.find((x: any) => x.id === id); sigById[id] = c ? probeSignatures(task, c.code, run, probes) : null; }
  const d = xsel2Choose(x1, sigById);
  return { rule: XSEL2_RULE, chosen: d.chosen, decidedBy: d.decidedBy, xsel1Chosen: x1.chosen, xsel1Ranking: x1.ranking, visibleMax: d.visibleMax, probes: probes.length, clusters: d.clusters,
    unmeasuredSignatures: M.filter((id: string) => !Array.isArray(sigById[id])) };
}

async function runP1(opts: any): Promise<any> {
  const root = opts.root || ROOT;
  const t0 = Date.now();
  const run = typeof opts.codeRunner === "function" ? opts.codeRunner : defaultRunner;
  const base: any = { schema: "odg-v178-p1r-result/1", label: opts.label, scenario: SCENARIO, contractSha256: opts.contractSha256 || null, run: { head: PIPE.headOf(root), startedAt: new Date(t0).toISOString(), runner: SELF }, budgets: BUDGETS, thresholds: THRESHOLDS, rules: { sample: PIPE.SAMPLE_RULE, select: XSEL2_RULE, controlSelect: PIPE.XSEL_RULE, host: PIPE.HOST_RULE, adapt: PIPE.ADAPT_RULE } };
  const finish = (x: any) => ({ ...base, ...x, outcome: x.verdict, wallMs: Date.now() - t0 });
  const ts = B.loadTaskSet(path.join(root, BUDGETS.taskSetFile));
  const tasks = implementTasks(ts);
  base.taskSet = ts.ok ? { version: ts.version, sha256: ts.sha256, tasks: tasks.map((t: any) => ({ id: t.id, lang: t.lang, cases: t.cases.length, split: PIPE.visibleSplit(t.cases.length) })) } : { error: ts.reason };
  base.baseline = baselineOf(root);
  if (!tasks.length) return finish({ verdict: "NOT_MEASURED", reason: "no implement task in the task set" });
  if (!base.baseline) return finish({ verdict: "NOT_MEASURED", reason: "baseline record unreadable" });
  // sandbox probe BEFORE any model call: a trivial correct candidate must be graded measured+passed
  const probe = B.gradeTrial({ id: "probe-add", taskClass: "selftest", lang: "js", grader: "hidden-test", fnName: "add", cases: [{ args: [1, 2], expect: 3 }] }, "function add(a, b) { return a + b; }", { codeRunner: (p: string, n: string) => run(p, n) });
  base.sandboxProbe = { measured: probe.measured, passed: probe.passed, reason: probe.reason };
  if (!(probe.measured && probe.passed)) return finish({ verdict: "NOT_MEASURED", reason: "sandbox unavailable before the first model call: " + probe.reason });
  const guard = PIPE.makeGuard(opts.transport, { ...BUDGETS, allowedCallOptions: POINTS });
  const network = () => ({ modelCalls: guard.st.modelCalls, warmupCalls: guard.st.warmupCalls, refused: guard.st.refused, capHit: guard.st.capHit, providerCalls: 0, prompts: guard.st.prompts });
  const hostReadings: any[] = [];
  const readHost = (before: string) => { const h = { before, ...PIPE.hostLoad(BUDGETS.hostIdleFactor, opts.loadProbe) }; hostReadings.push(h); return h; };
  base.host = { rule: PIPE.HOST_RULE, readings: hostReadings };
  const h0 = readHost("W0 warm-up");
  if (h0.aboveThreshold) return finish({ verdict: "NOT_MEASURED", reason: `HOST-1: host busy at start — loadavg-1m ${h0.load1} > ${h0.threshold}; no model call made`, network: network() });
  const wg = await PIPE.ollamaGenerate(guard.fetchImpl, { model: MODEL, prompt: PIPE.WARMUP_PROMPT, timeoutMs: BUDGETS.warmupTimeoutMs, warmup: true });
  const rate = PIPE.measureRate(wg);
  base.warmup = { ok: wg.ok, ms: wg.ms, reason: wg.reason || null, rate };
  if (guard.st.refused.length) return finish({ verdict: "NOT_MEASURED", reason: "non-loopback request refused", network: network() });
  if (!rate) return finish({ verdict: "NOT_MEASURED", reason: "ADAPT-1: warm-up yielded no measurable rate", network: network() });
  const halt: any = { reason: null };
  const cache = new Map<string, any>();   // (task, point) at temperature 0 ⇒ deterministic ⇒ sent once, reused
  const calls: any[] = [];
  const generateFor = (task: any) => async (p: any): Promise<any> => {
    const key = JSON.stringify([task.id, p.model, p.temperature, p.seed]);
    if (p.temperature === 0 && cache.has(key)) return { ...cache.get(key), notSent: true };
    if (halt.reason) return { ok: false, reason: "run halted: " + halt.reason };
    const rec: any = { i: calls.length + 1, task: task.id, model: p.model, temperature: p.temperature, seed: p.seed, hostLoad: readHost(`${task.id} t${p.temperature} s${p.seed}`) };
    rec.timeout = PIPE.adaptiveTimeout({ promptChars: task.prompt.length, numPredict: BUDGETS.numPredict, rate, policy: BUDGETS.perCallTimeout });
    calls.push(rec);
    if (rec.timeout.predictedOverCap) {
      const why = `ADAPT-1: predicted ${rec.timeout.estimateMs} ms > cap ${BUDGETS.perCallTimeout.maxMs} ms — call not sent`;
      if (guard.st.modelCalls === 0) { halt.reason = why; rec.refused = why; return { ok: false, reason: why }; }   // NOT_MEASURED only before the first work call
      rec.refused = why + " — counted as a FAILED generation"; return { ok: false, reason: rec.refused };
    }
    const g = await PIPE.ollamaGenerate(guard.fetchImpl, { model: p.model, prompt: task.prompt, timeoutMs: rec.timeout.timeoutMs, callOptions: { temperature: p.temperature, seed: p.seed } });
    rec.ok = g.ok; rec.ms = g.ms; rec.reason = g.reason || null; rec.responseSha256 = g.ok ? sha256(g.response) : null; rec.timings = g.timings || null;
    const out = g.ok ? { ok: true, text: g.response } : { ok: false, reason: g.reason };
    if (g.ok && p.temperature === 0) cache.set(key, out);
    return out;
  };
  const trials: any[] = [];
  for (const task of tasks) {
    const split = PIPE.visibleSplit(task.cases.length);
    for (let k = 1; k <= BUDGETS.trials; k++) {
      const s = await PIPE.sampleCandidates({ points: POINTS }, { n: BUDGETS.n, schedule: SCHEDULE[k - 1], generate: generateFor(task) });
      if (!s.ok) return finish({ verdict: "NOT_MEASURED", reason: s.refused, network: network() });
      if (halt.reason) return finish({ verdict: "NOT_MEASURED", reason: halt.reason, calls, network: network() });
      const cands = s.candidates.map((c: any) => {
        if (!c.ok) return { ...c };
        const code = B.extractCode(c.text);
        const excludedReason = PIPE.tamperCheck(code);
        const v = excludedReason ? { compileOk: false, measured: true, caseResults: {} } : visibleResults(task, code, run, split.visible);
        return { ...c, code, codeSha256: code ? sha256(code) : null, codeLines: code ? code.split("\n").filter((l: string) => l.trim()).length : null, excludedReason, compileOk: v.compileOk, visibleMeasured: v.measured, caseResults: v.caseResults, visibleReason: v.reason || null };
      });
      const sel = selectXsel2(cands, split, task, run);
      const chosen = cands.find((c: any) => c.id === sel.chosen) || null;
      const hidden = chosen ? B.gradeTrial(task, chosen.text, { codeRunner: (p: string, n: string) => run(p, n) }) : null;
      const ctl = cands[0] && cands[0].ok ? B.gradeTrial(task, cands[0].text, { codeRunner: (p: string, n: string) => run(p, n) }) : null;   // control arm: the V155-comparable t0 candidate (no extra call)
      const x1c = cands.find((c: any) => c.id === sel.xsel1Chosen) || null;   // control arm 2: what XSEL-1 (P1's rule) would have chosen — descriptive
      const ctl1 = x1c ? (x1c.id === (chosen && chosen.id) ? hidden : B.gradeTrial(task, x1c.text, { codeRunner: (p: string, n: string) => run(p, n) })) : null;
      trials.push({ task: task.id, trial: k, split, candidates: cands.map(({ text, ...rest }: any) => rest), selection: sel,
        accepted: { candidate: sel.chosen, passed: !!(hidden && hidden.passed), measured: hidden ? hidden.measured !== false : false, reason: hidden ? hidden.reason : "no selectable candidate" },
        controlT0: ctl ? { passed: ctl.passed, measured: ctl.measured !== false, reason: ctl.reason } : null,
        controlXsel1: ctl1 ? { candidate: sel.xsel1Chosen, passed: ctl1.passed, measured: ctl1.measured !== false, reason: ctl1.reason } : null });
    }
  }
  const passes = trials.filter((t: any) => t.accepted.passed).length;
  const controlPasses = trials.filter((t: any) => t.controlT0 && t.controlT0.passed).length;
  const xsel1Passes = trials.filter((t: any) => t.controlXsel1 && t.controlXsel1.passed).length;
  const verdict = passes >= THRESHOLDS.passMinPasses ? "PASS" : "FAIL";
  return finish({ verdict, reason: `implement accepted (host-graded full oracle) ${passes}/${trials.length} vs baseline ${base.baseline.passes}/${base.baseline.n}; PASS ⇔ ≥ ${THRESHOLDS.passMinPasses}/${THRESHOLDS.n}${guard.st.capHit ? " (cap " + guard.st.capHit + ")" : ""}`,
    result: { passes, n: trials.length, passRate: trials.length ? passes / trials.length : null, controlT0: { passes: controlPasses, n: trials.length, note: "descriptive: the t0 candidate alone, same run (V155-comparable point); never the verdict" }, controlXsel1: { passes: xsel1Passes, n: trials.length, note: "descriptive: what P1's XSEL-1 would have chosen in this same run; never the verdict" } },
    trials, calls, network: network(), provenance: { actor: "ODG", providerCalls: 0, providerEditedGeneratedCode: false } });
}

/* ---------------- gate ---------------- */
const canon = AS.canon;
function budgetsMatch(contract: any): boolean { const d = contract && contract.WORK_ITEM_CONTRACT ? contract.WORK_ITEM_CONTRACT.budgets : null; return !!d && canon(d) === canon(BUDGETS) && canon(contract.WORK_ITEM_CONTRACT.preRegistration && contract.WORK_ITEM_CONTRACT.preRegistration.thresholds && contract.WORK_ITEM_CONTRACT.preRegistration.thresholds.declared) === canon(THRESHOLDS); }
function gate(contract: any, inspection: any, probes: any): any {
  if (!contract) return { ok: false, reason: `contract ${SCENARIO} not found` };
  if (!budgetsMatch(contract)) return { ok: false, reason: "contract budgets/thresholds ≠ runner BUDGETS/THRESHOLDS (pre-registration enforced)" };
  const sc = AS.deriveAuthorizationScope(contract, { inspection, probes });
  if (!sc.applicable) return { ok: false, reason: `authorization scope not applicable: ${sc.reason}` };
  if (sc.currentStep !== STEP || sc.executionAuthorized !== true) return { ok: false, reason: `current step ${sc.currentStep} not execution-authorized: ${sc.reason}` };
  const t = contract.authorization && contract.authorization.dispatchTargets ? contract.authorization.dispatchTargets[STEP] : null;
  if (!t || t.command !== SELF || JSON.stringify(t.args) !== JSON.stringify([OUT]) || JSON.stringify(t.writeSet) !== JSON.stringify([OUT])) return { ok: false, reason: "declared dispatch target is not this runner with args/writeSet [OUT]" };
  return { ok: true, contractSha256: sc.contractSha256 };
}
function readContract(root: string): any { const d = readJson(path.join(root, CONTRACTS)); return d ? (d.contracts || []).find((c: any) => c && c.scenario === SCENARIO) || null : null; }
function readInspection(root: string): any { const r = readJson(path.join(root, INSPECTION)); return r ? { ...r, recordPath: INSPECTION } : null; }

/* ---------------- fakes (test fixtures — NOT results) ---------------- */
const FAKE_TIMINGS = Object.freeze({ eval_count: 16, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 5e7, load_duration: 1e6, total_duration: 6e8 });
/* fakeTransport(answer(prompt, options) -> text) behind the real guard */
function fakeTransport(answer: any): any {
  const calls: any[] = [];
  const fake = async (_u: string, init: any) => { const b = JSON.parse(init.body); if (b.prompt === PIPE.WARMUP_PROMPT) return { ok: true, json: async () => ({ model: b.model, response: "ready", ...FAKE_TIMINGS }) }; calls.push({ model: b.model, ...b.options }); return { ok: true, json: async () => ({ model: b.model, ...FAKE_TIMINGS, response: answer(b.prompt, b.options) }) }; };
  return { fake, calls };
}
/* fakeRunner — executes the sandbox PROGRAM in a child node process (test-only stand-in for bwrap). */
function fakeRunner(program: string): any { const r = require("child_process").spawnSync(process.execPath, ["-"], { input: program, encoding: "utf8", timeout: 15000 }); return { ran: true, exitOk: r.status === 0, stdout: String(r.stdout || "") }; }
const IDLE = () => ({ loadavg: [0.1, 0.1, 0.1], nproc: 8 });

async function selftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const RIGHT_RANGE = "export function parseRange(spec: string): number[] {\n  const out = new Set<number>();\n  if (spec.trim() === \"\") return [];\n  for (const raw of spec.split(\",\")) {\n    const it = raw.trim();\n    const m = /^(\\d+)(?:-(\\d+))?$/.exec(it);\n    if (!m) throw new Error(\"malformed: \" + it);\n    const a = Number(m[1]); const b = m[2] === undefined ? a : Number(m[2]);\n    if (b < a) throw new Error(\"malformed: \" + it);\n    for (let i = a; i <= b; i++) out.add(i);\n  }\n  return [...out].sort((x, y) => x - y);\n}\n";
  const RIGHT_CHUNK = "function chunk(arr, size) {\n  if (!Number.isInteger(size) || size <= 0) throw new RangeError('size');\n  const out = [];\n  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));\n  return out;\n}\nmodule.exports = { chunk };\n";
  // t0 answers WRONG for parseRange (the V155 failure); sampled answers are right
  const T = fakeTransport((prompt: string, o: any) => /parseRange/.test(prompt) ? "```ts\n" + (o.temperature > 0 ? RIGHT_RANGE : "export function parseRange(spec: string): number[] { return []; }\n") + "```" : "```js\n" + RIGHT_CHUNK + "```");
  const r = await runP1({ root: ROOT, label: "SELFTEST", transport: T.fake, codeRunner: fakeRunner, loadProbe: IDLE });
  check("selftest: PASS 6/6 with sampled candidates; control t0 arm 3/6 (descriptive)", r.verdict === "PASS" && r.result.passes === 6 && r.result.controlT0.passes === 3);
  check("selftest: every call is a pre-declared point; t0 sent once per task; ≤ maxModelCalls", T.calls.every((c: any) => POINTS.some((p: any) => p.temperature === c.temperature && p.seed === c.seed)) && T.calls.filter((c: any) => c.temperature === 0).length === 2 && r.network.modelCalls <= BUDGETS.maxModelCalls);
  check("selftest: XSEL-2 recorded (rule + xsel1 control) and candidate CODE persisted", r.trials.every((t: any) => /XSEL-2/.test(t.selection.rule) && "xsel1Chosen" in t.selection && t.controlXsel1) && r.trials.every((t: any) => t.candidates.every((c: any) => !c.ok || typeof c.code === "string")) && typeof r.result.controlXsel1.passes === "number");
  // ---- XSEL-2 regressions (inspection REJECT B1) — pure decision over XSEL-1 ----
  const X = (ranking: string[], vp: Record<string, number>) => ({ chosen: ranking[0], ranking, reasons: ranking.map((id, k) => ({ rank: k + 1, id, visiblePassed: vp[id] })) });
  { const d = xsel2Choose(X(["C2", "C1", "C3", "C4"], { C2: 3, C1: 2, C3: 2, C4: 2 }), { C2: null, C1: ["V:1"], C3: ["V:1"], C4: ["V:1"] });
    check("XSEL-2: a lower-visible candidate never beats the unique visible-max one (unmeasured signature ⇒ XSEL-1 choice)", d.chosen === "C2"); }
  { const d = xsel2Choose(X(["C2", "C1", "C3", "C4"], { C2: 3, C1: 3, C3: 3, C4: 3 }), { C2: null, C1: ["V:1"], C3: ["V:1"], C4: ["V:2"] });
    check("XSEL-2: an unmeasurable member is kept as its own singleton cluster (not dropped); largest cluster {C1,C3} wins", d.chosen === "C1" && d.clusters.some((c: any) => c.key === "NOT_MEASURED" && c.members[0] === "C2")); }
  { const d = xsel2Choose(X(["C3", "C1", "C2"], { C3: 3, C1: 3, C2: 3 }), { C3: ["V:1"], C1: ["V:1"], C2: ["V:1"] });
    check("XSEL-2: unanimous agreement carries no information ⇒ XSEL-1 choice (C3, not lowest id C1)", d.chosen === "C3" && /unanimous/.test(d.decidedBy)); }
  { const d = xsel2Choose(X(["C4", "C2", "C1"], { C4: 3, C2: 3, C1: 3 }), { C4: ["T"], C2: ["V:[]"], C1: ["V:[]"] });
    check("XSEL-2: within the winning cluster the best XSEL-1 rank decides (C2 ranked above C1), never the id", d.chosen === "C2" && d.decidedBy === "agreement"); }
  { const d = xsel2Choose(X(["C1", "C2", "C3", "C4"], { C1: 3, C2: 3, C3: 3, C4: 3 }), { C1: ["A"], C2: ["A"], C3: ["B"], C4: ["B"] });
    check("XSEL-2: a tie for the largest cluster ⇒ XSEL-1 choice", d.chosen === "C1" && /tie/.test(d.decidedBy)); }
  { // hidden-case invariance: changing ONLY hidden cases' expectations never changes the XSEL-2 choice
    const ts = B.loadTaskSet(path.join(ROOT, BUDGETS.taskSetFile)); const task = implementTasks(ts).find((t: any) => t.id === "impl-ts-parse-range");
    if (task) { const split = PIPE.visibleSplit(task.cases.length); const codes = [RIGHT_RANGE, "export function parseRange(spec: string): number[] { if (spec === '') return [0]; return " + JSON.stringify([1]) + "; }"];
      const mk = (tk: any) => codes.map((code: string, k: number) => { const v = visibleResults(tk, code, fakeRunner, split.visible); return { id: "C" + (k + 1), ok: true, code, text: code, sha256: sha256(code), codeLines: code.split("\n").length, excludedReason: null, compileOk: v.compileOk, caseResults: v.caseResults }; });
      const t2 = { ...task, cases: task.cases.map((c: any, i: number) => split.visible.includes(i) ? c : { ...c, expect: "__CHANGED_HIDDEN__" }) };
      const s1 = selectXsel2(mk(task), split, task, fakeRunner), s2 = selectXsel2(mk(t2), split, t2, fakeRunner);
      check("XSEL-2: hidden-case invariance — altering only hidden expectations leaves the choice and clusters unchanged", s1.chosen === s2.chosen && JSON.stringify(s1.clusters) === JSON.stringify(s2.clusters)); } }
  return f;
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--selftest") return (await selftest()) === 0 ? 0 : 1;
  const out = argv[0];
  if (out !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — one execution only\n`); return 4; }
  const c = readContract(ROOT);
  const g = gate(c, readInspection(ROOT), OCUR.localGitProbes(ROOT));
  if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const r = await runP1({ root: ROOT, label: "NATIVE (ODG GO dispatch)", transport: require("./odg-v161-scenario-f-run.js").loopbackFetch, contractSha256: g.contractSha256 });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`NATIVE verdict ${r.verdict} → ${OUT}\n`);
  return r.verdict === "PASS" ? 0 : 1;
}

module.exports = { xsel2Choose, selectXsel2, XSEL2_RULE, runP1, gate, budgetsMatch, readContract, readInspection, visibleResults, fakeTransport, fakeRunner, IDLE, BUDGETS, THRESHOLDS, SCHEDULE, POINTS, SELF, SCENARIO, OUT, INSPECTION, STEP, BASELINE_SOURCE };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
