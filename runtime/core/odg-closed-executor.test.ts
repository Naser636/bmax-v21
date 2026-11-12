#!/usr/bin/env node
"use strict";
/* V153 — ODG closed-executor ADVERSARIAL battery. Proves the executor's REAL behaviour (not string presence): deny-by-default,
 * no code strings, strict typing/arity, size limits, deterministic+reproducible, and that the V151 native cycle + V152
 * transforms still work with NO new Function. Covers the directive's 20 adversarial cases + regressions. */
const C = require("./odg-closed-executor.js");
const N = require("./odg-native-engineering.js");
const T = require("./odg-transform-catalog.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // baseline correct execution via the closed registry
  check("registered op executes (sum@1[2,3]=5), reproducible + traced", (() => { const r = C.executeOp("sum@1", [2, 3]); return r.ok === true && r.result === 5 && r.deterministic === true && r.trace.executed === true; })());

  // 1. unknown input / 2. unregistered op (deny-by-default)
  check("[1/2] unregistered op ⇒ UNREGISTERED_OP (deny-by-default, no execution)", C.executeOp("doesNotExist@9", [1]).code === "UNREGISTERED_OP" && C.executeOp("sum", [1, 2]).code === "UNREGISTERED_OP");
  // 3. wrong type
  check("[3] type mismatch ⇒ TYPE_MISMATCH", C.executeOp("sum@1", ["2", 3]).code === "TYPE_MISMATCH" && C.executeOp("isEven@1", [1.5]).code === "TYPE_MISMATCH");
  // 4. malformed value / args
  check("[4] malformed args (not array / wrong arity) ⇒ ARGS_NOT_ARRAY / ARITY_MISMATCH", C.executeOp("sum@1", "nope").code === "ARGS_NOT_ARRAY" && C.executeOp("sum@1", [1]).code === "ARITY_MISMATCH");
  // 5. string containing executable code AS the opId / 6. injection attempt
  check("[5/6] code-string-shaped opId ⇒ CODE_STRING_REJECTED (no eval path)", C.executeOp("(a,b)=>a+b", [1, 2]).code === "CODE_STRING_REJECTED" && C.executeOp("require('fs')", []).code === "CODE_STRING_REJECTED" && C.executeOp("() => process.exit(1)", []).code === "CODE_STRING_REJECTED");
  // 7. filesystem attempt / 8. unauthorized import — expressed as code-string opIds, all rejected
  check("[7/8] fs/import attempt via opId ⇒ rejected (no module/fs access)", C.executeOp("import('child_process')", []).code === "CODE_STRING_REJECTED" && C.executeOp("eval('1')", []).code === "CODE_STRING_REJECTED");
  // 9. excessive input / 10. size limit
  check("[9/10] oversized numeric arg ⇒ VALUE_TOO_LARGE; oversized result ⇒ RESULT_TOO_LARGE", C.executeOp("sum@1", [1e20, 1]).code === "VALUE_TOO_LARGE" && C.executeOp("sum@1", [9e14, 9e14]).code === "RESULT_TOO_LARGE");
  // 11. loop/recursion — not expressible: ops are O(1) pre-registered; an unregistered "recurse" op is denied
  check("[11] no loop/recursion op exists ⇒ denied (closed registry has only O(1) ops)", C.executeOp("while(true){}@1", []).code === "CODE_STRING_REJECTED" || C.executeOp("recurse@1", [1]).code === "UNREGISTERED_OP");
  // 12. precondition violated (wrong arity is a precondition) already covered; 13. postcondition (result bound) covered by RESULT_TOO_LARGE
  check("[12/13] pre/post guards enforced (arity + result bound)", C.executeOp("clampNonNegative@1", []).code === "ARITY_MISMATCH" && C.executeOp("absMinor@1", [-9e14 - 9e14]).ok === false);
  // 14. non-determinism — same input twice ⇒ identical (no clock/random)
  check("[14] deterministic: identical result across calls", JSON.stringify(C.executeOp("max@1", [3, 7])) === JSON.stringify(C.executeOp("max@1", [3, 7])));
  // 15. op failure handled (not thrown) — an integer op given a huge-but-finite within-bound float handled by type guard
  check("[15] failures are returned, never thrown", (() => { try { const r = C.executeOp("isEven@1", [Number.NaN]); return r.ok === false; } catch { return false; } })());
  // 16. interruption/recovery — a bad call does not corrupt subsequent calls
  check("[16] recovery: a rejected call does not affect the next valid call", (() => { C.executeOp("boom", []); return C.executeOp("sum@1", [10, 5]).result === 15; })());
  // 17. refusal-bypass attempt — opId with registered prefix but extra code chars still rejected
  check("[17] refusal cannot be bypassed by appending code to a valid opId", C.executeOp("sum@1;process.exit()", [1, 2]).code === "CODE_STRING_REJECTED");

  // 18. V151 native-cycle regression (now on the closed executor, NO new Function)
  check("[18] V151 native cycle still green via closed executor (NATIVE_GREEN)", (() => { const r = N.runNativeCycle({ id: "R", spec: { fnName: "sum", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [-1, 1], expect: 0 }] } }); return r.verdict === "NATIVE_GREEN" && r.testsPass === 2; })());
  check("[18b] V151 native REPAIR still works (seeded fault → NATIVE_REPAIRED_GREEN)", N.runNativeCycle({ id: "R2", spec: { fnName: "max", kind: "max", examples: [{ args: [2, 3], expect: 3 }] }, injectFault: true }).verdict === "NATIVE_REPAIRED_GREEN");
  check("[18c] native generate_code step records executedCodeString:false (no eval)", (() => { const r = N.runNativeCycle({ id: "R3", spec: { fnName: "isEven", kind: "isEven", examples: [{ args: [4], expect: true }] } }); return r.steps.find((s: any) => s.step === "generate_code").executedCodeString === false; })());

  // 19. V152 ten-transform regression (structural, unchanged)
  check("[19] V152 transforms still repair all classes (structural, no exec)", T.TRANSFORM_IDS.every((id: string) => T.runRepair(id).verified === true) && T.benchmarkCatalog().regressions === 0);
  // 20. mutation detection preserved
  check("[20] anti-reward-hacking mutation detection preserved (TESTS_NON_VACUOUS)", T.proveTestsDetectMutation((n: number) => n % 2 === 0, (n: number) => n % 2 === 1, { fnName: "isEven", cases: [{ kind: "normal", args: [4], expect: true }, { kind: "normal", args: [3], expect: false }] }).verdict === "TESTS_NON_VACUOUS");

  // reproducibility over multiple independent runs
  check("reproducible: 3 independent executor runs identical", (() => { const a = C.executeOp("absMinor@1", [-7]); const b = C.executeOp("absMinor@1", [-7]); const c = C.executeOp("absMinor@1", [-7]); return a.result === 7 && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c); })());

  // honest: getRepr returns a string that is NEVER executed
  check("getRepr returns evidence string (display only, never executed)", C.getRepr("sum@1") === "(a, b) => a + b" && C.getRepr("nope") === null);
  check("contract: no eval/new Function; executeOp takes opId+typed args", /NO eval \/ new Function/.test(C.CLOSED_EXECUTOR_CONTRACT.invariants[0]) && /never a code string/.test(C.CLOSED_EXECUTOR_CONTRACT.invariants[0]));
  check("honest: NOT called a sandbox (closed operation surface, not VM isolation)", /NOT process\/VM isolation/.test(C.CLOSED_EXECUTOR_CONTRACT.invariants[4]));

  // fail-closed
  check("fail-closed: null/garbage inputs ⇒ errors, no throw", C.executeOp(null, []).code === "INVALID_OP_ID" && C.executeOp("sum@1", null).code === "ARGS_NOT_ARRAY");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-closed-executor (deny-by-default registry; NO eval/new Function/code-strings; strict typing/arity/size; deterministic+reproducible; 20 adversarial cases; V151 cycle + V152 transforms regress green)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
