#!/usr/bin/env node
"use strict";
/* M10 (V12.4 integrated resilience/autonomy bench) — battery. Proves the integrated MODEL enforces each emergent
 * behaviour (chaining, parallel-cap, provider-unavailability⇒blocked, degradation⇒recovery, resume, loop/budget/
 * false-success prevention, provenance) AND that the sealed bench measures them with ZERO integrated violations and a
 * non-rubberstamp scorer. All scenarios are explicitly synthetic. Pure; no egress. */
const B = require("./integrated-autonomy-bench.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const byId = (id: string) => B.SCENARIOS.find((s: any) => s.id === id);

function main() {
  // ---- the bench ----
  const r = B.runBench();
  check("bench: ZERO integrated violations across all synthetic scenarios", r.integratedViolations === 0 && r.safe === r.total && r.total === B.SCENARIOS.length);
  check("bench: provenance digest stable sha256", /^[0-9a-f]{64}$/.test(r.digest) && r.digest === B.digest());
  check("bench: every behaviour covered + all-safe", Object.values(r.byBehaviour).every((b: any) => b.safe === b.total) && Object.keys(r.byBehaviour).length >= 8);
  check("bench: deterministic + frozen", JSON.stringify(B.runBench()) === JSON.stringify(B.runBench()) && Object.isFrozen(r) && Object.isFrozen(r.results) && Object.isFrozen(r.results[0]));

  // ---- the MODEL directly (prove behaviours, not just the bench verdict) ----
  // 1. dependent chaining: deps enforce order
  const ch = B.runScenario(byId("chaining"));
  const order = (m: string) => ch.decisions.findIndex((d: any) => d.mission === m && d.action === "ACCEPT");
  check("model: dependent chaining — A before B before C, all succeed", ch.verdict === "COMPLETE" && order("A") < order("B") && order("B") < order("C"));
  // 2. parallel cap respected
  const pc = B.runScenario(byId("parallel-cap"));
  check("model: parallel execution never exceeds the resource cap (2)", pc.maxConcurrent <= 2 && pc.verdict === "COMPLETE");
  // 3. provider unavailable ⇒ BLOCKED, not success
  const pu = B.runScenario(byId("provider-unavailable"));
  check("model: provider unavailable ⇒ BLOCKED (fail-closed, not a success)", pu.blocked.includes("X") && !pu.succeeded.includes("X") && pu.verdict === "PARTIAL");
  // 4. degradation + recovery decision
  const dr = B.runScenario(byId("degradation-recovery"));
  check("model: degradation detected ⇒ recovery decision, then success", dr.degraded >= 1 && dr.recovered >= 1 && dr.succeeded.includes("F"));
  // 5. loop prevention
  const lp = B.runScenario(byId("loop-frozen"));
  check("model: loop prevented ⇒ FROZEN at maxAttempts, never succeeds", lp.frozen.includes("L") && !lp.succeeded.includes("L"));
  // 6. budget overrun PREVENTED before spend
  const bo = B.runScenario(byId("budget-overrun"));
  check("model: budget overrun PREVENTED (stopped, spent <= budget)", bo.budgetStopped === true && bo.budgetSpent <= 15 && bo.verdict === "STOPPED_BUDGET");
  // 7. resume: checkpointed mission not re-run
  const rc = B.runScenario(byId("resume-checkpoint"));
  check("model: resume — checkpointed A not re-run, B proceeds + succeeds", rc.decisions.filter((d: any) => d.mission === "A").length === 0 && rc.succeeded.includes("A") && rc.succeeded.includes("B"));
  // 8. false success prevention + provenance
  const fs = B.runScenario(byId("false-success-guard"));
  check("model: no false success (failed mission never SUCCEEDED) + provenance recorded", !fs.succeeded.includes("G") && fs.decisions.length > 0 && fs.decisions.every((d: any) => typeof d.reason === "string"));

  // ---- adversarial ----
  // 9. anti-rubberstamp: a scenario whose expectation is violated ⇒ scored UNSAFE
  const rb = B.scoreScenario({ id: "rb", behaviour: "X", synthetic: true, budget: 100, parallelCap: 1, maxAttempts: 1, degradeThreshold: 9, missions: [{ id: "A", deps: [], cost: 5, scripted: ["FAIL"] }], expect: { succeeded: ["A"] } });
  check("anti-rubberstamp: a wrong expectation is detected UNSAFE (scorer really measures)", rb.safe === false);
  // 10. budget prevention is BEFORE any spend — a single too-costly mission never runs
  const noRun = B.runScenario({ synthetic: true, budget: 5, parallelCap: 1, maxAttempts: 2, degradeThreshold: 3, missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }] });
  check("adversarial: cost>budget ⇒ never runs, budgetSpent 0 (no overshoot)", noRun.budgetStopped === true && noRun.budgetSpent === 0 && !noRun.succeeded.includes("A"));
  // 11. TERMINATION: an all-FAIL pathological scenario still terminates (no infinite loop)
  const term = B.runScenario({ synthetic: true, budget: 1000, parallelCap: 2, maxAttempts: 3, degradeThreshold: 2, missions: [{ id: "A", deps: [], cost: 1, scripted: ["FAIL", "FAIL", "FAIL"] }, { id: "B", deps: [], cost: 1, scripted: ["FAIL", "FAIL", "FAIL"] }] });
  check("adversarial: all-FAIL scenario terminates (loop guard) ⇒ both FROZEN, PARTIAL", term.frozen.length === 2 && term.verdict === "PARTIAL");
  // 12. budgetSpent never exceeds budget (invariant across a mixed scenario)
  const mix = B.runScenario({ synthetic: true, budget: 25, parallelCap: 3, maxAttempts: 2, degradeThreshold: 3, missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "B", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "C", deps: [], cost: 10, scripted: ["SUCCESS"] }] });
  check("invariant: budgetSpent never exceeds budget", mix.budgetSpent <= 25);
  // 13. never throws on junk input (fail-closed)
  let threw = false; try { B.runScenario("nonsense"); B.runScenario(); B.runScenario({ missions: "x" }); B.scoreScenario(null); } catch { threw = true; }
  check("never throws on junk input (fail-closed)", threw === false && B.runScenario("nonsense").verdict !== undefined);
  // 14. a dependency that never succeeds blocks its dependents (no false completion)
  const dep = B.runScenario({ synthetic: true, budget: 100, parallelCap: 2, maxAttempts: 1, degradeThreshold: 9, missions: [{ id: "A", deps: [], cost: 5, scripted: ["FAIL"] }, { id: "B", deps: ["A"], cost: 5, scripted: ["SUCCESS"] }] });
  check("dependents of a failed mission never run/succeed (no false completion)", !dep.succeeded.includes("B") && dep.frozen.includes("A") && dep.verdict === "PARTIAL");

  // ===== Regression locks for independent-validator findings =====
  // RD1: a throwing getter on a scenario field ⇒ runScenario does NOT throw (matches "never throws"); fail-closed
  let rdThrew = false; let rdRes: any;
  const evilSc: any = { parallelCap: 1, maxAttempts: 2, degradeThreshold: 2, missions: [] };
  Object.defineProperty(evilSc, "budget", { get() { throw new Error("boom"); }, enumerable: true });
  try { rdRes = B.runScenario(evilSc); } catch { rdThrew = true; }
  check("RD1: throwing getter ⇒ runScenario does not throw, fail-closed STOPPED_ERROR", rdThrew === false && rdRes.verdict === "STOPPED_ERROR" && rdRes.succeeded.length === 0);
  // RD2a: unbounded maxAttempts is CLAMPED ⇒ terminates fast (not minutes), all FROZEN
  const clamp = B.runScenario({ synthetic: true, budget: 1e9, parallelCap: 1, maxAttempts: 1e9, degradeThreshold: 9, missions: [{ id: "A", deps: [], cost: 0, scripted: ["FAIL"] }] });
  check("RD2a: unbounded maxAttempts clamped ⇒ terminates, A FROZEN (no compute bomb)", clamp.frozen.includes("A") && clamp.verdict === "PARTIAL");
  // RD2b: absolute work backstop stops a huge all-FAIL scenario (STOPPED_LIMIT), bounded compute
  const many = Array.from({ length: 150 }, (_, i) => ({ id: "m" + i, deps: [], cost: 0, scripted: ["FAIL"] }));
  const work = B.runScenario({ synthetic: true, budget: 1e9, parallelCap: 1, maxAttempts: 1000, degradeThreshold: 9999, missions: many });
  check("RD2b: absolute work backstop ⇒ STOPPED_LIMIT on a huge scenario (bounded)", work.workStopped === true && work.verdict === "STOPPED_LIMIT");
  // RD3: maxConcurrent reflects ACTUAL runs, not merely selected (a wholly budget-blocked wave ⇒ 0, not the cap)
  const honest = B.runScenario({ synthetic: true, budget: 5, parallelCap: 3, maxAttempts: 2, degradeThreshold: 3, missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "B", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "C", deps: [], cost: 10, scripted: ["SUCCESS"] }] });
  check("RD3: maxConcurrent honest (budget-blocked wave ⇒ 0 actual runs, not selected count)", honest.maxConcurrent === 0 && honest.budgetStopped === true);
  // RD4: an empty `expect` is INDETERMINATE (safe:false), never a vacuous pass
  check("RD4: empty expect ⇒ scoreScenario UNSAFE (no vacuous pass)", B.scoreScenario({ id: "e", behaviour: "X", synthetic: true, budget: 10, missions: [{ id: "A", deps: [], cost: 0, scripted: ["SUCCESS"] }], expect: {} }).safe === false);
  // RD5: parallel-cap scenario actually EXHIBITS parallelism (maxConcurrent exactly the cap, not serial)
  check("RD5: parallel-cap scenario exhibits real parallelism (maxConcurrent === 2)", B.runScenario(byId("parallel-cap")).maxConcurrent === 2);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — integrated-autonomy-bench M10 (integrated resilience/autonomy demonstrated on sealed synthetic scenarios; 0 violations; non-rubberstamp; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
