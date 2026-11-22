#!/usr/bin/env node
"use strict";
/* V375 Lot A — autonomy availability: classification, SLIs, separation of journeys; independent synthetic fixtures
 * (not derived from the real log), so the calculations are checked on data the module was not tuned on. */
const A = require("./odg-autonomy-availability.js");
const EB = require("./odg-slo-error-budget-view.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const R = (t: string, status: string, reason = "") => ({ mission: "(x)", recordedAt: t, status, reason });
const rows = [
  R("2026-01-01T00:00:00Z", "IDLE"), R("2026-01-01T00:15:00Z", "STARTUP_REFUSED", 'REFUSED — unexpected branch "feat" (expected "main")'),
  R("2026-01-01T00:30:00Z", "STARTUP_REFUSED", "REFUSED — HEAD aaa diverges from origin/main bbb"), R("2026-01-01T00:45:00Z", "PASS"),
  R("2026-01-02T00:00:00Z", "BLOCKED", "contract"), R("2026-01-02T00:15:00Z", "IDLE"), R("2026-01-02T00:30:00Z", "STARTUP_REFUSED", "audit-chain integrity broken"),
  R("2026-01-02T00:45:00Z", "WEIRD"),
];
check("classification: branch move ⇒ ORGANIZATIONAL; divergence / integrity ⇒ LEGITIMATE", A.classifyAttempt(rows[1]) === "REFUSED_ORGANIZATIONAL" && A.classifyAttempt(rows[2]) === "REFUSED_LEGITIMATE" && A.classifyAttempt(rows[6]) === "REFUSED_LEGITIMATE");
check("classification: IDLE / PASS / BLOCKED are AVAILABLE (startup passed); unknown status ⇒ UNCLASSIFIED", A.classifyAttempt(rows[0]) === "AVAILABLE_IDLE" && A.classifyAttempt(rows[3]) === "AVAILABLE_EXECUTED_PASS" && A.classifyAttempt(rows[4]) === "AVAILABLE_EXECUTED_NOT_PASS" && A.classifyAttempt(rows[7]) === "UNCLASSIFIED");
const s = A.summarize(rows);
check("availability = 1 − refused/total = 5/8; excluding legitimate = 7/8", s.total === 8 && s.availability === 0.625 && s.availabilityExcludingLegitimate === 0.875);
check("mission reliability is NOT_MEASURED below 20 executed attempts (no fabricated rate)", s.missionReliability === null && /NOT_MEASURED/.test(s.missionReliabilityNote));
check("window filter [from, to) applies", A.summarize(rows, { from: "2026-01-02T00:00:00Z" }).total === 4);
const ev = A.toEvents(rows);
const an = EB.eventBudgetAnalysis(ev, { sloTarget: 0.9, windowDays: 2 });
check("events feed the canonical error-budget view: 3 bad of 8 at SLO 0.9 ⇒ allowedBad 0.8, exhausted", an.status === "MEASURED" && an.errorBudget.actualBad === 3 && an.errorBudget.allowedBad === 0.8 && an.errorBudget.exhausted === true);
check("garbage rows are ignored, never counted", A.summarize([null, { status: 1 }, ...rows]).total === 8);
check("wilson: 0/0 or bad input ⇒ null; 10/10 lower bound < 1 (no certainty from a small sample)", A.wilson(0, 0) === null && A.wilson(10, 10).low < 0.75 && A.wilson(10, 10).high === 1);
check("wilson known value: 982 trials, 966 good ⇒ interval brackets 0.9837", (() => { const w = A.wilson(966, 982); return w.low < 0.9837 && w.high > 0.9837 && w.low > 0.97; })());
check("minTicksToSupport: 99% needs ≥ 381 consecutive good ticks, 97% ≥ 125 (Wilson, z=1.96)", A.minTicksToSupport(0.99) === 381 && A.minTicksToSupport(0.97) === 125);
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-autonomy-availability (V375 Lot A)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
