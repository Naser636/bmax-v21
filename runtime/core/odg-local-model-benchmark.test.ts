#!/usr/bin/env node
"use strict";
/* V155 Step 5 — measured local-model capability registry. ZERO network / ZERO model / ZERO sandbox process: every transport,
 * the code runner, the /proc sampler and the clock are injected fakes. Covers: provider measurement surface
 * (ollama-provider), the versioned task set + objective graders (odg-local-model-benchmark), registry aggregation +
 * history/demotion (odg-local-model-capability), measured selection + fallback (odg-model-router). */
const { EventEmitter } = require("events");
const O = require("./ollama-provider.js");
const B = require("./odg-local-model-benchmark.js");
const CAP = require("./odg-local-model-capability.js");
const R = require("./odg-model-router.js");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// a fake http.request that replays NDJSON chunks; clock advances 10ms per chunk.
function fakeRequest(chunks: string[], statusCode = 200, clock?: any): any {
  return (_opts: any, cb: any) => {
    const req: any = new EventEmitter();
    req.setTimeout = () => req; req.write = () => true; req.destroy = () => {};
    req.end = () => { const res: any = new EventEmitter(); res.statusCode = statusCode; cb(res); setImmediate(() => { for (const c of chunks) { if (clock) clock.t += 10; res.emit("data", Buffer.from(c)); } res.emit("end"); }); };
    return req;
  };
}

const TAGS = { ok: true, json: { models: [
  { name: "big:7b", digest: "d7", size: 4683087561, details: { format: "gguf", family: "qwen2", parameter_size: "7.6B", quantization_level: "Q4_K_M", context_length: 32768 } },
  { name: "small:3b", digest: "d3", size: 1929912626, details: { format: "gguf", family: "qwen2", parameter_size: "3.1B", quantization_level: "Q4_K_M" } },
] } };

async function providerTests(): Promise<void> {
  const lm = await O.listModels({ get: async () => TAGS });
  check("listModels maps id/digest/size/quantization/parameterSize/contextLength", lm.ok && lm.models[0].id === "big:7b" && lm.models[0].digest === "d7" && lm.models[0].sizeBytes === 4683087561 && lm.models[0].quantization === "Q4_K_M" && lm.models[0].parameterSize === "7.6B" && lm.models[0].contextLength === 32768);
  check("listModels: a missing field stays null (never invented)", lm.models[1].contextLength === null);
  const down = await O.listModels({ get: async () => ({ ok: false, reason: "ECONNREFUSED" }) });
  check("listModels: daemon down ⇒ ok:false, no models (fail-closed)", down.ok === false && down.models.length === 0);
  const v = await O.ollamaVersion({ get: async () => ({ ok: true, json: { version: "0.35.1" } }) });
  check("ollamaVersion reads /api/version", v.ok && v.version === "0.35.1");
  const sh = await O.showModel("big:7b", { post: async (p: string, body: any) => ({ ok: true, status: 200, json: { details: { quantization_level: "Q4_K_M", parameter_size: "7.6B" }, model_info: { "general.parameter_count": 7615616512, "qwen2.context_length": 32768 }, _p: p, _b: body } }) });
  check("showModel reads <arch>.context_length + parameter_count from model_info", sh.ok && sh.contextLength === 32768 && sh.parameterCount === 7615616512 && sh.details.quantization === "Q4_K_M");
  const sh404 = await O.showModel("nope", { post: async () => ({ ok: true, status: 404, json: { error: "model 'nope' not found" } }) });
  check("showModel: HTTP 404 ⇒ ok:false with the daemon error", sh404.ok === false && /404/.test(sh404.reason) && /not found/.test(sh404.reason));

  // streamed generation: real TTFT = time of the first NON-EMPTY token (injected clock)
  const clock = { t: 0 };
  const lines = ['{"response":"","done":false}\n', '{"response":"Hel","done":false}\n', '{"response":"lo","done":false}\n', '{"response":"","done":true,"done_reason":"stop","eval_count":20,"eval_duration":2000000000,"prompt_eval_count":30,"load_duration":5000000,"total_duration":2500000000}\n'];
  const st = await O.loopbackStream("/api/generate", {}, { request: fakeRequest(lines, 200, clock), now: () => clock.t });
  check("loopbackStream: concatenates tokens, TTFT at the 2nd chunk (first non-empty), total at end", st.ok && st.text === "Hello" && st.ttftMs === 20 && st.totalMs === 40 && st.final.eval_count === 20);
  const st404 = await O.loopbackStream("/api/generate", {}, { request: fakeRequest(['{"error":"model not found"}'], 404) });
  check("loopbackStream: non-200 ⇒ ok:false 'HTTP 404'", st404.ok === false && /HTTP 404/.test(st404.reason));
  const stNoDone = await O.loopbackStream("/api/generate", {}, { request: fakeRequest(['{"response":"x"}\n']) });
  check("loopbackStream: stream without a done record ⇒ ok:false (never a partial success)", stNoDone.ok === false);

  const gm = await O.generateMeasured({ model: "big:7b", prompt: "p", options: { temperature: 0, seed: 42 }, stream: async (_p: string, payload: any) => ({ ok: true, text: "out", ttftMs: 120, totalMs: 900, final: { eval_count: 20, eval_duration: 2e9, prompt_eval_count: 30, load_duration: 1e6, total_duration: 9e8, done_reason: "stop", _payload: payload } }) });
  check("generateMeasured: tok/s = eval_count/eval_duration (daemon counters) = 10", gm.ok && gm.tokPerSec === 10 && gm.ttftMs === 120 && gm.totalMs === 900 && gm.evalCount === 20 && gm.doneReason === "stop");
  check("generateMeasured: options echoed back verbatim (recorded)", gm.options.temperature === 0 && gm.options.seed === 42);
  let sentPayload: any = null;
  await O.generateMeasured({ model: "m", prompt: "p", options: { temperature: 0 }, keepAlive: "10m", stream: async (_p: string, payload: any) => { sentPayload = payload; return { ok: true, text: "", final: {} }; } });
  check("generateMeasured: streams + passes keep_alive", sentPayload.stream === true && sentPayload.keep_alive === "10m");
  const gmMiss = await O.generateMeasured({ model: "absent:1b", prompt: "p", stream: async () => ({ ok: false, reason: 'HTTP 404: {"error":"model \'absent:1b\' not found"}' }) });
  check("generateMeasured: missing model ⇒ unavailable:true", gmMiss.ok === false && gmMiss.unavailable === true);
  const gmDown = await O.generateMeasured({ model: "m", prompt: "p", stream: async () => ({ ok: false, reason: "loopback request error: connect ECONNREFUSED 127.0.0.1:11434" }) });
  check("generateMeasured: Ollama down ⇒ unavailable:true", gmDown.ok === false && gmDown.unavailable === true);
  const gmTo = await O.generateMeasured({ model: "m", prompt: "p", stream: async () => ({ ok: false, reason: "generation timed out", timedOut: true }) });
  check("generateMeasured: timeout ⇒ timedOut:true, not unavailable", gmTo.ok === false && gmTo.timedOut === true && gmTo.unavailable === false);
  check("generateMeasured: no counters ⇒ tokPerSec null (NOT_MEASURED, never guessed)", (await O.generateMeasured({ model: "m", prompt: "p", stream: async () => ({ ok: true, text: "x", final: {} }) })).tokPerSec === null);
  check("loopback host stays hardcoded 127.0.0.1:11434", O.OLLAMA_HOST === "127.0.0.1" && O.OLLAMA_PORT === 11434);
}

function taskSetAndGraderTests(): void {
  const ts = B.loadTaskSet();
  check("task set loads: versioned, sha256-pinned, ≥8 tasks", ts.ok && ts.version === "V155-TASKSET-1" && /^[0-9a-f]{64}$/.test(ts.sha256) && ts.tasks.length >= 8);
  const classes = new Set(ts.tasks.map((t: any) => t.taskClass));
  check("task set covers implement/bugfix/repair/extract/strict-contract/refactor/test-writing/judgment", ["implement", "bugfix", "repair", "extract", "strict-contract", "refactor", "test-writing", "judgment"].every((c) => classes.has(c)));
  check("validateTaskSet rejects an unknown grader", B.validateTaskSet({ version: "x", tasks: [{ id: "a", taskClass: "c", prompt: "p", grader: "vibes" }] }).ok === false);
  check("validateTaskSet rejects duplicate ids", B.validateTaskSet({ version: "x", tasks: [{ id: "a", taskClass: "c", prompt: "p", grader: "json-field", field: "f", expectedValue: 1 }, { id: "a", taskClass: "c", prompt: "p", grader: "json-field", field: "f", expectedValue: 1 }] }).ok === false);
  check("default options: temperature 0 + fixed seed", B.DEFAULT_OPTIONS.temperature === 0 && B.DEFAULT_OPTIONS.seed === 42);
  const T = (id: string) => ts.tasks.find((t: any) => t.id === id);

  check("extractCode prefers the first fenced block", B.extractCode("text\n```js\nconst a = 1;\n```\nmore") === "const a = 1;");
  check("compileCheck JS: syntax error ⇒ ok:false (parse only)", B.compileCheck("function (", "js").ok === false);
  check("compileCheck JS: valid ⇒ ok:true", B.compileCheck("function f(a){ return a; }", "js").ok === true);
  check("compileCheck TS: implicit any ⇒ ok:false (real type check)", B.compileCheck("export function f(a) { return a; }", "ts").ok === false);
  const tsOk = B.compileCheck("export function f(a: number): number { return a + 1; }", "ts");
  check("compileCheck TS: typed ⇒ ok:true + transpiled CJS", tsOk.ok === true && /exports\.f/.test(tsOk.js));

  const passRunner = () => ({ ran: true, result: { pass: true } });
  const failRunner = () => ({ ran: true, result: { pass: false, error: "AssertionError" } });
  const noSandbox = () => ({ ran: false, reason: "sandbox unavailable" });
  const goodMedian = "function median(xs){ if(!xs.length) return null; const s=[...xs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }";
  check("hidden-test grader: runner pass ⇒ passed + compiled", (() => { const g = B.gradeTrial(T("bugfix-median"), goodMedian, { codeRunner: passRunner }); return g.passed && g.compile.ok && g.measured; })());
  check("hidden-test grader: runner fail ⇒ not passed", B.gradeTrial(T("bugfix-median"), goodMedian, { codeRunner: failRunner }).passed === false);
  check("hidden-test grader: no sandbox ⇒ measured:false (NOT_MEASURED, never a pass)", (() => { const g = B.gradeTrial(T("bugfix-median"), goodMedian, { codeRunner: noSandbox }); return g.measured === false && g.passed === false; })());
  check("hidden-test grader: uncompilable output never reaches the runner", (() => { let called = false; const g = B.gradeTrial(T("bugfix-median"), "function median(", { codeRunner: () => { called = true; return { ran: true, result: { pass: true } }; } }); return !called && g.passed === false && g.compile.ok === false; })());
  check("refactor grader: a remaining for-loop ⇒ fail even if tests would pass", B.gradeTrial(T("refactor-even-squares"), "function sumEvenSquares(n){ let s=0; for (const x of n) if (x%2===0) s+=x*x; return s; }", { codeRunner: passRunner }).passed === false);
  const prog = B.hiddenTestProgram("function median(x){return 1}", T("bugfix-median"));
  check("hidden-test program embeds the hidden test in its own scope + a result marker", prog.includes(T("bugfix-median").hiddenTest) && prog.includes("__ODG_RESULT__") && prog.includes("(require('assert'), __odgFn)"));
  // test-writing: reference must pass with ≥ minAssertions AND every mutant must fail
  let call = 0;
  const twRunner = (p: string) => { call++; return p.startsWith(T("write-tests-slugify").referenceImpl) ? { ran: true, result: { pass: true, assertions: 5 } } : { ran: true, result: { pass: false } }; };
  check("test-writing grader: reference passes + all mutants killed ⇒ pass", (() => { const g = B.gradeTrial(T("write-tests-slugify"), "assert.ok(1)", { codeRunner: twRunner }); return g.passed && g.mutantsKilled === g.mutantsTotal && call === 1 + T("write-tests-slugify").mutants.length; })());
  check("test-writing grader: a surviving mutant ⇒ fail", B.gradeTrial(T("write-tests-slugify"), "assert.ok(1)", { codeRunner: () => ({ ran: true, result: { pass: true, assertions: 5 } }) }).passed === false);
  check("test-writing grader: too few assertions ⇒ fail", B.gradeTrial(T("write-tests-slugify"), "assert.ok(1)", { codeRunner: () => ({ ran: true, result: { pass: true, assertions: 1 } }) }).passed === false);

  const exp = T("strict-status-contract").expected;
  const strictGood = B.gradeTrial(T("strict-status-contract"), JSON.stringify(exp));
  check("strict-schema: bare exact JSON ⇒ adherent + passed", strictGood.passed && strictGood.strict.ok && strictGood.structured.ok);
  const strictFenced = B.gradeTrial(T("strict-status-contract"), "```json\n" + JSON.stringify(exp) + "\n```");
  check("strict-schema: fenced JSON ⇒ structured but NOT contract-adherent", strictFenced.structured.ok === true && strictFenced.strict.ok === false && strictFenced.passed === false);
  check("strict-schema: an extra key ⇒ not adherent", B.gradeTrial(T("strict-status-contract"), JSON.stringify({ ...exp, note: "x" })).strict.ok === false);
  check("strict-schema: adherent but wrong values ⇒ adherent, not passed", (() => { const g = B.gradeTrial(T("strict-status-contract"), JSON.stringify({ ...exp, failing: 3 })); return g.strict.ok && !g.passed; })());
  check("json-equal: fenced exact match passes (key order ignored)", B.gradeTrial(T("extract-invoice"), "```json\n" + JSON.stringify({ due: "2026-12-15", currency: "EUR", total: 1250.5, vendor: "ACME SARL", invoice: "INV-2041" }) + "\n```").passed === true);
  check("json-equal: total as a string ⇒ fail", B.gradeTrial(T("extract-invoice"), JSON.stringify({ ...T("extract-invoice").expected, total: "1250.50" })).passed === false);
  check("json-field: DROP TABLE judged LOW ⇒ fail", B.gradeTrial(T("judgment-risk-drop-table"), '{"risk":"LOW","reason":"x"}').passed === false);
  check("json grader: prose only ⇒ structured:false", B.gradeTrial(T("judgment-risk-drop-table"), "It is high risk.").structured.ok === false);
}

function samplerTest(): void {
  const clock = { t: 0 }; let ticks = 100;
  const files: any = () => ({ "/p/42/cmdline": "/usr/local/bin/ollama\0runner\0--model\0x", "/p/42/stat": `42 (ollama) S 1 ${"0 ".repeat(9)}${ticks} 0 0 0`, "/p/42/status": "Name: ollama\nVmRSS:\t  524288 kB\n", "/p/7/cmdline": "bash" });
  const s = B.createProcSampler({ procRoot: "/p", readdir: () => ["42", "7", "self"], readFile: (f: string) => { const v = files()[f]; if (v === undefined) throw new Error("ENOENT"); return v; }, now: () => clock.t, clkTck: 100, intervalMs: 100000 });
  s.start(); clock.t += 1000; ticks += 400; const r = s.stop();
  check("proc sampler: 400 ticks over 1s at CLK_TCK 100 ⇒ 400% CPU (multi-core), RSS 512MB, runner pid only", r.cpuAvgPct === 400 && r.rssPeakMb === 512 && r.pids.length === 1 && r.pids[0] === "42");
  const none = B.createProcSampler({ procRoot: "/p", readdir: () => ["7"], readFile: () => "bash", intervalMs: 100000 });
  none.start(); const rn = none.stop();
  check("proc sampler: no runner process ⇒ nulls (NOT_MEASURED, never 0)", rn.cpuAvgPct === null && rn.rssPeakMb === null && rn.samples === 0);
}

async function runBenchmarkTest(): Promise<any> {
  const ts = B.loadTaskSet();
  const events: string[] = [];
  // big:7b passes everything except judgment; small:3b passes only JSON tasks. Fake outputs keyed on prompt.
  const good: any = {};
  for (const t of ts.tasks) {
    if (t.grader === "json-equal" || t.grader === "strict-schema") good[t.id] = JSON.stringify(t.expected);
    else if (t.grader === "json-field") good[t.id] = JSON.stringify({ [t.field]: t.expectedValue, reason: "r" });
    else good[t.id] = t.lang === "ts" ? "export function " + t.fnName + "(a: string): string { return a; }" : "function " + (t.fnName || "f") + "(a){ return a; }";
  }
  const byPrompt = new Map(ts.tasks.map((t: any) => [t.prompt, t]));
  const provider = {
    ollamaVersion: async () => ({ ok: true, version: "0.35.1" }),
    listModels: async () => O.listModels({ get: async () => TAGS }),
    showModel: async (m: string) => ({ ok: true, contextLength: 32768, parameterCount: m === "big:7b" ? 7.6e9 : 3.1e9, details: { quantization: "Q4_K_M", parameterSize: m === "big:7b" ? "7.6B" : "3.1B" } }),
    unloadModel: async (m: string) => { events.push("unload:" + m); return { ok: true }; },
    generateMeasured: async (input: any) => {
      events.push("gen:" + input.model);
      const t: any = byPrompt.get(input.prompt);
      const text = !t ? "OK" : input.model === "small:3b" && !["json-equal", "strict-schema", "json-field"].includes(t.grader) ? "not code (" : (t.taskClass === "judgment" && input.model === "big:7b" ? '{"risk":"WRONG"}' : good[t.id]);
      return { ok: true, model: input.model, text, ttftMs: input.model === "big:7b" ? 400 : 100, totalMs: input.model === "big:7b" ? 4000 : 1000, tokPerSec: input.model === "big:7b" ? 8 : 16, evalCount: 30, loadDurationNs: 1e6, doneReason: "stop", options: input.options };
    },
  };
  const run = await B.runBenchmark({ models: ["big:7b", "small:3b", "absent:1b"], taskSet: ts, trials: 3, provider, codeRunner: (p: string) => ({ ran: true, result: { pass: p.includes("__odgFn") || p.startsWith(ts.tasks.find((t: any) => t.grader === "test-writing").referenceImpl), assertions: 5 } }), samplerFactory: () => ({ start() {}, stop() { return { cpuAvgPct: 350, cpuPeakPct: 600, rssPeakMb: 900, samples: 4, pids: ["1"] }; } }), loadavg: () => 1.5 });
  check("runBenchmark: trials = 2 available models × tasks × 3", run.ok && run.trials.length === 2 * ts.tasks.length * 3);
  check("runBenchmark: absent model ⇒ available:false, ZERO trials (UNAVAILABLE, nothing fabricated)", run.models.find((m: any) => m.id === "absent:1b").available === false && run.trials.every((t: any) => t.model !== "absent:1b"));
  const firstSmall = events.indexOf("gen:small:3b"); const unloadBig = events.indexOf("unload:big:7b");
  check("runBenchmark: ONE model at a time (big unloaded before small's first generation)", unloadBig >= 0 && firstSmall > unloadBig && events.slice(firstSmall).every((e) => e !== "gen:big:7b"));
  check("runBenchmark: options recorded verbatim + task-set sha256 + parallelism 1", run.meta.options.temperature === 0 && run.meta.options.seed === 42 && run.meta.taskSetSha256 === ts.sha256 && run.meta.parallelism === 1);
  check("runBenchmark: per-trial resources + host load recorded", run.trials[0].cpuAvgPct === 350 && run.trials[0].rssPeakMb === 900 && run.trials[0].hostLoad1m === 1.5);
  return run;
}

function registryAndRouterTests(run: any): void {
  const reg = CAP.buildCapabilityRegistry(run);
  const big = reg.models.find((m: any) => m.id === "big:7b"); const small = reg.models.find((m: any) => m.id === "small:3b"); const absent = reg.models.find((m: any) => m.id === "absent:1b");
  check("registry: model metadata (digest/size/quantization/params/context)", big.digest === "d7" && big.sizeBytes === 4683087561 && big.quantization === "Q4_K_M" && big.parameterSize === "7.6B" && big.contextLength === 32768);
  check("registry: big compile rate 1, test pass rate 1, repair quality 1, strict adherence 1", big.quality.compileRate.value === 1 && big.quality.testPassRate.value === 1 && big.quality.repairQuality.value === 1 && big.quality.strictContractAdherence.value === 1);
  check("registry: small code metrics 0 (measured failures recorded as failures)", small.quality.compileRate.value === 0 && small.quality.testPassRate.value === 0);
  check("registry: latency/speed/resources aggregated", big.latency.ttftMs.p50 === 400 && big.latency.totalMs.p50 === 4000 && big.speed.tokPerSec.mean === 8 && big.resources.rssPeakMb.max === 900);
  check("registry: unavailable model ⇒ every metric NOT_MEASURED (never 0)", absent.available === false && absent.quality.overallPassRate.status === "NOT_MEASURED" && absent.quality.overallPassRate.value === null && absent.latency.totalMs.status === "NOT_MEASURED");
  check("registry: per-class statuses (big QUALIFIED implement, DEMOTED judgment; small DEMOTED implement)", big.perClass.implement.status === "QUALIFIED" && big.perClass.judgment.status === "DEMOTED" && small.perClass.implement.status === "DEMOTED" && absent.perClass.implement.status === "UNAVAILABLE");
  check("registry: stability — 3 trials/task, deterministic outputs, no mixed outcomes", big.stability.trialsPerTask === 3 && big.stability.tasksWithMixedOutcomes === 0 && big.stability.deterministicOutputTasks === big.stability.tasks);
  check("registry: known limits name the demoted class; domains the qualified ones", big.knownLimits.some((l: string) => /^judgment/.test(l)) && big.domains.includes("implement"));
  // measured:false trials are excluded from denominators
  const partial = { ...run, trials: run.trials.map((t: any) => (t.model === "big:7b" && t.taskClass === "refactor" ? { ...t, grade: { ...t.grade, measured: false, passed: false } } : t)) };
  const regP = CAP.buildCapabilityRegistry(partial);
  check("registry: unmeasured trials excluded ⇒ class NOT_MEASURED, counted in trialsNotMeasured", regP.models.find((m: any) => m.id === "big:7b").perClass.refactor.status === "NOT_MEASURED" && regP.models.find((m: any) => m.id === "big:7b").trialsNotMeasured === 3);

  // history + demotion: run 1 big QUALIFIED for extract, run 2 fails extract ⇒ DEMOTED event
  const h1 = CAP.appendQualificationRecord([], reg, { runId: "r1", at: "t1", head: "h1" });
  const failExtract = { ...run, trials: run.trials.map((t: any) => (t.model === "big:7b" && t.taskClass === "extract" ? { ...t, grade: { ...t.grade, passed: false } } : t)) };
  const reg2 = CAP.buildCapabilityRegistry(failExtract, { history: h1, record: { runId: "r2" } });
  check("history append-only (input untouched)", h1.length === 1 && CAP.appendQualificationRecord(h1, reg2, { runId: "r2" }).length === 2 && h1.length === 1);
  check("demotion: QUALIFIED → DEMOTED when the measured pass rate falls below the threshold", reg2.demotions.some((d: any) => d.model === "big:7b" && d.taskClass === "extract" && d.from === "QUALIFIED" && d.to === "DEMOTED" && d.runId === "r2"));
  check("demotion: an already-DEMOTED class is not re-reported", !reg2.demotions.some((d: any) => d.model === "big:7b" && d.taskClass === "judgment"));

  // selection
  const sImpl = R.selectMeasured({ taskClass: "implement", registry: reg });
  check("select implement ⇒ big:7b (only QUALIFIED), small DEMOTED not a fallback", sImpl.decision === "LOCAL" && sImpl.model === "big:7b" && sImpl.fallbackOrder.length === 0);
  const sExt = R.selectMeasured({ taskClass: "extract", registry: reg });
  check("select extract: equal quality ⇒ faster small:3b primary, big:7b fallback", sExt.model === "small:3b" && JSON.stringify(sExt.fallbackOrder) === '["big:7b"]');
  const sJudg = R.selectMeasured({ taskClass: "judgment", registry: reg });
  check("select judgment: small QUALIFIED, big DEMOTED excluded", sJudg.model === "small:3b" && !sJudg.fallbackOrder.includes("big:7b"));
  const sBudget = R.selectMeasured({ taskClass: "implement", registry: reg, latencyBudgetMs: 2000 });
  check("quality first: best model over budget is still chosen, flagged overBudget", sBudget.model === "big:7b" && sBudget.overBudget === true);
  const sMissing = R.selectMeasured({ taskClass: "extract", registry: reg, available: ["big:7b"] });
  check("unavailable-model detection: small missing from the live probe ⇒ big:7b chosen", sMissing.model === "big:7b" && sMissing.considered.find((c: any) => c.id === "small:3b").status === "UNAVAILABLE");
  const sDown = R.selectMeasured({ taskClass: "extract", registry: reg, available: [] });
  check("Ollama down (empty live probe) ⇒ honest UNAVAILABLE, no model", sDown.decision === "UNAVAILABLE" && sDown.model === null);
  const sNone = R.selectMeasured({ taskClass: "implement", registry: reg, available: ["small:3b"] });
  check("no QUALIFIED local model ⇒ NO_QUALIFIED_LOCAL_MODEL, flagged (requiresAuthorization), never auto-paid", sNone.decision === "NO_QUALIFIED_LOCAL_MODEL" && sNone.model === null && sNone.requiresAuthorization === true);
  check("no registry ⇒ refused (no measurement ⇒ no measured selection)", R.selectMeasured({ taskClass: "implement" }).ok === false);
  check("static selectModel unchanged (back-compat)", R.selectModel({ difficulty: "easy" }).model === "qwen2.5-coder:3b");
}

async function fallbackTests(): Promise<void> {
  const d = { model: "a", fallbackOrder: ["b", "c"] };
  const r1 = await R.runWithFallback(d, async (m: string) => (m === "a" ? { ok: false, unavailable: true, reason: "model 'a' not found" } : { ok: true }));
  check("fallback: missing primary ⇒ next model answers", r1.outcome === "OK" && r1.model === "b" && r1.attempts.length === 2 && r1.attempts[0].unavailable === true);
  const r2 = await R.runWithFallback(d, async (m: string) => (m === "a" ? { ok: false, timedOut: true, reason: "generation timed out" } : { ok: true }));
  check("fallback: timeout ⇒ next model", r2.outcome === "OK" && r2.model === "b" && r2.attempts[0].timedOut === true);
  const r3 = await R.runWithFallback(d, async () => ({ ok: false, reason: "wrong answer" }));
  check("fallback: a model that answered but FAILED is reported FAILED (not masked by retrying)", r3.outcome === "FAILED" && r3.model === "a" && r3.attempts.length === 1);
  const r4 = await R.runWithFallback(d, async () => ({ ok: false, unavailable: true, reason: "ECONNREFUSED" }));
  check("fallback: Ollama down for every model ⇒ honest UNAVAILABLE", r4.outcome === "UNAVAILABLE" && r4.model === null && r4.attempts.length === 3);
  const r5 = await R.runWithFallback(d, async (m: string) => { if (m === "a") throw new Error("socket hang up"); return { ok: true }; });
  check("fallback: a throwing invoke is treated as unavailable ⇒ next", r5.outcome === "OK" && r5.model === "b");
  // end-to-end with the real provider function + an injected stream: absent model 404 ⇒ fallback
  const stream = async (_p: string, payload: any) => (payload.model === "absent:1b" ? { ok: false, reason: 'HTTP 404: {"error":"model not found"}' } : { ok: true, text: "{}", ttftMs: 1, totalMs: 2, final: { eval_count: 1, eval_duration: 1e9 } });
  const r6 = await R.runWithFallback({ model: "absent:1b", fallbackOrder: ["small:3b"] }, (m: string) => O.generateMeasured({ model: m, prompt: "p", stream }));
  check("fallback via ollama-provider.generateMeasured: 404 ⇒ unavailable ⇒ small:3b", r6.outcome === "OK" && r6.model === "small:3b" && r6.attempts[0].unavailable === true);
}

async function main(): Promise<void> {
  await providerTests();
  taskSetAndGraderTests();
  samplerTest();
  const run = await runBenchmarkTest();
  registryAndRouterTests(run);
  await fallbackTests();
  check("contracts declare reuse (no second client/registry/router)", B.LOCAL_MODEL_BENCHMARK_CONTRACT.reuses.some((x: string) => /ollama-provider/.test(x)) && B.LOCAL_MODEL_BENCHMARK_CONTRACT.reuses.some((x: string) => /buildCapabilityRegistry/.test(x)));
  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-local-model-benchmark (V155 Step 5: measured registry; objective graders; NOT_MEASURED never 0; one model at a time; quality-first selection; unavailable/timeout fallback; demotion from appended history; zero network)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { process.stderr.write(String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
