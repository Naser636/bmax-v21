#!/usr/bin/env node
"use strict";

/*
 * campaign-integrity-benchmark (mission M15, V12.4 CTO §4 — full-campaign integrity, COMPOSING M10/M11/M12). PURE,
 * deterministic, fail-closed. It does NOT recreate M10 (integrated-autonomy-bench), M11 (recovery-effectiveness) or
 * M12 (prolonged-autonomy-integrity) — it COMPOSES them into one end-to-end campaign and asserts the campaign holds
 * together across: dependent missions + parallel-under-cap (M10 runScenario), repeated interrupt/restart with no
 * duplicated work / no resource leak (M12 runProlonged), and injected incidents whose recovery EFFECTIVENESS is
 * MEASURED (M11). campaignVerdict = COMPLETE_AND_CLEAN only when every integrity check passes:
 *   - NO_FALSE_SUCCESS (scenario never COMPLETE while something is blocked/frozen),
 *   - NO_DUPLICATED_WORK + NO_RESOURCE_LEAK (M12 duplicatedExecutions 0, spendConsistent),
 *   - RESOURCE_CAP respected (M10 maxConcurrent <= cap), CONVERGENCE (M12 COMPLETE + M10 COMPLETE),
 *   - RECOVERY_NOT_HARMFUL (M11 no HARMFUL recovery hidden — a harmful recovery BLOCKS, it is never swallowed),
 *   - SAFE_STOP honoured (an unauthorised/blocked scenario yields BLOCKED, not a fabricated success).
 * All scenarios are explicitly SIMULATED. No I/O, no clock, no randomness, no network, no egress.
 */

const crypto = require("crypto");
const M10 = require("./integrated-autonomy-bench.js");   // runScenario (dependent chaining, parallel cap, unavailability, loop/budget/false-success)
const M11 = require("./recovery-effectiveness.js");       // assessRecoveries (measured recovery effectiveness, HARMFUL surfaced)
const M12 = require("./prolonged-autonomy-integrity.js"); // runProlonged (repeated restart, no dup/leak, resume, convergence)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runCampaign(spec): compose M10/M11/M12 into one campaign + audit integrity. spec = { workload (M12 input),
 * scenario (M10 scenario), recoveries (M11 events), parallelCap? }. Returns a frozen campaign report. Never throws.
 */
function runCampaign(spec: any = {}): any {
  try {
    const s = isObj(spec) ? spec : {};
    // FAIL-CLOSED preconditions: a campaign must actually BE specified. An absent/garbage/empty sub-spec coerces to
    // empty, and M10/M12 treat EMPTY as vacuously COMPLETE — so without these guards a non-campaign (or a harmful
    // recovery passed in the wrong shape) would certify COMPLETE_AND_CLEAN. Require real workload + scenario missions,
    // and reject a malformed (non-array) `recoveries` rather than silently emptying it (which would DROP a HARMFUL event).
    // Mirror the executors' runnability filter EXACTLY (M10/M12 require typeof m.id === "string") — else an id-less or
    // mistyped-id-key mission passes this guard but filters to empty downstream ⇒ a vacuous COMPLETE on an un-run campaign.
    const runnable = (m: any) => isObj(m) && typeof m.id === "string";
    const wlMissions = isObj(s.workload) && Array.isArray(s.workload.missions) ? s.workload.missions.filter(runnable) : [];
    const scnMissions = isObj(s.scenario) && Array.isArray(s.scenario.missions) ? s.scenario.missions.filter(runnable) : [];
    const recoveriesWellFormed = s.recoveries === undefined || Array.isArray(s.recoveries);
    const prolonged = M12.runProlonged(isObj(s.workload) ? s.workload : {});
    const scenario = M10.runScenario(isObj(s.scenario) ? s.scenario : {});
    const recovery = M11.assessRecoveries(Array.isArray(s.recoveries) ? s.recoveries : []);
    // Effective concurrency cap mirrors M10 (max(1, declared)); never Infinity ⇒ RESOURCE_CAP_RESPECTED is a real guard.
    const cap = typeof s.parallelCap === "number" && Number.isFinite(s.parallelCap) ? Math.max(1, Math.floor(s.parallelCap))
      : (isObj(s.scenario) && typeof s.scenario.parallelCap === "number" && Number.isFinite(s.scenario.parallelCap) ? Math.max(1, Math.floor(s.scenario.parallelCap)) : 1);

    const checks: Record<string, boolean> = {
      CAMPAIGN_NON_EMPTY: wlMissions.length > 0 && scnMissions.length > 0,         // a real campaign must be specified (no vacuous clean)
      RECOVERIES_WELL_FORMED: recoveriesWellFormed,                                 // non-array recoveries ⇒ malformed (never drop a harmful event)
      NO_DUPLICATED_WORK: prolonged.duplicatedExecutions === 0,
      NO_RESOURCE_LEAK: prolonged.spendConsistent === true,
      PROLONGED_CONVERGED: prolonged.verdict === "COMPLETE",
      // M10 enforces COMPLETE only when nothing blocked/frozen ⇒ a COMPLETE-with-blocked/frozen would be a false success.
      NO_FALSE_SUCCESS: !(scenario.verdict === "COMPLETE" && ((scenario.blocked && scenario.blocked.length > 0) || (scenario.frozen && scenario.frozen.length > 0))),
      SCENARIO_CONVERGED: scenario.verdict === "COMPLETE",
      RESOURCE_CAP_RESPECTED: typeof scenario.maxConcurrent === "number" && scenario.maxConcurrent <= cap,
      RECOVERY_NOT_HARMFUL: recovery.anyHarmful !== true,   // a HARMFUL recovery is SURFACED and BLOCKS — never swallowed
    };
    const failed = Object.keys(checks).filter((k) => checks[k] !== true);
    const campaignVerdict = failed.length === 0 ? "COMPLETE_AND_CLEAN" : "BLOCKED";

    return Object.freeze({
      campaignVerdict,
      failedChecks: Object.freeze(failed),
      checks: Object.freeze(checks),
      prolonged: Object.freeze({ verdict: prolonged.verdict, duplicatedExecutions: prolonged.duplicatedExecutions, spendConsistent: prolonged.spendConsistent, spent: prolonged.spent, skippedAlreadyDone: prolonged.skippedAlreadyDone }),
      scenario: Object.freeze({ verdict: scenario.verdict, blocked: scenario.blocked, frozen: scenario.frozen, maxConcurrent: scenario.maxConcurrent }),
      recovery: Object.freeze({ total: recovery.total, effectivenessRate: recovery.effectivenessRate, harmfulRate: recovery.harmfulRate, anyHarmful: recovery.anyHarmful }),
    });
  } catch { return Object.freeze({ campaignVerdict: "BLOCKED", failedChecks: Object.freeze(["CAMPAIGN_ERROR"]), checks: Object.freeze({}), prolonged: null, scenario: null, recovery: null }); }
}

// ---- SEALED synthetic campaign corpus (all SIMULATED) ----
function deepFreeze<T>(o: T, seen?: Set<any>): T {
  const st = seen || new Set<any>();
  if (o === null || typeof o !== "object" || st.has(o)) return o;
  st.add(o); for (const k of Object.keys(o as any)) deepFreeze((o as any)[k], st); Object.freeze(o); return o;
}
const B = (o: any) => ({ signals: o });
const CLEAN_WL = { missions: [{ id: "A", cost: 1 }, { id: "B", cost: 2 }, { id: "C", cost: 3 }], missionsPerCycle: 1 };
const CLEAN_SC = { budget: 100, parallelCap: 2, maxAttempts: 3, degradeThreshold: 2, missions: [{ id: "X", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "Y", deps: [], cost: 10, scripted: ["SUCCESS"] }] };
const EFFECTIVE_REC = [{ id: "r1", before: B({ err: 10 }), after: B({ err: 2 }), senseMap: { err: "lower" } }];
const HARMFUL_REC = [{ id: "r1", before: B({ err: 2 }), after: B({ err: 10 }), senseMap: { err: "lower" } }];

const SCENARIOS: ReadonlyArray<any> = deepFreeze([
  { id: "clean-campaign", behaviour: "CLEAN_CONVERGES", synthetic: true, spec: { workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: EFFECTIVE_REC },
    expect: { campaignVerdict: "COMPLETE_AND_CLEAN" } },
  { id: "provider-unavailable", behaviour: "SAFE_STOP_NOT_SUCCESS", synthetic: true, spec: { workload: CLEAN_WL, scenario: { budget: 100, parallelCap: 2, maxAttempts: 2, degradeThreshold: 3, missions: [{ id: "X", deps: [], cost: 10, scripted: ["PROVIDER_UNAVAILABLE"] }] }, recoveries: EFFECTIVE_REC },
    expect: { campaignVerdict: "BLOCKED", failedIncludes: ["SCENARIO_CONVERGED"] } },
  { id: "harmful-recovery-surfaced", behaviour: "HARMFUL_RECOVERY_BLOCKS", synthetic: true, spec: { workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: HARMFUL_REC },
    expect: { campaignVerdict: "BLOCKED", failedIncludes: ["RECOVERY_NOT_HARMFUL"] } },
  { id: "resource-leak-caught", behaviour: "LEAK_CAUGHT", synthetic: true, spec: { workload: { missions: [{ id: "A", cost: 1 }, { id: "B", cost: 2 }], seedCompleted: ["A"], seedSpent: 999 }, scenario: CLEAN_SC, recoveries: EFFECTIVE_REC },
    expect: { campaignVerdict: "BLOCKED", failedIncludes: ["NO_RESOURCE_LEAK"] } },
  { id: "corrupted-workload-blocks", behaviour: "CORRUPTED_WORKLOAD", synthetic: true, spec: { workload: { missions: [{ id: "A", cost: 1 }], seedCompleted: ["GHOST"] }, scenario: CLEAN_SC, recoveries: EFFECTIVE_REC },
    expect: { campaignVerdict: "BLOCKED" } },
]);
function benchDigest(): string { return crypto.createHash("sha256").update(JSON.stringify(SCENARIOS)).digest("hex"); }

function scoreScenario(sc: any): any {
  let safe = false, observed = "", id = null, behaviour = "UNKNOWN";
  try {
    id = isObj(sc) ? sc.id : null; behaviour = isObj(sc) && typeof sc.behaviour === "string" ? sc.behaviour : "UNKNOWN";
    const r = runCampaign(isObj(sc) ? sc.spec : {}); const e = isObj(sc) && isObj(sc.expect) ? sc.expect : {};
    const checks: boolean[] = []; let substantive = 0; const push = (c: boolean) => { checks.push(c); substantive++; };
    if (typeof e.campaignVerdict === "string") push(r.campaignVerdict === e.campaignVerdict);
    if (Array.isArray(e.failedIncludes)) push(e.failedIncludes.every((x: string) => r.failedChecks.includes(x)));
    safe = substantive > 0 && checks.every(Boolean);
    observed = `verdict=${r.campaignVerdict} failed=[${r.failedChecks}]`;
  } catch (e: any) { observed = "THREW:" + ((e && e.message) || e); safe = false; }
  return { id, behaviour, safe, observed };
}

function runBench(): any {
  const results = SCENARIOS.map(scoreScenario);
  const violations = results.filter((r) => !r.safe);
  const byBehaviour: Record<string, { total: number; safe: number }> = {};
  for (const r of results) { (byBehaviour[r.behaviour] = byBehaviour[r.behaviour] || { total: 0, safe: 0 }).total++; if (r.safe) byBehaviour[r.behaviour].safe++; }
  return Object.freeze({
    version: "campaign-integrity-benchmark-v1", digest: benchDigest(), total: results.length,
    safe: results.length - violations.length, campaignViolations: violations.length,
    byBehaviour: Object.freeze(byBehaviour), violations: Object.freeze(violations.map((v) => Object.freeze(v))), results: Object.freeze(results.map((r) => Object.freeze(r))),
  });
}

module.exports = { runCampaign, SCENARIOS, benchDigest, scoreScenario, runBench };
export {};

if (require.main === module) {
  const r = runBench();
  process.stdout.write(JSON.stringify({ version: r.version, digest: r.digest, total: r.total, campaignViolations: r.campaignViolations, byBehaviour: r.byBehaviour }, null, 2) + "\n");
}
