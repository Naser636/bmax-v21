#!/usr/bin/env node
"use strict";
/*
 * V17.8 P1 — MULTI-CANDIDATE GENERATION + EXECUTION-BASED SELECTION RUNNER (contract docs/odg/evidence/
 * V160_AP_WORK_ITEM_CONTRACTS.json#V178-P1; owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json — « la conversion
 * des propositions Radar en contrats »; Radar dossier docs/odg/evidence/V178_RADAR_CAMPAIGN.json proposal V178-P1).
 *
 * NO second engine. Generation = the native-design pipeline's guarded loopback transport (PIPE.makeGuard: exact
 * 127.0.0.1:11434 allow-list, call/wall caps, allowedCallOptions) + ADAPT-1 per-call timeouts + HOST-1 idle-host start;
 * candidates = PIPE.sampleCandidates (SAMPLE-1, pre-declared schedule); selection = PIPE.selectByExecution (XSEL-1) over results
 * EXECUTED in the bwrap sandbox by the V155 benchmark harness (B.compileCheck / B.hiddenTestProgram / provider-sandbox) on the
 * VISIBLE cases only (VIS-1); acceptance = the V155 host-graded full oracle B.gradeTrial on ALL cases (the same grader that
 * produced the 3/6 baseline). Task class `implement` of task set v2 (impl-chunk, impl-ts-parse-range), 3 trials each.
 *
 * MODES:
 *   <out>          NATIVE run (GO dispatch). Refused (exit 2) unless odg-authorization-scope derives RUN_CONTROLLED_EXPERIMENTS as
 *                  the current execution-authorized step of V178-P1 (owner record + committed independent inspection ACCEPT bound
 *                  to the contract sha) AND the contract budgets equal BUDGETS; <out> must be the declared writeSet (exit 3);
 *                  an existing record ⇒ ALREADY_RECORDED (exit 4). Writes ONLY <out>.
 *   --selftest     offline: fake transport behind the real guard + fake code runner; nothing written.
 */
const fs = require("fs");
const path = require("path");
const PIPE = require("../core/odg-native-design-pipeline.js");
const B = require("../core/odg-local-model-benchmark.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v178-p1-multi-candidate-run.ts";
const SCENARIO = "V178-P1";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const OUT = "docs/odg/evidence/V178_P1_MULTI_CANDIDATE_RESULT.json";
const INSPECTION = "docs/odg/evidence/V178_P1_CONTRACT_INSPECTION.json";
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

async function runP1(opts: any): Promise<any> {
  const root = opts.root || ROOT;
  const t0 = Date.now();
  const run = typeof opts.codeRunner === "function" ? opts.codeRunner : defaultRunner;
  const base: any = { schema: "odg-v178-p1-result/1", label: opts.label, scenario: SCENARIO, contractSha256: opts.contractSha256 || null, run: { head: PIPE.headOf(root), startedAt: new Date(t0).toISOString(), runner: SELF }, budgets: BUDGETS, thresholds: THRESHOLDS, rules: { sample: PIPE.SAMPLE_RULE, select: PIPE.XSEL_RULE, host: PIPE.HOST_RULE, adapt: PIPE.ADAPT_RULE } };
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
        return { ...c, codeSha256: code ? sha256(code) : null, codeLines: code ? code.split("\n").filter((l: string) => l.trim()).length : null, excludedReason, compileOk: v.compileOk, visibleMeasured: v.measured, caseResults: v.caseResults, visibleReason: v.reason || null };
      });
      const sel = PIPE.selectByExecution(cands, split.visible);
      const chosen = cands.find((c: any) => c.id === sel.chosen) || null;
      const hidden = chosen ? B.gradeTrial(task, chosen.text, { codeRunner: (p: string, n: string) => run(p, n) }) : null;
      const ctl = cands[0] && cands[0].ok ? B.gradeTrial(task, cands[0].text, { codeRunner: (p: string, n: string) => run(p, n) }) : null;   // control arm: the V155-comparable t0 candidate (no extra call)
      trials.push({ task: task.id, trial: k, split, candidates: cands.map(({ text, ...rest }: any) => rest), selection: sel,
        accepted: { candidate: sel.chosen, passed: !!(hidden && hidden.passed), measured: hidden ? hidden.measured !== false : false, reason: hidden ? hidden.reason : "no selectable candidate" },
        controlT0: ctl ? { passed: ctl.passed, measured: ctl.measured !== false, reason: ctl.reason } : null });
    }
  }
  const passes = trials.filter((t: any) => t.accepted.passed).length;
  const controlPasses = trials.filter((t: any) => t.controlT0 && t.controlT0.passed).length;
  const verdict = passes >= THRESHOLDS.passMinPasses ? "PASS" : "FAIL";
  return finish({ verdict, reason: `implement accepted (host-graded full oracle) ${passes}/${trials.length} vs baseline ${base.baseline.passes}/${base.baseline.n}; PASS ⇔ ≥ ${THRESHOLDS.passMinPasses}/${THRESHOLDS.n}${guard.st.capHit ? " (cap " + guard.st.capHit + ")" : ""}`,
    result: { passes, n: trials.length, passRate: trials.length ? passes / trials.length : null, controlT0: { passes: controlPasses, n: trials.length, note: "descriptive: the t0 candidate alone, same run (V155-comparable point); never the verdict" } },
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

module.exports = { runP1, gate, budgetsMatch, readContract, readInspection, visibleResults, fakeTransport, fakeRunner, IDLE, BUDGETS, THRESHOLDS, SCHEDULE, POINTS, SELF, SCENARIO, OUT, INSPECTION, STEP, BASELINE_SOURCE };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
