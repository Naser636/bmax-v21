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
  // and still fail-closed: a generator that STAYS wrong through the repair is NOT accepted.
  const staysWrong = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const rsw = await B.buildProject(spec, { generateFile: staysWrong, maxRepair: 2 });
  check(rsw.accepted === false && rsw.verified === false, "a generator that stays wrong through all repairs ⇒ NOT accepted (fail-closed; repair never lowers the gate)");

  // write-set confinement: a file outside the write-set is refused.
  const outSpec = { ...spec, architecture: [{ path: "src/secrets.js", contract: "x" }] };
  const ro = await B.buildProject(outSpec, { generateFile: good });
  check(ro.fileStatus.some((s: any) => s.stage === "WRITE_SET_VIOLATION"), "a file outside the write-set is refused");

  check(/accepted ONLY if it builds AND passes the INDEPENDENT test/i.test(JSON.stringify(B.NATIVE_PROJECT_BUILDER_CONTRACT.invariants)), "contract: independent test is the arbiter");
  if (failures === 0) process.stdout.write("ALL PASS — V12.4 NATIVE PROJECT BUILDER\n");
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
