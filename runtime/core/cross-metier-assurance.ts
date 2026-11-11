#!/usr/bin/env node
"use strict";

/*
 * cross-metier-assurance (mission M13, V12.4 CTO §2 — cross-métier change-impact assurance). PURE, deterministic,
 * fail-closed. Closes an evidenced gap: change-impact-graph answers the MODULE (require) graph and
 * cross-metier-collaboration is a one-problem SHIP gate, but nothing analyses a MÉTIER-level change across its
 * dependents: which métiers are affected (transitively), which EXPECTED contracts break, which dependency is missing,
 * which tests must be re-run, and whether closure is safe. This is a SELECTOR/ANALYSER over the declared métier graph
 * + contracts — it NEVER runs tests (no second test orchestrator) and NEVER invents coverage. analyzeMetierChange:
 *   - MISSING_DEPENDENCY: a dependsOn/expects reference to an unknown métier ⇒ fail-closed (graph integrity broken).
 *   - CONTRACT_BREAK: a direct consumer that EXPECTS a key the change removed/altered ⇒ a detected regression.
 *   - affected métiers = the transitive consumers of the changed métier; affected tests = their union.
 *   - closure SAFE only when: no missing dep, no contract break, AND every affected test is PASS in testResults.
 * Deterministic traceability (change -> risk -> tests -> verdict). No I/O, no clock, no randomness, no network.
 */

const crypto = require("crypto");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function strs(v: any): string[] { return arr(v).filter((x) => typeof x === "string" && x); }
function uniqSort(a: string[]): string[] { return [...new Set(a)].sort(); }

/**
 * analyzeMetierChange({ graph, change, testResults? }): PURE métier-level impact analysis. graph = { [id]: {
 * dependsOn:[ids], expects:{[depId]:[keys]}, tests:[ids] } }. change = { metier, breakingKeys:[keys] }. testResults =
 * { [testId]: "PASS"|... }. Returns a frozen verdict with affectedMetiers, contractBreaks, missingDependencies,
 * affectedTests, unrunOrFailedTests, traceability[], and closure SAFE_TO_CLOSE | BLOCKED. Never throws.
 */
function analyzeMetierChange(input: any = {}): any {
  try {
    const i = isObj(input) ? input : {};
    const graph = isObj(i.graph) ? i.graph : {};
    const ids = Object.keys(graph).filter((k) => isObj(graph[k]));
    const idSet = new Set(ids);
    const change = isObj(i.change) ? i.change : {};
    const changed = typeof change.metier === "string" ? change.metier : null;
    const breakingKeys = new Set(strs(change.breakingKeys));
    const testResults = isObj(i.testResults) ? i.testResults : {};

    // GRAPH INTEGRITY (fail-closed): every dependsOn / expects reference must be a known métier.
    const missingDependencies: Array<{ metier: string; missing: string; reason: string }> = [];
    for (const id of ids) {
      const g = graph[id];
      const deps = new Set(strs(g.dependsOn));
      for (const d of deps) if (!idSet.has(d)) missingDependencies.push({ metier: id, missing: d, reason: "UNKNOWN_DEPENDENCY" });
      const exp = isObj(g.expects) ? g.expects : {};
      // An `expects` contract MUST be backed by a declared dependency. A contract on an unknown métier, OR on a known
      // métier that is NOT in dependsOn (a self-inconsistent graph), is an integrity violation ⇒ fail-closed (else a
      // break on that un-declared contract edge would be silently missed and read SAFE_TO_CLOSE).
      for (const dep of Object.keys(exp)) {
        if (!idSet.has(dep)) missingDependencies.push({ metier: id, missing: dep, reason: "EXPECTS_UNKNOWN_METIER" });
        else if (!deps.has(dep)) missingDependencies.push({ metier: id, missing: dep, reason: "EXPECTS_WITHOUT_DEPENDSON" });
      }
    }
    if (!changed || !idSet.has(changed)) {
      return Object.freeze({ verdict: "BLOCKED", reasons: Object.freeze(["UNKNOWN_CHANGED_METIER"]), changed, affectedMetiers: Object.freeze([]), contractBreaks: Object.freeze([]), missingDependencies: Object.freeze(missingDependencies), affectedTests: Object.freeze([]), unrunOrFailedTests: Object.freeze([]), traceability: Object.freeze([]) });
    }

    // reverse edges: consumers[x] = métiers that dependОn x
    const consumers: Record<string, string[]> = {};
    for (const id of ids) for (const d of strs(graph[id].dependsOn)) if (idSet.has(d)) (consumers[d] = consumers[d] || []).push(id);

    // transitive affected = all métiers that (transitively) depend on the changed one
    const affected = new Set<string>();
    const queue = [changed];
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const c of (consumers[cur] || [])) if (!affected.has(c)) { affected.add(c); queue.push(c); }
    }

    // CONTRACT BREAKS: a DIRECT consumer that expects a broken key from the changed métier.
    const contractBreaks: Array<{ metier: string; brokenKeys: string[] }> = [];
    for (const c of (consumers[changed] || [])) {
      const exp = isObj(graph[c].expects) ? graph[c].expects : {};
      const expectedFromChanged = strs(exp[changed]);
      const broken = expectedFromChanged.filter((k) => breakingKeys.has(k));
      if (broken.length) contractBreaks.push({ metier: c, brokenKeys: uniqSort(broken) });
    }

    // affected tests = union of tests across the changed métier + all affected métiers (SELECTION, not execution)
    const affectedMetiers = uniqSort([...affected]);
    const testOwners = uniqSort([changed, ...affectedMetiers]);
    const affectedTests = uniqSort(testOwners.flatMap((m) => strs(graph[m].tests)));
    const unrunOrFailedTests = affectedTests.filter((t) => testResults[t] !== "PASS");

    // traceability: change -> per-métier risk -> its tests -> status
    const breakSet = new Set(contractBreaks.map((b) => b.metier));
    const traceability = testOwners.map((m) => Object.freeze({
      metier: m,
      relation: m === changed ? "CHANGED" : (breakSet.has(m) ? "CONTRACT_BREAK" : "INDIRECT_RISK"),
      tests: Object.freeze(strs(graph[m].tests)),
      allTestsPass: strs(graph[m].tests).every((t) => testResults[t] === "PASS"),
    }));

    const reasons: string[] = [];
    if (missingDependencies.length) reasons.push("MISSING_DEPENDENCY");
    if (contractBreaks.length) reasons.push("CONTRACT_BREAK");
    if (unrunOrFailedTests.length) reasons.push("AFFECTED_TESTS_NOT_ALL_PASS");
    const verdict = reasons.length === 0 ? "SAFE_TO_CLOSE" : "BLOCKED";

    return Object.freeze({
      verdict,
      reasons: Object.freeze(reasons),
      changed,
      affectedMetiers: Object.freeze(affectedMetiers),
      contractBreaks: Object.freeze(contractBreaks.map((b) => Object.freeze({ metier: b.metier, brokenKeys: Object.freeze(b.brokenKeys) }))),
      missingDependencies: Object.freeze(missingDependencies.map((m) => Object.freeze(m))),
      affectedTests: Object.freeze(affectedTests),
      unrunOrFailedTests: Object.freeze(unrunOrFailedTests),
      traceability: Object.freeze(traceability),
    });
  } catch { return Object.freeze({ verdict: "BLOCKED", reasons: Object.freeze(["ANALYSIS_ERROR"]), changed: null, affectedMetiers: Object.freeze([]), contractBreaks: Object.freeze([]), missingDependencies: Object.freeze([]), affectedTests: Object.freeze([]), unrunOrFailedTests: Object.freeze([]), traceability: Object.freeze([]) }); }
}

// ---- SEALED synthetic adversarial scenario bench (all SIMULATED métier graphs) ----
function deepFreeze<T>(o: T, seen?: Set<any>): T {
  const st = seen || new Set<any>();
  if (o === null || typeof o !== "object" || st.has(o)) return o;
  st.add(o); for (const k of Object.keys(o as any)) deepFreeze((o as any)[k], st); Object.freeze(o); return o;
}
// A→B→C chain (C depends on B expects {k}; B depends on A expects {a}); plus D isolated.
const G = () => ({
  A: { dependsOn: [], expects: {}, tests: ["tA"] },
  B: { dependsOn: ["A"], expects: { A: ["a"] }, tests: ["tB"] },
  C: { dependsOn: ["B"], expects: { B: ["k"] }, tests: ["tC"] },
  D: { dependsOn: [], expects: {}, tests: ["tD"] },
});
const ALLPASS = { tA: "PASS", tB: "PASS", tC: "PASS", tD: "PASS" };
const SCENARIOS: ReadonlyArray<any> = deepFreeze([
  { id: "direct-break-detected", behaviour: "CONTRACT_BREAK_BEFORE_CLOSURE", synthetic: true, input: { graph: G(), change: { metier: "B", breakingKeys: ["k"] }, testResults: ALLPASS },
    expect: { verdict: "BLOCKED", reason: "CONTRACT_BREAK", breakMetier: "C", affectedIncludes: ["C"] } },
  { id: "indirect-risk-affected", behaviour: "TRANSITIVE_AFFECTED", synthetic: true, input: { graph: G(), change: { metier: "A", breakingKeys: ["zzz"] }, testResults: ALLPASS },
    expect: { verdict: "SAFE_TO_CLOSE", affectedIncludes: ["B", "C"] } },   // A change, no expected key broken, all tests pass
  { id: "non-breaking-safe", behaviour: "NON_BREAKING_SAFE", synthetic: true, input: { graph: G(), change: { metier: "B", breakingKeys: ["other"] }, testResults: ALLPASS },
    expect: { verdict: "SAFE_TO_CLOSE", affectedIncludes: ["C"] } },
  { id: "affected-test-not-run", behaviour: "UNRUN_AFFECTED_TEST_BLOCKS", synthetic: true, input: { graph: G(), change: { metier: "A", breakingKeys: [] }, testResults: { tA: "PASS", tB: "PASS", tC: "FAIL", tD: "PASS" } },
    expect: { verdict: "BLOCKED", reason: "AFFECTED_TESTS_NOT_ALL_PASS", unrunIncludes: ["tC"] } },
  { id: "missing-dependency", behaviour: "MISSING_DEPENDENCY_FAILCLOSED", synthetic: true, input: { graph: { A: { dependsOn: ["GHOST"], expects: {}, tests: ["tA"] } }, change: { metier: "A", breakingKeys: [] }, testResults: { tA: "PASS" } },
    expect: { verdict: "BLOCKED", reason: "MISSING_DEPENDENCY" } },
  { id: "isolated-change-minimal", behaviour: "ISOLATED_NO_FALSE_IMPACT", synthetic: true, input: { graph: G(), change: { metier: "D", breakingKeys: ["x"] }, testResults: ALLPASS },
    expect: { verdict: "SAFE_TO_CLOSE", affectedEquals: [] } },   // D has no consumers ⇒ no false blast radius
]);
function benchDigest(): string { return crypto.createHash("sha256").update(JSON.stringify(SCENARIOS)).digest("hex"); }

function scoreScenario(sc: any): any {
  let safe = false, observed = "", id = null, behaviour = "UNKNOWN";
  try {
    id = isObj(sc) ? sc.id : null; behaviour = isObj(sc) && typeof sc.behaviour === "string" ? sc.behaviour : "UNKNOWN";
    const r = analyzeMetierChange(isObj(sc) ? sc.input : {}); const e = isObj(sc) && isObj(sc.expect) ? sc.expect : {};
    const checks: boolean[] = []; let substantive = 0; const push = (c: boolean) => { checks.push(c); substantive++; };
    if (e.verdict !== undefined) push(r.verdict === e.verdict);
    if (typeof e.reason === "string") push(Array.isArray(r.reasons) && r.reasons.includes(e.reason));
    if (typeof e.breakMetier === "string") push(r.contractBreaks.some((b: any) => b.metier === e.breakMetier));
    if (Array.isArray(e.affectedIncludes)) push(e.affectedIncludes.every((x: string) => r.affectedMetiers.includes(x)));
    if (Array.isArray(e.affectedEquals)) push(r.affectedMetiers.length === e.affectedEquals.length && e.affectedEquals.every((x: string) => r.affectedMetiers.includes(x)));
    if (Array.isArray(e.unrunIncludes)) push(e.unrunIncludes.every((x: string) => r.unrunOrFailedTests.includes(x)));
    safe = substantive > 0 && checks.every(Boolean);
    observed = `verdict=${r.verdict} reasons=[${r.reasons}] affected=[${r.affectedMetiers}] breaks=${r.contractBreaks.length}`;
  } catch (e: any) { observed = "THREW:" + ((e && e.message) || e); safe = false; }
  return { id, behaviour, safe, observed };
}

function runBench(): any {
  const results = SCENARIOS.map(scoreScenario);
  const violations = results.filter((r) => !r.safe);
  const byBehaviour: Record<string, { total: number; safe: number }> = {};
  for (const r of results) { (byBehaviour[r.behaviour] = byBehaviour[r.behaviour] || { total: 0, safe: 0 }).total++; if (r.safe) byBehaviour[r.behaviour].safe++; }
  return Object.freeze({
    version: "cross-metier-assurance-v1", digest: benchDigest(), total: results.length,
    safe: results.length - violations.length, assuranceViolations: violations.length,
    byBehaviour: Object.freeze(byBehaviour), violations: Object.freeze(violations.map((v) => Object.freeze(v))), results: Object.freeze(results.map((r) => Object.freeze(r))),
  });
}

module.exports = { analyzeMetierChange, SCENARIOS, benchDigest, scoreScenario, runBench };
export {};

if (require.main === module) {
  const r = runBench();
  process.stdout.write(JSON.stringify({ version: r.version, digest: r.digest, total: r.total, assuranceViolations: r.assuranceViolations, byBehaviour: r.byBehaviour }, null, 2) + "\n");
}
