#!/usr/bin/env node
"use strict";
/* V375 Lot A + V15 SLI-definition fixes — autonomy availability: classification, SLIs, separation of journeys;
 * independent synthetic fixtures (not derived from the real log), so the calculations are checked on data the module was
 * not tuned on. The producer-grounding check reads the REAL producer sources (odg-schedule-tick + mission-scheduler) so
 * the allowlist cannot silently drift from what is actually written to the mission-attempt-log. */
const fs = require("fs"); const path = require("path");
const A = require("./odg-autonomy-availability.js");
const EB = require("./odg-slo-error-budget-view.js");
const SLO = require("./slo-targets.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
function safe(fn: () => boolean): boolean { try { return fn(); } catch { return false; } }
const R = (t: string, status: string, reason = "") => ({ mission: "(x)", recordedAt: t, status, reason });
// all rows 15 min apart (no missing slot) so the logged-row and scheduled-slot SLIs coincide here
const rows = [
  R("2026-01-01T00:00:00Z", "IDLE"), R("2026-01-01T00:15:00Z", "STARTUP_REFUSED", 'REFUSED — unexpected branch "feat" (expected "main")'),
  R("2026-01-01T00:30:00Z", "STARTUP_REFUSED", "REFUSED — HEAD aaa diverges from origin/main bbb"), R("2026-01-01T00:45:00Z", "PASS"),
  R("2026-01-01T01:00:00Z", "BLOCKED", "proof absent"), R("2026-01-01T01:15:00Z", "IDLE"), R("2026-01-01T01:30:00Z", "AUDIT_CHAIN_TAMPERED", "hash mismatch @3"),
  R("2026-01-01T01:45:00Z", "WEIRD"),
];
check("classification: branch move ⇒ ORGANIZATIONAL; divergence ⇒ LEGITIMATE", A.classifyAttempt(rows[1]) === "REFUSED_ORGANIZATIONAL" && A.classifyAttempt(rows[2]) === "REFUSED_LEGITIMATE");
check("classification: IDLE / PASS available; BLOCKED 'proof absent' (dispatch outcome) ⇒ EXECUTED_FAIL", A.classifyAttempt(rows[0]) === "AVAILABLE_IDLE" && A.classifyAttempt(rows[3]) === "AVAILABLE_EXECUTED_PASS" && A.classifyAttempt(rows[4]) === "AVAILABLE_EXECUTED_FAIL");
// D1 — the producer writes AUDIT_CHAIN_TAMPERED (odg-schedule-tick.ts startup gate B); it must be an UNAVAILABLE integrity refusal
check("D1: AUDIT_CHAIN_TAMPERED ⇒ REFUSED_INTEGRITY (unavailable), not UNCLASSIFIED/good", A.classifyAttempt(rows[6]) === "REFUSED_INTEGRITY" && safe(() => A.toEvents([rows[6]])[0].good === false));
check("D1: unknown status ⇒ UNCLASSIFIED_FAIL_CLOSED and counted UNAVAILABLE", A.classifyAttempt(rows[7]) === "UNCLASSIFIED_FAIL_CLOSED" && safe(() => A.toEvents([rows[7]])[0].good === false) && A.summarize([rows[0], rows[7]]).availability === 0.5);
check("D1: non-string status / non-object ⇒ UNCLASSIFIED_FAIL_CLOSED", A.classifyAttempt({ status: 3 }) === "UNCLASSIFIED_FAIL_CLOSED" && A.classifyAttempt(null) === "UNCLASSIFIED_FAIL_CLOSED");
check("D1: producer grounding — every status literal the producer writes is explicitly classified, and the available allowlist ⊆ producer statuses", safe(() => {
  const tick = fs.readFileSync(path.join(__dirname, "..", "bin", "odg-schedule-tick.ts"), "utf8");
  const sch = fs.readFileSync(path.join(__dirname, "mission-scheduler.ts"), "utf8");
  const lits = new Set<string>();
  for (const m of tick.matchAll(/recordAttempt\(LOG, \{[^}]*status: "([A-Z_]+)"/g)) lits.add(m[1]);
  for (const m of sch.matchAll(/decision\("([A-Z_]+)"/g)) lits.add(m[1]);
  for (const m of sch.matchAll(/status: "([A-Z_]+)"/g)) lits.add(m[1]);
  const known = new Set([...A.AVAILABLE_STATUSES, ...A.STARTUP_REFUSAL_STATUSES]);
  return lits.has("AUDIT_CHAIN_TAMPERED") && lits.has("STARTUP_REFUSED") && lits.has("IDLE") && [...lits].every((s) => known.has(s)) && A.AVAILABLE_STATUSES.every((s: string) => lits.has(s));
}));
const s = A.summarize(rows);
check("availability (logged rows) = 1 − unavailable/total = 4/8 (2 refusals + integrity + unknown); excluding organizational = 7/8", s.total === 8 && s.availability === 0.5 && s.availabilityExcludingLegitimate === 0.875);
check("mission reliability is NOT_MEASURED below minSampleN (no fabricated rate)", s.missionReliability === null && /NOT_MEASURED/.test(s.missionReliabilityNote));
check("min-sample is READ from slo-targets MISSION_SUCCESS_VERIFIED (not hardcoded)", s.missionMinSampleN === SLO.getTarget("MISSION_SUCCESS_VERIFIED").minSampleN && A.AUTONOMY_AVAILABILITY_CONTRACT.missionMinSampleN === SLO.getTarget("MISSION_SUCCESS_VERIFIED").minSampleN);
check("window filter [from, to) applies", A.summarize(rows, { from: "2026-01-01T01:00:00Z" }).total === 4);
const ev = A.toEvents(rows);
const an = EB.eventBudgetAnalysis(ev, { sloTarget: 0.9, windowDays: 1 });
check("events feed the canonical error-budget view: 4 bad of 8 at SLO 0.9 ⇒ allowedBad 0.8, exhausted", an.status === "MEASURED" && an.errorBudget.actualBad === 4 && an.errorBudget.allowedBad === 0.8 && an.errorBudget.exhausted === true);
check("garbage rows are ignored, never counted", A.summarize([null, { status: 1 }, ...rows]).total === 8);
// D2 — scheduled-slot model: missing ticks are UNAVAILABLE
const g = [R("2026-01-01T00:00:00Z", "IDLE"), R("2026-01-01T00:15:00Z", "IDLE"), R("2026-01-01T01:15:00Z", "IDLE"), R("2026-01-01T01:37:00Z", "IDLE")];
check("D2: 60-min gap at 15-min cadence ⇒ floor(60/15)−1 = 3 missing slots; 22-min gap (< 1.5×) ⇒ 0", safe(() => { const x = A.summarize(g); return x.scheduledSlot.missingTicks === 3 && x.scheduledSlot.slots === 7 && x.scheduledSlot.sli === Number((4 / 7).toFixed(4)) && x.availability === 1; }));
check("D2: trailing edge to asOf counts (last tick 01:37, asOf 02:37 ⇒ +3 missing); timer-down window is NOT invisible", safe(() => A.summarize(g, { asOf: "2026-01-01T02:37:00Z" }).scheduledSlot.missingTicks === 6));
check("D2: leading edge from 'from' counts; empty window with bounds ⇒ all slots missing (sli 0, not null/1)", safe(() => A.summarize(g, { from: "2025-12-31T23:00:00Z" }).scheduledSlot.missingTicks === 6 && A.summarize([], { from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" }).scheduledSlot.missingTicks === 4 && A.summarize([], { from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" }).scheduledSlot.sli === 0));
check("D2: toEvents(includeMissing) emits one bad UNAVAILABLE_MISSING_TICK event per missing slot", safe(() => { const e = A.toEvents(g, { includeMissing: true }); return e.length === 7 && e.filter((x: any) => x.change === "UNAVAILABLE_MISSING_TICK" && x.good === false).length === 3; }));
check("D2: cadence default = 15 min (odg-mission-runner.timer OnUnitActiveSec=15min)", A.SCHEDULE_CADENCE_MS === 15 * 60 * 1000);
// D3 — CI: main-push reliability SLI separate from PR development signal, explicit window
const ci = [
  { t: "2026-01-01T00:00:00Z", conclusion: "success", event: "push", change: "main" }, { t: "2026-01-02T00:00:00Z", conclusion: "failure", event: "push", change: "main" },
  { t: "2026-01-03T00:00:00Z", conclusion: "failure", event: "pull_request", change: "feat/x" }, { t: "2026-01-04T00:00:00Z", conclusion: "failure", event: "push", change: "feat/y" },
  { t: "2026-01-05T00:00:00Z", conclusion: "cancelled", event: "push", change: "main" }, { t: "2026-01-06T00:00:00Z", conclusion: "success", event: "pull_request", change: "feat/z" },
];
check("D3: CI_MAIN_PUSH_SUCCESS counts only decisive push-to-main runs (PR / other-branch / cancelled excluded) with explicit window", safe(() => { const c = A.ciSplit(ci); return c.mainPush.n === 2 && c.mainPush.good === 1 && c.mainPush.window.from === "2026-01-01T00:00:00Z" && c.mainPush.window.to === "2026-01-02T00:00:00Z" && c.pullRequest.n === 2 && c.pullRequest.good === 1 && c.pullRequest.role === "DEVELOPMENT_SIGNAL_NOT_SLO" && c.excluded.cancelled === 1 && c.excluded.otherPush === 1; }));
// D4 — policy refusals are separated from failures (still fail-closed in the SLI)
const pol = [R("2026-01-01T00:00:00Z", "BLOCKED", "AUTHORIZATION_DENIED: CANARY_REFUSES_NON_READONLY"), R("2026-01-01T00:15:00Z", "BLOCKED", "already proven (dedup at dispatch)"), R("2026-01-01T00:30:00Z", "FAIL", "x"), R("2026-01-01T00:45:00Z", "STOPPED", "ODG_SCHEDULER_STOP / emergency stop"), R("2026-01-01T01:00:00Z", "NOT_MEASURABLE", "x")];
check("D4: BLOCKED AUTHORIZATION_DENIED / dedup / STOPPED ⇒ AVAILABLE_POLICY_REFUSED; FAIL / NOT_MEASURABLE ⇒ AVAILABLE_EXECUTED_FAIL", A.classifyAttempt(pol[0]) === "AVAILABLE_POLICY_REFUSED" && A.classifyAttempt(pol[1]) === "AVAILABLE_POLICY_REFUSED" && A.classifyAttempt(pol[3]) === "AVAILABLE_POLICY_REFUSED" && A.classifyAttempt(pol[2]) === "AVAILABLE_EXECUTED_FAIL" && A.classifyAttempt(pol[4]) === "AVAILABLE_EXECUTED_FAIL");
check("D4: missionBreakdown reports pass / fail / policyRefused separately; SLI stays fail-closed (policy refusals in the denominator)", safe(() => {
  const many = [...Array(18)].map((_, i) => R(new Date(Date.UTC(2026, 0, 1) + i * 900000).toISOString(), "PASS")).concat(pol);
  const x = A.summarize(many); return x.missionBreakdown.pass === 18 && x.missionBreakdown.fail === 2 && x.missionBreakdown.policyRefused === 3 && x.missionReliability === Number((18 / 23).toFixed(4));
}));
check("wilson: 0/0 or bad input ⇒ null; 10/10 lower bound < 1 (no certainty from a small sample)", A.wilson(0, 0) === null && A.wilson(10, 10).low < 0.75 && A.wilson(10, 10).high === 1);
check("wilson known value: 982 trials, 966 good ⇒ interval brackets 0.9837", (() => { const w = A.wilson(966, 982); return w.low < 0.9837 && w.high > 0.9837 && w.low > 0.97; })());
check("minTicksToSupport: 99% needs ≥ 381 consecutive good ticks, 97% ≥ 125 (Wilson, z=1.96)", A.minTicksToSupport(0.99) === 381 && A.minTicksToSupport(0.97) === 125);
// D6 — input validation
check("D6: minTicksToSupport rejects target ∉ (0,1) / non-finite / non-number ⇒ null", [1, 0, -0.1, 1.5, NaN, Infinity, "0.9", undefined].every((t: any) => A.minTicksToSupport(t) === null));
check("additionalGoodToSupport: 450/452 at 0.98 ⇒ 0 (already supported); at 0.99 ⇒ > 0; 0/0 ⇒ minTicks; target 1 ⇒ null", safe(() => A.additionalGoodToSupport(450, 452, 0.98) === 0 && A.additionalGoodToSupport(450, 452, 0.99) > 0 && A.additionalGoodToSupport(0, 0, 0.99) === 381 && A.additionalGoodToSupport(1, 2, 1) === null));
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-autonomy-availability (V375 Lot A + V15 SLI definitions)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
