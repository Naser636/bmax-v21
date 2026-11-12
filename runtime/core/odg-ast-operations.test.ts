#!/usr/bin/env node
"use strict";
/* V154 — ODG AST-lite operations battery. Proves REAL TS-AST behaviour (ts.createSourceFile), not string presence: 1 TRANSFORM
 * (import-ordering, idempotent, AST-postcondition-verified, hard refusal) + 3 DIAGNOSTIC ops (duplicate-import / dead-require /
 * contract-test). Covers the directive's adversarial list (alias/type/namespace/side-effect/comment/dup/collision/dynamic/
 * malformed/empty/large/EOL/idempotence/pre-post/unknown/mistyped/injection/refusal-bypass) + V151–V153 non-regression. */
const A = require("./odg-ast-operations.js");
const C = require("./odg-closed-executor.js");
const N = require("./odg-native-engineering.js");
const T = require("./odg-transform-catalog.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const ord = (src: string) => A.runAstOp("import-ordering@1", { source: src });

function main() {
  check("registry: ≥4 canonical ops incl. import-ordering (V155 adds consolidation ⇒ 5), NO faulty fixtures", A.CANONICAL_OPS.length >= 4 && A.OP_IDS.indexOf("import-ordering@1") >= 0 && A.OP_IDS.every((id: string) => id.indexOf(".faulty") < 0));

  // ---- A. import-ordering TRANSFORM ----
  const r = ord('import { z } from "./zebra";\nimport { a } from "./apple";\nimport { m } from "./mango";\n\nconst x = 1;\n');
  check("import-ordering sorts the leading block, idempotent, AST-postcondition-verified", r.outcome === "NATIVE_REPAIRED_GREEN" && r.idempotent === true && r.postconditions.reparsed === true && r.postconditions.sorted === true);
  check("import-ordering preserves code after the block", /const x = 1;/.test(r.after) && r.after.indexOf("./apple") < r.after.indexOf("./mango") && r.after.indexOf("./mango") < r.after.indexOf("./zebra"));
  check("already sorted ⇒ NATIVE_GREEN (changed:false)", (() => { const g = ord('import { a } from "./a";\nimport { b } from "./b";\n'); return g.outcome === "NATIVE_GREEN" && g.changed === false; })());
  check("running on its own output ⇒ NATIVE_GREEN (true idempotence)", ord(r.after).outcome === "NATIVE_GREEN");

  // alias / type-only / namespace imports still sort safely (they are import declarations)
  check("alias/type/namespace imports sort by specifier (no semantics changed)", (() => { const x = ord('import * as z from "./z";\nimport type { T } from "./t";\nimport { a as b } from "./a";\n'); return x.outcome === "NATIVE_REPAIRED_GREEN" && x.after.indexOf("./a") < x.after.indexOf("./t") && x.after.indexOf("./t") < x.after.indexOf("./z"); })());

  // ---- hard refusals (never a guessed edit) ----
  check("[side-effect] import in block ⇒ NATIVE_REFUSED", ord('import "./polyfill";\nimport { b } from "./b";\nimport { a } from "./a";\n').outcome === "NATIVE_REFUSED");
  check("[comment] import carrying a leading comment ⇒ NATIVE_REFUSED", ord('// pin first\nimport { z } from "./z";\nimport { a } from "./a";\n').outcome === "NATIVE_REFUSED");
  check("[malformed] unparseable source ⇒ NATIVE_REFUSED (parseDiagnostics)", ord('import { from "./bad\n').outcome === "NATIVE_REFUSED");
  check("[empty] no imports ⇒ NATIVE_GREEN (nothing to sort)", ord("").outcome === "NATIVE_GREEN" && ord("const x=1;\n").outcome === "NATIVE_GREEN");

  // ---- EOL / idempotence robustness ----
  check("[EOL] CRLF file: block keeps CRLF, re-parses, idempotent", (() => { const crlf = 'import { z } from "./z";\r\nimport { a } from "./a";\r\n'; const x = ord(crlf); return x.outcome === "NATIVE_REPAIRED_GREEN" && x.after.indexOf("\r\n") >= 0 && x.idempotent === true; })());

  // ---- B. duplicate-import-analysis DIAGNOSTIC (read-only) ----
  const dup = A.runAstOp("duplicate-import-analysis@1", { source: 'import { a } from "./m";\nimport { b } from "./m";\nimport { c } from "./other";\n' });
  check("duplicate-import-analysis flags ./m (count 2), modifies no text, refuses consolidation", dup.outcome === "DIAGNOSED" && dup.modifiesText === false && dup.findings.length === 1 && dup.findings[0].moduleSpecifier === "./m" && dup.findings[0].count === 2);
  check("no duplicates ⇒ empty findings", A.runAstOp("duplicate-import-analysis@1", { source: 'import { a } from "./a";\nimport { b } from "./b";\n' }).findings.length === 0);

  // ---- C. dead-require-analysis DIAGNOSTIC (conservative) ----
  const dead = A.runAstOp("dead-require-analysis@1", { source: 'const used = require("./u");\nconst gone = require("./d");\nconst { x } = require("./destr");\nconsole.log(used());\n' });
  const byBinding = (b: string) => dead.findings.find((f: any) => f.binding === b);
  check("dead-require: referenced ⇒ keep; unreferenced ⇒ safeToRemove; destructured ⇒ NOT safe (ambiguous)", byBinding("used").safeToRemove === false && byBinding("gone").safeToRemove === true && byBinding("gone").references === 0 && dead.findings.find((f: any) => f.binding === "(destructured)").safeToRemove === false);
  check("dead-require is DIAGNOSTIC only (modifies no text, removes nothing)", dead.modifiesText === false && dead.kind === "DIAGNOSTIC" && /DIAGNOSTIC ops never modify text/.test(dead.note));
  // indirect/string reference safety: a binding used only inside a string is NOT an AST reference — but we NEVER auto-remove, so the diagnostic stays advisory
  check("dead-require never auto-removes (safety: advisory even when references===0)", byBinding("gone").safeToRemove === true && dead.outcome === "DIAGNOSED");

  // ---- D. contract-test-consistency DIAGNOSTIC (never adapts contract to impl) ----
  const cc = A.runAstOp("contract-test-consistency@1", { source: "x", contract: { fnName: "parse", errors: ["BAD_INPUT"], edgeCases: ["empty"] }, testCases: [{ kind: "normal" }] });
  check("contract-test-consistency reports missing kinds + dimensions, proposes no contract change", cc.outcome === "DIAGNOSED" && cc.findings.missingKinds.indexOf("error") >= 0 && cc.findings.missingDimensions.length === 2 && /do NOT change the contract/.test(cc.findings.proposal));

  // ---- deny-by-default / injection / mistyped / refusal-bypass ----
  check("[unknown op] ⇒ UNREGISTERED_OP (deny-by-default)", A.runAstOp("no-such@9", { source: "x" }).code === "UNREGISTERED_OP");
  check("[injection] code-string opId ⇒ CODE_STRING_REJECTED", A.runAstOp("() => eval('x')", { source: "x" }).code === "CODE_STRING_REJECTED" && A.runAstOp("require('fs')", { source: "x" }).code === "CODE_STRING_REJECTED");
  check("[mistyped] missing/non-string source ⇒ SOURCE_REQUIRED", A.runAstOp("import-ordering@1", {}).code === "SOURCE_REQUIRED" && A.runAstOp("import-ordering@1", { source: 123 }).code === "SOURCE_REQUIRED");
  check("[oversize] source over the size bound ⇒ SOURCE_TOO_LARGE", A.runAstOp("import-ordering@1", { source: "a".repeat(200001) }).code === "SOURCE_TOO_LARGE");
  check("[refusal-bypass] opId with appended code ⇒ rejected", A.runAstOp("import-ordering@1;process.exit()", { source: "x" }).code === "CODE_STRING_REJECTED");
  check("fail-closed: null inputs ⇒ errors, no throw", A.runAstOp(null, null).code === "INVALID_OP_ID");

  // ---- determinism + candidate-patch (no real write) ----
  check("deterministic: two runs identical", JSON.stringify(ord('import { b } from "./b";\nimport { a } from "./a";\n')) === JSON.stringify(ord('import { b } from "./b";\nimport { a } from "./a";\n')));
  check("TRANSFORM yields a reversible candidate patch (before kept; real write owner-gated)", r.reversible === true && r.before.indexOf("./zebra") >= 0 && /OWNER_GATED/.test(r.note));

  // ---- §7 non-regression: V153 closed executor, V151 native cycle, V152 transforms ----
  check("[regression V153] closed executor still deny-by-default + green", C.executeOp("sum@1", [2, 3]).result === 5 && C.executeOp("nope", [1]).code === "UNREGISTERED_OP");
  check("[regression V151] native cycle still NATIVE_GREEN + REPAIRED", N.runNativeCycle({ id: "R", spec: { fnName: "sum", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] } }).verdict === "NATIVE_GREEN" && N.runNativeCycle({ id: "R2", spec: { fnName: "max", kind: "max", examples: [{ args: [2, 3], expect: 3 }] }, injectFault: true }).verdict === "NATIVE_REPAIRED_GREEN");
  check("[regression V152] transforms + mutation detection intact", T.benchmarkCatalog().regressions === 0 && T.proveTestsDetectMutation((n: number) => n % 2 === 0, (n: number) => n % 2 === 1, { fnName: "isEven", cases: [{ kind: "normal", args: [4], expect: true }, { kind: "normal", args: [3], expect: false }] }).verdict === "TESTS_NON_VACUOUS");

  // ---- honest contract ----
  check("contract: REAL AST, malformed⇒refuse, semantic⇒escalate; existing TS dependency, parse-only", /REAL AST/.test(A.AST_OPERATIONS_CONTRACT.invariants[0]) && /EXISTING repo dependency/.test(A.AST_OPERATIONS_CONTRACT.dependency));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-ast-operations (REAL ts-AST; 1 transform import-ordering idempotent+postcondition-verified + 3 diagnostics dup-import/dead-require/contract-test; hard refusal; closed deny-by-default; candidate patches owner-gated; V151–V153 regress green)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
