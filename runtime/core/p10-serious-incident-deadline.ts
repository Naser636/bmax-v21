#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 (P10 regulatory — world-research gap) — EU AI-ACT ARTICLE 73 SERIOUS-INCIDENT REPORTING DEADLINE. PURE,
 * deterministic. World reference: EU AI Act (Reg 2024/1689) Art.73 — a provider must report a serious incident to
 * the market-surveillance authority immediately once a causal link is established and in any event within ≤ 2 days
 * (widespread infringement / serious & irreversible disruption of critical infrastructure), ≤ 10 days (death of a
 * person), ≤ 15 days (all other serious incidents). ODG models obligation EXISTENCE (ai-act-role-classifier) and
 * in-force DATES (ai-act-in-force) but has NO Art.73 deadline arithmetic (grep-verified: no serious-incident /
 * Article-73 / reportingDeadline). This composes ai-act-role-classifier.classifyRole (establish PROVIDER subject,
 * deny-by-default) + the injected-asOf, no-live-clock date discipline proven in ai-act-in-force (dates are caller-
 * supplied DATA; Date.UTC arithmetic, no clock/network). NOT legal advice; declared-not-verified; NOT a certification.
 * Dual export.
 */

const CLASSIFIER = require("./ai-act-role-classifier");   // classifyRole — is the entity a PROVIDER subject to Art.73?

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

// Art.73 statutory windows (days). Unknown/missing category ⇒ the SHORTEST (2-day), never the lenient default.
const DEADLINE_DAYS = Object.freeze({ WIDESPREAD_INFRINGEMENT: 2, CRITICAL_INFRASTRUCTURE: 2, DEATH: 10, OTHER_SERIOUS: 15 });
const SHORTEST_DAYS = 2;
const VERDICT = Object.freeze(["REPORTED_ON_TIME", "NOT_YET_DUE", "OVERDUE", "REPORT_REQUIRED"]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function isISO(s: any): boolean { return isStr(s) && ISO.test(s); }
/** addDaysUTC(iso, days) -> YYYY-MM-DD, Date.UTC arithmetic (pure — NOT a clock). */
function addDaysUTC(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);   // constructed from an explicit timestamp (deterministic), not `new Date()` wall-clock
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0"); const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * assessIncidentDeadline({ activities, incident:{category, awareDate}, reportedDate?, asOf }) ->
 *   { subjectRoles, category, deadlineDays, dueBy, verdict, reasons, notLegalAdvice, declaredNotVerified }.
 * Fail-closed: unknown category ⇒ 2-day window; missing awareDate/asOf ⇒ REPORT_REQUIRED (never REPORTED_ON_TIME).
 */
function assessIncidentDeadline(input: any): any {
  const o = isObj(input) ? input : {};
  const incident = isObj(o.incident) ? o.incident : {};
  const roleInfo = CLASSIFIER.classifyRole(isObj(o.activities) ? o.activities : {});
  const subjectRoles = Array.isArray(roleInfo.roles) ? roleInfo.roles : [];
  const reasons: string[] = [];

  // deny-by-default: an unknown/missing serious-incident category gets the SHORTEST window, never the lenient 15-day.
  const catKnown = isStr(incident.category) && Object.prototype.hasOwnProperty.call(DEADLINE_DAYS, incident.category);
  const category = catKnown ? incident.category : "UNKNOWN";
  const deadlineDays = catKnown ? (DEADLINE_DAYS as any)[incident.category] : SHORTEST_DAYS;
  if (!catKnown) reasons.push("unknown/missing incident category ⇒ shortest 2-day window applied (fail-closed)");

  // a PROVIDER (or an undetermined classification) is subject; ODG never silently exempts a flagged serious incident.
  if (roleInfo.undetermined) reasons.push("role undetermined ⇒ treated as a potential Art.73 subject (deny-by-default), not exempt");

  if (!isISO(incident.awareDate)) {
    reasons.push("missing/invalid awareDate (YYYY-MM-DD) ⇒ cannot assert on-time reporting ⇒ REPORT_REQUIRED");
    return build(subjectRoles, category, deadlineDays, null, "REPORT_REQUIRED", reasons);
  }
  const dueBy = addDaysUTC(incident.awareDate, deadlineDays);

  if (isISO(o.reportedDate)) {
    const verdict = o.reportedDate <= dueBy ? "REPORTED_ON_TIME" : "OVERDUE";
    reasons.push(verdict === "REPORTED_ON_TIME" ? `reported ${o.reportedDate} ≤ due ${dueBy}` : `reported ${o.reportedDate} AFTER due ${dueBy} (late)`);
    return build(subjectRoles, category, deadlineDays, dueBy, verdict, reasons);
  }
  // not yet reported — compare the injected asOf to the deadline.
  if (!isISO(o.asOf)) { reasons.push("not reported and no valid asOf ⇒ REPORT_REQUIRED"); return build(subjectRoles, category, deadlineDays, dueBy, "REPORT_REQUIRED", reasons); }
  const verdict = o.asOf > dueBy ? "OVERDUE" : "NOT_YET_DUE";
  reasons.push(verdict === "OVERDUE" ? `not reported and asOf ${o.asOf} > due ${dueBy} ⇒ OVERDUE` : `not reported; asOf ${o.asOf} ≤ due ${dueBy} ⇒ NOT_YET_DUE (still must report)`);
  return build(subjectRoles, category, deadlineDays, dueBy, verdict, reasons);
}

function build(subjectRoles: any, category: string, deadlineDays: number, dueBy: any, verdict: string, reasons: string[]): any {
  return Object.freeze({ subjectRoles: Object.freeze(subjectRoles), category, deadlineDays, dueBy, verdict, reasons: Object.freeze(reasons), notLegalAdvice: true, declaredNotVerified: true });
}

const P10_SERIOUS_INCIDENT_CONTRACT = Object.freeze({
  id: "V124-P10-SERIOUS-INCIDENT-DEADLINE",
  source: "SÉRIE 23 P10 — EU AI-Act Art.73 serious-incident reporting deadline (Reg 2024/1689; 2/10/15-day windows)",
  verdicts: VERDICT, deadlineDays: DEADLINE_DAYS,
  reuses: Object.freeze(["ai-act-role-classifier.classifyRole (PROVIDER subject, deny-by-default)", "ai-act-in-force injected-asOf / no-clock date discipline"]),
  notAuthority: "a deterministic deadline check; NOT legal advice, declared-not-verified, NOT a certification; it files nothing",
  invariants: Object.freeze([
    "deadline windows: DEATH=10d, WIDESPREAD/CRITICAL_INFRASTRUCTURE=2d, OTHER_SERIOUS=15d (Art.73)",
    "unknown/missing category ⇒ shortest 2-day window (fail-closed, never the lenient 15-day)",
    "missing awareDate or asOf ⇒ REPORT_REQUIRED — a serious incident is NEVER asserted REPORTED_ON_TIME without dates",
    "a PROVIDER or undetermined classification is subject; a flagged serious incident is never silently exempted",
    "dates are caller-supplied DATA (injected asOf); Date.UTC arithmetic only — no hardcoded dates, no clock, no network",
  ]),
});

module.exports = { addDaysUTC, assessIncidentDeadline, P10_SERIOUS_INCIDENT_CONTRACT };

if (require.main === module) {
  const demo = assessIncidentDeadline({ activities: { placesOnMarket: true }, incident: { category: "DEATH", awareDate: "2026-11-01" }, asOf: "2026-11-15" });
  process.stdout.write(JSON.stringify({ ...P10_SERIOUS_INCIDENT_CONTRACT, demo: { verdict: demo.verdict, dueBy: demo.dueBy } }, null, 2) + "\n");
}

export {};
