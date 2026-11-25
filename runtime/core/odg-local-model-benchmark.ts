#!/usr/bin/env node
"use strict";

/*
 * V155 Step 5 — LOCAL-MODEL BENCHMARK HARNESS (the MEASUREMENT half of the measured capability registry). It is NOT a
 * registry and NOT a router: it loads the versioned task set (odg-local-model-benchmark-tasks.v2.json), drives each
 * installed local model through it ONE MODEL AT A TIME with recorded options (temperature 0, fixed seed), grades every
 * trial with an OBJECTIVE pass/fail grader, and samples the Ollama runner process (CPU/RSS via /proc) during inference.
 * Aggregation lives in the canonical odg-local-model-capability.buildCapabilityRegistry; selection/fallback/demotion in
 * the canonical odg-model-router.selectMeasured/runWithFallback. Transport = the canonical ollama-provider
 * (listModels/showModel/generateMeasured/unloadModel — loopback only).
 *
 * SAFETY: model output is UNTRUSTED. JS compile checks only PARSE (vm.Script, nothing executed); TS is type-checked
 * (noResolve, no reference following) in a time-bounded child process (nothing executed); candidate code runs ONLY inside
 * provider-sandbox's bubblewrap profile (no network, cleared env, no home dir, RLIMIT_AS 1 GiB) and, within it, in a
 * null-prototype vm context with no require/process. The sandboxed program only RECORDS observations; the EXPECTED values
 * stay on the host, which asserts (exit 0 + a per-run random nonce on stdout required). No sandbox ⇒ NOT_MEASURED. Every seam (provider, codeRunner, sampler, clock) is injectable so unit tests use ZERO network/processes.
 * HONESTY: a grader that cannot run records NOT_MEASURED — never a pass.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { spawnSync } = require("child_process");

const TASKSET_FILE = path.join(__dirname, "odg-local-model-benchmark-tasks.v2.json");
const DEFAULT_OPTIONS = Object.freeze({ temperature: 0, seed: 42, top_k: 1, num_predict: 512, num_ctx: 4096 });
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
    if ((t.grader === "hidden-test" || t.grader === "refactor") && (!Array.isArray(t.cases) || !t.cases.length || typeof t.fnName !== "string")) return { ok: false, reason: "task " + t.id + ": cases[]+fnName required" };
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

// TS type check runs in a SEPARATE, time-bounded child process (never in this process): noResolve + no reference
// following (a `/// <reference path>` or an import can never make the compiler read a host file), only the pinned
// lib.es2020.d.ts is loaded, and host paths are scrubbed from the diagnostic. Nothing of the candidate is executed.
const TS_CHECK_SCRIPT = [
  "const inp = JSON.parse(require('fs').readFileSync(0, 'utf8'));",
  "const ts = require(inp.tsPath); const fileName = '/virtual/candidate.ts'; const code = inp.code;",
  "const options = { strict: true, noImplicitAny: true, noEmit: true, noResolve: true, types: [], skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, lib: ['lib.es2020.d.ts'] };",
  "const host = ts.createCompilerHost(options); const orig = host.getSourceFile.bind(host);",
  "host.getSourceFile = (f, l) => (f === fileName ? ts.createSourceFile(f, code, l) : (/lib\\.[a-z0-9.]+\\.d\\.ts$/i.test(f) ? orig(f, l) : undefined));",
  "const oe = host.fileExists.bind(host); host.fileExists = (f) => f === fileName || (/lib\\.[a-z0-9.]+\\.d\\.ts$/i.test(f) && oe(f));",
  "const or = host.readFile.bind(host); host.readFile = (f) => (f === fileName ? code : (/lib\\.[a-z0-9.]+\\.d\\.ts$/i.test(f) ? or(f) : undefined));",
  "const program = ts.createProgram([fileName], options, host);",
  "const d = ts.getPreEmitDiagnostics(program).filter((x) => x.file && x.file.fileName === fileName);",
  "if (d.length) { process.stdout.write(JSON.stringify({ ok: false, reason: 'tsc: ' + ts.flattenDiagnosticMessageText(d[0].messageText, ' ').slice(0, 200), diagnostics: d.length })); }",
  "else { process.stdout.write(JSON.stringify({ ok: true, js: ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, noResolve: true } }).outputText })); }",
].join("\n");

function scrubHostPaths(s: string): string { return String(s).replace(/(?:\/[A-Za-z0-9._@+-]+){2,}/g, "<path>"); }

let TS_PATH: any = null;
function tsPath(): string | null { if (TS_PATH === null) { try { TS_PATH = require.resolve("typescript"); } catch { TS_PATH = false; } } return TS_PATH || null; }

/** compileCheck(code, lang, opts?) -> { ok, applicable, reason?, js? }. JS: vm.Script PARSE only (= node --check; nothing
 *  runs). TS: full type check (strict, noImplicitAny, noResolve) in a time-bounded child process, then transpile to CJS. */
function compileCheck(code: any, lang: string, opts: any = {}): any {
  if (typeof code !== "string" || !code.trim()) return { ok: false, applicable: true, reason: "no code extracted" };
  if (lang === "ts") {
    if (/^\s*\/\/\/\s*<reference/m.test(code)) return { ok: false, applicable: true, reason: "triple-slash reference directives are refused (no host-file following)" };
    const tp = tsPath();
    if (!tp) return { ok: false, applicable: false, reason: "typescript compiler unavailable ⇒ NOT_MEASURED" };
    const spawn = typeof opts.spawn === "function" ? opts.spawn : spawnSync;
    const r = spawn(process.execPath, ["-e", TS_CHECK_SCRIPT], { input: JSON.stringify({ code, tsPath: tp }), encoding: "utf8", timeout: Number(opts.tsTimeoutMs) > 0 ? Number(opts.tsTimeoutMs) : 30000, maxBuffer: 4 * 1024 * 1024 });
    if (r.error || r.status !== 0) {
      const timedOut = !!(r.error && /ETIMEDOUT/.test(String(r.error.code || r.error.message))) || r.signal === "SIGTERM";
      return timedOut ? { ok: false, applicable: true, reason: "tsc: type check exceeded the time bound" } : { ok: false, applicable: false, reason: "type-check process failed ⇒ NOT_MEASURED: " + scrubHostPaths(String((r.error && r.error.message) || r.stderr || "")).slice(0, 160) };
    }
    let o: any; try { o = JSON.parse(String(r.stdout)); } catch { return { ok: false, applicable: false, reason: "type-check output unparseable ⇒ NOT_MEASURED" }; }
    return o.ok ? { ok: true, applicable: true, js: String(o.js) } : { ok: false, applicable: true, reason: scrubHostPaths(o.reason), diagnostics: o.diagnostics };
  }
  try { new vm.Script(code, { filename: "candidate.js" }); return { ok: true, applicable: true, js: code }; }
  catch (e: any) { return { ok: false, applicable: true, reason: "syntax: " + String(e && e.message).slice(0, 200) }; }
}

// In-context minimal assert (counts in a closure the candidate cannot name). Defined INSIDE the candidate's vm context so
// no host-realm object is ever handed to model code (no constructor-chain escape to the host `process`).
const CTX_ASSERT_SRC = [
  "var __odgAssertApi = (function () {",
  "  let n = 0;",
  "  function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; return typeof v === 'undefined' ? 'undefined' : JSON.stringify(v); }",
  "  function fail(m) { var e = new Error(m); e.name = 'AssertionError'; throw e; }",
  "  var a = function (v, m) { n++; if (!v) fail(m || 'not truthy'); };",
  "  a.ok = a;",
  "  a.strictEqual = function (x, y, m) { n++; if (!Object.is(x, y)) fail(m || JSON.stringify(x) + ' !== ' + JSON.stringify(y)); };",
  "  a.equal = function (x, y, m) { n++; if (!(x === y || String(x) === String(y))) fail(m || 'not equal'); };",
  "  a.notStrictEqual = function (x, y, m) { n++; if (Object.is(x, y)) fail(m || 'equal'); };",
  "  a.notEqual = a.notStrictEqual;",
  "  a.deepStrictEqual = function (x, y, m) { n++; if (canon(x) !== canon(y)) fail(m || canon(x) + ' !== ' + canon(y)); };",
  "  a.deepEqual = a.deepStrictEqual;",
  "  a.notDeepStrictEqual = function (x, y, m) { n++; if (canon(x) === canon(y)) fail(m || 'deep equal'); };",
  "  a.throws = function (f, e, m) { n++; var t = false; try { f(); } catch (err) { t = true; } if (!t) fail(m || 'missing expected exception'); };",
  "  a.doesNotThrow = function (f, m) { n++; try { f(); } catch (err) { fail(m || 'unexpected exception'); } };",
  "  a.match = function (s, re, m) { n++; if (!re.test(s)) fail(m || 'no match'); };",
  "  a.strict = a;",
  "  return { assert: a, count: function () { return n; } };",
  "})();",
].join("\n");

/**
 * hiddenTestProgram(js, task, nonce) -> a self-contained Node program. The candidate runs ONLY inside a fresh vm context
 * built from Object.create(null) (no host-realm object, no require/process), with per-call vm timeouts. The program only
 * OBSERVES: for each hidden case it records { value | errorName, argsAfter } as JSON and prints ONE line on stdout
 * prefixed with a per-run random nonce. The EXPECTED values never enter the program — assertions run on the host
 * (gradeObservations), so a candidate cannot neuter the oracle; faking an observation requires computing the answer.
 */
function hiddenTestProgram(js: string, task: any, nonce: string): string {
  const n = String(task.fnName).replace(/[^A-Za-z0-9_$]/g, "");
  const inCtx = "var module = { exports: {} }; var exports = module.exports;\n" + js + "\n;";
  const finder = `globalThis.__odgFn = (typeof ${n} === "function") ? ${n} : (module.exports && typeof module.exports.${n} === "function") ? module.exports.${n} : (typeof module.exports === "function" ? module.exports : undefined);
globalThis.__odgRun = function (argsJson) { var args = JSON.parse(argsJson); if (typeof __odgFn !== "function") return JSON.stringify({ missing: true }); try { var v = __odgFn.apply(null, args); return JSON.stringify({ ok: true, undef: v === undefined, value: v === undefined ? null : v, argsAfter: args }); } catch (e) { return JSON.stringify({ ok: false, errorName: (e && e.name) ? String(e.name) : null, message: String((e && e.message) || e).slice(0, 200) }); } };`;
  const cases = arr(task.cases).map((c: any) => JSON.stringify(arr(c.args)));
  return [
    "'use strict';",
    "const __w = process.stdout.write.bind(process.stdout); const __vm = require('vm');",
    `const __N = ${JSON.stringify(nonce)};`,
    `const __cases = ${JSON.stringify(cases)};`,
    "const __ctx = __vm.createContext(Object.create(null));",
    "let __out;",
    "try {",
    `  __vm.runInContext(${JSON.stringify(inCtx)}, __ctx, { timeout: 5000, filename: 'candidate.js' });`,
    `  __vm.runInContext(${JSON.stringify(finder)}, __ctx, { timeout: 1000 });`,
    "  __out = __cases.map((a) => { const s = __vm.runInContext('__odgRun(' + JSON.stringify(a) + ')', __ctx, { timeout: 5000 }); return typeof s === 'string' ? s : JSON.stringify({ bad: true }); });",
    "} catch (e) { __out = { crashed: String((e && e.message) || e).slice(0, 200) }; }",
    "__w('\\n' + __N + JSON.stringify(__out) + '\\n');",
  ].join("\n");
}

/** testWritingProgram(impl, candidateTests, nonce) -> runs the candidate's assert-script against the trusted `impl`
 *  inside a fresh null-prototype vm context with an in-context assert (assertions counted in a closure). Outcome =
 *  whether the script threw; printed once on stdout behind the per-run nonce. */
function testWritingProgram(impl: string, tests: string, nonce: string): string {
  const prelude = CTX_ASSERT_SRC + "\n" + impl + "\n;var __odgImpl = slugify;\nvar __odgRequire = function (m) { if (m === 'assert' || m === 'node:assert' || m === 'assert/strict' || m === 'node:assert/strict') return __odgAssertApi.assert; if (String(m).charAt(0) === '.') { var o = function () { return __odgImpl.apply(null, arguments); }; o.slugify = __odgImpl; o.default = __odgImpl; return o; } throw new Error('module ' + m + ' is not available'); };\nvar __odgSuite = function (name, f) { if (typeof f === 'function') f(); };";
  const body = "(function (require, describe, it, test) {\n" + tests + "\n})(__odgRequire, __odgSuite, __odgSuite, __odgSuite);";
  return [
    "'use strict';",
    "const __w = process.stdout.write.bind(process.stdout); const __vm = require('vm');",
    `const __N = ${JSON.stringify(nonce)};`,
    "const __ctx = __vm.createContext(Object.create(null));",
    "let __done = false; const __emit = (o) => { if (__done) return; __done = true; __w('\\n' + __N + JSON.stringify(o) + '\\n'); };",
    "process.on('unhandledRejection', (e) => { __emit({ pass: false, error: 'unhandled rejection' }); });",
    "let __count = null;",
    "try {",
    `  __vm.runInContext(${JSON.stringify(prelude)}, __ctx, { timeout: 2000, filename: 'prelude.js' });`,
    "  __count = __vm.runInContext('__odgAssertApi.count', __ctx);",
    `  __vm.runInContext(${JSON.stringify(body)}, __ctx, { timeout: 5000, filename: 'candidate-tests.js' });`,
    "  setImmediate(() => __emit({ pass: true, assertions: Number(__count()) }));",
    "} catch (e) { __emit({ pass: false, assertions: __count ? Number(__count()) : 0, error: String((e && e.message) || e).slice(0, 300) }); }",
  ].join("\n");
}

const CODE_MEMORY_LIMIT_BYTES = 1024 * 1024 * 1024; // RLIMIT_AS for candidate code (an allocation bomb fails fast)

/** defaultCodeRunner(program) -> { ran, exitOk, stdout, reason? }: runs ONLY inside provider-sandbox (bubblewrap; no
 *  network, cleared env) under an RLIMIT_AS memory bound. Sandbox unavailable ⇒ { ran:false } (NOT_MEASURED). */
function defaultCodeRunner(program: string, opts: any = {}): any {
  const PS = require("./provider-sandbox");
  const r = PS.runProvider(program, { command: "node -", timeoutMs: Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 15000, memoryLimitBytes: Number(opts.memoryLimitBytes) > 0 ? Number(opts.memoryLimitBytes) : CODE_MEMORY_LIMIT_BYTES });
  if (!r.launched) return { ran: false, reason: r.reason || "sandbox did not launch" };
  return { ran: true, exitOk: r.ok === true, stdout: r.ok ? String(r.text || "") : "", reason: r.ok ? undefined : r.reason };
}

/** parseResult(stdout, nonce) -> the JSON after the LAST line starting with the nonce on STDOUT, or null. */
function parseResult(stdout: string, nonce: string): any {
  if (typeof nonce !== "string" || nonce.length < 16) return null;
  const lines = String(stdout || "").split("\n").filter((l) => l.startsWith(nonce));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1].slice(nonce.length)); } catch { return null; }
}

/** runSandboxed(run, program, nonce) -> { ran, result|null, reason }: requires launch + exit 0 + a nonce line on stdout. */
function runSandboxed(run: any, program: string, nonce: string): any {
  const r = run(program, nonce) || {};
  if (!r.ran) return { ran: false, result: null, reason: r.reason || "sandbox unavailable" };
  if (r.exitOk !== true) return { ran: true, result: null, reason: "candidate process exited non-zero / timed out: " + String(r.reason || "").slice(0, 120) };
  const res = parseResult(r.stdout, nonce);
  return res === null ? { ran: true, result: null, reason: "no nonce-stamped result on stdout" } : { ran: true, result: res };
}

/** gradeObservations(task, observed) -> { pass, reason }: the HOST-side oracle over the sandbox's observations. */
function gradeObservations(task: any, observed: any): any {
  const cases = arr(task.cases);
  if (!Array.isArray(observed)) return { pass: false, reason: "candidate crashed: " + String((observed && observed.crashed) || "no observations").slice(0, 160) };
  if (observed.length !== cases.length) return { pass: false, reason: "observation count mismatch" };
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]; let o: any; try { o = JSON.parse(observed[i]); } catch { return { pass: false, reason: `case ${i}: unparseable observation` }; }
    if (!isObj(o) || o.missing) return { pass: false, reason: `function ${task.fnName} not found in candidate` };
    if (c.throws !== undefined) {
      if (o.ok !== false) return { pass: false, reason: `case ${i}: expected a throw${typeof c.throws === "string" ? " (" + c.throws + ")" : ""}, got ${canonical(o.undef ? undefined : o.value)}` };
      if (typeof c.throws === "string" && o.errorName !== c.throws) return { pass: false, reason: `case ${i}: threw ${o.errorName}, expected ${c.throws}` };
      continue;
    }
    if (o.ok !== true) return { pass: false, reason: `case ${i}: threw ${o.errorName}: ${o.message}` };
    const got = o.undef ? "undefined" : canonical(o.value);
    if (got !== canonical(c.expect)) return { pass: false, reason: `case ${i}: got ${got.slice(0, 80)} expected ${canonical(c.expect).slice(0, 80)}` };
    if (c.argsAfter !== undefined && canonical(o.argsAfter) !== canonical(c.argsAfter)) return { pass: false, reason: `case ${i}: input mutated (${canonical(o.argsAfter).slice(0, 80)})` };
  }
  return { pass: true, reason: `all ${cases.length} hidden cases passed` };
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
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

function newNonce(): string { return "ODG" + crypto.randomBytes(16).toString("hex") + ":"; }

/**
 * gradeTrial(task, rawText, opts?) -> { passed, compile:{applicable,ok}, structured:{applicable,ok}, strict:{applicable,ok},
 * measured, reason }. OBJECTIVE graders only. opts.codeRunner(program, nonce) -> { ran, exitOk, stdout } injectable
 * (tests). `measured:false` ⇒ the grader could not run (e.g. no sandbox) ⇒ NOT_MEASURED, never a pass.
 */
function gradeTrial(task: any, rawText: any, opts: any = {}): any {
  const run = typeof opts.codeRunner === "function" ? opts.codeRunner : defaultCodeRunner;
  const nonceOf = typeof opts.nonce === "function" ? opts.nonce : newNonce;
  const text = String(rawText == null ? "" : rawText);
  const out: any = { passed: false, measured: true, compile: { applicable: false, ok: false }, structured: { applicable: false, ok: false }, strict: { applicable: false, ok: false }, reason: "" };
  if (CODE_GRADERS.includes(task.grader)) {
    const code = extractCode(text);
    const cc = compileCheck(code, task.lang, opts);
    out.compile = { applicable: cc.applicable !== false, ok: cc.ok === true };
    if (cc.applicable === false) { out.measured = false; out.reason = cc.reason; return out; }
    if (!cc.ok) { out.reason = cc.reason; return out; }
    if (task.grader === "refactor" && /\b(for|while)\s*\(|\bdo\s*\{/.test(stripComments(cc.js))) { out.reason = "refactor constraint violated: a for/while loop remains"; return out; }
    if (task.grader === "test-writing") {
      const n1 = nonceOf();
      const ref = runSandboxed(run, testWritingProgram(task.referenceImpl, cc.js, n1), n1);
      if (!ref.ran) { out.measured = false; out.reason = ref.reason; return out; }
      const minA = Number(task.minAssertions) > 0 ? Number(task.minAssertions) : 1;
      if (!ref.result || ref.result.pass !== true) { out.reason = "tests fail against the CORRECT implementation: " + String((ref.result && ref.result.error) || ref.reason || ""); return out; }
      if (!(Number(ref.result.assertions) >= minA)) { out.reason = "only " + ref.result.assertions + " assertion(s) executed (< " + minA + ")"; return out; }
      const survived: number[] = [];
      for (let i = 0; i < arr(task.mutants).length; i++) {
        const nm = nonceOf();
        const r = runSandboxed(run, testWritingProgram(task.mutants[i], cc.js, nm), nm);
        if (!r.ran) { out.measured = false; out.reason = "sandbox unavailable for a mutant run"; return out; }
        if (r.result && r.result.pass === true) survived.push(i);   // a mutant is KILLED by a failed assertion / crash / non-zero exit
      }
      out.passed = survived.length === 0;
      out.mutantsKilled = arr(task.mutants).length - survived.length; out.mutantsTotal = arr(task.mutants).length;
      out.reason = out.passed ? "all mutants killed; reference passes" : "mutant(s) survived: " + survived.join(",");
      return out;
    }
    const nonce = nonceOf();
    const r = runSandboxed(run, hiddenTestProgram(cc.js, task, nonce), nonce);
    if (!r.ran) { out.measured = false; out.reason = r.reason; return out; }
    if (r.result === null) { out.reason = "hidden test failed: " + r.reason; return out; }
    const g = gradeObservations(task, r.result);
    out.passed = g.pass === true;
    out.reason = out.passed ? "hidden test passed (" + g.reason + ")" : "hidden test failed: " + g.reason;
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
  // THINK-1 (V17.8 P3): optional think passthrough; absent ⇒ calls unchanged (P2 pre-registered profile unaffected)
  const thinkArg = typeof cfg.think === "boolean" ? { think: cfg.think } : {};
  const log = typeof cfg.log === "function" ? cfg.log : () => {};
  const loadavg = typeof cfg.loadavg === "function" ? cfg.loadavg : () => Math.round(require("os").loadavg()[0] * 100) / 100;
  const samplerFactory = typeof cfg.samplerFactory === "function" ? cfg.samplerFactory : () => createProcSampler();
  const tasks = arr(ts.tasks).filter((t: any) => !arr(cfg.onlyTasks).length || arr(cfg.onlyTasks).includes(t.id));
  // V17.8 P2 (all optional; absent ⇒ V155 behaviour unchanged): loadCeiling ⇒ per-trial CONTENDED flag; maxCalls / wallMs ⇒
  // hard caps on generation calls (warm-ups included) — once hit, no further call is sent and the cap is recorded.
  const loadCeiling = typeof cfg.loadCeiling === "number" && Number.isFinite(cfg.loadCeiling) ? cfg.loadCeiling : null;
  const nowMs = typeof cfg.nowMs === "function" ? cfg.nowMs : () => Date.now();
  const deadline = Number(cfg.wallMs) > 0 ? nowMs() + Number(cfg.wallMs) : null;
  const caps: any = { maxCalls: Number.isInteger(cfg.maxCalls) && cfg.maxCalls > 0 ? cfg.maxCalls : null, wallMs: deadline !== null ? Number(cfg.wallMs) : null, calls: 0, capHit: null };
  const capOk = (): boolean => { if (caps.maxCalls !== null && caps.calls >= caps.maxCalls) { caps.capHit = caps.capHit || "maxCalls"; return false; } if (deadline !== null && nowMs() > deadline) { caps.capHit = caps.capHit || "wallMs"; return false; } caps.calls++; return true; };
  const ver = await P.ollamaVersion();
  const listed = await P.listModels();
  const meta = { ...thinkArg, ollamaVersion: ver.ok ? ver.version : null, daemonUp: listed.ok === true, taskSetVersion: ts.version, taskSetSha256: ts.sha256, trialsPerTask: trialsN, options, keepAlive: cfg.keepAlive || "10m", parallelism: 1 };
  const models: any[] = []; const trials: any[] = []; const coldLoads: any = {};
  for (const id of arr(cfg.models)) {
    const tag = listed.ok ? arr(listed.models).find((m: any) => m.id === id) : null;
    if (!tag) { models.push({ id, available: false, reason: listed.ok ? "model not installed in the local daemon" : "Ollama daemon not reachable" }); log(`[${id}] UNAVAILABLE`); continue; }
    const show = await P.showModel(id);
    models.push({ id, available: true, digest: tag.digest, sizeBytes: tag.sizeBytes, quantization: (show.ok && show.details.quantization) || tag.quantization, parameterSize: (show.ok && show.details.parameterSize) || tag.parameterSize, parameterCount: show.ok ? show.parameterCount : null, contextLength: show.ok && show.contextLength !== null ? show.contextLength : tag.contextLength, family: tag.family, format: tag.format });
    if (!capOk()) { log(`[${id}] cap ${caps.capHit} — not started`); break; }
    const warm = await P.generateMeasured({ model: id, prompt: "Reply with the single word OK.", options: { ...options, num_predict: 4 }, keepAlive: meta.keepAlive, timeoutMs: cfg.timeoutMs, ...thinkArg });
    coldLoads[id] = warm.ok ? { totalMs: warm.totalMs, loadMs: warm.loadDurationNs !== null ? Math.round(warm.loadDurationNs / 1e6) : null } : { error: warm.reason };
    log(`[${id}] cold load ${JSON.stringify(coldLoads[id])}`);
    for (const task of tasks) {
      for (let k = 1; k <= trialsN; k++) {
        if (!capOk()) break;
        const sampler = samplerFactory();
        const hostLoad1m = loadavg();
        sampler.start();
        const g = await P.generateMeasured({ model: id, prompt: task.prompt, options, keepAlive: meta.keepAlive, timeoutMs: cfg.timeoutMs, ...thinkArg });
        const res = sampler.stop();
        const rec: any = { model: id, taskId: task.id, taskClass: task.taskClass, trial: k, generated: g.ok === true };
        if (!g.ok) { rec.error = g.reason; rec.unavailable = !!g.unavailable; rec.timedOut = !!g.timedOut; rec.grade = { passed: false, measured: !g.unavailable, compile: { applicable: CODE_GRADERS.includes(task.grader), ok: false }, structured: { applicable: JSON_GRADERS.includes(task.grader), ok: false }, strict: { applicable: task.grader === "strict-schema", ok: false }, reason: "generation failed: " + g.reason }; }
        else {
          rec.ttftMs = g.ttftMs; rec.totalMs = g.totalMs; rec.tokPerSec = g.tokPerSec; rec.evalCount = g.evalCount; rec.promptEvalCount = g.promptEvalCount;
          rec.promptTokPerSec = promptTokPerSec(g);   // V17.8 P2: prompt_eval_count / prompt_eval_duration (daemon counters)
          rec.loadMs = g.loadDurationNs !== null ? Math.round(g.loadDurationNs / 1e6) : null; rec.doneReason = g.doneReason;
          rec.outputSha256 = sha256(g.text); rec.outputChars = g.text.length; rec.outputHead = g.text.slice(0, 160);
          rec.grade = gradeTrial(task, g.text, { codeRunner: cfg.codeRunner });
        }
        rec.hostLoad1m = hostLoad1m; if (loadCeiling !== null) rec.contended = !(typeof hostLoad1m === "number" && hostLoad1m <= loadCeiling); rec.cpuAvgPct = res.cpuAvgPct; rec.cpuPeakPct = res.cpuPeakPct; rec.rssPeakMb = res.rssPeakMb; rec.resourceSamples = res.samples;
        trials.push(rec);
        log(`[${id}] ${task.id}#${k} ${rec.grade.passed ? "PASS" : "FAIL"} ${rec.totalMs || "-"}ms ${rec.tokPerSec || "-"}tok/s cpu=${rec.cpuAvgPct}% rss=${rec.rssPeakMb}MB — ${String(rec.grade.reason).slice(0, 90)}`);
      }
    }
    await P.unloadModel(id);
    if (caps.capHit) break;
  }
  return { ok: true, meta: { ...meta, ...(loadCeiling !== null ? { loadCeiling } : {}), ...(caps.maxCalls !== null || caps.wallMs !== null ? { caps: { maxCalls: caps.maxCalls, wallMs: caps.wallMs, calls: caps.calls, capHit: caps.capHit } } : {}) }, models, trials, coldLoads, taskSet: { version: ts.version, sha256: ts.sha256, tasks: tasks.map((t: any) => ({ id: t.id, taskClass: t.taskClass, grader: t.grader, lang: t.lang })) } };
}

/* =========================== V17.8 P2 measurement profile (pure summaries over runBenchmark trials) =========================== */
/** promptTokPerSec(g) — prompt_eval_count / prompt_eval_duration(s) from the daemon's counters; absent/zero ⇒ null (NOT_MEASURED). */
function promptTokPerSec(g: any): number | null {
  const c = g && Number.isFinite(g.promptEvalCount) ? g.promptEvalCount : null; const d = g && Number.isFinite(g.promptEvalDurationNs) ? g.promptEvalDurationNs : null;
  return c !== null && d !== null && c > 0 && d > 0 ? Math.round((c / (d / 1e9)) * 100) / 100 : null;
}
function stat(xs: number[]): any {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, status: "NOT_MEASURED" };
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return { n: v.length, mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, p50: q(0.5), min: v[0], max: v[v.length - 1] };
}
const MEASURE_RULE = "MEAS-1: speed statistics (generation tok/s = eval_count/eval_duration, prompt tok/s = prompt_eval_count/prompt_eval_duration, totalMs, warm loadMs) use ONLY generated trials NOT flagged CONTENDED (hostLoad1m ≤ loadCeiling); CONTENDED trials stay in the raw trials and are counted; cold load = the first (warm-up) generation after unload; RSS peak = /proc samples of the Ollama runner process (0 samples ⇒ NOT_MEASURED); per-class pass rate over MEASURED trials (grade.measured ≠ false), all trials regardless of load";
/** summarizeMeasurement(run) -> per model: speed (uncontended only), coldLoad, rssPeak, perClass pass rate, contention counts. */
function summarizeMeasurement(run: any): any {
  const out: any = {};
  for (const m of arr(run && run.models)) {
    const ts = arr(run.trials).filter((t: any) => t.model === m.id);
    const gen = ts.filter((t: any) => t.generated);
    const clean = gen.filter((t: any) => t.contended !== true);
    const perClass: any = {};
    for (const t of ts) { const c = perClass[t.taskClass] = perClass[t.taskClass] || { passes: 0, n: 0, notMeasured: 0 }; if (t.grade && t.grade.measured === false) c.notMeasured++; else { c.n++; if (t.grade && t.grade.passed) c.passes++; } }
    for (const c of Object.values(perClass) as any[]) c.passRate = c.n ? Math.round((c.passes / c.n) * 1000) / 1000 : null;
    const rss = ts.filter((t: any) => Number(t.resourceSamples) > 0).map((t: any) => t.rssPeakMb);
    const cold = run.coldLoads ? run.coldLoads[m.id] : null;
    out[m.id] = { available: m.available === true, trials: ts.length, generated: gen.length, contended: gen.length - clean.length,
      speed: { genTokPerSec: stat(clean.map((t: any) => t.tokPerSec)), promptTokPerSec: stat(clean.map((t: any) => t.promptTokPerSec)), totalMs: stat(clean.map((t: any) => t.totalMs)), warmLoadMs: stat(clean.map((t: any) => t.loadMs)) },
      coldLoadMs: cold && Number.isFinite(cold.loadMs) ? cold.loadMs : null, coldLoadStatus: cold && Number.isFinite(cold.loadMs) ? "MEASURED" : "NOT_MEASURED",
      rssPeakMb: rss.length ? Math.max(...rss) : null, rssStatus: rss.length ? "MEASURED (/proc of the Ollama runner)" : "NOT_MEASURED (runner /proc not readable or no sample)",
      hostLoad1m: stat(ts.map((t: any) => t.hostLoad1m)), perClass };
  }
  return { rule: MEASURE_RULE, models: out };
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
    "model output is UNTRUSTED: compile checks parse/type-check only (TS: noResolve, child process, time-bounded); candidate code runs ONLY inside the bubblewrap sandbox under RLIMIT_AS, in a null-prototype vm context",
    "the oracle is on the HOST: the sandboxed program records observations only (expected values never enter it); a result counts only with exit 0 + the per-run nonce on stdout",
    "every grader is objective pass/fail against a hidden oracle (hidden test / mutants / exact JSON / schema); no model self-report",
    "a grader that cannot run ⇒ measured:false ⇒ NOT_MEASURED — never a pass; a missing model ⇒ UNAVAILABLE, no fabricated trials",
    "one model resident at a time (parallelism 1; unload after each model); options recorded verbatim with the task-set sha256",
  ]),
});

module.exports = { promptTokPerSec, summarizeMeasurement, MEASURE_RULE, TASKSET_FILE, DEFAULT_OPTIONS, CODE_MEMORY_LIMIT_BYTES, CTX_ASSERT_SRC, loadTaskSet, validateTaskSet, extractCode, parseJsonLoose, compileCheck, hiddenTestProgram, testWritingProgram, gradeObservations, gradeTrial, createProcSampler, runBenchmark, parseResult, defaultCodeRunner, LOCAL_MODEL_BENCHMARK_CONTRACT };
export {};
