#!/usr/bin/env node
"use strict";
/* M13 (V12.4 cross-métier assurance) — battery. Proves a métier change is analysed through its dependents: contract
 * breaks + missing dependencies detected (fail-closed), transitive affected métiers computed, affected tests SELECTED,
 * closure gated (SAFE only with no break + all affected tests PASS), and change->risk->test traceability. Sealed
 * adversarial bench (0 violations, non-rubberstamp). It SELECTS tests; it never runs them (no 2nd orchestrator). */
const A = require("./cross-metier-assurance.js");
const G = () => ({
  A: { dependsOn: [], expects: {}, tests: ["tA"] },
  B: { dependsOn: ["A"], expects: { A: ["a"] }, tests: ["tB"] },
  C: { dependsOn: ["B"], expects: { B: ["k"] }, tests: ["tC"] },
  D: { dependsOn: [], expects: {}, tests: ["tD"] },
});
const ALLPASS = { tA: "PASS", tB: "PASS", tC: "PASS", tD: "PASS" };
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- bench ----
  const r = A.runBench();
  check("bench: ZERO assurance violations across sealed adversarial scenarios", r.assuranceViolations === 0 && r.safe === r.total && r.total === A.SCENARIOS.length);
  check("bench: digest stable + deterministic + frozen", /^[0-9a-f]{64}$/.test(r.digest) && r.digest === A.benchDigest() && JSON.stringify(A.runBench()) === JSON.stringify(A.runBench()) && Object.isFrozen(r) && Object.isFrozen(r.results[0]));

  // ---- model ----
  // 1. CONTRACT BREAK detected before closure: B changes key "k" that C expects ⇒ BLOCKED, C named
  const brk = A.analyzeMetierChange({ graph: G(), change: { metier: "B", breakingKeys: ["k"] }, testResults: ALLPASS });
  check("contract break (B breaks key C expects) ⇒ BLOCKED + C named", brk.verdict === "BLOCKED" && brk.reasons.includes("CONTRACT_BREAK") && brk.contractBreaks.some((b: any) => b.metier === "C" && b.brokenKeys.includes("k")));
  // 2. TRANSITIVE affected: A change ⇒ B and C affected (even if not broken)
  const tr = A.analyzeMetierChange({ graph: G(), change: { metier: "A", breakingKeys: ["zzz"] }, testResults: ALLPASS });
  check("transitive affected: A change ⇒ affected includes B and C", tr.affectedMetiers.includes("B") && tr.affectedMetiers.includes("C") && tr.verdict === "SAFE_TO_CLOSE");
  // 3. affected-test SELECTION: affectedTests = union of changed + affected métiers' tests
  check("affected tests SELECTED (tA,tB,tC) for an A change", tr.affectedTests.includes("tA") && tr.affectedTests.includes("tB") && tr.affectedTests.includes("tC") && !tr.affectedTests.includes("tD"));
  // 4. closure GATE: an affected test not PASS ⇒ BLOCKED (regression caught before closure)
  const un = A.analyzeMetierChange({ graph: G(), change: { metier: "A", breakingKeys: [] }, testResults: { tA: "PASS", tB: "PASS", tC: "FAIL", tD: "PASS" } });
  check("affected test FAIL ⇒ BLOCKED (not closed), tC listed", un.verdict === "BLOCKED" && un.reasons.includes("AFFECTED_TESTS_NOT_ALL_PASS") && un.unrunOrFailedTests.includes("tC"));
  // 5. MISSING DEPENDENCY fail-closed
  const md = A.analyzeMetierChange({ graph: { A: { dependsOn: ["GHOST"], expects: {}, tests: ["tA"] } }, change: { metier: "A", breakingKeys: [] }, testResults: { tA: "PASS" } });
  check("missing dependency ⇒ BLOCKED (fail-closed) + GHOST named", md.verdict === "BLOCKED" && md.reasons.includes("MISSING_DEPENDENCY") && md.missingDependencies.some((m: any) => m.missing === "GHOST"));
  // 6. ISOLATED change ⇒ no false blast radius (D has no consumers)
  const iso = A.analyzeMetierChange({ graph: G(), change: { metier: "D", breakingKeys: ["x"] }, testResults: ALLPASS });
  check("isolated métier change ⇒ 0 affected dependents (no false impact), SAFE", iso.affectedMetiers.length === 0 && iso.verdict === "SAFE_TO_CLOSE");
  // 7. TRACEABILITY: change -> per-métier relation (CHANGED / CONTRACT_BREAK / INDIRECT_RISK)
  const tc = brk.traceability;
  check("traceability: B=CHANGED, C=CONTRACT_BREAK recorded with tests", tc.some((t: any) => t.metier === "B" && t.relation === "CHANGED") && tc.some((t: any) => t.metier === "C" && t.relation === "CONTRACT_BREAK" && t.tests.includes("tC")));

  // ---- adversarial ----
  // 8. non-breaking change on a key nobody expects ⇒ SAFE (no false regression), but still lists affected for re-test
  const nb = A.analyzeMetierChange({ graph: G(), change: { metier: "B", breakingKeys: ["unused"] }, testResults: ALLPASS });
  check("non-breaking change ⇒ SAFE, no false contract break, C still in affected (re-test)", nb.verdict === "SAFE_TO_CLOSE" && nb.contractBreaks.length === 0 && nb.affectedMetiers.includes("C"));
  // 9. unknown changed métier ⇒ BLOCKED
  check("unknown changed métier ⇒ BLOCKED", A.analyzeMetierChange({ graph: G(), change: { metier: "ZZZ" } }).verdict === "BLOCKED");
  // 10. anti-rubberstamp + empty expect
  check("anti-rubberstamp: wrong expectation ⇒ UNSAFE", A.scoreScenario({ id: "rb", behaviour: "X", input: { graph: G(), change: { metier: "B", breakingKeys: ["k"] }, testResults: ALLPASS }, expect: { verdict: "SAFE_TO_CLOSE" } }).safe === false);
  check("empty expect ⇒ UNSAFE (no vacuous pass)", A.scoreScenario({ id: "e", behaviour: "X", input: { graph: G(), change: { metier: "A" } }, expect: {} }).safe === false);
  // 11. never throws on junk + frozen
  let threw = false; try { A.analyzeMetierChange("nonsense"); A.analyzeMetierChange(); A.analyzeMetierChange({ graph: "x" }); A.scoreScenario(null); } catch { threw = true; }
  check("never throws on junk + outputs frozen", threw === false && A.analyzeMetierChange("nonsense").verdict === "BLOCKED" && Object.isFrozen(brk) && Object.isFrozen(brk.affectedMetiers));
  // 12. deterministic
  check("deterministic (identical analysis ⇒ identical JSON)", JSON.stringify(brk) === JSON.stringify(A.analyzeMetierChange({ graph: G(), change: { metier: "B", breakingKeys: ["k"] }, testResults: ALLPASS })));
  // Regression lock (validator): a contract `expects` on a métier NOT in dependsOn is a self-inconsistent graph ⇒
  // must be BLOCKED (fail-closed), never a silent SAFE_TO_CLOSE that misses the break.
  const inconsistent = { C: { dependsOn: [], expects: { B: ["k"] }, tests: ["tC"] }, B: { dependsOn: [], expects: {}, tests: ["tB"] } };
  const rd = A.analyzeMetierChange({ graph: inconsistent, change: { metier: "B", breakingKeys: ["k"] }, testResults: { tB: "PASS", tC: "PASS" } });
  check("RD: expects-without-dependsOn (inconsistent graph) ⇒ BLOCKED (break not silently missed)", rd.verdict === "BLOCKED" && rd.reasons.includes("MISSING_DEPENDENCY") && rd.missingDependencies.some((m: any) => m.reason === "EXPECTS_WITHOUT_DEPENDSON"));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cross-metier-assurance M13 (métier change-impact: contract breaks + transitive affected + test selection + closure gate + traceability; fail-closed; SELECTS not runs)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
