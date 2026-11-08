#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./ai-act-in-force");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 21 — EU AI-ACT OBLIGATION IN-FORCE TRACKER");

const art50 = "Art.50(1): inform persons they are interacting with an AI system";
const activities = { developsOrPlacesAiSystemUnderOwnName: true, systemInteractsWithHumans: true };

// an obligation whose date has passed ⇒ IN_FORCE.
{
  const r = F.assessInForce({ activities, asOf: "2026-11-08", register: { [art50]: { applicableFrom: "2026-08-02", amendingRegulation: "Reg 2026/1744" } } });
  const row = r.obligations.find((x: any) => x.obligation === art50);
  check(row && row.status === "IN_FORCE" && row.applicableFrom === "2026-08-02", "asOf after applicableFrom ⇒ IN_FORCE");
}

// an obligation whose date is in the future ⇒ NOT_YET_IN_FORCE (e.g. high-risk deferred to 2027-12-02).
{
  const r = F.assessInForce({ activities, asOf: "2026-11-08", register: { [art50]: { applicableFrom: "2027-12-02" } } });
  const row = r.obligations.find((x: any) => x.obligation === art50);
  check(row && row.status === "NOT_YET_IN_FORCE", "asOf before applicableFrom ⇒ NOT_YET_IN_FORCE (Omnibus deferral)");
}

// register SILENT for an obligation ⇒ UNKNOWN_DATE (fail-closed, never 'in force').
{
  const r = F.assessInForce({ activities, asOf: "2026-11-08", register: {} });
  check(r.obligations.every((x: any) => x.status === "UNKNOWN_DATE"), "register silent ⇒ UNKNOWN_DATE (never asserts in-force)");
  check(r.summary.inForce === 0, "nothing asserted IN_FORCE without a register source");
}

// a bad asOf ⇒ UNKNOWN_DATE (fail-closed).
{
  const r = F.assessInForce({ activities, asOf: "not-a-date", register: { [art50]: { applicableFrom: "2026-08-02" } } });
  check(r.asOf === null && r.obligations.every((x: any) => x.status === "UNKNOWN_DATE"), "bad asOf ⇒ UNKNOWN_DATE (fail-closed)");
}

// no qualifying activity ⇒ no obligations (deny-by-default via the classifier).
{
  const r = F.assessInForce({ activities: {}, asOf: "2026-11-08", register: {} });
  check(r.obligations.length === 0 && r.roles.length === 0, "no activity ⇒ no roles, no obligations (deny-by-default)");
}

check(F.AI_ACT_IN_FORCE_CONTRACT.invariants.some((i: any) => /NEVER asserted IN_FORCE/.test(i)), "contract: register-silent ⇒ never in-force");

console.log(failures === 0 ? "ALL PASS — SÉRIE 21 AI-ACT IN-FORCE TRACKER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
