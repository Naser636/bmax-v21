#!/usr/bin/env node
"use strict";

/*
 * V155 Step 5 — LOCAL-MODEL BENCHMARK HARNESS (the MEASUREMENT half of the measured capability registry). It is NOT a
 * registry and NOT a router: it loads the versioned task set (odg-local-model-benchmark-tasks.v1.json), drives each
 * installed local model through it ONE MODEL AT A TIME with recorded options (temperature 0, fixed seed), grades every
 * trial with an OBJECTIVE pass/fail grader, and samples the Ollama runner process (CPU/RSS via /proc) during inference.
 * Aggregation lives in the canonical odg-local-model-capability.buildCapabilityRegistry; selection/fallback/demotion in
 * the canonical odg-model-router.selectMeasured/runWithFallback. Transport = the canonical ollama-provider
 * (listModels/showModel/generateMeasured/unloadModel — loopback only).
 *
 * SAFETY: model output is UNTRUSTED. JS compile checks only PARSE (vm.Script, nothing executed); TS is type-checked with
 * the typescript compiler API (nothing executed); hidden tests run the candidate ONLY inside provider-sandbox's bubblewrap
 * profile (no network, cleared env, no home dir) via runProvider("node -"). No sandbox ⇒ the run is REFUSED, never run
 * unsandboxed. Every seam (provider, codeRunner, sampler, clock) is injectable so unit tests use ZERO network/processes.
 * HONESTY: a grader that cannot run records NOT_MEASURED — never a pass.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const TASKSET_FILE = path.join(__dirname, "odg-local-model-benchmark-tasks.v1.json");
const DEFAULT_OPTIONS = Object.freeze({ temperature: 0, seed: 42, top_k: 1, num_predict: 512, num_ctx: 4096 });
const RESULT_MARK = "__ODG_RESULT__";
const CODE_GRADERS = Object.freeze(["hidden-test", "refactor", "test-writing"]);
const JSON_GRADERS = Object.freeze(["json-equal", "strict-schema", "json-field"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

/** loadTaskSet(file?) -> { ok, version, sha256, tasks, graders } — the versioned task set + its content hash (pinning). */
function loadTaskSet(file?: string): any {
  const f = typeof file === "string" && file ? file : TASKSET_FILE;
  let raw: string; try { raw = fs.readFileSync(f, "utf8"); } catch (e: any) { return { ok: false, reason: "task set unreadable: " + (e && e.message) }; }
  let doc: any; try { doc = JSON.parse(raw); } catch { return { ok: false, reason: "task set is not JSON" }; }
  const v = validateTaskSet(doc);
  if (!v.ok) return v;
  return { ok: true, version: doc.version, sha256: sha256(raw), tasks: doc.tasks, graders: doc.graders };
}

/** validateTaskSet(doc) -> { ok, reason? } — structural validation (every task has an objective grader + its oracle). */
function validateTaskSet(doc: any): any {
  if (!isObj(doc) || typeof doc.version !== "string" || !Array.isArray(doc.tasks)) return { ok: false, reason: "task set must have version + tasks[]" };
  const ids = new Set<string>();
  for (const t of doc.tasks) {
    if (!isObj(t) || typeof t.id !== "string" || typeof t.taskClass !== "string" || typeof t.prompt !== "string") return { ok: false, reason: "each task needs id/taskClass/prompt" };
    if (ids.has(t.id)) return { ok: false, reason: "duplicate task id " + t.id };
    ids.add(t.id);
    if (![...CODE_GRADERS, ...JSON_GRADERS].includes(t.grader)) return { ok: false, reason: "task " + t.id + ": unknown grader " + t.grader };
    if ((t.grader === "hidden-test" || t.grader === "refactor") && (typeof t.hiddenTest !== "string" || typeof t.fnName !== "string")) return { ok: false, reason: "task " + t.id + ": hiddenTest+fnName required" };
    if (t.grader === "test-writing" && (typeof t.referenceImpl !== "string" || !arr(t.mutants).length)) return { ok: false, reason: "task " + t.id + ": referenceImpl+mutants required" };
    if ((t.grader === "json-equal" || t.grader === "strict-schema") && !isObj(t.expected)) return { ok: false, reason: "task " + t.id + ": expected required" };
    if (t.grader === "json-field" && (typeof t.field !== "string" || t.expectedValue === undefined)) return { ok: false, reason: "task " + t.id + ": field+expectedValue required" };
  }
  return { ok: true };
}

/** extractCode(raw) -> string|null: prefer the FIRST fenced block; else the raw text minus stray fences. */
function extractCode(raw: any): string | null {
  const s = String(raw == null ? "" : raw);
  const fence = s.match(/```[a-zA-Z0-9_+-]*[ \t]*\r?\n([\s\S]*?)```/);
  const code = (fence ? fence[1] : s.replace(/^\s*```[a-zA-Z0-9_+-]*\s*/, "").replace(/\s*```\s*$/, "")).trim();
  return code ? code : null;
}

/** parseJsonLoose(raw) -> object|null: fence-stripped, first balanced {...} (structured-output rate). */
function parseJsonLoose(raw: any): any {
  const s = String(raw == null ? "" : raw);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : s).trim();
  const start = body.indexOf("{"); const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { const o = JSON.parse(body.slice(start, end + 1)); return isObj(o) ? o : null; } catch { return null; }
}

function stripComments(code: string): string { return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1"); }

let TS_CACHE: any = null;
function loadTs(): any { if (TS_CACHE === null) { try { TS_CACHE = require("typescript"); } catch { TS_CACHE = false; } } return TS_CACHE || null; }

/** compileCheck(code, lang) -> { ok, applicable, reason?, js? }. JS: vm.Script PARSE only (= node --check; nothing runs).
 *  TS: full type check (strict, noImplicitAny) of the single file via the typescript compiler API, then transpile to CJS. */
function compileCheck(code: any, lang: string): any {
  if (typeof code !== "string" || !code.trim()) return { ok: false, applicable: true, reason: "no code extracted" };
  if (lang === "ts") {
    const ts = loadTs();
    if (!ts) return { ok: false, applicable: false, reason: "typescript compiler unavailable ⇒ NOT_MEASURED" };
    const fileName = "/virtual/candidate.ts";
    const options = { strict: true, noImplicitAny: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, lib: ["lib.es2020.d.ts"], types: [], skipLibCheck: true };
    const host = ts.createCompilerHost(options);
    const orig = host.getSourceFile.bind(host);
    host.getSourceFile = (f: string, l: any, ...rest: any[]) => (f === fileName ? ts.createSourceFile(f, code, l) : orig(f, l, ...rest));
    const origExists = host.fileExists.bind(host);
    host.fileExists = (f: string) => f === fileName || origExists(f);
    const origRead = host.readFile.bind(host);
    host.readFile = (f: string) => (f === fileName ? code : origRead(f));
    const program = ts.createProgram([fileName], options, host);
    const diags = ts.getPreEmitDiagnostics(program).filter((d: any) => d.file && d.file.fileName === fileName);
    if (diags.length) return { ok: false, applicable: true, reason: "tsc: " + ts.flattenDiagnosticMessageText(diags[0].messageText, " ").slice(0, 200), diagnostics: diags.length };
    const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    return { ok: true, applicable: true, js };
  }
  try { new vm.Script(code, { filename: "candidate.js" }); return { ok: true, applicable: true, js: code }; }
  catch (e: any) { return { ok: false, applicable: true, reason: "syntax: " + String(e && e.message).slice(0, 200) }; }
}

/** hiddenTestProgram(js, task) -> a self-contained Node program: candidate at module scope, the hidden test in its own
 *  function scope (so a candidate's own `assert`/`fn` bindings cannot collide), one RESULT_MARK line on stdout. */
function hiddenTestProgram(js: string, task: any): string {
  const n = String(task.fnName).replace(/[^A-Za-z0-9_$]/g, "");
  return [
    js,
    ";",
    `const __odgFn = (typeof ${n} === "function") ? ${n} : (module.exports && typeof module.exports.${n} === "function") ? module.exports.${n} : (typeof module.exports === "function" ? module.exports : (typeof exports !== "undefined" && exports && typeof exports.${n} === "function" ? exports.${n} : undefined));`,
    "try {",
    "  if (typeof __odgFn !== 'function') throw new Error('function " + n + " not found in candidate');",
    "  (function (assert, fn) {",
    task.hiddenTest,
    "  })(require('assert'), __odgFn);",
    `  process.stdout.write('\\n${RESULT_MARK}' + JSON.stringify({ pass: true }) + '\\n');`,
    "} catch (e) {",
    `  process.stdout.write('\\n${RESULT_MARK}' + JSON.stringify({ pass: false, error: String(e && e.message || e).slice(0, 300) }) + '\\n');`,
    "}",
  ].join("\n");
}

/** testWritingProgram(impl, candidateTests) -> runs the candidate's assert-script against `impl`, counting assertions. */
function testWritingProgram(impl: string, tests: string): string {
  return [
    impl,
    ";",
    "const __odgA = require('assert'); let __odgCount = 0;",
    "function __odgWrap(base) { const w = function () { __odgCount++; return base.apply(null, arguments); }; for (const k of Object.keys(base)) { if (typeof base[k] === 'function') w[k] = function () { __odgCount++; return base[k].apply(null, arguments); }; } return w; }",
    "const __odgAssert = __odgWrap(__odgA); __odgAssert.strict = __odgWrap(__odgA.strict);",
    "const __odgImpl = slugify;",
    "function __odgRequire(m) { if (m === 'assert' || m === 'node:assert') return __odgAssert; if (m === 'assert/strict' || m === 'node:assert/strict') return __odgAssert.strict; if (String(m).startsWith('.')) { const o = function () { return __odgImpl.apply(null, arguments); }; o.slugify = __odgImpl; o.default = __odgImpl; return o; } return require(m); }",
    "function __odgSuite(name, f) { if (typeof f === 'function') f(); }",
    "process.on('unhandledRejection', (e) => { process.stdout.write('\\n" + RESULT_MARK + "' + JSON.stringify({ pass: false, assertions: __odgCount, error: 'unhandled rejection: ' + String(e && e.message || e).slice(0, 200) }) + '\\n'); process.exit(0); });",
    "try {",
    "  (function (require, describe, it, test) {",
    tests,
    "  })(__odgRequire, __odgSuite, __odgSuite, __odgSuite);",
    "  setImmediate(() => process.stdout.write('\\n" + RESULT_MARK + "' + JSON.stringify({ pass: true, assertions: __odgCount }) + '\\n'));",
    "} catch (e) {",
    "  process.stdout.write('\\n" + RESULT_MARK + "' + JSON.stringify({ pass: false, assertions: __odgCount, error: String(e && e.message || e).slice(0, 300) }) + '\\n');",
    "}",
  ].join("\n");
}

/** defaultCodeRunner(program) -> { ran, result?, reason? }: runs ONLY inside provider-sandbox (bubblewrap; no network,
 *  cleared env). Sandbox unavailable ⇒ { ran:false } (the trial's test metric is NOT_MEASURED, never a pass). */
function defaultCodeRunner(program: string, opts: any = {}): any {
  const PS = require("./provider-sandbox");
  const r = PS.runProvider(program, { command: "node -", timeoutMs: Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 10000 });
  if (!r.launched) return { ran: false, reason: r.reason || "sandbox did not launch" };
  return { ran: true, result: parseResult(String(r.text || "") + "\n" + String(r.stderr || "")), exitOk: r.ok === true, reason: r.ok ? undefined : r.reason };
}

function parseResult(out: string): any {
  const i = out.lastIndexOf(RESULT_MARK);
  if (i < 0) return { pass: false, error: "no result marker (crash/timeout)" };
  const line = out.slice(i + RESULT_MARK.length).split("\n")[0];
  try { const o = JSON.parse(line); return isObj(o) ? o : { pass: false, error: "bad result" }; } catch { return { pass: false, error: "bad result json" }; }
}

function strictSchemaCheck(obj: any, schema: any): any {
  if (!isObj(obj)) return { ok: false, reason: "not a JSON object" };
  const keys = Object.keys(obj).sort();
  const want = arr(schema.keys).slice().sort();
  if (JSON.stringify(keys) !== JSON.stringify(want)) return { ok: false, reason: "keys " + JSON.stringify(keys) + " ≠ " + JSON.stringify(want) };
  for (const [k, allowed] of Object.entries(isObj(schema.enums) ? schema.enums : {})) if (!arr(allowed).includes(obj[k])) return { ok: false, reason: "enum violation on " + k };
  for (const k of arr(schema.integer)) if (!Number.isInteger(obj[k]) || obj[k] < 0) return { ok: false, reason: k + " must be a non-negative integer" };
  for (const k of arr(schema.stringArray)) if (!Array.isArray(obj[k]) || obj[k].some((x: any) => typeof x !== "string")) return { ok: false, reason: k + " must be a string array" };
  return { ok: true };
}

function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

/**
 * gradeTrial(task, rawText, opts?) -> { passed, compile:{applicable,ok}, structured:{applicable,ok}, strict:{applicable,ok},
 * measured, reason }. OBJECTIVE graders only. opts.codeRunner(program) injectable (tests). `measured:false` ⇒ the grader
 * could not run (e.g. no sandbox) ⇒ the caller records NOT_MEASURED, never a pass.
 */
function gradeTrial(task: any, rawText: any, opts: any = {}): any {
  const run = typeof opts.codeRunner === "function" ? opts.codeRunner : defaultCodeRunner;
  const text = String(rawText == null ? "" : rawText);
  const out: any = { passed: false, measured: true, compile: { applicable: false, ok: false }, structured: { applicable: false, ok: false }, strict: { applicable: false, ok: false }, reason: "" };
  if (CODE_GRADERS.includes(task.grader)) {
    const code = extractCode(text);
    const cc = compileCheck(code, task.lang);
    out.compile = { applicable: cc.applicable !== false, ok: cc.ok === true };
    if (cc.applicable === false) { out.measured = false; out.reason = cc.reason; return out; }
    if (!cc.ok) { out.reason = cc.reason; return out; }
    if (task.grader === "refactor" && /\b(for|while)\s*\(|\bdo\s*\{/.test(stripComments(cc.js))) { out.reason = "refactor constraint violated: a for/while loop remains"; return out; }
    if (task.grader === "test-writing") {
      const ref = run(testWritingProgram(task.referenceImpl, cc.js));
      if (!ref.ran) { out.measured = false; out.reason = ref.reason; return out; }
      const minA = Number(task.minAssertions) > 0 ? Number(task.minAssertions) : 1;
      if (ref.result.pass !== true) { out.reason = "tests fail against the CORRECT implementation: " + (ref.result.error || ""); return out; }
      if (!(Number(ref.result.assertions) >= minA)) { out.reason = "only " + ref.result.assertions + " assertion(s) executed (< " + minA + ")"; return out; }
      const survived: number[] = [];
      arr(task.mutants).forEach((m: string, i: number) => { const r = run(testWritingProgram(m, cc.js)); if (!r.ran) { out.measured = false; } else if (r.result.pass === true) survived.push(i); });
      if (!out.measured) { out.reason = "sandbox unavailable for a mutant run"; return out; }
      out.passed = survived.length === 0;
      out.mutantsKilled = arr(task.mutants).length - survived.length; out.mutantsTotal = arr(task.mutants).length;
      out.reason = out.passed ? "all mutants killed; reference passes" : "mutant(s) survived: " + survived.join(",");
      return out;
    }
    const r = run(hiddenTestProgram(cc.js, task));
    if (!r.ran) { out.measured = false; out.reason = r.reason; return out; }
    out.passed = r.result.pass === true;
    out.reason = out.passed ? "hidden test passed" : "hidden test failed: " + (r.result.error || r.reason || "");
    return out;
  }
  // JSON graders
  const loose = parseJsonLoose(text);
  out.structured = { applicable: true, ok: loose !== null };
  if (task.grader === "strict-schema") {
    let rawObj: any = null; try { rawObj = JSON.parse(text.trim()); } catch { rawObj = null; }
    const sc = rawObj === null ? { ok: false, reason: "RAW output is not bare JSON (fences/prose ⇒ contract violated)" } : strictSchemaCheck(rawObj, task.schema || {});
    out.strict = { applicable: true, ok: sc.ok === true };
    if (!sc.ok) { out.reason = sc.reason; return out; }
    out.passed = canonical(rawObj) === canonical(task.expected);
    out.reason = out.passed ? "strict contract + values correct" : "contract adhered but values wrong";
    return out;
  }
  if (loose === null) { out.reason = "no parseable JSON object"; return out; }
  if (task.grader === "json-equal") { out.passed = canonical(loose) === canonical(task.expected); out.reason = out.passed ? "exact match" : "mismatch: " + canonical(loose).slice(0, 200); return out; }
  out.passed = loose[task.field] === task.expectedValue;
  out.reason = out.passed ? task.field + " correct" : task.field + "=" + JSON.stringify(loose[task.field]) + " (expected " + JSON.stringify(task.expectedValue) + ")";
  return out;
}

/**
 * createProcSampler(opts?) -> { start(), stop() -> { cpuAvgPct, cpuPeakPct, rssPeakMb, samples, pids } }. Samples every
 * process whose cmdline matches (default: the Ollama RUNNER — the process doing inference) via /proc/<pid>/stat
 * (utime+stime) and /proc/<pid>/status (VmRSS). Injectable procRoot/readdir/readFile/clock (tests). No sample ⇒ nulls.
 */
function createProcSampler(opts: any = {}): any {
  const procRoot = typeof opts.procRoot === "string" ? opts.procRoot : "/proc";
  const readdir = typeof opts.readdir === "function" ? opts.readdir : (d: string) => fs.readdirSync(d);
  const readFile = typeof opts.readFile === "function" ? opts.readFile : (f: string) => fs.readFileSync(f, "utf8");
  const now = typeof opts.now === "function" ? opts.now : () => Number(process.hrtime.bigint() / BigInt(1000000));
  const match = opts.match instanceof RegExp ? opts.match : /ollama\0runner|ollama runner|ollama_llama_server|llama-server/;
  const clkTck = Number(opts.clkTck) > 0 ? Number(opts.clkTck) : 100;
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 250;
  let timer: any = null; let prev: any = null; const cpu: number[] = []; let rssPeakKb = 0; let samples = 0; const pids = new Set<string>();
  function snap(): any {
    let ticks = 0; let rssKb = 0; let found = 0;
    let entries: string[] = []; try { entries = readdir(procRoot); } catch { return null; }
    for (const e of entries) {
      if (!/^\d+$/.test(e)) continue;
      let cmd = ""; try { cmd = readFile(procRoot + "/" + e + "/cmdline"); } catch { continue; }
      if (!match.test(cmd)) continue;
      try {
        const stat = readFile(procRoot + "/" + e + "/stat"); const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        ticks += Number(after[11]) + Number(after[12]);   // fields 14/15 (utime, stime) — offsets after the comm field
        const st = readFile(procRoot + "/" + e + "/status"); const m = st.match(/VmRSS:\s+(\d+)\s*kB/); if (m) rssKb += Number(m[1]);
        found++; pids.add(e);
      } catch { /* process vanished */ }
    }
    return found ? { t: now(), ticks, rssKb } : null;
  }
  function tick(): void {
    const s = snap(); if (!s) return;
    samples++; if (s.rssKb > rssPeakKb) rssPeakKb = s.rssKb;
    if (prev && s.t > prev.t && s.ticks >= prev.ticks) cpu.push(((s.ticks - prev.ticks) / clkTck) / ((s.t - prev.t) / 1000) * 100);
    prev = s;
  }
  return {
    start(): void { tick(); timer = setInterval(tick, intervalMs); if (timer && typeof timer.unref === "function") timer.unref(); },
    stop(): any {
      if (timer) clearInterval(timer); timer = null; tick();
      const avg = cpu.length ? Math.round((cpu.reduce((a, b) => a + b, 0) / cpu.length) * 10) / 10 : null;
      return { cpuAvgPct: avg, cpuPeakPct: cpu.length ? Math.round(Math.max(...cpu) * 10) / 10 : null, rssPeakMb: samples ? Math.round((rssPeakKb / 1024) * 10) / 10 : null, samples, pids: [...pids] };
    },
  };
}

/**
 * runBenchmark(cfg) -> { ok, meta, models:[info], trials:[record], coldLoads } — drives the measurement. cfg: {
 *   models:[id], taskSet (from loadTaskSet), trials (>=1, default 3), options (recorded verbatim), keepAlive,
 *   provider: { ollamaVersion, listModels, showModel, generateMeasured, unloadModel } (ollama-provider by default),
 *   codeRunner?, samplerFactory?, log?, timeoutMs? }. Models run STRICTLY one at a time (unloaded after each).
 * A model absent from the daemon ⇒ { available:false } and no trials (UNAVAILABLE, never fabricated).
 */
async function runBenchmark(cfg: any = {}): Promise<any> {
  const P = isObj(cfg.provider) ? cfg.provider : require("./ollama-provider");
  const ts = isObj(cfg.taskSet) ? cfg.taskSet : loadTaskSet();
  if (!ts.ok) return { ok: false, reason: ts.reason };
  const trialsN = Number.isInteger(cfg.trials) && cfg.trials > 0 ? cfg.trials : 3;
  const options = isObj(cfg.options) ? { ...cfg.options } : { ...DEFAULT_OPTIONS };
  const log = typeof cfg.log === "function" ? cfg.log : () => {};
  const loadavg = typeof cfg.loadavg === "function" ? cfg.loadavg : () => Math.round(require("os").loadavg()[0] * 100) / 100;
  const samplerFactory = typeof cfg.samplerFactory === "function" ? cfg.samplerFactory : () => createProcSampler();
  const tasks = arr(ts.tasks).filter((t: any) => !arr(cfg.onlyTasks).length || arr(cfg.onlyTasks).includes(t.id));
  const ver = await P.ollamaVersion();
  const listed = await P.listModels();
  const meta = { ollamaVersion: ver.ok ? ver.version : null, daemonUp: listed.ok === true, taskSetVersion: ts.version, taskSetSha256: ts.sha256, trialsPerTask: trialsN, options, keepAlive: cfg.keepAlive || "10m", parallelism: 1 };
  const models: any[] = []; const trials: any[] = []; const coldLoads: any = {};
  for (const id of arr(cfg.models)) {
    const tag = listed.ok ? arr(listed.models).find((m: any) => m.id === id) : null;
    if (!tag) { models.push({ id, available: false, reason: listed.ok ? "model not installed in the local daemon" : "Ollama daemon not reachable" }); log(`[${id}] UNAVAILABLE`); continue; }
    const show = await P.showModel(id);
    models.push({ id, available: true, digest: tag.digest, sizeBytes: tag.sizeBytes, quantization: (show.ok && show.details.quantization) || tag.quantization, parameterSize: (show.ok && show.details.parameterSize) || tag.parameterSize, parameterCount: show.ok ? show.parameterCount : null, contextLength: show.ok && show.contextLength !== null ? show.contextLength : tag.contextLength, family: tag.family, format: tag.format });
    const warm = await P.generateMeasured({ model: id, prompt: "Reply with the single word OK.", options: { ...options, num_predict: 4 }, keepAlive: meta.keepAlive, timeoutMs: cfg.timeoutMs });
    coldLoads[id] = warm.ok ? { totalMs: warm.totalMs, loadMs: warm.loadDurationNs !== null ? Math.round(warm.loadDurationNs / 1e6) : null } : { error: warm.reason };
    log(`[${id}] cold load ${JSON.stringify(coldLoads[id])}`);
    for (const task of tasks) {
      for (let k = 1; k <= trialsN; k++) {
        const sampler = samplerFactory();
        const hostLoad1m = loadavg();
        sampler.start();
        const g = await P.generateMeasured({ model: id, prompt: task.prompt, options, keepAlive: meta.keepAlive, timeoutMs: cfg.timeoutMs });
        const res = sampler.stop();
        const rec: any = { model: id, taskId: task.id, taskClass: task.taskClass, trial: k, generated: g.ok === true };
        if (!g.ok) { rec.error = g.reason; rec.unavailable = !!g.unavailable; rec.timedOut = !!g.timedOut; rec.grade = { passed: false, measured: !g.unavailable, compile: { applicable: CODE_GRADERS.includes(task.grader), ok: false }, structured: { applicable: JSON_GRADERS.includes(task.grader), ok: false }, strict: { applicable: task.grader === "strict-schema", ok: false }, reason: "generation failed: " + g.reason }; }
        else {
          rec.ttftMs = g.ttftMs; rec.totalMs = g.totalMs; rec.tokPerSec = g.tokPerSec; rec.evalCount = g.evalCount; rec.promptEvalCount = g.promptEvalCount; rec.loadMs = g.loadDurationNs !== null ? Math.round(g.loadDurationNs / 1e6) : null; rec.doneReason = g.doneReason;
          rec.outputSha256 = sha256(g.text); rec.outputChars = g.text.length; rec.outputHead = g.text.slice(0, 160);
          rec.grade = gradeTrial(task, g.text, { codeRunner: cfg.codeRunner });
        }
        rec.hostLoad1m = hostLoad1m; rec.cpuAvgPct = res.cpuAvgPct; rec.cpuPeakPct = res.cpuPeakPct; rec.rssPeakMb = res.rssPeakMb; rec.resourceSamples = res.samples;
        trials.push(rec);
        log(`[${id}] ${task.id}#${k} ${rec.grade.passed ? "PASS" : "FAIL"} ${rec.totalMs || "-"}ms ${rec.tokPerSec || "-"}tok/s cpu=${rec.cpuAvgPct}% rss=${rec.rssPeakMb}MB — ${String(rec.grade.reason).slice(0, 90)}`);
      }
    }
    await P.unloadModel(id);
  }
  return { ok: true, meta, models, trials, coldLoads, taskSet: { version: ts.version, sha256: ts.sha256, tasks: tasks.map((t: any) => ({ id: t.id, taskClass: t.taskClass, grader: t.grader, lang: t.lang })) } };
}

const LOCAL_MODEL_BENCHMARK_CONTRACT = Object.freeze({
  id: "V155-LOCAL-MODEL-BENCHMARK",
  purpose: "Step 5 — reproducible, versioned local-model benchmark (≥8 tasks, objective graders, temperature 0 + fixed seed, recorded options) feeding the MEASURED capability registry",
  reuses: Object.freeze([
    "ollama-provider (listModels/showModel/generateMeasured/unloadModel — loopback-only transport; no second client)",
    "provider-sandbox.runProvider (bubblewrap: candidate code runs with no network/cleared env; no sandbox ⇒ NOT_MEASURED)",
    "odg-local-model-capability.buildCapabilityRegistry (aggregation) + odg-model-router.selectMeasured (selection) — not reimplemented here",
  ]),
  invariants: Object.freeze([
    "model output is UNTRUSTED: compile checks parse/type-check only; hidden tests run ONLY inside the bubblewrap sandbox",
    "every grader is objective pass/fail against a hidden oracle (hidden test / mutants / exact JSON / schema); no model self-report",
    "a grader that cannot run ⇒ measured:false ⇒ NOT_MEASURED — never a pass; a missing model ⇒ UNAVAILABLE, no fabricated trials",
    "one model resident at a time (parallelism 1; unload after each model); options recorded verbatim with the task-set sha256",
  ]),
});

module.exports = { TASKSET_FILE, DEFAULT_OPTIONS, loadTaskSet, validateTaskSet, extractCode, parseJsonLoose, compileCheck, hiddenTestProgram, testWritingProgram, gradeTrial, createProcSampler, runBenchmark, parseResult, LOCAL_MODEL_BENCHMARK_CONTRACT };
export {};
