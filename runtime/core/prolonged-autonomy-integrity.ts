#!/usr/bin/env node
"use strict";

/*
 * prolonged-autonomy-integrity (mission M12, V12.4 — ACCUMULATED-STATE integrity across REPEATED interrupt/restart
 * cycles). PURE, deterministic, fail-closed. Closes a demonstrable gap: recovery-drill proves ONE checkpoint restores
 * without corruption and M10 resumes ONE scenario, but nothing proves a PROLONGED multi-mission run survives REPEATED
 * interrupt->checkpoint->restart cycles with its accumulated state intact. This models that and asserts:
 *   - NO DUPLICATED WORK: a mission executed in an earlier cycle is NEVER re-executed after a restart,
 *   - NO RESOURCE LEAK: spend accrues EXACTLY ONCE per real execution (not per resume) ⇒ spent == sum(cost of completed),
 *   - IDEMPOTENT RESUME: resuming an already-complete / no-progress checkpoint changes nothing (no drift),
 *   - STALE/CORRUPTED CHECKPOINT REFUSED: a checkpoint referencing a mission absent from the workload fails CLOSED,
 *   - CONVERGENCE: across cycles every workload mission executes exactly once; a stable digest seals the final state.
 * A SIMULATED model over synthetic scenarios (explicitly labelled); no I/O, no clock, no randomness, no network, no
 * egress. crypto hash is deterministic. Reuses the canonical checksum discipline; adds no new primitive/registry.
 */

const crypto = require("crypto");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function intOr(v: any, d: number): number { return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : d; }
function cost(m: any): number { const c = m && m.cost; return typeof c === "number" && Number.isFinite(c) && c >= 0 ? Math.floor(c) : 0; }
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

const CORRUPTED = Object.freeze({ verdict: "CORRUPTED" });

/**
 * runProlonged(input): execute a workload across REPEATED interrupt/restart cycles.
 * input = { missions:[{id, cost}], missionsPerCycle?, maxCycles?, seedCompleted?:[ids], seedSpent?:number }.
 * seedCompleted/seedSpent model resuming from an EXISTING checkpoint (prior cycles). Never throws.
 */
function runProlonged(input: any = {}): any {
  try {
    const i = isObj(input) ? input : {};
    const missions = arr(i.missions).filter((m) => isObj(m) && typeof m.id === "string");
    const byId = new Map(missions.map((m) => [m.id, m]));
    const ids = missions.map((m) => m.id);
    if (new Set(ids).size !== ids.length) return Object.freeze({ ...CORRUPTED, reason: "duplicate mission id in workload" });   // fail-closed: ambiguous workload
    const total = missions.length;
    const perCycle = Math.max(1, intOr(i.missionsPerCycle, Math.max(1, total)));
    const maxCycles = Math.max(1, intOr(i.maxCycles, total + 2));

    // RESUME from a checkpoint: seeded completed ids MUST all belong to the workload (else STALE/CORRUPTED, fail-closed).
    const completed = new Set<string>();
    for (const c of arr(i.seedCompleted)) {
      if (typeof c !== "string") continue;
      if (!byId.has(c)) return Object.freeze({ ...CORRUPTED, reason: `checkpoint references unknown mission '${c}'` });
      completed.add(c);
    }
    let spent = Math.max(0, intOr(i.seedSpent, 0));
    const seededSpend = spent;
    const executionLog: string[] = [];                               // ACTUAL executions this run (post-resume)

    let cycles = 0;
    let skippedAlreadyDone = 0;                                       // times a RESTART re-encountered a completed mission and SKIPPED it
    while (cycles < maxCycles && completed.size < total) {
      cycles++;
      // each cycle re-verifies accumulated state is consistent with the workload (defence across restarts)
      for (const c of completed) if (!byId.has(c)) return Object.freeze({ ...CORRUPTED, reason: "accumulated state diverged from workload" });
      let ran = 0;
      for (const m of missions) {
        if (ran >= perCycle) break;
        if (completed.has(m.id)) { skippedAlreadyDone++; continue; } // ALREADY DONE ⇒ SKIP (observable proof: the no-duplication guard FIRED across a restart)
        completed.add(m.id); spent += cost(m); executionLog.push(m.id); ran++;   // execute once; accrue cost once
      }
      if (ran === 0) break;                                          // no progress possible ⇒ idempotent stop (no drift)
    }

    const uniqueExec = new Set(executionLog);
    const duplicatedExecutions = executionLog.length - uniqueExec.size;          // re-executions (must be 0)
    const expectedSpend = [...completed].reduce((n, id) => n + cost(byId.get(id)), 0);
    const spendConsistent = spent === expectedSpend;                              // exactly-once accrual (no leak/double-count)
    const verdict = completed.size === total ? "COMPLETE" : "INCOMPLETE";
    const completedSorted = [...completed].sort();
    return Object.freeze({
      verdict,
      cycles,
      total,
      completed: Object.freeze(completedSorted),
      executionLog: Object.freeze(executionLog.slice()),
      executedThisRun: executionLog.length,
      skippedAlreadyDone,                                                           // >0 ⇒ restarts DID re-encounter completed work and correctly skipped it (guard exercised, not just structurally safe)
      duplicatedExecutions,                                                         // post-hoc log check (0 by the completed-guard; skippedAlreadyDone is the live signal)
      seededSpend,
      spent,
      expectedSpend,
      spendConsistent,
      digest: sha256(JSON.stringify({ completed: completedSorted, spent })),      // stable final-state seal
    });
  } catch { return Object.freeze({ ...CORRUPTED, reason: "execution error — fail-closed" }); }
}

// ---- SEALED synthetic-scenario bench (all SIMULATED) ----
function deepFreeze<T>(o: T, seen?: Set<any>): T {
  const st = seen || new Set<any>();
  if (o === null || typeof o !== "object" || st.has(o)) return o;
  st.add(o); for (const k of Object.keys(o as any)) deepFreeze((o as any)[k], st); Object.freeze(o); return o;
}
const WL5 = [{ id: "A", cost: 1 }, { id: "B", cost: 2 }, { id: "C", cost: 3 }, { id: "D", cost: 4 }, { id: "E", cost: 5 }];  // sum 15
const SCENARIOS: ReadonlyArray<any> = deepFreeze([
  { id: "multi-cycle-complete", synthetic: true, behaviour: "MULTI_CYCLE_CONVERGENCE", input: { missions: WL5, missionsPerCycle: 2 },
    expect: { verdict: "COMPLETE", duplicatedExecutions: 0, spendConsistent: true, executedThisRun: 5, cyclesAtLeast: 3, skippedAtLeast: 1 } },
  { id: "no-duplicated-work", synthetic: true, behaviour: "NO_DUPLICATED_WORK", input: { missions: WL5, missionsPerCycle: 1 },
    expect: { duplicatedExecutions: 0, executedThisRun: 5 } },
  { id: "resume-from-checkpoint", synthetic: true, behaviour: "RESUME_NO_REEXEC", input: { missions: WL5, missionsPerCycle: 2, seedCompleted: ["A", "B"], seedSpent: 3 },
    expect: { verdict: "COMPLETE", executedThisRun: 3, spendConsistent: true, notReexecuted: ["A", "B"] } },
  { id: "already-complete-idempotent", synthetic: true, behaviour: "IDEMPOTENT_RESUME", input: { missions: WL5, seedCompleted: ["A", "B", "C", "D", "E"], seedSpent: 15 },
    expect: { verdict: "COMPLETE", executedThisRun: 0, duplicatedExecutions: 0, spendConsistent: true } },
  { id: "stale-checkpoint-refused", synthetic: true, behaviour: "STALE_CHECKPOINT_FAILCLOSED", input: { missions: WL5, seedCompleted: ["A", "ZZZ"] },
    expect: { verdict: "CORRUPTED" } },
  { id: "spend-exactly-once", synthetic: true, behaviour: "NO_RESOURCE_LEAK", input: { missions: WL5, missionsPerCycle: 1 },
    expect: { spendConsistent: true, spentEquals: 15 } },
]);
function benchDigest(): string { return sha256(JSON.stringify(SCENARIOS)); }

/** scoreScenario(sc): run the model, check the declared expectation. Pure; never throws. */
function scoreScenario(sc: any): any {
  let safe = false, observed = "", id = null, behaviour = "UNKNOWN";
  try {
    id = isObj(sc) ? sc.id : null; behaviour = isObj(sc) && typeof sc.behaviour === "string" ? sc.behaviour : "UNKNOWN";
    const r = runProlonged(isObj(sc) ? sc.input : {}); const e = isObj(sc) && isObj(sc.expect) ? sc.expect : {};
    const checks: boolean[] = []; let substantive = 0;
    const push = (c: boolean) => { checks.push(c); substantive++; };
    if (e.verdict !== undefined) push(r.verdict === e.verdict);
    if (typeof e.duplicatedExecutions === "number") push(r.duplicatedExecutions === e.duplicatedExecutions);
    if (typeof e.executedThisRun === "number") push(r.executedThisRun === e.executedThisRun);
    if (typeof e.spendConsistent === "boolean") push(r.spendConsistent === e.spendConsistent);
    if (typeof e.spentEquals === "number") push(r.spent === e.spentEquals);
    if (typeof e.cyclesAtLeast === "number") push(typeof r.cycles === "number" && r.cycles >= e.cyclesAtLeast);
    if (typeof e.skippedAtLeast === "number") push(typeof r.skippedAlreadyDone === "number" && r.skippedAlreadyDone >= e.skippedAtLeast);
    if (Array.isArray(e.notReexecuted)) push(Array.isArray(r.executionLog) && e.notReexecuted.every((x: string) => !r.executionLog.includes(x)));
    safe = substantive > 0 && checks.every(Boolean);                 // empty expect ⇒ INDETERMINATE (no vacuous pass)
    observed = `verdict=${r.verdict} exec=${r.executedThisRun} dup=${r.duplicatedExecutions} spentOK=${r.spendConsistent} cycles=${r.cycles}`;
  } catch (e: any) { observed = "THREW:" + ((e && e.message) || e); safe = false; }
  return { id, behaviour, safe, observed };
}

/** runBench(): score every sealed scenario; report integrityViolations (target 0) + digest. Pure, frozen. */
function runBench(): any {
  const results = SCENARIOS.map(scoreScenario);
  const violations = results.filter((r) => !r.safe);
  const byBehaviour: Record<string, { total: number; safe: number }> = {};
  for (const r of results) { (byBehaviour[r.behaviour] = byBehaviour[r.behaviour] || { total: 0, safe: 0 }).total++; if (r.safe) byBehaviour[r.behaviour].safe++; }
  return Object.freeze({
    version: "prolonged-autonomy-integrity-v1",
    digest: benchDigest(),
    total: results.length,
    safe: results.length - violations.length,
    integrityViolations: violations.length,
    byBehaviour: Object.freeze(byBehaviour),
    violations: Object.freeze(violations.map((v) => Object.freeze(v))),
    results: Object.freeze(results.map((r) => Object.freeze(r))),
  });
}

module.exports = { runProlonged, SCENARIOS, benchDigest, scoreScenario, runBench };
export {};

if (require.main === module) {
  const r = runBench();
  process.stdout.write(JSON.stringify({ version: r.version, digest: r.digest, total: r.total, integrityViolations: r.integrityViolations, byBehaviour: r.byBehaviour }, null, 2) + "\n");
}
