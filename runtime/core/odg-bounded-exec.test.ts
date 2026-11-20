#!/usr/bin/env node
"use strict";
/* Tests for odg-bounded-exec (V327 §4 timeboxed verification of untrusted codegen). Proves a hang ⇒ TIMEOUT (fail-closed),
 * only an explicit child PASS is a pass, and the verdict logic is deterministic (injected spawn). Real-spawn behaviour is
 * exercised in the live demo. */
const M = require("./odg-bounded-exec.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
// injected spawn: return a canned child result for a given probe (ignores probe; deterministic).
const withSpawn = (res: any) => ({ spawn: () => res });

function main(): void {
  const ex = [{ args: [2, 3], expect: 5 }];
  // PASS only on an explicit child PASS
  check("child PASS ⇒ verdict PASS", M.runExamplesBounded("src", ex, withSpawn({ stdout: '{"v":"PASS"}' })).verdict === "PASS");
  // FAIL carries the failing case
  const fail = M.runExamplesBounded("src", ex, withSpawn({ stdout: '{"v":"FAIL","failing":{"args":[2,3],"expect":5,"actual":6,"threw":null}}' }));
  check("child FAIL ⇒ verdict FAIL + failing case", fail.verdict === "FAIL" && fail.failing.actual === 6 && fail.failing.expect === 5);
  // TIMEOUT: a spawn error with a kill signal ⇒ TIMEOUT (fail-closed — a hang is a FAILURE, never a pass)
  check("spawn killed/timeout ⇒ verdict TIMEOUT (fail-closed, never PASS)", M.runExamplesBounded("src", ex, withSpawn({ error: { killed: true, signal: "SIGTERM" }, timedOut: true })).verdict === "TIMEOUT");
  check("ETIMEDOUT ⇒ TIMEOUT", M.runExamplesBounded("src", ex, withSpawn({ error: { code: "ETIMEDOUT" } })).verdict === "TIMEOUT");
  // LOAD_ERROR + EXEC_ERROR + malformed ⇒ all non-pass (fail-closed)
  check("child LOAD_ERROR ⇒ verdict LOAD_ERROR (non-pass)", M.runExamplesBounded("src", ex, withSpawn({ stdout: '{"v":"LOAD_ERROR","e":"x"}' })).verdict === "LOAD_ERROR");
  check("malformed child output ⇒ EXEC_ERROR (fail-closed, never a fabricated PASS)", M.runExamplesBounded("src", ex, withSpawn({ stdout: "garbage" })).verdict === "EXEC_ERROR");
  check("non-timeout spawn error ⇒ EXEC_ERROR (not TIMEOUT)", M.runExamplesBounded("src", ex, withSpawn({ error: { message: "spawn ENOENT" } })).verdict === "EXEC_ERROR");

  // buildProbe is pure + embeds the source and examples (so the child loads exactly them)
  const probe = M.buildProbe("module.exports=(a,b)=>a+b;", ex);
  check("buildProbe embeds the source + examples + deep-equal compare + JSON verdict", /module.exports=\(a,b\)=>a\+b/.test(probe) && /"expect":5/.test(probe) && /EQ\(a,ex.expect\)/.test(probe) && /JSON.stringify\(\{v:'PASS'\}\)/.test(probe));
  check("classifyResult is pure/deterministic (same input ⇒ same verdict)", JSON.stringify(M.classifyResult({ stdout: '{"v":"PASS"}' })) === JSON.stringify(M.classifyResult({ stdout: '{"v":"PASS"}' })));

  // only an explicit PASS is a pass — a child that prints nothing is NOT a pass
  check("empty child output ⇒ non-pass (EXEC_ERROR)", M.runExamplesBounded("src", ex, withSpawn({ stdout: "" })).verdict !== "PASS");

  // frozen + contract
  check("frozen result + VERDICT enum", Object.isFrozen(fail) && M.VERDICT.TIMEOUT === "TIMEOUT");
  check("contract: hang⇒TIMEOUT fail-closed, separate process, only explicit PASS, pure probe/classify",
    M.BOUNDED_EXEC_CONTRACT.invariants.some((s: string) => /a hang ⇒ TIMEOUT/.test(s)) &&
    M.BOUNDED_EXEC_CONTRACT.invariants.some((s: string) => /SEPARATE process/.test(s)) &&
    M.BOUNDED_EXEC_CONTRACT.invariants.some((s: string) => /ONLY an explicit child-reported PASS is a pass/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-bounded-exec (V327 §4 timeboxed verification: hang⇒TIMEOUT [fail-closed, killed, never a false pass]; only an explicit child PASS passes; FAIL carries the failing case; LOAD_ERROR/EXEC_ERROR/malformed⇒non-pass; buildProbe+classifyResult PURE [injected spawn deterministic]; separate process so the cycle thread can't hang; frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
