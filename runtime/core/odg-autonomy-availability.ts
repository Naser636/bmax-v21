/**
 * V375 Lot A (G0/G1) — AUTONOMY AVAILABILITY from the REAL mission-attempt-log (the attempt-level source; the proven-only
 * mission-ledger stays the status-of-record and is NOT replaced). PURE, deterministic.
 * Separates three things that must not be conflated:
 *   - AVAILABILITY (did the scheduled tick get past startup?) — this module;
 *   - MISSION RELIABILITY (did a mission the tick reached pass?) — PASS vs FAIL vs POLICY_REFUSED (reported separately;
 *     the SLI stays fail-closed: policy refusals are in the denominator);
 *   - CI RELIABILITY — a different journey: push-to-main runs (the reliability SLI) vs pull_request runs (a development
 *     signal — a red PR is the check WORKING, not an outage) — ciSplit().
 * Refusal causes are classified so that ORGANIZATIONAL losses (main worktree on a non-main branch) are distinguished from
 * LEGITIMATE Truth-Lock protections (main itself diverges) and INTEGRITY refusals (audit chain tampered).
 *
 * V15 SLI-definition fixes (independent audit):
 *   D1 — FAIL-CLOSED classification: only an explicit allowlist of producer statuses counts AVAILABLE. The allowlist is
 *        the set the producer actually writes (runtime/bin/odg-schedule-tick.ts startup gates + runtime/core/
 *        mission-scheduler.ts decision()/classifyDispatch()); AUDIT_CHAIN_TAMPERED = integrity refusal; any other status
 *        ⇒ UNCLASSIFIED_FAIL_CLOSED (unavailable). The test re-derives the producer set from source to catch drift.
 *   D2 — SCHEDULED-SLOT model: the denominator of the scheduled-slot SLI is logged rows + MISSING slots. A gap between
 *        consecutive ticks > 1.5 × cadence contributes floor(gap / cadence) − 1 missing slots (UNAVAILABLE_MISSING_TICK);
 *        window edges (from → first row, last row → to/asOf) treat the boundary as a virtual tick (lenient by ≤ 1 slot
 *        per edge); an empty window with both bounds ⇒ floor(span / cadence) missing. Rows closer than the cadence (manual
 *        or retried runs) are NOT de-duplicated — counted as offScheduleRows for transparency.
 *   D4 — POLICY_REFUSED (authorization denied / dedup / excellence-claim gate / budget / failure cap / operator stop)
 *        separated from EXECUTED_FAIL in the breakdown.
 *   D6 — minTicksToSupport validates 0 < target < 1 (finite) ⇒ else null.
 *   min-sample for mission reliability is READ from slo-targets MISSION_SUCCESS_VERIFIED.minSampleN (not hardcoded).
 */
"use strict";
const CLASSES = Object.freeze(["AVAILABLE_IDLE", "AVAILABLE_EXECUTED_PASS", "AVAILABLE_EXECUTED_FAIL", "AVAILABLE_POLICY_REFUSED",
  "REFUSED_ORGANIZATIONAL", "REFUSED_LEGITIMATE", "REFUSED_INTEGRITY", "UNCLASSIFIED_FAIL_CLOSED"]);
const UNAVAILABLE_CLASSES = Object.freeze(["REFUSED_ORGANIZATIONAL", "REFUSED_LEGITIMATE", "REFUSED_INTEGRITY", "UNCLASSIFIED_FAIL_CLOSED"]);
/* Statuses written by the producer AFTER startup passed (mission-scheduler decision()/classifyDispatch()) — the ONLY ones that count available. */
const AVAILABLE_STATUSES = Object.freeze(["IDLE", "PASS", "FAIL", "BLOCKED", "STOPPED", "NOT_MEASURABLE"]);
/* Statuses written by odg-schedule-tick's startup gates (A: Truth-Lock, B: audit-chain integrity) — unavailable. */
const STARTUP_REFUSAL_STATUSES = Object.freeze(["STARTUP_REFUSED", "AUDIT_CHAIN_TAMPERED"]);
/* BLOCKED reasons emitted by mission-scheduler POLICY gates (not by a dispatched execution). */
const POLICY_BLOCK_REASONS = Object.freeze([/^AUTHORIZATION_DENIED:/, /^already proven/, /^EXCELLENCE_PROHIBITED_CLAIM:/, /^budget exhausted/, /^consecutive-failure cap/]);
/* Cadence of the producer: /etc/systemd/system/odg-mission-runner.timer (template deploy/odg-mission-runner.timer) OnUnitActiveSec=15min. */
const SCHEDULE_CADENCE_MS = 15 * 60 * 1000;
const MISSION_MIN_SAMPLE_N: number | null = (() => {
  try { const t = require("./slo-targets.js").getTarget("MISSION_SUCCESS_VERIFIED"); return t && Number.isInteger(t.minSampleN) && t.minSampleN > 0 ? t.minSampleN : null; }
  catch { return null; }   // slo-targets unreadable ⇒ mission reliability stays NOT_MEASURED (fail-closed, no invented sample size)
})();
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function tms(r: any): number { return isObj(r) && typeof r.recordedAt === "string" ? Date.parse(r.recordedAt) : NaN; }

/* classifyAttempt(row) — row = { mission, recordedAt, status, reason } as written by odg-schedule-tick / mission-attempt-log. */
function classifyAttempt(row: any): string {
  if (!isObj(row) || typeof row.status !== "string") return "UNCLASSIFIED_FAIL_CLOSED";
  const st = row.status, why = typeof row.reason === "string" ? row.reason : "";
  if (st === "STARTUP_REFUSED") return /unexpected branch/.test(why) ? "REFUSED_ORGANIZATIONAL" : "REFUSED_LEGITIMATE";
  if (st === "AUDIT_CHAIN_TAMPERED") return "REFUSED_INTEGRITY";
  if (AVAILABLE_STATUSES.indexOf(st) < 0) return "UNCLASSIFIED_FAIL_CLOSED";
  if (st === "IDLE") return "AVAILABLE_IDLE";
  if (st === "PASS") return "AVAILABLE_EXECUTED_PASS";
  if (st === "STOPPED") return "AVAILABLE_POLICY_REFUSED";
  if (st === "BLOCKED" && POLICY_BLOCK_REASONS.some((re) => re.test(why))) return "AVAILABLE_POLICY_REFUSED";
  return "AVAILABLE_EXECUTED_FAIL";                                              // FAIL / NOT_MEASURABLE / BLOCKED by dispatch outcome or unknown reason
}
function isAvailable(cls: string): boolean { return UNAVAILABLE_CLASSES.indexOf(cls) < 0; }

/* scheduledSlots(sortedTimesMs, {fromMs?, endMs?, cadenceMs}) -> {missingTicks, missingAt[], gaps[], offScheduleRows}. */
function scheduledSlots(times: number[], o: any): any {
  const c = o.cadenceMs, thr = 1.5 * c, missingAt: number[] = [], gaps: any[] = []; let off = 0;
  const gap = (a: number, b: number, edge: string) => {
    const g = b - a; if (!(g > thr)) return;
    const k = Math.floor(g / c) - 1; if (k <= 0) return;
    for (let i = 1; i <= k; i++) missingAt.push(a + i * c);
    gaps.push(Object.freeze({ after: new Date(a).toISOString(), before: new Date(b).toISOString(), gapMin: Number((g / 60000).toFixed(1)), missing: k, edge }));
  };
  if (times.length === 0) {
    if (Number.isFinite(o.fromMs) && Number.isFinite(o.endMs) && o.endMs > o.fromMs) {
      const k = Math.floor((o.endMs - o.fromMs) / c); for (let i = 0; i < k; i++) missingAt.push(o.fromMs + i * c);
      if (k > 0) gaps.push(Object.freeze({ after: new Date(o.fromMs).toISOString(), before: new Date(o.endMs).toISOString(), gapMin: Number(((o.endMs - o.fromMs) / 60000).toFixed(1)), missing: k, edge: "EMPTY_WINDOW" }));
    }
  } else {
    if (Number.isFinite(o.fromMs)) gap(o.fromMs, times[0], "LEADING");
    for (let i = 1; i < times.length; i++) { if (times[i] - times[i - 1] < 0.5 * c) off++; gap(times[i - 1], times[i], "INTERIOR"); }
    if (Number.isFinite(o.endMs)) gap(times[times.length - 1], o.endMs, "TRAILING");
  }
  return { missingTicks: missingAt.length, missingAt, gaps, offScheduleRows: off };
}
function bounds(opts: any): any {
  const fromMs = opts.from ? Date.parse(opts.from) : NaN, toMs = opts.to ? Date.parse(opts.to) : NaN, asOfMs = opts.asOf ? Date.parse(opts.asOf) : NaN;
  const endMs = Number.isFinite(toMs) ? (Number.isFinite(asOfMs) ? Math.min(toMs, asOfMs) : toMs) : asOfMs;
  const cadenceMs = Number.isFinite(opts.cadenceMs) && opts.cadenceMs > 0 ? opts.cadenceMs : SCHEDULE_CADENCE_MS;
  return { fromMs, toMs, endMs, cadenceMs };
}

/* summarize(rows, {from?, to?, asOf?, cadenceMs?}) -> counts per class, logged-row + scheduled-slot availability SLIs, mission breakdown. */
function summarize(rows: any, o?: any): any {
  const opts = isObj(o) ? o : {};
  const { fromMs, toMs, endMs, cadenceMs } = bounds(opts);
  const inWin = (r: any) => { const t = tms(r); return Number.isFinite(t) && (!Number.isFinite(fromMs) || t >= fromMs) && (!Number.isFinite(toMs) || t < toMs); };
  const rs = (Array.isArray(rows) ? rows : []).filter((r: any) => isObj(r) && inWin(r)).slice().sort((a: any, b: any) => tms(a) - tms(b));
  const counts: Record<string, number> = {}; for (const c of CLASSES) counts[c] = 0;
  for (const r of rs) counts[classifyAttempt(r)]++;
  const total = rs.length;
  const unavailable = UNAVAILABLE_CLASSES.reduce((a, c) => a + counts[c], 0);
  const rate = (a: number, b: number) => (b > 0 ? Number((a / b).toFixed(4)) : null);
  const slots = scheduledSlots(rs.map(tms), { fromMs, endMs, cadenceMs });
  const nSlots = total + slots.missingTicks;
  const pass = counts.AVAILABLE_EXECUTED_PASS, fail = counts.AVAILABLE_EXECUTED_FAIL, pol = counts.AVAILABLE_POLICY_REFUSED;
  const reached = pass + fail + pol, minN = MISSION_MIN_SAMPLE_N;
  const measured = minN !== null && reached >= minN;
  return Object.freeze({
    window: Object.freeze({ from: opts.from || (rs[0] && rs[0].recordedAt) || null, to: opts.to || opts.asOf || (rs[rs.length - 1] && rs[rs.length - 1].recordedAt) || null }),
    total, counts: Object.freeze(counts),
    availability: rate(total - unavailable, total),                                            // LOGGED-ROW SLI (kept for history)
    availabilityExcludingLegitimate: rate(total - counts.REFUSED_ORGANIZATIONAL, total),       // what the main-worktree guard can recover
    scheduledSlot: Object.freeze({ cadenceMin: cadenceMs / 60000, missingTicks: slots.missingTicks, slots: nSlots, good: total - unavailable,
      sli: rate(total - unavailable, nSlots), gaps: Object.freeze(slots.gaps), offScheduleRows: slots.offScheduleRows,
      edges: "leading edge from 'from', trailing edge to min(to, asOf) when given; boundary treated as a virtual tick (lenient by ≤1 slot per edge)" }),
    missionBreakdown: Object.freeze({ pass, fail, policyRefused: pol, reached }),
    missionMinSampleN: minN,
    missionReliability: measured ? rate(pass, reached) : null,
    missionReliabilityNote: measured ? "measured (fail-closed: policy refusals count as not-pass)" : (minN === null ? "NOT_MEASURED — slo-targets MISSION_SUCCESS_VERIFIED.minSampleN unavailable" : "NOT_MEASURED — only " + reached + " mission attempt(s) (< minSampleN " + minN + " from slo-targets MISSION_SUCCESS_VERIFIED)"),
  });
}

/* toEvents(rows, {includeMissing?, from?, to?, asOf?, cadenceMs?}) -> [{t, good, change}] for odg-slo-error-budget-view.eventBudgetAnalysis.
 * includeMissing ⇒ one bad UNAVAILABLE_MISSING_TICK event per missing scheduled slot (scheduled-slot journey). */
function toEvents(rows: any, o?: any): any[] {
  const opts = isObj(o) ? o : {};
  const rs = (Array.isArray(rows) ? rows : []).filter((r: any) => Number.isFinite(tms(r))).slice().sort((a: any, b: any) => tms(a) - tms(b));
  const ev: any[] = rs.map((r: any) => { const c = classifyAttempt(r); return { t: r.recordedAt, good: isAvailable(c), change: c }; });
  if (opts.includeMissing !== true) return ev;
  const { fromMs, endMs, cadenceMs } = bounds(opts);
  const sl = scheduledSlots(rs.map(tms), { fromMs, endMs, cadenceMs });
  return ev.concat(sl.missingAt.map((t: number) => ({ t: new Date(t).toISOString(), good: false, change: "UNAVAILABLE_MISSING_TICK" }))).sort((a: any, b: any) => Date.parse(a.t) - Date.parse(b.t));
}

/* ciSplit(runs) — runs = [{t, conclusion, event, change(branch)}]. Decisive = success|failure (cancelled = superseded, not decisive).
 * mainPush = the reliability SLI (CI_MAIN_PUSH_SUCCESS); pullRequest = development signal (NOT an SLO). Window = actual first..last run. */
function ciSplit(runs: any): any {
  const rs = (Array.isArray(runs) ? runs : []).filter((r: any) => isObj(r) && typeof r.t === "string" && Number.isFinite(Date.parse(r.t))).slice().sort((a: any, b: any) => Date.parse(a.t) - Date.parse(b.t));
  const decisive = (r: any) => r.conclusion === "success" || r.conclusion === "failure";
  const stat = (xs: any[]) => { const good = xs.filter((r) => r.conclusion === "success").length;
    return { n: xs.length, good, bad: xs.length - good, sli: xs.length ? Number((good / xs.length).toFixed(4)) : null, wilson: wilson(good, xs.length),
      window: { from: xs.length ? xs[0].t : null, to: xs.length ? xs[xs.length - 1].t : null,
        days: xs.length > 1 ? Number(((Date.parse(xs[xs.length - 1].t) - Date.parse(xs[0].t)) / 86400000).toFixed(2)) : 0 } }; };
  const main = rs.filter((r: any) => r.event === "push" && r.change === "main");
  const pr = rs.filter((r: any) => r.event === "pull_request");
  return Object.freeze({
    mainPush: Object.freeze({ id: "CI_MAIN_PUSH_SUCCESS", role: "RELIABILITY_SLI", ...stat(main.filter(decisive)) }),
    pullRequest: Object.freeze({ role: "DEVELOPMENT_SIGNAL_NOT_SLO", note: "a failing PR run is the required check catching bad code — not an outage", ...stat(pr.filter(decisive)) }),
    excluded: Object.freeze({ cancelled: rs.filter((r: any) => r.conclusion === "cancelled").length,
      otherPush: rs.filter((r: any) => r.event === "push" && r.change !== "main" && decisive(r)).length,
      otherEvent: rs.filter((r: any) => r.event !== "push" && r.event !== "pull_request" && decisive(r)).length,
      nonDecisiveOther: rs.filter((r: any) => !decisive(r) && r.conclusion !== "cancelled").length }),
  });
}

/* wilson(k, n, z=1.96) -> {low, high} 95% score interval for a proportion (honest at small n and near 1). */
function wilsonRaw(k: number, n: number, z?: number): any {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null;
  const zz = typeof z === "number" && z > 0 ? z : 1.96, p = k / n, d = 1 + zz * zz / n;
  const c = (p + zz * zz / (2 * n)) / d, h = (zz * Math.sqrt(p * (1 - p) / n + zz * zz / (4 * n * n))) / d;
  return { low: Math.max(0, c - h), high: Math.min(1, c + h) };
}
function wilson(k: number, n: number, z?: number): any {
  const w = wilsonRaw(k, n, z); return w ? Object.freeze({ low: Number(w.low.toFixed(4)), high: Number(w.high.toFixed(4)) }) : null;
}
function validTarget(t: any): boolean { return typeof t === "number" && Number.isFinite(t) && t > 0 && t < 1; }
function validZ(z: any): number { return typeof z === "number" && Number.isFinite(z) && z > 0 ? z : 1.96; }
/* minTicksToSupport(target, z=1.96) -> smallest n such that n good out of n has a Wilson LOWER bound ≥ target (n/(n+z²) ≥ t). null on invalid target. */
function minTicksToSupport(target: any, z?: any): number | null { if (!validTarget(target)) return null; const zz = validZ(z); return Math.ceil(zz * zz * target / (1 - target)); }
/* additionalGoodToSupport(k, n, target) -> smallest m ≥ 0 such that wilson(k+m, n+m).low ≥ target (all future events good). null if invalid / not reached within 1e6. */
function additionalGoodToSupport(k: number, n: number, target: any, z?: any): number | null {
  if (!validTarget(target) || !Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) return null;
  const zz = validZ(z); const low = (kk: number, nn: number) => { const w = wilsonRaw(kk, nn, zz); return w ? w.low : 0; };   // unrounded: consistent with minTicksToSupport
  if (n > 0 && low(k, n) >= target) return 0;
  let lo = 0, hi = 1; while (low(k + hi, n + hi) < target) { hi *= 2; if (hi > 1e6) return null; }
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (low(k + mid, n + mid) >= target) hi = mid; else lo = mid; }
  return hi;
}

const AUTONOMY_AVAILABILITY_CONTRACT = Object.freeze({
  id: "V375-LOT-A-AUTONOMY-AVAILABILITY", definitionVersion: "V15-SLI-DEFINITIONS", classes: CLASSES, availableStatuses: AVAILABLE_STATUSES,
  startupRefusalStatuses: STARTUP_REFUSAL_STATUSES, cadenceMs: SCHEDULE_CADENCE_MS, missionMinSampleN: MISSION_MIN_SAMPLE_N,
  invariants: Object.freeze([
    "source = mission-attempt-log (attempt level); the proven-only mission-ledger is not replaced",
    "availability ≠ mission reliability ≠ CI reliability — reported separately",
    "fail-closed: only an explicit allowlist of producer statuses counts available; unknown ⇒ UNCLASSIFIED_FAIL_CLOSED (unavailable)",
    "scheduled-slot SLI: missing ticks (gap > 1.5× cadence) are UNAVAILABLE_MISSING_TICK",
    "organizational refusals distinguished from legitimate Truth-Lock and integrity refusals",
    "mission reliability NOT_MEASURED below slo-targets MISSION_SUCCESS_VERIFIED.minSampleN; policy refusals reported separately, still not-pass",
    "CI: push-to-main = reliability SLI; pull_request runs = development signal, not an SLO",
  ]),
});
module.exports = { classifyAttempt, summarize, toEvents, ciSplit, wilson, minTicksToSupport, additionalGoodToSupport, CLASSES, UNAVAILABLE_CLASSES,
  AVAILABLE_STATUSES, STARTUP_REFUSAL_STATUSES, SCHEDULE_CADENCE_MS, AUTONOMY_AVAILABILITY_CONTRACT };
export {};
