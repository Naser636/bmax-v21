#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p10-serious-incident-deadline");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23 — P10 SERIOUS-INCIDENT DEADLINE (Art.73)");
const provider = { placesOnMarket: true };

// DEATH ⇒ 10-day window; reported within ⇒ REPORTED_ON_TIME.
{
  const r = P.assessIncidentDeadline({ activities: provider, incident: { category: "DEATH", awareDate: "2026-11-01" }, reportedDate: "2026-11-08" });
  check(r.deadlineDays === 10 && r.dueBy === "2026-11-11" && r.verdict === "REPORTED_ON_TIME", `DEATH 10d, reported on time (got ${r.verdict}, due ${r.dueBy})`);
}
// WIDESPREAD ⇒ 2-day; asOf past due, not reported ⇒ OVERDUE.
{
  const r = P.assessIncidentDeadline({ activities: provider, incident: { category: "WIDESPREAD_INFRINGEMENT", awareDate: "2026-11-01" }, asOf: "2026-11-05" });
  check(r.deadlineDays === 2 && r.verdict === "OVERDUE", `WIDESPREAD 2d, overdue (got ${r.verdict}, due ${r.dueBy})`);
}
// OTHER_SERIOUS ⇒ 15-day; asOf before due, not reported ⇒ NOT_YET_DUE.
{
  const r = P.assessIncidentDeadline({ activities: provider, incident: { category: "OTHER_SERIOUS", awareDate: "2026-11-01" }, asOf: "2026-11-10" });
  check(r.deadlineDays === 15 && r.verdict === "NOT_YET_DUE", `OTHER_SERIOUS 15d, not yet due (got ${r.verdict})`);
}
// reported AFTER due ⇒ OVERDUE (late).
{
  const r = P.assessIncidentDeadline({ activities: provider, incident: { category: "DEATH", awareDate: "2026-11-01" }, reportedDate: "2026-11-20" });
  check(r.verdict === "OVERDUE", "reported after due ⇒ OVERDUE");
}

// fail-closed: unknown category ⇒ shortest 2-day window.
{
  const r = P.assessIncidentDeadline({ activities: provider, incident: { category: "MYSTERY", awareDate: "2026-11-01" }, asOf: "2026-11-02" });
  check(r.deadlineDays === 2 && r.category === "UNKNOWN", "unknown category ⇒ 2-day window (fail-closed)");
}
// fail-closed: missing awareDate ⇒ REPORT_REQUIRED (never REPORTED_ON_TIME).
check(P.assessIncidentDeadline({ activities: provider, incident: { category: "DEATH" } }).verdict === "REPORT_REQUIRED", "missing awareDate ⇒ REPORT_REQUIRED");
// fail-closed: not reported + no asOf ⇒ REPORT_REQUIRED.
check(P.assessIncidentDeadline({ activities: provider, incident: { category: "DEATH", awareDate: "2026-11-01" } }).verdict === "REPORT_REQUIRED", "no asOf, not reported ⇒ REPORT_REQUIRED");
// undetermined role is still a subject (deny-by-default), never silently exempt.
{
  const r = P.assessIncidentDeadline({ activities: {}, incident: { category: "DEATH", awareDate: "2026-11-01" }, asOf: "2026-11-20" });
  check(r.verdict === "OVERDUE" && r.reasons.some((x: any) => /deny-by-default/.test(x)), "undetermined role ⇒ still subject (deny-by-default)");
}

// addDaysUTC sanity across a month boundary.
check(P.addDaysUTC("2026-11-28", 5) === "2026-12-03", "addDaysUTC crosses month boundary (2026-11-28 +5 = 2026-12-03)");
check(P.P10_SERIOUS_INCIDENT_CONTRACT.invariants.some((i: any) => /never the lenient 15-day/.test(i)), "contract: unknown ⇒ shortest window");

console.log(failures === 0 ? "ALL PASS — SÉRIE 23 P10 SERIOUS-INCIDENT DEADLINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
