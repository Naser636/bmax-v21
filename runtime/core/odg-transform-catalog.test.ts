#!/usr/bin/env node
"use strict";
/* V152 — ODG transform-catalog battery. Proves ODG natively performs BOUNDED deterministic SOURCE-TEXT transformations with
 * pre/postconditions + HARD refusal (SafeRepair "never a wrong patch"), STRUCTURAL verification (no eval of transformed code),
 * generated≠accepted patches (transactional revert on VALIDATION_FAILED), a repair catalog across 5 fault classes, and
 * anti-reward-hacking test generation (expectations from the CONTRACT; a mutation must be caught). Fail-closed; reproducible. */
const T = require("./odg-transform-catalog.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- §3 catalog + §6 repair across all classes ----
  check("catalog has 5 source-text transform classes (expansion over V151's value-function templates)", T.TRANSFORM_IDS.length === 5);
  check("every class repairs its seeded fault ⇒ NATIVE_REPAIRED_GREEN + verified", T.TRANSFORM_IDS.every((id: string) => { const r = T.runRepair(id); return r.outcome === "NATIVE_REPAIRED_GREEN" && r.verified === true; }));

  // ---- specific transform correctness ----
  const exp = T.runTransform({ classId: "ensure-dual-export@1", source: '"use strict";\nmodule.exports = { f };\n' });
  check("ensure-dual-export appends `export {};` and keeps module.exports", exp.outcome === "NATIVE_REPAIRED_GREEN" && /export \{\};\s*$/.test(exp.after.trimEnd() + "\n") && /module\.exports/.test(exp.after));
  const norm = T.runTransform({ classId: "normalize-strict-equality@1", source: "return a == b && c != d;" });
  check("normalize-strict-equality: == → ===, != → !== (exact)", norm.after === "return a === b && c !== d;");
  const sort = T.runTransform({ classId: "sort-named-destructure@1", source: 'const { sum, add, mul } = require("./m.js");\n' });
  check("sort-named-destructure sorts keys, same set + require target", /const \{ add, mul, sum \} = require\("\.\/m\.js"\);/.test(sort.after));
  const dedupe = T.runTransform({ classId: "dedupe-require-lines@1", source: 'const A = require("a");\nconst A = require("a");\nconst B = require("b");\n' });
  check("dedupe-require-lines removes exact duplicate, keeps uniques", (dedupe.after.match(/const A = require/g) || []).length === 1 && /const B = require/.test(dedupe.after));

  // ---- idempotence / no regression: re-running on fixed output ⇒ NATIVE_GREEN ----
  check("idempotent: re-running a transform on its own output ⇒ NATIVE_GREEN (no regression)", T.runTransform({ classId: "ensure-dual-export@1", source: exp.after }).outcome === "NATIVE_GREEN");

  // ---- HARD refusal / escalation (never a guessed edit) ----
  check("ambiguous `== null` ⇒ ESCALATED_TO_PROVIDER (refuse, source unchanged)", (() => { const r = T.runTransform({ classId: "normalize-strict-equality@1", source: "if (x == null) {}" }); return r.outcome === "ESCALATED_TO_PROVIDER" && r.accepted === false; })());
  check("`export default` present ⇒ ESCALATED (ambiguous, refuse dual-export)", T.runTransform({ classId: "ensure-dual-export@1", source: "export default foo;\nmodule.exports = foo;" }).outcome === "ESCALATED_TO_PROVIDER");
  check("unknown class ⇒ ESCALATED_TO_PROVIDER (not attempted)", T.runTransform({ classId: "no-such@9", source: "x" }).outcome === "ESCALATED_TO_PROVIDER");
  check("out-of-scope source ⇒ NATIVE_REFUSED (precondition unmet), source unchanged", (() => { const r = T.runTransform({ classId: "ensure-dual-export@1", source: "const x = 1; // no module.exports" }); return r.outcome === "NATIVE_REFUSED" && r.before === "const x = 1; // no module.exports"; })());

  // ---- §4 safety: generated ≠ accepted; structural verification, no eval ----
  check("accepted patch records executedTransformedCode:false (structural verification, no eval)", exp.evidence.executedTransformedCode === false && exp.evidence.postconditionsVerified === true);
  check("contract invariant: transformed code is NEVER executed", /NEVER executed/.test(T.ODG_TRANSFORM_CATALOG_CONTRACT.invariants[1]));
  check("contract invariant: generated patch is NOT an accepted patch", /GENERATED patch is NOT an accepted patch/.test(T.ODG_TRANSFORM_CATALOG_CONTRACT.invariants[2]));

  // ---- §5 native test generation from contract + anti-reward-hacking mutation proof ----
  const contract = { fnName: "isEven", cases: [{ kind: "normal", args: [4], expect: true }, { kind: "normal", args: [3], expect: false }, { kind: "boundary", args: [0], expect: true }] };
  const gen = T.generateContractTests(contract);
  check("test-gen derives expectations from the CONTRACT (independent of impl), covers multiple kinds", gen.independentOfImpl === true && gen.assertions.length === 3 && gen.kindsCovered.length >= 2);
  const proof = T.proveTestsDetectMutation((n: number) => n % 2 === 0, (n: number) => n % 2 === 1, contract);
  check("mutation proof: correct passes ALL + a mutation is CAUGHT ⇒ TESTS_NON_VACUOUS", proof.verdict === "TESTS_NON_VACUOUS" && proof.correctPassesAll === true && proof.mutantDetected === true);
  check("a 'mutation' identical to correct ⇒ TESTS_MISS_MUTATION (honest: not native-verified)", T.proveTestsDetectMutation((n: number) => n % 2 === 0, (n: number) => n % 2 === 0, contract).verdict === "TESTS_MISS_MUTATION");
  check("tests that reject the correct fn ⇒ TESTS_REJECT_CORRECT (honest)", T.proveTestsDetectMutation((n: number) => n % 2 === 1, (n: number) => n % 2 === 0, contract).verdict === "TESTS_REJECT_CORRECT");

  // ---- §8 reproducible benchmark ----
  const b1 = T.benchmarkCatalog(); const b2 = T.benchmarkCatalog();
  check("benchmark: 5 classes, 5 repaired+verified, 0 regressions, idempotent, refusal correct", b1.transformationClasses === 5 && b1.repairedAndVerified === 5 && b1.regressions === 0 && b1.idempotentAll === true && b1.refusalCorrect === true);
  check("benchmark is reproducible (two runs identical)", JSON.stringify(b1) === JSON.stringify(b2));
  check("benchmark honestly shows V152 adds source-text transforms over V151 baseline (0→5)", b1.v151Baseline.sourceTextTransforms === 0 && b1.v152.sourceTextTransforms === 5);

  // ---- fail-closed ----
  check("malformed mission / contract ⇒ fail-closed (no throw)", T.runTransform(null).code === "INVALID_MISSION" && T.generateContractTests(null).code === "INVALID_CONTRACT" && T.runRepair("nope").code === "NO_FAULT_FIXTURE");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-transform-catalog (5 deterministic source-text transforms w/ pre/postconditions + hard refusal; structural verification no-eval; generated≠accepted; 5 repair classes; anti-reward-hacking mutation-proven test-gen; reproducible benchmark; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
