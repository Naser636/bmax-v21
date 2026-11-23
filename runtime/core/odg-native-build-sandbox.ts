#!/usr/bin/env node
"use strict";

/*
 * V15.9 — NATIVE BUILD ISOLATION (outer-process sandbox for MODEL-WRITTEN code). native-project-builder used to compile
 * generated files in ODG's OWN process (module._compile) and run the independent test in-thread; a require allowlist
 * cannot close the in-process escapes (require.cache, module.constructor._load/createRequire, process.mainModule.require,
 * process.getBuiltinModule, Function('return process'), dynamic import(), process.binding). This module moves the
 * BUILD + INDEPENDENT TEST of a native project into an OUTER process, REUSING the proven #898 pattern — no second sandbox:
 *
 *   provider-sandbox.runProvider (bubblewrap: --unshare-all ⇒ NO network, --clearenv, no /home|/etc|/var, tmpfs /tmp,
 *   --die-with-parent, opt-in prlimit --as memory bound, spawn timeout, fail-closed --info-fd launch proof)
 *     via odg-local-model-benchmark.defaultCodeRunner (`node -` + RLIMIT_AS) and .parseResult (per-run nonce channel)
 *       ⇒ inside: a null-prototype vm context (no require/process/console) built with vm.compileFunction(parsingContext)
 *          so NO host-realm object is ever handed to model code; in-context `assert` = the benchmark's CTX_ASSERT_SRC.
 *
 * Only DATA crosses the boundary: generated file sources + the test's INPUTS go in (program text on stdin); only a JSON
 * observation/verdict comes out, on stdout, behind a per-run random nonce (model code has no stdout). The HOST never
 * compiles or executes model code on this path.
 *
 * Serializable test forms (the host-function independentTest cannot cross a process boundary):
 *   spec.independentTestSource : JS source of a function EXPRESSION `(modules) => boolean`, evaluated INSIDE the sandbox
 *                                (defined BEFORE any model code runs). Verdict = `=== true`. Same realm as the candidate
 *                                ⇒ tamper-resistance EQUAL to the legacy in-thread test (no better, no worse) — stated.
 *   spec.independentTestCases  : [{ entry, member?, args, expect }] — the sandbox only RECORDS observations; EXPECTED values
 *                                never enter it; the HOST grades (canonical JSON equality). The stronger oracle.
 * Fail-closed: no sandbox / probe fails ⇒ NOT_RUN (never an in-process fallback); a launched run without a nonce-stamped
 * result (crash, OOM, timeout, garbage, forgery) ⇒ a NON-pass. NOT_MEASURED is never a number. Dual export.
 */

const crypto = require("crypto");
const LMB = require("./odg-local-model-benchmark.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function freeze<T>(o: T): T { return Object.freeze(o) as T; }

const UNISOLATED_OPT_IN = "UNISOLATED_IN_PROCESS";
const DEFAULT_STEP_TIMEOUT_MS = 5000;      // per vm step (load, each case, the test)
const DEFAULT_PROCESS_TIMEOUT_MS = 30000;  // whole sandboxed process (spawn timeout ⇒ killed)
const MEMORY_LIMIT_BYTES = 1024 * 1024 * 1024; // RLIMIT_AS (same bound #898 proved for candidate code)

function newNonce(): string { return "ODGNB" + crypto.randomBytes(16).toString("hex") + ":"; }

/** serializableTest(spec) -> { kind:"source", source } | { kind:"cases", cases } | null. Source wins if both are given. */
function serializableTest(spec: any): any {
  const s = isObj(spec) ? spec : {};
  if (typeof s.independentTestSource === "string" && s.independentTestSource.trim()) return freeze({ kind: "source", source: s.independentTestSource });
  if (Array.isArray(s.independentTestCases) && s.independentTestCases.length > 0 && s.independentTestCases.every((c: any) => isObj(c) && typeof c.entry === "string" && Array.isArray(c.args) && "expect" in c)) {
    return freeze({ kind: "cases", cases: s.independentTestCases.map((c: any) => ({ entry: c.entry, member: typeof c.member === "string" ? c.member : null, args: c.args, expect: c.expect })) });
  }
  return null;
}

/** hasAcceptanceCriterion(spec) -> true if ANY acceptance criterion is present (host function OR a serializable form). */
function hasAcceptanceCriterion(spec: any): boolean { return isObj(spec) && (typeof spec.independentTest === "function" || serializableTest(spec) !== null); }

/** testSourceFromFn(fn, entryPath, preludeSrc?) -> an independentTestSource that applies a SELF-CONTAINED test function
 *  (e.g. a corpus `task.test(entryExport)`) to modules[entryPath] inside the sandbox. preludeSrc carries the helper
 *  functions the test references (e.g. the corpus `jeq`). A throw ⇒ false (same as the legacy try/catch wrappers). */
function testSourceFromFn(fnc: any, entryPath: string, preludeSrc: string = ""): string {
  if (typeof fnc !== "function") throw new Error("testSourceFromFn: not a function");
  return "(function () {\n" + String(preludeSrc || "") + "\nvar __t = (" + String(fnc) + ");\nreturn function (m) { try { return __t(m[" + JSON.stringify(String(entryPath)) + "]) === true; } catch (e) { return false; } };\n})()";
}

// ---- the in-sandbox program ------------------------------------------------------------------------------------------
// LOADER runs FIRST in the fresh null-prototype context (before any model code): captures intrinsics, defines the
// NON-writable/NON-configurable entrypoints the outer program drives, and a CJS loader whose require resolves ONLY other
// generated files (same basename rule as the legacy assembleAndLoad) or the in-context assert; everything else ⇒ REQUIRE_DENIED.
const LOADER_SRC = [
  "(function (g) {",
  "  'use strict';",
  "  var S = JSON.stringify, P = JSON.parse, DP = Object.defineProperty, W = Object.create(null), R = Object.create(null), paths = [], T = null, C = [], A = __odgAssertApi.assert;",
  "  function msg(e) { try { return String(e && e.message !== undefined ? e.message : e).slice(0, 500); } catch (x) { return 'unprintable error'; } }",
  "  function find(req) { req = String(req); for (var i = 0; i < paths.length; i++) { var k = paths[i]; if (k === req || k.endsWith(req.replace(/^\\.\\//, '')) || req.endsWith(k.replace(/^.*\\//, '').replace(/\\.js$/, ''))) return k; } return null; }",
  "  function make(p) { var m = { exports: {} }; var req = function (r) { var k = find(r); if (k !== null) { if (!R[k]) R[k] = make(k); return R[k].exports; } var b = String(r).replace(/^node:/, ''); if (b === 'assert' || b === 'assert/strict') return A; throw new Error(\"REQUIRE_DENIED: '\" + String(r) + \"' — inside the native-build sandbox generated code may only require other generated files or 'assert' (no host modules)\"); }; W[p].call(m.exports, m.exports, req, m, p, ''); return m; }",
  "  function obs(fn, args) { try { var v = fn.apply(null, args); var s; try { s = S(v === undefined ? null : v); } catch (x) { return S({ ok: true, unserializable: true }); } return '{\"ok\":true,\"undef\":' + (v === undefined) + ',\"value\":' + (s === undefined ? 'null' : s) + '}'; } catch (e) { return S({ ok: false, threw: msg(e) }); } }",
  "  function target(entry, member) { var m = R[entry]; if (!m) return null; var x = m.exports; if (member !== null && member !== undefined) x = x ? x[member] : undefined; return typeof x === 'function' ? x : null; }",
  "  function def(n, v) { DP(g, n, { value: v, writable: false, configurable: false, enumerable: false }); }",
  "  def('__odgDefine', function (p, w) { if (typeof p !== 'string' || typeof w !== 'function' || W[p]) return false; W[p] = w; paths.push(p); return true; });",
  "  def('__odgSetTest', function (t) { T = typeof t === 'function' ? t : null; return T !== null; });",
  "  def('__odgSetCases', function (j) { C = P(j); return true; });",
  "  def('__odgLoadAll', function () { try { for (var i = 0; i < paths.length; i++) { var p = paths[i]; if (!R[p]) R[p] = make(p); } return ''; } catch (e) { return 'ERR:' + msg(e); } });",
  "  def('__odgRunTest', function () { if (T === null) return 'E:no test'; try { var mods = {}; for (var i = 0; i < paths.length; i++) mods[paths[i]] = R[paths[i]] ? R[paths[i]].exports : undefined; return T(mods) === true ? 'T' : 'F'; } catch (e) { return 'E:' + msg(e); } });",
  "  def('__odgCase', function (i) { var c = C[i]; var f = target(c.entry, c.member === undefined ? null : c.member); if (f === null) return S({ ok: false, missing: true }); return obs(f, c.args); });",
  "})(globalThis);",
].join("\n");

/** buildSandboxProgram(files, test, repair, nonce, stepTimeoutMs) -> the self-contained Node program run INSIDE bwrap. PURE. */
function buildSandboxProgram(files: any, test: any, repair: any, nonce: string, stepTimeoutMs: number = DEFAULT_STEP_TIMEOUT_MS): string {
  const entries = Object.keys(isObj(files) ? files : {}).filter((k) => typeof files[k] === "string").map((k) => [k, files[k]]);
  const t = isObj(test) ? test : { kind: "none" };
  const cases = t.kind === "cases" ? t.cases.map((c: any) => ({ entry: c.entry, member: c.member, args: c.args })) : [];   // EXPECTED values stay on the host
  const rep = isObj(repair) && typeof repair.entry === "string" && Array.isArray(repair.examples) ? repair.examples.map((e: any) => ({ entry: repair.entry, member: null, args: e.args })) : [];
  const allCases = cases.concat(rep);
  const to = Number.isFinite(stepTimeoutMs) && stepTimeoutMs > 0 ? Math.floor(stepTimeoutMs) : DEFAULT_STEP_TIMEOUT_MS;
  return [
    "'use strict';",
    "const __w = process.stdout.write.bind(process.stdout); const __vm = require('vm');",
    `const __N = ${JSON.stringify(nonce)};`,
    `const __F = ${JSON.stringify(entries)};`,
    `const __TK = ${JSON.stringify(t.kind)}; const __TS = ${JSON.stringify(t.kind === "source" ? t.source : "")};`,
    `const __C = ${JSON.stringify(JSON.stringify(allCases))}; const __NC = ${cases.length}; const __NR = ${rep.length};`,
    `const __TO = ${to};`,
    "const __out = { build: { ok: false, error: null }, test: null, repair: null };",
    "const __s = (v) => (typeof v === 'string' ? v : null);",
    "try {",
    "  const __ctx = __vm.createContext(Object.create(null), { microtaskMode: 'afterEvaluate' });",
    `  __vm.runInContext(${JSON.stringify(LMB.CTX_ASSERT_SRC + "\n" + LOADER_SRC)}, __ctx, { timeout: __TO, filename: 'odg-loader.js' });`,
    "  const __def = __vm.runInContext('__odgDefine', __ctx);",
    "  let __compileErr = null;",
    "  for (const [p, src] of __F) { try { const w = __vm.compileFunction(src, ['exports', 'require', 'module', '__filename', '__dirname'], { parsingContext: __ctx, filename: p }); if (__def(p, w) !== true) { __compileErr = 'duplicate module ' + p; break; } } catch (e) { __compileErr = String((e && e.message) || e).slice(0, 500); break; } }",
    "  if (__TK === 'source') { const okT = __vm.runInContext('__odgSetTest((' + __TS + '\\n))', __ctx, { timeout: __TO, filename: 'independent-test.js' }); if (okT !== true) __out.test = { kind: 'source', verdict: 'E:test source did not evaluate to a function' }; }",
    "  __vm.runInContext('__odgSetCases(' + JSON.stringify(__C) + ')', __ctx, { timeout: __TO });",
    "  if (__compileErr !== null) { __out.build = { ok: false, error: __compileErr }; }",
    "  else {",
    "    const le = __s(__vm.runInContext('__odgLoadAll()', __ctx, { timeout: __TO }));",
    "    if (le === null || le.indexOf('ERR:') === 0) { __out.build = { ok: false, error: le === null ? 'loader returned a non-string' : le.slice(4) }; }",
    "    else {",
    "      __out.build = { ok: true, error: null };",
    "      const runCase = (i) => { try { const r = __s(__vm.runInContext('__odgCase(' + i + ')', __ctx, { timeout: __TO })); return r === null ? '{\"ok\":false,\"bad\":true}' : r; } catch (e) { return JSON.stringify({ ok: false, threw: String((e && e.message) || e).slice(0, 300), timeout: /timed out/i.test(String(e && e.message)) }); } };",
    "      if (__TK === 'source' && __out.test === null) { try { const v = __s(__vm.runInContext('__odgRunTest()', __ctx, { timeout: __TO })); __out.test = { kind: 'source', verdict: v === null ? 'E:non-string verdict' : v }; } catch (e) { __out.test = { kind: 'source', verdict: 'E:' + String((e && e.message) || e).slice(0, 300), timeout: /timed out/i.test(String(e && e.message)) }; } }",
    "      if (__TK === 'cases') { const o = []; for (let i = 0; i < __NC; i++) o.push(runCase(i)); __out.test = { kind: 'cases', observations: o }; }",
    "      if (__NR > 0) { const o = []; for (let i = __NC; i < __NC + __NR; i++) o.push(runCase(i)); __out.repair = o; }",
    "    }",
    "  }",
    "} catch (e) { __out.build = { ok: false, error: 'sandbox step failed: ' + String((e && e.message) || e).slice(0, 300) }; __out.stepTimeout = /timed out/i.test(String(e && e.message)); }",
    "__w('\\n' + __N + JSON.stringify(__out) + '\\n');",
  ].join("\n");
}

function canon(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return v === undefined ? "undefined" : JSON.stringify(v);
}
function parseObs(s: any): any { try { const o = JSON.parse(String(s)); return isObj(o) ? o : null; } catch { return null; } }

/** gradeCases(cases, observations) -> { pass, error }: HOST-side oracle (expected values never entered the sandbox). */
function gradeCases(cases: any[], observations: any): any {
  if (!Array.isArray(observations) || observations.length !== cases.length) return { pass: false, error: "observation count mismatch (fail-closed)" };
  for (let i = 0; i < cases.length; i++) {
    const o = parseObs(observations[i]); const c = cases[i];
    if (!o) return { pass: false, error: `case ${i}: unparseable observation (fail-closed)` };
    if (o.missing) return { pass: false, error: `case ${i}: entry ${c.entry}${c.member ? "." + c.member : ""} is not a function` };
    if (o.ok !== true) return { pass: false, error: `case ${i}: threw: ${String(o.threw || "error")}` };
    if (o.unserializable) return { pass: false, error: `case ${i}: result not serializable (fail-closed)` };
    const actual = o.undef === true ? undefined : o.value;
    if (canon(actual) !== canon(c.expect)) return { pass: false, error: `case ${i}: (${JSON.stringify(c.args)}) returned ${canon(actual)}, expected ${canon(c.expect)}` };
  }
  return { pass: true, error: null };
}

/** defaultRunner(program, nonce, opts) — REUSES odg-local-model-benchmark.defaultCodeRunner (provider-sandbox bwrap +
 *  RLIMIT_AS). Returns { ran, exitOk, stdout, reason }. ran:false ⇒ the sandbox did not launch (NOT_RUN). */
function defaultRunner(program: string, _nonce: string, opts: any = {}): any {
  return LMB.defaultCodeRunner(program, { timeoutMs: Number(opts.processTimeoutMs) > 0 ? Number(opts.processTimeoutMs) : DEFAULT_PROCESS_TIMEOUT_MS, memoryLimitBytes: Number(opts.memoryLimitBytes) > 0 ? Number(opts.memoryLimitBytes) : MEMORY_LIMIT_BYTES });
}

/**
 * runIsolated(files, test, opts) -> {
 *   status: "EXECUTED" | "NOT_RUN", reason, buildOk, buildError, verified (bool | null when NOT_RUN), verifyError,
 *   outcome: PASS|FAIL|BUILD_ERROR|TIMEOUT|CRASH_OR_NO_RESULT|NO_TEST|NOT_RUN, repairObservations, wallMs, isolation }.
 * opts: { runner?(program, nonce, opts) (injectable for tests), nonce?() , repair?:{entry, examples}, stepTimeoutMs?,
 * processTimeoutMs?, memoryLimitBytes? }. ONLY a nonce-stamped, well-formed result counts; anything else is a NON-pass.
 */
function runIsolated(files: any, test: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const run = typeof o.runner === "function" ? o.runner : defaultRunner;
  const nonce = typeof o.nonce === "function" ? String(o.nonce()) : newNonce();
  const t0 = Date.now();
  const isolation = freeze({ mechanism: "provider-sandbox bwrap (--unshare-all, --clearenv, no /home|/etc|/var) + prlimit RLIMIT_AS + null-prototype vm context", network: false, memoryLimitBytes: Number(o.memoryLimitBytes) > 0 ? Number(o.memoryLimitBytes) : MEMORY_LIMIT_BYTES, hostExecutesModelCode: false });
  const base = (x: any) => freeze({ status: "EXECUTED", reason: null, buildOk: false, buildError: null, verified: false, verifyError: null, outcome: "CRASH_OR_NO_RESULT", repairObservations: null, wallMs: Date.now() - t0, isolation, ...x });
  let program: string;
  try { program = buildSandboxProgram(files, test, o.repair, nonce, Number(o.stepTimeoutMs)); }
  catch (e: any) { return base({ status: "NOT_RUN", verified: null, outcome: "NOT_RUN", reason: "program construction failed: " + String((e && e.message) || e) }); }
  let r: any;
  try { r = run(program, nonce, o) || {}; } catch (e: any) { return base({ status: "NOT_RUN", verified: null, outcome: "NOT_RUN", reason: "sandbox runner threw: " + String((e && e.message) || e) }); }
  if (r.ran !== true) return base({ status: "NOT_RUN", verified: null, outcome: "NOT_RUN", reason: "sandbox unavailable / did not launch: " + String(r.reason || "unknown") + " — refusing in-process fallback (fail-closed)" });
  if (r.exitOk !== true) {
    const timedOut = /ETIMEDOUT|timed out|SIGTERM|SIGKILL/i.test(String(r.reason || ""));
    return base({ outcome: timedOut ? "TIMEOUT" : "CRASH_OR_NO_RESULT", buildError: timedOut ? "sandbox TIMEOUT: the candidate did not terminate within the process budget — killed (fail-closed)" : "sandboxed process failed (crash / memory bound / non-zero exit): " + String(r.reason || "").slice(0, 200), verifyError: null });
  }
  const res = LMB.parseResult(String(r.stdout || ""), nonce);
  if (!isObj(res) || !isObj(res.build) || typeof res.build.ok !== "boolean") return base({ buildError: "no well-formed nonce-stamped result on stdout (garbage / forged / truncated output) — fail-closed" });
  if (res.build.ok !== true) return base({ outcome: res.stepTimeout === true ? "TIMEOUT" : "BUILD_ERROR", buildError: String(res.build.error || "build failed") });
  const repairObservations = Array.isArray(res.repair) ? res.repair : null;
  const tt = isObj(test) ? test : { kind: "none" };
  if (tt.kind === "source") {
    const v = res.test && typeof res.test.verdict === "string" ? res.test.verdict : null;
    if (v === "T") return base({ buildOk: true, verified: true, outcome: "PASS", repairObservations });
    if (v === "F") return base({ buildOk: true, verified: false, outcome: "FAIL", repairObservations });
    return base({ buildOk: true, verified: false, outcome: res.test && res.test.timeout === true ? "TIMEOUT" : "FAIL", verifyError: v ? v.replace(/^E:/, "") : "no test verdict (fail-closed)", repairObservations });
  }
  if (tt.kind === "cases") {
    const obs = res.test && Array.isArray(res.test.observations) ? res.test.observations : null;
    const g = gradeCases(tt.cases, obs);
    const anyTimeout = Array.isArray(obs) && obs.some((s: any) => { const x = parseObs(s); return !!(x && x.timeout); });
    return base({ buildOk: true, verified: g.pass === true, outcome: g.pass ? "PASS" : (anyTimeout ? "TIMEOUT" : "FAIL"), verifyError: g.error, repairObservations });
  }
  return base({ buildOk: true, verified: false, outcome: "NO_TEST", verifyError: "no independent test supplied", repairObservations });
}

/** replayFn(observations) -> a HOST function that REPLAYS sandbox observations in call order (never runs model code), so
 *  odg-repair-feedback.buildExecutionFeedback can build the specific execution-feedback hint from isolated runs. */
function replayFn(observations: any[]): any {
  let i = 0;
  return function () {
    const o = parseObs(observations[i++]);
    if (!o) throw new Error("no observation (sandbox)");
    if (o.missing) throw new Error("entry is not a function");
    if (o.ok !== true) throw new Error(String(o.threw || "error"));
    return o.undef === true ? undefined : o.value;
  };
}

let PROBE_CACHE: any = null;
/** probeSandbox(runner?) -> { ok, reason }: one trivial isolated build+test (cached for the default runner). Detects a
 *  launched-but-broken sandbox (e.g. no node inside) so infrastructure failure is NOT_RUN, never a candidate FAILURE. */
function probeSandbox(runner?: any): any {
  const isDefault = typeof runner !== "function";
  if (isDefault && PROBE_CACHE) return PROBE_CACHE;
  const r = runIsolated({ "probe.js": "module.exports = (a, b) => a + b;" }, { kind: "cases", cases: [{ entry: "probe.js", member: null, args: [2, 3], expect: 5 }] }, isDefault ? {} : { runner });
  const out = freeze({ ok: r.status === "EXECUTED" && r.verified === true, reason: r.status !== "EXECUTED" ? r.reason : (r.verified === true ? null : "sandbox probe launched but did not produce a correct verdict: " + String(r.buildError || r.verifyError || r.outcome)) });
  if (isDefault && out.ok) PROBE_CACHE = out;   // only cache success (a transient failure is retried next time)
  return out;
}

const NATIVE_BUILD_SANDBOX_CONTRACT = Object.freeze({
  id: "V159-NATIVE-BUILD-SANDBOX",
  purpose: "execute MODEL-WRITTEN native-build code ONLY in an outer isolated process; the host never compiles/executes it",
  reuses: Object.freeze([
    "provider-sandbox.runProvider/buildBwrapArgs (bubblewrap --unshare-all/--clearenv/minimal ro binds/--info-fd launch proof/prlimit RLIMIT_AS) — no second sandbox",
    "odg-local-model-benchmark.defaultCodeRunner + parseResult + CTX_ASSERT_SRC (#898 pattern: null-prototype vm context inside bwrap, per-run nonce, JSON observations only)",
    "odg-repair-feedback.buildExecutionFeedback (fed by replayFn over sandbox observations)",
  ]),
  invariants: Object.freeze([
    "only DATA crosses: file sources + test inputs in; a nonce-stamped JSON verdict/observations out; model code has no stdout/process/require",
    "sandbox unavailable / probe failed ⇒ NOT_RUN (verified=null) — NEVER a silent in-process fallback",
    "a launched run without a well-formed nonce-stamped result (crash, OOM, timeout, garbage, forgery) ⇒ NON-pass",
    "no network (--unshare-all), cleared env, no repo/home bind, tmpfs /tmp, RLIMIT_AS 1 GiB, per-step vm timeout + process timeout",
    "CASES form: expected values stay on the host (host-graded). SOURCE form: test runs in the candidate realm (tamper-equivalent to the legacy in-thread test — stated, not hidden)",
  ]),
});

module.exports = { UNISOLATED_OPT_IN, DEFAULT_STEP_TIMEOUT_MS, DEFAULT_PROCESS_TIMEOUT_MS, MEMORY_LIMIT_BYTES, serializableTest, hasAcceptanceCriterion, testSourceFromFn, buildSandboxProgram, gradeCases, runIsolated, replayFn, probeSandbox, newNonce, NATIVE_BUILD_SANDBOX_CONTRACT };
export {};
