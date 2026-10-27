#!/usr/bin/env node
/**
 * control-evidence-freshness — operational evidence has a SHELF LIFE (V21 Phase 11 / benchmark ref #11 Vanta).
 *
 * iso-27001-clause-matrix lets a control be asserted as operationally evidenced (operationalEvidence[ref]=true),
 * but a one-time assertion never expires there — yet an ISMS/AIMS is audited on a SURVEILLANCE cadence (evidence
 * must stay current). This module adds the missing time dimension: each control's operational-evidence date is
 * checked against a TTL, and anything past it is STALE and must NOT be counted satisfied until re-attested.
 *
 * Honesty (mandate): FRESH ≠ SATISFIED — freshness only says the operational-evidence assertion is CURRENT; whether
 * the control is satisfied is still the clause-matrix's call (mechanism≠satisfied). Deny-by-default: missing /
 * unparseable / future-dated evidence is NEVER fresh. Pure/deterministic; the clock is caller-supplied (opts.now),
 * so results are reproducible and there is no hidden Date.now().
 */
"use strict";

const DEFAULT_TTL_DAYS = 365;   // ISO surveillance audits run ~annually; evidence older than a year needs refresh.
const DAY_MS = 86400000;

function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** daysBetween(aIso, bIso): (b - a) in days, or null if either is unparseable. */
function daysBetween(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso), b = Date.parse(bIso);
  if (!isFinite(a) || !isFinite(b)) return null;
  return (b - a) / DAY_MS;
}

/** isFresh(evidenceAt, now, ttlDays): true iff evidence is in the past AND within the TTL. Deny-by-default. */
function isFresh(evidenceAt: string, now: string, ttlDays: number = DEFAULT_TTL_DAYS): boolean {
  const d = daysBetween(evidenceAt, now);
  if (d === null) return false;          // unparseable ⇒ not fresh
  if (d < 0) return false;               // future-dated ⇒ suspicious ⇒ not fresh
  return d <= ttlDays;
}

/**
 * assessFreshness(controls, opts): classify each control's operational-evidence freshness at opts.now.
 * controls: array of { ref, operationalEvidenceAt? } (or an object map ref→{operationalEvidenceAt}).
 * Returns { ok, now, ttlDays, summary:{total,fresh,stale,noEvidence,invalid}, rows[] } or fail-closed.
 */
function assessFreshness(controls: any, opts: any = {}): any {
  const now = opts.now;
  if (!nonEmptyString(now) || !isFinite(Date.parse(now))) return { ok: false, code: "INVALID_INPUT", detail: "opts.now (parseable ISO date) required" };
  const ttlDays = typeof opts.ttlDays === "number" && opts.ttlDays > 0 ? opts.ttlDays : DEFAULT_TTL_DAYS;

  let list: any[];
  if (Array.isArray(controls)) list = controls;
  else if (controls && typeof controls === "object") list = Object.keys(controls).map((ref) => Object.assign({ ref }, controls[ref]));
  else return { ok: false, code: "INVALID_INPUT", detail: "controls must be an array or object map" };

  const rows: any[] = [];
  let fresh = 0, stale = 0, noEvidence = 0, invalid = 0;
  for (const c of list) {
    const ref = nonEmptyString(c && c.ref) ? c.ref : "(unnamed)";
    const at = c && c.operationalEvidenceAt;
    if (!nonEmptyString(at)) { rows.push({ ref, status: "NO_EVIDENCE", ageDays: null }); noEvidence++; continue; }
    const d = daysBetween(at, now);
    if (d === null) { rows.push({ ref, status: "INVALID_DATE", ageDays: null, evidenceAt: at }); invalid++; continue; }
    if (d < 0) { rows.push({ ref, status: "FUTURE_DATED", ageDays: Math.round(d), evidenceAt: at }); invalid++; continue; }
    const ageDays = Math.round(d);
    if (d <= ttlDays) { rows.push({ ref, status: "FRESH", ageDays, evidenceAt: at }); fresh++; }
    else { rows.push({ ref, status: "STALE", ageDays, overdueDays: Math.round(d - ttlDays), evidenceAt: at }); stale++; }
  }

  return {
    ok: true, now, ttlDays,
    summary: { total: list.length, fresh, stale, noEvidence, invalid },
    rows,
    note: "FRESH means the operational-evidence assertion is CURRENT, NOT that the control is SATISFIED (mechanism≠satisfied — see iso clause-matrix). STALE / NO_EVIDENCE / INVALID / FUTURE_DATED must NOT be counted satisfied until re-attested.",
  };
}

export { DEFAULT_TTL_DAYS, daysBetween, isFresh, assessFreshness };
module.exports = { DEFAULT_TTL_DAYS, daysBetween, isFresh, assessFreshness };

// Read-only CLI: print the policy (TTL + the deny-by-default rule); mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "control-evidence-freshness/1", defaultTtlDays: DEFAULT_TTL_DAYS, rule: "missing/unparseable/future-dated ⇒ not fresh; FRESH ≠ SATISFIED" }, null, 2) + "\n");
}
