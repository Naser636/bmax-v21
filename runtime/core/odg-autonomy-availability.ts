/**
 * V375 Lot A (G0/G1) — AUTONOMY AVAILABILITY from the REAL mission-attempt-log (the attempt-level source; the proven-only
 * mission-ledger stays the status-of-record and is NOT replaced). PURE, deterministic.
 * Separates three things that must not be conflated:
 *   - AVAILABILITY (did the scheduled tick get past startup?) — this module;
 *   - MISSION RELIABILITY (did an executed mission pass?) — PASS vs BLOCKED/FAIL among executed attempts;
 *   - CI RELIABILITY — a different journey (odg-slo-error-budget-view on CI events).
 * Refusal causes are classified so that ORGANIZATIONAL losses (main worktree on a non-main branch) are distinguished from
 * LEGITIMATE Truth-Lock protections (main itself diverges / integrity broken) — the guard targets only the former.
 */
"use strict";
const CLASSES = Object.freeze(["AVAILABLE_IDLE", "AVAILABLE_EXECUTED_PASS", "AVAILABLE_EXECUTED_NOT_PASS", "REFUSED_ORGANIZATIONAL", "REFUSED_LEGITIMATE", "UNCLASSIFIED"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* classifyAttempt(row) — row = { mission, recordedAt, status, reason } as written by odg-schedule-tick / mission-attempt-log. */
function classifyAttempt(row: any): string {
  if (!isObj(row) || typeof row.status !== "string") return "UNCLASSIFIED";
  const st = row.status, why = typeof row.reason === "string" ? row.reason : "";
  if (st === "IDLE") return "AVAILABLE_IDLE";
  if (st === "PASS") return "AVAILABLE_EXECUTED_PASS";
  if (st === "BLOCKED" || st === "FAIL" || st === "STOPPED" || st === "NOT_MEASURABLE") return "AVAILABLE_EXECUTED_NOT_PASS";
  if (st === "STARTUP_REFUSED") {
    if (/unexpected branch/.test(why)) return "REFUSED_ORGANIZATIONAL";          // main worktree moved off 'main' by a dev session
    return "REFUSED_LEGITIMATE";                                                 // e.g. main diverges from origin, audit-chain integrity
  }
  return "UNCLASSIFIED";
}

/* summarize(rows, {from?, to?}) -> counts per class, availability SLIs, mission-reliability sample. */
function summarize(rows: any, o?: any): any {
  const opts = isObj(o) ? o : {};
  const inWin = (r: any) => typeof r.recordedAt === "string" && (!opts.from || r.recordedAt >= opts.from) && (!opts.to || r.recordedAt < opts.to);
  const rs = (Array.isArray(rows) ? rows : []).filter((r: any) => isObj(r) && inWin(r));
  const counts: Record<string, number> = {}; for (const c of CLASSES) counts[c] = 0;
  for (const r of rs) counts[classifyAttempt(r)]++;
  const total = rs.length;
  const refused = counts.REFUSED_ORGANIZATIONAL + counts.REFUSED_LEGITIMATE;
  const executed = counts.AVAILABLE_EXECUTED_PASS + counts.AVAILABLE_EXECUTED_NOT_PASS;
  const rate = (a: number, b: number) => (b > 0 ? Number((a / b).toFixed(4)) : null);
  return Object.freeze({
    window: Object.freeze({ from: opts.from || (rs[0] && rs[0].recordedAt) || null, to: opts.to || (rs[rs.length - 1] && rs[rs.length - 1].recordedAt) || null }),
    total, counts: Object.freeze(counts),
    availability: rate(total - refused, total),                                   // any refusal counts as unavailable
    availabilityExcludingLegitimate: rate(total - counts.REFUSED_ORGANIZATIONAL, total),   // what the guard can recover
    missionReliability: executed >= 20 ? rate(counts.AVAILABLE_EXECUTED_PASS, executed) : null,
    missionReliabilityNote: executed >= 20 ? "measured" : "NOT_MEASURED — only " + executed + " executed attempt(s) (< 20)",
  });
}

/* toEvents(rows) -> [{t, good, change}] for odg-slo-error-budget-view.eventBudgetAnalysis (availability journey). */
function toEvents(rows: any): any[] {
  return (Array.isArray(rows) ? rows : []).filter((r: any) => isObj(r) && typeof r.recordedAt === "string").map((r: any) => {
    const c = classifyAttempt(r);
    return { t: r.recordedAt, good: !(c === "REFUSED_ORGANIZATIONAL" || c === "REFUSED_LEGITIMATE"), change: c };
  });
}

/* wilson(k, n, z=1.96) -> {low, high} 95% score interval for a proportion (honest at small n and near 1). */
function wilson(k: number, n: number, z?: number): any {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null;
  const zz = typeof z === "number" && z > 0 ? z : 1.96, p = k / n, d = 1 + zz * zz / n;
  const c = (p + zz * zz / (2 * n)) / d, h = (zz * Math.sqrt(p * (1 - p) / n + zz * zz / (4 * n * n))) / d;
  return Object.freeze({ low: Number(Math.max(0, c - h).toFixed(4)), high: Number(Math.min(1, c + h).toFixed(4)) });
}
/* minTicksToSupport(target, z=1.96) -> smallest n such that n good out of n has a Wilson LOWER bound ≥ target. */
function minTicksToSupport(target: number, z?: number): number { const zz = z || 1.96; return Math.ceil(zz * zz * target / (1 - target)); }

const AUTONOMY_AVAILABILITY_CONTRACT = Object.freeze({
  id: "V375-LOT-A-AUTONOMY-AVAILABILITY", classes: CLASSES,
  invariants: Object.freeze([
    "source = mission-attempt-log (attempt level); the proven-only mission-ledger is not replaced",
    "availability ≠ mission reliability ≠ CI reliability — reported separately",
    "organizational refusals (main worktree off 'main') distinguished from legitimate Truth-Lock refusals",
    "mission reliability NOT_MEASURED below 20 executed attempts",
  ]),
});
module.exports = { classifyAttempt, summarize, toEvents, wilson, minTicksToSupport, CLASSES, AUTONOMY_AVAILABILITY_CONTRACT };
export {};
