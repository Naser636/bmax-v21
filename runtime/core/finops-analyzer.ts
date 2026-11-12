#!/usr/bin/env node
"use strict";
/*
 * V146 MÉTIER 3 (FinOps) — READ-ONLY cost analyzer for cloud / SaaS / AI spend. PURE, deterministic, fail-closed. Works on
 * IMPORTED cost records (synthetic, clearly labelled) — it NEVER touches infrastructure, subscriptions or spend (no write).
 * It normalises records, groups costs, and surfaces OPTIMISATION OPPORTUNITIES with ESTIMATED savings — never a REALIZED
 * saving. Amounts are integer MINOR units (no float drift). No write path; no new primitive.
 *
 * analyzeCosts(records, opts?) -> { byService, byPeriod, duplicates, anomalies, unused, opportunities, totalMinor, note }.
 * record: { vendor, service, periodMonth:"YYYY-MM", amountMinor(int), usage?(number), capacity?(number) }.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function norm(s: any): string { return isStr(s) ? String(s).trim().toLowerCase() : "(unknown)"; }

function analyzeCosts(records: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const spikeRatio = typeof o.spikeRatio === "number" && o.spikeRatio > 1 ? o.spikeRatio : 1.5;   // period-over-period spike threshold
  const recs = (Array.isArray(records) ? records : []).filter((r) => isObj(r) && isInt(r.amountMinor) && r.amountMinor >= 0);
  const byService: Record<string, number> = {};
  const byPeriod: Record<string, number> = {};
  const servicePeriod: Record<string, number[]> = {};   // service -> ordered period totals (for spike detection)
  const seen: Record<string, number> = {};
  const duplicates: any[] = []; const unused: any[] = [];
  let totalMinor = 0;

  // group + detect duplicates + unused
  for (const r of recs) {
    const svc = norm(r.service), ven = norm(r.vendor), per = isStr(r.periodMonth) ? r.periodMonth : "(unknown)";
    totalMinor += r.amountMinor;
    byService[svc] = (byService[svc] || 0) + r.amountMinor;
    byPeriod[per] = (byPeriod[per] || 0) + r.amountMinor;
    const key = `${ven}|${svc}|${per}|${r.amountMinor}`;
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] === 2) duplicates.push({ vendor: ven, service: svc, period: per, amountMinor: r.amountMinor, detail: "identical vendor+service+period+amount seen more than once ⇒ possible double-charge/import duplicate" });
    // unused: paid but zero usage
    if (typeof r.usage === "number" && r.usage === 0 && r.amountMinor > 0) unused.push({ vendor: ven, service: svc, period: per, amountMinor: r.amountMinor, detail: "paid resource with zero recorded usage ⇒ candidate for removal" });
  }

  // anomalies: a service's spend spikes vs the previous period beyond spikeRatio
  const perList = Object.keys(byPeriod).sort();
  for (const r of recs) { const svc = norm(r.service), per = isStr(r.periodMonth) ? r.periodMonth : "(unknown)"; servicePeriod[svc] = servicePeriod[svc] || []; }
  for (const svc of Object.keys(servicePeriod)) {
    const totals = perList.map((p) => recs.filter((r) => norm(r.service) === svc && (isStr(r.periodMonth) ? r.periodMonth : "(unknown)") === p).reduce((n, r) => n + r.amountMinor, 0));
    servicePeriod[svc] = totals;
  }
  const anomalies: any[] = [];
  for (const svc of Object.keys(servicePeriod)) {
    const t = servicePeriod[svc];
    for (let k = 1; k < t.length; k++) if (t[k - 1] > 0 && t[k] > t[k - 1] * spikeRatio) anomalies.push({ service: svc, fromPeriod: perList[k - 1], toPeriod: perList[k], fromMinor: t[k - 1], toMinor: t[k], ratio: Math.round((t[k] / t[k - 1]) * 100) / 100, detail: `spend spiked ${Math.round((t[k] / t[k - 1]) * 100) / 100}× vs previous period (≥${spikeRatio}×)` });
  }

  // opportunities: ESTIMATED savings from unused + duplicates (clearly an estimate, never realized).
  const unusedSaveMinor = unused.reduce((n, u) => n + u.amountMinor, 0);
  const dupSaveMinor = duplicates.reduce((n, d) => n + d.amountMinor, 0);
  const opportunities = [
    ...(unusedSaveMinor > 0 ? [{ kind: "REMOVE_UNUSED", estimatedMonthlySaveMinor: unusedSaveMinor, basis: "sum of paid-but-zero-usage resources", confidence: "ESTIMATE" }] : []),
    ...(dupSaveMinor > 0 ? [{ kind: "DEDUPLICATE_CHARGES", estimatedSaveMinor: dupSaveMinor, basis: "sum of duplicate charge amounts (verify before action)", confidence: "ESTIMATE" }] : []),
  ];

  return Object.freeze({
    totalMinor,
    byService: Object.freeze(byService), byPeriod: Object.freeze(byPeriod),
    duplicates: Object.freeze(duplicates), anomalies: Object.freeze(anomalies), unused: Object.freeze(unused),
    opportunities: Object.freeze(opportunities),
    estimatedSavingsMinor: unusedSaveMinor + dupSaveMinor,
    recordsAnalyzed: recs.length, recordsDropped: (Array.isArray(records) ? records.length : 0) - recs.length,
    note: "READ-ONLY analysis of imported cost records; integer-minor (no float drift). Savings are ESTIMATES (not realized); duplicates/anomalies must be verified before any action; NO write to infra/subscriptions/spend.",
  });
}

/** measureSavings(before, after) -> { realizedMinor, pct } — a before/after on two analyses (both from real imported data).
 * This is the ONLY way a saving becomes 'realized': measured from two actual periods, never asserted from an estimate. */
function measureSavings(before: any, after: any): any {
  const b = isObj(before) && isInt(before.totalMinor) ? before.totalMinor : null;
  const a = isObj(after) && isInt(after.totalMinor) ? after.totalMinor : null;
  if (b === null || a === null) return Object.freeze({ measurable: false, reason: "two analyses with integer totals required (fail-closed)" });
  const realizedMinor = b - a;
  return Object.freeze({ measurable: true, beforeMinor: b, afterMinor: a, realizedMinor, pct: b > 0 ? Math.round((realizedMinor / b) * 1000) / 10 : 0, note: "realized delta between two ACTUAL periods — a measured result, not an estimate" });
}

const FINOPS_ANALYZER_CONTRACT = Object.freeze({
  id: "V146-FINOPS-ANALYZER",
  reuses: ["integer-minor arithmetic convention (shared with invoicing/einvoice); FinOps unit-economics concepts (finops.org)"],
  invariants: Object.freeze([
    "READ-ONLY: never touches infra/subscriptions/spend; works on imported records only",
    "integer-minor arithmetic (no float drift); drops malformed records (fail-closed)",
    "savings from unused/duplicates are ESTIMATES (confidence=ESTIMATE); a REALIZED saving requires measureSavings over two actual periods",
    "duplicates/anomalies are flagged for human verification; no new primitive/parallel system",
  ]),
});
module.exports = { analyzeCosts, measureSavings, FINOPS_ANALYZER_CONTRACT };
export {};
