#!/usr/bin/env node
"use strict";
const B = require("./native-project-builder");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// a 2-file interdependent project: ops.js (add) + calc.js (uses ops).
const spec = {
  name: "calc", writeSet: ["src/ops.js", "src/calc.js"],
  architecture: [
    { path: "src/ops.js", role: "math ops", contract: "exports { add(a,b) }" },
    { path: "src/calc.js", role: "calculator", contract: "exports compute(a,b) using ops.add", dependsOn: ["src/ops.js"] },
  ],
  independentTest: (mods: any) => { const calc = mods["src/calc.js"]; return typeof calc === "function" ? calc(2, 3) === 5 : (calc && calc.compute ? calc.compute(2, 3) === 5 : false); },
};
// a GOOD generator seam (models a correct local-model output): ops exports add; calc requires ops and computes.
const good = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a+b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
(async () => {
  const r = await B.buildProject(spec, { generateFile: good });
  check(r.filesGenerated === 2 && r.buildOk === true, "2 interdependent files generated + assembled (imports resolve)");
  check(r.verified === true && r.accepted === true, "project accepted ONLY on the independent test (compute(2,3)===5)");

  // a BROKEN generator (calc references a missing symbol) ⇒ build fails ⇒ NOT accepted (fail-closed).
  const broken = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a+b};" : "module.exports=(a,b)=>{ return ops.add(a,b" });  // syntax error (unclosed)
  const rb = await B.buildProject(spec, { generateFile: broken, maxRepair: 0 });
  check(rb.buildOk === false && rb.accepted === false, "a file with a syntax error ⇒ build FAILS ⇒ NOT accepted (fail-closed)");
  // a runtime-missing-symbol project compiles but the INDEPENDENT test catches it ⇒ NOT accepted.
  const lazyMissing = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a+b};" : "module.exports=(a,b)=>missing.add(a,b);" });
  const rl = await B.buildProject(spec, { generateFile: lazyMissing });
  check(rl.accepted === false && rl.verified === false, "a compiling project with a runtime-missing symbol ⇒ independent test catches it ⇒ NOT accepted");

  // a plausible-but-WRONG project (compiles but compute is wrong) ⇒ independent test rejects ⇒ NOT accepted (false success caught).
  const wrong = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const rw = await B.buildProject(spec, { generateFile: wrong });
  check(rw.buildOk === true && rw.verified === false && rw.accepted === false, "a compiling-but-wrong project ⇒ independent test rejects ⇒ NOT accepted (false success caught)");

  // V40 LOT M: a false success (builds but FAILS the independent test) is now REPAIRED on the verify-failure feedback.
  const fixOnVerify = async (f: any) => {
    if (f.path === "src/ops.js") return { ok: true, content: "module.exports={add:(a,b)=>a+b};" };
    return { ok: true, content: f.verifyError ? "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" : "const ops=require('./ops.js');module.exports=(a,b)=>a-b;" };  // wrong first, correct once the test-failure hint arrives
  };
  const rfix = await B.buildProject(spec, { generateFile: fixOnVerify, maxRepair: 1 });
  check(rfix.buildOk === true && rfix.verified === true && rfix.accepted === true && rfix.repairs === 1, "a false success (builds-but-fails-test) is REPAIRED on the verify-failure feedback ⇒ ACCEPTED after 1 repair (independent test still the arbiter)");
  check(rfix.firstPass && rfix.firstPass.buildOk === true && rfix.firstPass.verified === false, "firstPass instrumentation records the PRE-repair verdict (built but failed the test) — distinct from the final accepted result");
  // and still fail-closed: a generator that STAYS wrong through the repair is NOT accepted.
  const staysWrong = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const rsw = await B.buildProject(spec, { generateFile: staysWrong, maxRepair: 2 });
  check(rsw.accepted === false && rsw.verified === false, "a generator that stays wrong through all repairs ⇒ NOT accepted (fail-closed; repair never lowers the gate)");
  // V15.0 §37.8 anti-loop: the same wrong output regenerated identically ⇒ stop after ONE repair (no new information),
  // instead of consuming the whole budget; still fail-closed. A generator that CHANGES its output keeps its full budget.
  let calls = 0; const countingStaysWrong = async (f: any) => { calls++; return staysWrong(f); };
  const rnp = await B.buildProject(spec, { generateFile: countingStaysWrong, maxRepair: 5 });
  check(rnp.accepted === false && rnp.repairs === 1 && rnp.repairStopReason === "NO_PROGRESS_IDENTICAL_REGENERATION" && calls === 4, "anti-loop: identical regeneration ⇒ stop after 1 repair (2 initial + 2 repair calls, not 2 + 5×2), still NOT accepted");
  let n = 0; const drifting = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b+" + (0 * (n++)) + "*" + n + "};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const rdr = await B.buildProject(spec, { generateFile: drifting, maxRepair: 3 });
  check(rdr.accepted === false && rdr.repairs === 3 && rdr.repairStopReason === "REPAIR_BUDGET_EXHAUSTED", "a generator whose output CHANGES each round keeps its full budget (3 repairs) ⇒ REPAIR_BUDGET_EXHAUSTED");
  // inspection MED: a TRANSIENT generate failure during a repair keeps the old content — it must NOT be read as "no progress"
  let k = 0; const transient = async (f: any) => { k++; if (k <= 2) return staysWrong(f); if (k <= 4) return { ok: false }; return good(f); };
  const rtr = await B.buildProject(spec, { generateFile: transient, maxRepair: 3 });
  check(rtr.accepted === true && rtr.repairs === 2 && rtr.repairStopReason === null, "transient generate failure in a repair round ⇒ retried (not NO_PROGRESS), then accepted");

  // write-set confinement: a file outside the write-set is refused.
  const outSpec = { ...spec, architecture: [{ path: "src/secrets.js", contract: "x" }] };
  const ro = await B.buildProject(outSpec, { generateFile: good });
  check(ro.fileStatus.some((s: any) => s.stage === "WRITE_SET_VIOLATION"), "a file outside the write-set is refused");

  // V327 §3: with STRUCTURED repairExamples, the repair hint is SPECIFIC execution feedback (Self-Debugging), not generic.
  const fbSpec = { name: "f", writeSet: ["f.js"], entry: "f.js", repairExamples: [{ args: [2, 3], expect: 5 }],
    architecture: [{ path: "f.js", role: "add", contract: "module.exports=(a,b)=>a+b" }],
    independentTest: (m: any) => m["f.js"](2, 3) === 5 };
  let hintSeen: any = null;
  const capFeedback = async (f: any) => { if (f.verifyError) hintSeen = f.verifyError; return { ok: true, content: f.verifyError ? "module.exports=(a,b)=>a+b;" : "module.exports=(a,b)=>a*b;" }; };
  const rfb = await B.buildProject(fbSpec, { generateFile: capFeedback, maxRepair: 1 });
  check(rfb.accepted === true && rfb.repairs === 1, "repairExamples path still repairs to ACCEPTED (independent test arbiter)");
  check(hintSeen && /\(2, 3\)/.test(hintSeen) && /returned 6/.test(hintSeen) && /expected result is 5/.test(hintSeen), "repair hint is SPECIFIC execution feedback (input 2,3 → returned 6, expected 5), not the generic message");
  // without repairExamples ⇒ generic hint (backward-compatible, unchanged)
  let genHint: any = null;
  const capGen = async (f: any) => { if (f.verifyError) genHint = f.verifyError; return { ok: true, content: f.verifyError ? "module.exports=(a,b)=>a+b;" : "module.exports=(a,b)=>a*b;" }; };
  await B.buildProject({ ...fbSpec, repairExamples: undefined }, { generateFile: capGen, maxRepair: 1 });
  check(genHint && /fix the logic/.test(genHint) && !/EXECUTION FEEDBACK/.test(genHint), "no repairExamples ⇒ generic hint (backward-compatible)");

  // V327 §4/§7: the bounded PRE-GUARD skips the hang-prone in-thread test when a single-file candidate does not terminate.
  const guardSpec = { name: "f", writeSet: ["f.js"], repairExamples: [{ args: [2, 3], expect: 5 }], architecture: [{ path: "f.js", role: "add", contract: "module.exports=(a,b)=>a+b" }], independentTest: (m: any) => { spy.called = true; return m["f.js"](2, 3) === 5; } };
  const spy = { called: false };
  const good1 = async () => ({ ok: true, content: "module.exports=(a,b)=>a+b;" });
  // guard TIMEOUT ⇒ in-thread test SKIPPED, not accepted (cycle protected) — independentTest never called
  const rGuard = await B.buildProject(guardSpec, { generateFile: good1, maxRepair: 0, boundedCheck: () => ({ verdict: "TIMEOUT" }) });
  check(rGuard.accepted === false && spy.called === false && /bounded pre-guard TIMEOUT/.test(String(rGuard.verifyError)), "bounded pre-guard: a non-terminating candidate ⇒ in-thread test SKIPPED, not accepted (cycle protected from hang)");
  // guard PASS (terminates) ⇒ normal path: independentTest runs and accepts the correct code
  const spy2 = { called: false };
  const guardSpec2 = { ...guardSpec, independentTest: (m: any) => { spy2.called = true; return m["f.js"](2, 3) === 5; } };
  const rOk = await B.buildProject(guardSpec2, { generateFile: good1, maxRepair: 0, boundedCheck: () => ({ verdict: "PASS" }) });
  check(rOk.accepted === true && spy2.called === true, "bounded pre-guard PASS (terminates) ⇒ normal in-thread verification runs and accepts (backward-compatible)");

  check(/accepted ONLY if it builds AND passes the INDEPENDENT test/i.test(JSON.stringify(B.NATIVE_PROJECT_BUILDER_CONTRACT.invariants)), "contract: independent test is the arbiter");
  // V15.9 security: generated code may require only other generated files or pure built-ins (default-deny, fail-closed).
  const denied = (src: string) => { const r = B.assembleAndLoad({ "src/x.js": src }); return r.ok === false && /REQUIRE_DENIED/.test(String(r.error)); };
  check(["fs", "node:fs", "child_process", "net", "http", "https", "worker_threads", "vm", "module", "os"].every((m) => denied(`const z=require('${m}');module.exports=1;`)), "V15.9: fs/child_process/net/http(s)/worker_threads/vm/module/os ⇒ REQUIRE_DENIED (build fails)");
  check(denied("const z=require('./repair-workflow.js');module.exports=1;") && denied("const z=require('../core/repair-workflow');module.exports=1;"), "V15.9: a relative path that is NOT a generated file (formerly resolved to ODG internals in runtime/core) ⇒ REQUIRE_DENIED");
  check(denied("const z=require('/etc/passwd');module.exports=1;"), "V15.9: absolute path ⇒ REQUIRE_DENIED");
  const okAssert = B.assembleAndLoad({ "src/y.js": "const a=require('assert');const u=require('node:util');module.exports=(x)=>{a.ok(true);return u.format('%d',x);};" });
  check(okAssert.ok === true && okAssert.modules["src/y.js"](7) === "7", "V15.9: pure built-ins on the allowlist (assert, node:util) still load");
  const okRel = B.assembleAndLoad({ "src/ops.js": "module.exports={add:(a,b)=>a+b};", "src/calc.js": "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  check(okRel.ok === true && okRel.modules["src/calc.js"](2, 3) === 5, "V15.9: requiring another GENERATED file still works (inter-file relations preserved)");
  if (failures === 0) process.stdout.write("ALL PASS — V12.4 NATIVE PROJECT BUILDER\n");
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
