#!/usr/bin/env node
"use strict";

/*
 * integrated-autonomy-bench (mission M10, V12.4 — INTEGRATED resilience/autonomy demonstration bench). PURE,
 * deterministic, fail-closed. Beyond the isolated modules, this is a small INTEGRATED mission-runtime MODEL plus a
 * SEALED, provenance-digested corpus of clearly-SYNTHETIC scenarios that exercise the emergent behaviours of a
 * prolonged multi-mission run and assert the SAFE outcome for each:
 *   - dependent-mission CHAINING (a mission runs only after its deps SUCCEEDED),
 *   - PARALLEL execution under a resource cap (observed concurrency never exceeds parallelCap),
 *   - provider/component UNAVAILABILITY (⇒ BLOCKED, never a false success),
 *   - DEGRADATION detection (K consecutive fails ⇒ DEGRADED) and a RECOVERY/rollback decision,
 *   - RESUME after interruption (checkpointed missions are not re-run),
 *   - decision TRACEABILITY/provenance (every decision carries a reason),
 *   - correct CLOSURE (COMPLETE only when every non-blocked mission succeeded),
 *   - prevention of LOOPS (maxAttempts ⇒ FROZEN), BUDGET overrun (prevented before spend), and FALSE SUCCESS
 *     (a mission is SUCCEEDED only on a real SUCCESS outcome).
 * It performs NO real orchestration, egress, or I/O — every scenario is explicitly `synthetic:true`. crypto hash is
 * deterministic. No clock (events are scripted), no randomness, no network.
 */

const crypto = require("crypto");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function intOr(v: any, d: number): number { return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : d; }

/**
 * runScenario(scenario): the pure integrated model. scenario (synthetic) = { budget, parallelCap, maxAttempts,
 * degradeThreshold, completed[], missions:[{id, deps[], cost, scripted:[SUCCESS|FAIL|PROVIDER_UNAVAILABLE]}] }.
 * Returns { verdict, succeeded[], blocked[], frozen[], budgetSpent, maxConcurrent, degraded, recovered, decisions[] }.
 * Never throws; unknown/missing fields fail CLOSED (nothing runs rather than running unbounded).
 */
const SAFE_MAX_ATTEMPTS = 1000, SAFE_MAX_PARALLEL = 1000, MAX_WORK = 100000;    // bound hostile scenarios (compute+memory)
function failClosedResult(verdict: string): any {
  return Object.freeze({ verdict, succeeded: Object.freeze([]), blocked: Object.freeze([]), frozen: Object.freeze([]), budgetSpent: 0, budgetStopped: false, workStopped: verdict === "STOPPED_ERROR", maxConcurrent: 0, degraded: 0, recovered: 0, decisions: Object.freeze([]) });
}

function runScenario(scenario: any): any {
  // Whole body guarded: a throwing getter on any scenario/mission field fails CLOSED, never throws (matches docstring).
  try {
    const s = isObj(scenario) ? scenario : {};
    const budget = intOr(s.budget, 0);
    const parallelCap = Math.min(SAFE_MAX_PARALLEL, Math.max(1, intOr(s.parallelCap, 1)));     // clamped (no runaway)
    const maxAttempts = Math.min(SAFE_MAX_ATTEMPTS, Math.max(1, intOr(s.maxAttempts, 3)));     // clamped (no compute bomb)
    const degradeThreshold = Math.max(1, intOr(s.degradeThreshold, 2));
    const missions = arr(s.missions).filter((m) => isObj(m) && typeof m.id === "string");
    const byId = new Map(missions.map((m) => [m.id, m]));

    const succeeded = new Set<string>(arr(s.completed).filter((x) => typeof x === "string"));   // RESUME: checkpoint
    const blocked = new Set<string>();
    const frozen = new Set<string>();
    const attempts: Record<string, number> = {};
    const cursor: Record<string, number> = {};                 // index into each mission's scripted outcomes
    const decisions: any[] = [];
    let budgetSpent = 0, consecutiveFails = 0, maxConcurrent = 0, degraded = 0, recovered = 0, totalRun = 0;
    let budgetStopped = false, workStopped = false;

    const log = (mission: string | null, action: string, reason: string) => decisions.push({ mission, action, reason });
    const terminal = (id: string) => succeeded.has(id) || blocked.has(id) || frozen.has(id);
    const depsMet = (m: any) => arr(m.deps).every((d: string) => succeeded.has(d));

    // Deterministic WAVES: each wave selects up to parallelCap eligible missions (deps met, non-terminal, attempts
    // left). The per-mission BUDGET pre-check happens at spend time (so budget overrun is a STOP, not silent skip).
    let guard = 0;                                             // backstop against any accidental non-termination
    while (!budgetStopped && !workStopped && guard++ < missions.length * maxAttempts + missions.length + 1) {
      const eligible = missions
        .filter((m) => !terminal(m.id) && depsMet(m) && (attempts[m.id] || 0) < maxAttempts)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (eligible.length === 0) break;                         // nothing runnable ⇒ done

      const wave = eligible.slice(0, parallelCap);              // RESOURCE CAP: at most parallelCap this wave
      let ranThisWave = 0;                                      // count missions that ACTUALLY ran (honest concurrency)
      for (const m of wave) {
        // BUDGET overrun PREVENTED before any spend (fail-closed — never overshoot).
        const cost = Math.max(0, intOr(m.cost, 0));
        if (budgetSpent + cost > budget) { log(m.id, "BUDGET_STOP", `would exceed budget (${budgetSpent}+${cost}>${budget})`); budgetStopped = true; break; }
        if (totalRun >= MAX_WORK) { log(m.id, "WORK_LIMIT", `absolute work backstop ${MAX_WORK} reached`); workStopped = true; break; }
        const idx = cursor[m.id] || 0;
        const scripted = arr(m.scripted);
        const outcome = idx < scripted.length ? scripted[idx] : "FAIL";   // past the script ⇒ FAIL (never a phantom success)
        cursor[m.id] = idx + 1;
        attempts[m.id] = (attempts[m.id] || 0) + 1;
        budgetSpent += cost;                                    // an attempt costs whether it passes or fails
        totalRun++; ranThisWave++;

        if (outcome === "SUCCESS") {
          succeeded.add(m.id); consecutiveFails = 0; log(m.id, "ACCEPT", "verified success");
        } else if (outcome === "PROVIDER_UNAVAILABLE") {
          blocked.add(m.id); log(m.id, "BLOCKED", "provider/component unavailable (fail-closed, not a success)");
        } else {                                                 // FAIL (or unknown ⇒ treated as FAIL)
          consecutiveFails++; log(m.id, "FAIL", `attempt ${attempts[m.id]} failed`);
          if (consecutiveFails >= degradeThreshold) { degraded++; recovered++; consecutiveFails = 0; log(m.id, "RECOVER", `degradation detected (>=${degradeThreshold} consecutive) ⇒ recovery/rollback decision`); }
          if ((attempts[m.id] || 0) >= maxAttempts) { frozen.add(m.id); log(m.id, "FROZEN", `max attempts ${maxAttempts} reached ⇒ loop prevented`); }
        }
      }
      maxConcurrent = Math.max(maxConcurrent, ranThisWave);     // honest: missions that ACTUALLY ran, not merely selected
      if (ranThisWave === 0) break;
    }

    // CLOSURE: COMPLETE only when every mission is terminal AND none is blocked/frozen (no false success, honest).
    const allTerminal = missions.every((m) => terminal(m.id));
    const anyUnresolved = blocked.size > 0 || frozen.size > 0 || budgetStopped || workStopped || !allTerminal;
    const verdict = !anyUnresolved ? "COMPLETE" : (budgetStopped ? "STOPPED_BUDGET" : (workStopped ? "STOPPED_LIMIT" : "PARTIAL"));

    return Object.freeze({
      verdict,
      succeeded: Object.freeze([...succeeded].sort()),
      blocked: Object.freeze([...blocked].sort()),
      frozen: Object.freeze([...frozen].sort()),
      budgetSpent,
      budgetStopped,
      workStopped,
      maxConcurrent,
      degraded,
      recovered,
      decisions: Object.freeze(decisions.map((d) => Object.freeze(d))),
    });
  } catch { return failClosedResult("STOPPED_ERROR"); }
}

// ---- SEALED synthetic-scenario corpus (deep-frozen, digested). Each asserts ONE integrated behaviour. ----
function deepFreeze<T>(o: T, seen?: Set<any>): T {
  const st = seen || new Set<any>();
  if (o === null || typeof o !== "object" || st.has(o)) return o;
  st.add(o); for (const k of Object.keys(o as any)) deepFreeze((o as any)[k], st); Object.freeze(o); return o;
}

const SCENARIOS: ReadonlyArray<any> = deepFreeze([
  { id: "chaining", synthetic: true, behaviour: "DEPENDENT_CHAINING", budget: 30, parallelCap: 3, maxAttempts: 3, degradeThreshold: 2,
    missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "B", deps: ["A"], cost: 10, scripted: ["SUCCESS"] }, { id: "C", deps: ["B"], cost: 10, scripted: ["SUCCESS"] }],
    expect: { verdict: "COMPLETE", succeeded: ["A", "B", "C"] } },
  { id: "parallel-cap", synthetic: true, behaviour: "PARALLEL_RESOURCE_CAP", budget: 40, parallelCap: 2, maxAttempts: 2, degradeThreshold: 3,
    missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "B", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "C", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "D", deps: [], cost: 10, scripted: ["SUCCESS"] }],
    expect: { verdict: "COMPLETE", maxConcurrentAtMost: 2, maxConcurrentAtLeast: 2 } },
  { id: "provider-unavailable", synthetic: true, behaviour: "PROVIDER_UNAVAILABILITY", budget: 30, parallelCap: 2, maxAttempts: 2, degradeThreshold: 3,
    missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "X", deps: [], cost: 10, scripted: ["PROVIDER_UNAVAILABLE"] }],
    expect: { verdict: "PARTIAL", blocked: ["X"], notSucceeded: ["X"] } },
  { id: "degradation-recovery", synthetic: true, behaviour: "DEGRADATION_AND_RECOVERY", budget: 100, parallelCap: 1, maxAttempts: 5, degradeThreshold: 2,
    missions: [{ id: "F", deps: [], cost: 10, scripted: ["FAIL", "FAIL", "SUCCESS"] }],
    expect: { degradedAtLeast: 1, recoveredAtLeast: 1, succeeded: ["F"] } },
  { id: "loop-frozen", synthetic: true, behaviour: "LOOP_PREVENTION", budget: 100, parallelCap: 1, maxAttempts: 3, degradeThreshold: 9,
    missions: [{ id: "L", deps: [], cost: 5, scripted: ["FAIL", "FAIL", "FAIL", "FAIL", "FAIL"] }],
    expect: { frozen: ["L"], notSucceeded: ["L"] } },
  { id: "budget-overrun", synthetic: true, behaviour: "BUDGET_PREVENTION", budget: 15, parallelCap: 1, maxAttempts: 2, degradeThreshold: 3,
    missions: [{ id: "A", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "B", deps: [], cost: 10, scripted: ["SUCCESS"] }],
    expect: { budgetStopped: true, budgetSpentAtMost: 15, verdict: "STOPPED_BUDGET" } },
  { id: "resume-checkpoint", synthetic: true, behaviour: "RESUME_AFTER_INTERRUPTION", budget: 30, parallelCap: 2, maxAttempts: 2, degradeThreshold: 3,
    completed: ["A"], missions: [{ id: "A", deps: [], cost: 10, scripted: ["FAIL"] }, { id: "B", deps: ["A"], cost: 10, scripted: ["SUCCESS"] }],
    expect: { succeeded: ["A", "B"], aNotReattempted: true } },
  { id: "false-success-guard", synthetic: true, behaviour: "FALSE_SUCCESS_PREVENTION", budget: 30, parallelCap: 1, maxAttempts: 1, degradeThreshold: 9,
    missions: [{ id: "G", deps: [], cost: 10, scripted: ["FAIL"] }],
    expect: { notSucceeded: ["G"], verdict: "PARTIAL" } },
]);

function digest(): string { return crypto.createHash("sha256").update(JSON.stringify(SCENARIOS)).digest("hex"); }

/** scoreScenario(sc): run the model and check the scenario's declared SAFE expectation. Pure; never throws. */
function scoreScenario(sc: any): any {
  let safe = false, observed = "", id = null, behaviour = "UNKNOWN";
  try {
    id = isObj(sc) ? sc.id : null; behaviour = isObj(sc) && typeof sc.behaviour === "string" ? sc.behaviour : "UNKNOWN";
    const r = runScenario(sc); const e = isObj(sc) && isObj(sc.expect) ? sc.expect : {};
    const checks: boolean[] = [];
    let substantive = 0;                                       // count of real expectation checks (an empty `expect` is INDETERMINATE, never a vacuous pass)
    if (e.verdict !== undefined) { checks.push(r.verdict === e.verdict); substantive++; }
    if (Array.isArray(e.succeeded)) { checks.push(e.succeeded.every((x: string) => r.succeeded.includes(x)) && r.succeeded.length === e.succeeded.length); substantive++; }
    if (Array.isArray(e.blocked)) { checks.push(e.blocked.every((x: string) => r.blocked.includes(x)) && r.blocked.length === e.blocked.length); substantive++; }
    if (Array.isArray(e.frozen)) { checks.push(e.frozen.every((x: string) => r.frozen.includes(x)) && r.frozen.length === e.frozen.length); substantive++; }
    if (Array.isArray(e.notSucceeded)) { checks.push(e.notSucceeded.every((x: string) => !r.succeeded.includes(x))); substantive++; }
    if (typeof e.maxConcurrentAtMost === "number") { checks.push(r.maxConcurrent <= e.maxConcurrentAtMost); substantive++; }
    if (typeof e.maxConcurrentAtLeast === "number") { checks.push(r.maxConcurrent >= e.maxConcurrentAtLeast); substantive++; }   // prove parallelism ACTUALLY occurs
    if (typeof e.degradedAtLeast === "number") { checks.push(r.degraded >= e.degradedAtLeast); substantive++; }
    if (typeof e.recoveredAtLeast === "number") { checks.push(r.recovered >= e.recoveredAtLeast); substantive++; }
    if (typeof e.budgetStopped === "boolean") { checks.push(r.budgetStopped === e.budgetStopped); substantive++; }
    if (typeof e.budgetSpentAtMost === "number") { checks.push(r.budgetSpent <= e.budgetSpentAtMost); substantive++; }
    if (e.aNotReattempted === true) { checks.push((r.decisions.filter((d: any) => d.mission === "A").length) === 0); substantive++; }   // A was checkpointed ⇒ never ran
    checks.push(r.decisions.length > 0);                      // PROVENANCE: decisions were recorded (always-on, not counted substantive)
    safe = substantive > 0 && checks.every(Boolean);          // require at least one real expectation ⇒ no vacuous pass
    observed = `verdict=${r.verdict} succ=[${r.succeeded}] blk=[${r.blocked}] frz=[${r.frozen}] maxC=${r.maxConcurrent} spent=${r.budgetSpent} deg=${r.degraded}`;
  } catch (e: any) { observed = "THREW:" + ((e && e.message) || e); safe = false; }
  return { id, behaviour, safe, observed };
}

/** runBench(): score every sealed scenario; report integratedViolations (target 0) + digest. Pure, frozen. */
function runBench(): any {
  const results = SCENARIOS.map(scoreScenario);
  const violations = results.filter((r) => !r.safe);
  const byBehaviour: Record<string, { total: number; safe: number }> = {};
  for (const r of results) { (byBehaviour[r.behaviour] = byBehaviour[r.behaviour] || { total: 0, safe: 0 }).total++; if (r.safe) byBehaviour[r.behaviour].safe++; }
  return Object.freeze({
    version: "integrated-autonomy-bench-v1",
    digest: digest(),
    total: results.length,
    safe: results.length - violations.length,
    integratedViolations: violations.length,
    byBehaviour: Object.freeze(byBehaviour),
    violations: Object.freeze(violations.map((v) => Object.freeze(v))),
    results: Object.freeze(results.map((r) => Object.freeze(r))),
  });
}

module.exports = { runScenario, SCENARIOS, digest, scoreScenario, runBench };
export {};

if (require.main === module) {
  const r = runBench();
  process.stdout.write(JSON.stringify({ version: r.version, digest: r.digest, total: r.total, integratedViolations: r.integratedViolations, byBehaviour: r.byBehaviour }, null, 2) + "\n");
}
