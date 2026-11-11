#!/usr/bin/env node
"use strict";
/* M15 (V12.4 full-campaign integrity) — battery. Proves M10+M11+M12 COMPOSE into an end-to-end campaign whose
 * integrity is audited: a clean campaign converges COMPLETE_AND_CLEAN; a provider-unavailable scenario, a HARMFUL
 * recovery, a resource leak, and a corrupted workload each BLOCK (named failing check) — no false success. It composes
 * the existing modules (does NOT recreate M10/M11/M12). Fail-closed, frozen, deterministic, no egress. */
const C = require("./campaign-integrity-benchmark.js");
const B = (o: any) => ({ signals: o });
const CLEAN_WL = { missions: [{ id: "A", cost: 1 }, { id: "B", cost: 2 }, { id: "C", cost: 3 }], missionsPerCycle: 1 };
const CLEAN_SC = { budget: 100, parallelCap: 2, maxAttempts: 3, degradeThreshold: 2, missions: [{ id: "X", deps: [], cost: 10, scripted: ["SUCCESS"] }, { id: "Y", deps: [], cost: 10, scripted: ["SUCCESS"] }] };
const EFFECTIVE = [{ id: "r1", before: B({ err: 10 }), after: B({ err: 2 }), senseMap: { err: "lower" } }];
const HARMFUL = [{ id: "r1", before: B({ err: 2 }), after: B({ err: 10 }), senseMap: { err: "lower" } }];
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- bench ----
  const r = C.runBench();
  check("bench: ZERO campaign violations across sealed synthetic campaigns", r.campaignViolations === 0 && r.safe === r.total && r.total === C.SCENARIOS.length);
  check("bench: digest stable + deterministic + frozen", /^[0-9a-f]{64}$/.test(r.digest) && r.digest === C.benchDigest() && JSON.stringify(C.runBench()) === JSON.stringify(C.runBench()) && Object.isFrozen(r) && Object.isFrozen(r.results[0]));

  // ---- composition: a clean campaign converges + all sub-results present (M10+M11+M12 wired) ----
  const clean = C.runCampaign({ workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: EFFECTIVE });
  check("clean campaign ⇒ COMPLETE_AND_CLEAN, composes M12/M10/M11 sub-results", clean.campaignVerdict === "COMPLETE_AND_CLEAN" && clean.failedChecks.length === 0 && clean.prolonged.verdict === "COMPLETE" && clean.scenario.verdict === "COMPLETE" && clean.recovery.total === 1);
  check("clean campaign: no dup, spend consistent, cap respected, recovery not harmful", clean.checks.NO_DUPLICATED_WORK && clean.checks.NO_RESOURCE_LEAK && clean.checks.RESOURCE_CAP_RESPECTED && clean.checks.RECOVERY_NOT_HARMFUL);

  // ---- integrity failures each BLOCK with the right named check ----
  // provider unavailable ⇒ scenario not COMPLETE ⇒ BLOCKED (safe stop, not a fabricated success)
  const pu = C.runCampaign({ workload: CLEAN_WL, scenario: { budget: 100, parallelCap: 2, maxAttempts: 2, degradeThreshold: 3, missions: [{ id: "X", deps: [], cost: 10, scripted: ["PROVIDER_UNAVAILABLE"] }] }, recoveries: EFFECTIVE });
  check("provider unavailable ⇒ BLOCKED (SCENARIO_CONVERGED fails), NO_FALSE_SUCCESS still true", pu.campaignVerdict === "BLOCKED" && pu.failedChecks.includes("SCENARIO_CONVERGED") && pu.checks.NO_FALSE_SUCCESS === true);
  // HARMFUL recovery ⇒ surfaced + BLOCKED (never swallowed)
  const hr = C.runCampaign({ workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: HARMFUL });
  check("HARMFUL recovery ⇒ BLOCKED (RECOVERY_NOT_HARMFUL fails), anyHarmful surfaced", hr.campaignVerdict === "BLOCKED" && hr.failedChecks.includes("RECOVERY_NOT_HARMFUL") && hr.recovery.anyHarmful === true);
  // resource leak (wrong seedSpent) ⇒ BLOCKED
  const leak = C.runCampaign({ workload: { missions: [{ id: "A", cost: 1 }, { id: "B", cost: 2 }], seedCompleted: ["A"], seedSpent: 999 }, scenario: CLEAN_SC, recoveries: EFFECTIVE });
  check("resource leak ⇒ BLOCKED (NO_RESOURCE_LEAK fails)", leak.campaignVerdict === "BLOCKED" && leak.failedChecks.includes("NO_RESOURCE_LEAK"));
  // corrupted workload (stale checkpoint) ⇒ BLOCKED (M12 CORRUPTED propagates)
  const corr = C.runCampaign({ workload: { missions: [{ id: "A", cost: 1 }], seedCompleted: ["GHOST"] }, scenario: CLEAN_SC, recoveries: EFFECTIVE });
  check("corrupted workload ⇒ BLOCKED (prolonged not COMPLETE)", corr.campaignVerdict === "BLOCKED" && corr.failedChecks.includes("PROLONGED_CONVERGED"));

  // ---- adversarial ----
  check("anti-rubberstamp: wrong expectation ⇒ UNSAFE", C.scoreScenario({ id: "rb", behaviour: "X", spec: { workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: HARMFUL }, expect: { campaignVerdict: "COMPLETE_AND_CLEAN" } }).safe === false);
  check("empty expect ⇒ UNSAFE (no vacuous pass)", C.scoreScenario({ id: "e", behaviour: "X", spec: { workload: CLEAN_WL, scenario: CLEAN_SC }, expect: {} }).safe === false);
  let threw = false; try { C.runCampaign("nonsense"); C.runCampaign(); C.scoreScenario(null); } catch { threw = true; }
  check("never throws on junk + outputs frozen", threw === false && Object.isFrozen(clean) && Object.isFrozen(clean.checks));
  // ===== Regression locks for the independent-validator REJECT (fail-OPEN on missing/malformed sub-specs) =====
  // RD1: a junk/empty/partial spec must BLOCK (CAMPAIGN_NON_EMPTY), never a vacuous COMPLETE_AND_CLEAN
  for (const bad of ["nonsense" as any, {} as any, null as any, { workload: CLEAN_WL } as any, { scenario: CLEAN_SC } as any, { workload: CLEAN_WL, scenario: { parallelCap: 2, missionz: [{ id: "X", deps: [], cost: 1, scripted: ["SUCCESS"] }] } } as any]) {
    const rb = C.runCampaign(bad);
    check(`RD1: junk/partial spec ⇒ BLOCKED not vacuous clean (${JSON.stringify(bad).slice(0, 40)})`, rb.campaignVerdict === "BLOCKED" && rb.failedChecks.includes("CAMPAIGN_NON_EMPTY"));
  }
  // RD2 (WORST CASE): a HARMFUL recovery passed as a NON-ARRAY must NOT be silently dropped ⇒ BLOCKED (malformed)
  const dropped = C.runCampaign({ workload: CLEAN_WL, scenario: CLEAN_SC, recoveries: HARMFUL[0] as any });
  check("RD2: harmful recovery in wrong shape (non-array) ⇒ BLOCKED RECOVERIES_WELL_FORMED (not dropped)", dropped.campaignVerdict === "BLOCKED" && dropped.failedChecks.includes("RECOVERIES_WELL_FORMED"));
  // RD3 (2nd-round): id-less / mistyped-id missions pass isObj but are not runnable downstream ⇒ must BLOCK (no vacuous complete)
  const noId = C.runCampaign({ workload: { missions: [{ cost: 1 }, { cost: 2 }] }, scenario: { budget: 100, parallelCap: 2, missions: [{ cost: 10, deps: [], scripted: ["SUCCESS"] }] }, recoveries: EFFECTIVE });
  check("RD3: id-less missions ⇒ BLOCKED CAMPAIGN_NON_EMPTY (not vacuous complete)", noId.campaignVerdict === "BLOCKED" && noId.failedChecks.includes("CAMPAIGN_NON_EMPTY"));
  const badIdKey = C.runCampaign({ workload: { missions: [{ missionId: "A", cost: 1 }] }, scenario: { budget: 100, parallelCap: 2, missions: [{ missionId: "X", deps: [], cost: 10, scripted: ["SUCCESS"] }] }, recoveries: EFFECTIVE });
  check("RD3: mistyped id key (missionId) ⇒ BLOCKED CAMPAIGN_NON_EMPTY", badIdKey.campaignVerdict === "BLOCKED" && badIdKey.failedChecks.includes("CAMPAIGN_NON_EMPTY"));
  const numId = C.runCampaign({ workload: { missions: [{ id: 1, cost: 1 }] }, scenario: { budget: 100, parallelCap: 2, missions: [{ id: 2, deps: [], cost: 10, scripted: ["SUCCESS"] }] }, recoveries: EFFECTIVE });
  check("RD3: numeric id ⇒ BLOCKED CAMPAIGN_NON_EMPTY (mirrors executor id-string filter)", numId.campaignVerdict === "BLOCKED" && numId.failedChecks.includes("CAMPAIGN_NON_EMPTY"));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — campaign-integrity-benchmark M15 (M10+M11+M12 composed; clean converges, incidents/leaks/harmful-recovery BLOCK; no false success; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
