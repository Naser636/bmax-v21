#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the recurring offer is honest (no SLA/monitoring/cert claim), reuses the B
// package per cycle, prices with retention adjustment (not 12× flat), and runs a synthetic multi-cycle re-assessment.
"use strict";
const assert = require("assert");
const R = require("./recurring-offer.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) spec: explicitly NOT an SLA / monitoring / certification.
const O = R.OFFER;
ok("spec: no SLA / no monitoring / no cert (disclaimed)", /NOT a contractual SLA/i.test(O.responseExpectation) && /SLA|monitoring|certification/i.test(O.exclusions.join(" ")) && /does NOT provide an SLA/i.test(O.disclaimer));
ok("included work = periodic re-assessment reusing B", O.includedWork.length > 0 && /re-run the audit/i.test(O.includedWork.join(" ")) && /B-MID/i.test(O.basis));

// (2) economics retention-adjusted (not 12× flat) + assumptions.
const e = R.economics();
ok("retention-adjusted annualized revenue < 12× monthly; assumptions labeled", e.expectedMonthsBilledYr1 < 12 && e.expectedMonthsBilledYr1 > 1 && e.annualizedGrossRevenue < e.monthlyPrice * 12 && e.assumptions === true);
ok("lower retention ⇒ lower annualized revenue", R.economics({ retentionAssumptionPct: 50 }).annualizedGrossRevenue < R.economics({ retentionAssumptionPct: 90 }).annualizedGrossRevenue);
ok("note: GROSS not net, NOT an SLA", /GROSS not net/i.test(e.note) && /NOT an SLA/i.test(e.note));

// (3) synthetic multi-cycle run reusing the B package.
const project = { project: "retco", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: true }, { name: "b", version: "2", license: "GPL-3.0", outdated: false }], tests: { total: 10, passing: 9 }, aiActivities: {} };
const run = R.runCycles(project, { cycles: 3, at: ["2026-10-01", "2026-11-01", "2026-12-01"] });
ok("3 synthetic cycles run, each with residual counts", run.ok && run.cycles.length === 3 && run.cycles.every(c => typeof c.residualFindings === "number"));
ok("trend computed (improving or stable)", run.trend.cycles === 3 && typeof run.trend.improvingOrStable === "boolean");
ok("note: synthetic cadence ≠ sold retainer / SLA", /SYNTHETIC.*NOT a sold retainer|NOT a sold retainer/i.test(run.note));

// (4) fail-closed + deterministic.
ok("fail-closed: bad input ⇒ INVALID_INPUT", R.runCycles(null).code === "INVALID_INPUT" && R.runCycles({}).code === "INVALID_INPUT");
ok("reproducible", JSON.stringify(R.runCycles(project, { cycles: 3, at: ["2026-10-01", "2026-11-01", "2026-12-01"] })) === JSON.stringify(run));

console.log(`\nRECURRING-OFFER suite — ${pass} assertions passed. (recurrence over B; no SLA/monitoring/cert; retention-adjusted economics; synthetic cadence)`);
