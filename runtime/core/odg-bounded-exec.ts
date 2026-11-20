#!/usr/bin/env node
"use strict";
/*
 * V327 §4 — BOUNDED (TIMEBOXED) VERIFICATION of untrusted codegen output. The real finding from the feedback A/B: an
 * in-thread verifier CANNOT interrupt an infinite-loop generation, so a runaway candidate hangs the whole cycle. This
 * runs a candidate CommonJS source + structured examples in a CHILD process with a HARD timeout — a hang is KILLED and
 * reported as TIMEOUT (fail-closed; a non-terminating program is a FAILURE, never a false pass). World-class codegen
 * harnesses sandbox/timebox untrusted execution for exactly this reason.
 *
 * Structure: buildProbe (PURE) emits the child program; classifyResult (PURE) maps the child's {stdout,status,error}
 * to a verdict (PASS | FAIL | TIMEOUT | LOAD_ERROR | EXEC_ERROR) + the first failing case; runExamplesBounded composes
 * them with an INJECTABLE spawn (default: child_process.execFileSync with the timeout) so the pure logic is deterministic
 * and testable without spawning. No fabricated pass: anything that is not an explicit child-reported PASS is a non-pass.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }

const VERDICT = Object.freeze({ PASS: "PASS", FAIL: "FAIL", TIMEOUT: "TIMEOUT", LOAD_ERROR: "LOAD_ERROR", EXEC_ERROR: "EXEC_ERROR" });

/** buildProbe(sourceCode, examples) -> a self-contained node program (string) that loads the CommonJS source, runs each
 *  example (args→expect), and prints a single JSON line: {v:"PASS"} | {v:"FAIL",failing} | {v:"LOAD_ERROR",e}. PURE. */
function buildProbe(sourceCode: any, examples: any): string {
  const SRC = JSON.stringify(typeof sourceCode === "string" ? sourceCode : "");
  const EX = JSON.stringify(Array.isArray(examples) ? examples : []);
  return [
    "let m={exports:{}};",
    "try{(new Function('module','exports',", SRC, "))(m,m.exports);}",
    "catch(e){console.log(JSON.stringify({v:'LOAD_ERROR',e:String(e&&e.message||e)}));process.exit(0);}",
    "var f=m.exports;var E=", EX, ";",
    "if(typeof f!=='function'){console.log(JSON.stringify({v:'LOAD_ERROR',e:'export is not a function'}));process.exit(0);}",
    "var EQ=function(x,y){return JSON.stringify(x)===JSON.stringify(y);};",  // deep (structural) equality — correct for array/object/null outputs, not just scalars
    "for(var i=0;i<E.length;i++){var ex=E[i];var a,t=null;try{a=f.apply(null,ex.args);}catch(x){t=String(x&&x.message||x);}",
    "if(t!==null||!EQ(a,ex.expect)){console.log(JSON.stringify({v:'FAIL',failing:{args:ex.args,expect:ex.expect,actual:t===null?a:null,threw:t}}));process.exit(0);}}",
    "console.log(JSON.stringify({v:'PASS'}));",
  ].join("");
}

/** classifyResult(res) -> { verdict, failing, detail }. res: { stdout?, error?, timedOut? } from the spawn. A spawn
 *  error with a kill/timeout signal ⇒ TIMEOUT; any other spawn error ⇒ EXEC_ERROR; else parse the child's JSON line. */
function classifyResult(res: any): any {
  const r = res && typeof res === "object" ? res : {};
  if (r.error || r.timedOut === true) {
    const killed = r.timedOut === true || (r.error && (r.error.killed === true || r.error.signal === "SIGTERM" || r.error.code === "ETIMEDOUT"));
    if (killed) return freeze({ verdict: VERDICT.TIMEOUT, failing: null, detail: "candidate did not terminate within the time budget — killed (fail-closed; a non-terminating program is a FAILURE)" });
    return freeze({ verdict: VERDICT.EXEC_ERROR, failing: null, detail: "child execution error: " + String((r.error && r.error.message) || r.error) });
  }
  let parsed: any = null;
  try { parsed = JSON.parse(String(r.stdout || "").trim().split("\n").filter(Boolean).pop() || ""); } catch { parsed = null; }
  if (!parsed || typeof parsed.v !== "string") return freeze({ verdict: VERDICT.EXEC_ERROR, failing: null, detail: "no parseable child verdict (fail-closed)" });
  if (parsed.v === "PASS") return freeze({ verdict: VERDICT.PASS, failing: null, detail: "all examples passed" });
  if (parsed.v === "FAIL") return freeze({ verdict: VERDICT.FAIL, failing: freeze(parsed.failing || null), detail: "an example failed" });
  if (parsed.v === "LOAD_ERROR") return freeze({ verdict: VERDICT.LOAD_ERROR, failing: null, detail: "candidate did not load: " + String(parsed.e || "") });
  return freeze({ verdict: VERDICT.EXEC_ERROR, failing: null, detail: "unrecognized child verdict" });
}

/**
 * runExamplesBounded(sourceCode, examples, opts) -> classifyResult verdict. opts: { timeoutMs?=3000, spawn? }. The default
 * spawn runs `node -e <probe>` via child_process.execFileSync with the timeout (a hang is SIGTERM-killed ⇒ TIMEOUT). A
 * custom spawn(probe)->{stdout?|error?|timedOut?} is injected in tests (deterministic, no real child). ONLY an explicit
 * child PASS is a pass; TIMEOUT/LOAD_ERROR/EXEC_ERROR/FAIL are all non-pass (fail-closed).
 */
function runExamplesBounded(sourceCode: any, examples: any, opts: any = {}): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const timeoutMs = Number.isFinite(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : 3000;
  const probe = buildProbe(sourceCode, examples);
  const spawn = typeof o.spawn === "function" ? o.spawn : (code: string) => {
    try { const cp = require("child_process"); return { stdout: cp.execFileSync(process.execPath, ["-e", code], { timeout: timeoutMs, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 20 }) }; }
    catch (e: any) { return { error: e, timedOut: !!(e && (e.killed || e.signal === "SIGTERM" || e.code === "ETIMEDOUT")), stdout: e && e.stdout }; }
  };
  return classifyResult(spawn(probe));
}

const BOUNDED_EXEC_CONTRACT = Object.freeze({
  id: "V327-BOUNDED-EXEC",
  purpose: "§4 — timeboxed child-process verification of untrusted codegen output: a non-terminating (infinite-loop) candidate is KILLED and reported TIMEOUT (fail-closed), so a runaway generation can never hang the native cycle or be counted as a pass",
  verdicts: VERDICT,
  reuses: Object.freeze(["child_process.execFileSync with a timeout (default spawn; injectable for deterministic tests)", "runs the SAME structured {args,expect} examples odg-repair-feedback uses"]),
  invariants: Object.freeze([
    "a hang ⇒ TIMEOUT (killed) — fail-closed; a non-terminating program is a FAILURE, NEVER a false pass",
    "ONLY an explicit child-reported PASS is a pass; FAIL/TIMEOUT/LOAD_ERROR/EXEC_ERROR are all non-pass",
    "buildProbe + classifyResult are PURE (deterministic, testable with an injected spawn); the real spawn is isolated",
    "executes the candidate in a SEPARATE process (not in-thread) — the cycle thread cannot be hung by the candidate",
    "no fabricated pass on malformed/absent child output (fail-closed EXEC_ERROR)",
  ]),
});

module.exports = { buildProbe, classifyResult, runExamplesBounded, VERDICT, BOUNDED_EXEC_CONTRACT };
export {};
