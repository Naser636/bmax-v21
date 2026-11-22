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
 *   D2 (r2, after inspection MED-2) — TRUE SLOT model: the window is cut into epoch-aligned cadence slots; a slot is good
 *        iff it holds ≥ 1 row and every row in it is available; an empty slot is UNAVAILABLE_MISSING_TICK. Extra/manual/
 *        duplicate rows never add slots. Rows dated after asOf are excluded. (r1's gap formula floor(gap/c)−1 let extra rows
 *        add good slots and counted 22.5–30 min gaps as 0 missing — replaced.)
 *   CI (r2, MED-1/MED-3) — ciSplit: completed non-success non-cancelled ⇒ BAD; first-attempt outcome when attempt data exists.
 *   The availability SLI is a LIVENESS signal (timer fired and the tick passed startup with the repo on main) — it says
 *        nothing about whether autonomy (missions) works.
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

/* slotGrid(rows sorted, {fromMs?, endMs?, cadenceMs}) — TRUE slot model (MED-2). The window is cut into epoch-aligned
 * cadence slots [i·c, (i+1)·c); only FULL slots inside [from, end) count (from rounded up, end rounded down; without
 * bounds: the slot of the first row .. the slot of the last row). A slot is GOOD iff it holds ≥ 1 row AND every row in it
 * is available (worst row wins); an empty slot is UNAVAILABLE_MISSING_TICK. Extra / duplicate rows in a slot never add
 * slots (extraRowsIgnored). An empty slot whose bracketing rows are ≤ 1.5 × cadence apart is still BAD but also counted as
 * a driftSlip (OnUnitActiveSec + AccuracySec make the timer fire slightly later than every 15 min — fewer ticks than slots). */
function slotGrid(rs: any[], o: any): any {
  const c = o.cadenceMs, ts = rs.map(tms);
  const empty = { slots: 0, good: 0, missingTicks: 0, driftSlips: 0, refusedSlots: 0, extraRowsIgnored: 0, edgeRowsExcluded: rs.length, slotEvents: [] as any[], missingRuns: [] as any[] };
  const lo = Number.isFinite(o.fromMs) ? Math.ceil(o.fromMs / c) : (ts.length ? Math.floor(ts[0] / c) : NaN);
  const hi = Number.isFinite(o.endMs) ? Math.floor(o.endMs / c) : (ts.length ? Math.floor(ts[ts.length - 1] / c) + 1 : NaN);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return empty;
  const buckets = new Map<number, any[]>(); let edge = 0;
  rs.forEach((r: any, k: number) => { const i = Math.floor(ts[k] / c); if (i < lo || i >= hi) { edge++; return; } const b = buckets.get(i); if (b) b.push(r); else buckets.set(i, [r]); });
  let good = 0, missing = 0, drift = 0, refused = 0, extra = 0, p = 0; const ev: any[] = [], runs: any[] = [];
  for (let i = lo; i < hi; i++) {
    const t0 = i * c, iso = new Date(t0).toISOString(), b = buckets.get(i);
    if (!b) {
      missing++;
      while (p < ts.length && ts[p] < t0) p++;                        // first row at/after this slot start
      const prev = p > 0 ? ts[p - 1] : NaN, next = p < ts.length ? ts[p] : NaN;
      const isDrift = Number.isFinite(prev) && Number.isFinite(next) && next - prev <= 1.5 * c;
      if (isDrift) drift++;
      ev.push({ t: iso, good: false, change: isDrift ? "UNAVAILABLE_MISSING_TICK_DRIFT_SLIP" : "UNAVAILABLE_MISSING_TICK" });
      const last = runs[runs.length - 1];
      if (last && last.toSlot === i - 1) { last.toSlot = i; last.slots++; } else runs.push({ fromSlot: i, toSlot: i, slots: 1 });
      continue;
    }
    extra += b.length - 1;
    const bad = b.map(classifyAttempt).find((cl: string) => !isAvailable(cl));
    if (bad) { refused++; ev.push({ t: iso, good: false, change: bad }); } else { good++; ev.push({ t: iso, good: true, change: "SLOT_SERVED" }); }
  }
  const missingRuns = runs.slice(0, 200).map((r: any) => Object.freeze({ from: new Date(r.fromSlot * c).toISOString(), to: new Date((r.toSlot + 1) * c).toISOString(), slots: r.slots }));
  return { slots: hi - lo, good, missingTicks: missing, driftSlips: drift, refusedSlots: refused, extraRowsIgnored: extra, edgeRowsExcluded: edge, slotEvents: ev, missingRuns };
}
function bounds(opts: any): any {
  const fromMs = opts.from ? Date.parse(opts.from) : NaN, toMs = opts.to ? Date.parse(opts.to) : NaN, asOfMs = opts.asOf ? Date.parse(opts.asOf) : NaN;
  const endMs = Number.isFinite(toMs) ? (Number.isFinite(asOfMs) ? Math.min(toMs, asOfMs) : toMs) : asOfMs;
  const cadenceMs = Number.isFinite(opts.cadenceMs) && opts.cadenceMs > 0 ? opts.cadenceMs : SCHEDULE_CADENCE_MS;
  return { fromMs, toMs, asOfMs, endMs, cadenceMs };
}
/* windowRows(rows, opts) — rows in [from, to), clamped at asOf (rows dated after asOf are excluded and counted). */
function windowRows(rows: any, opts: any): any {
  const { fromMs, toMs, asOfMs } = bounds(opts); let future = 0;
  const rs = (Array.isArray(rows) ? rows : []).filter((r: any) => {
    const t = tms(r); if (!Number.isFinite(t)) return false;
    if (Number.isFinite(asOfMs) && t > asOfMs) { future++; return false; }
    return (!Number.isFinite(fromMs) || t >= fromMs) && (!Number.isFinite(toMs) || t < toMs);
  }).slice().sort((a: any, b: any) => tms(a) - tms(b));
  return { rs, future };
}

/* summarize(rows, {from?, to?, asOf?, cadenceMs?}) -> counts per class, logged-row + scheduled-slot availability SLIs, mission breakdown. */
function summarize(rows: any, o?: any): any {
  const opts = isObj(o) ? o : {};
  const { fromMs, endMs, cadenceMs } = bounds(opts);
  const { rs, future } = windowRows(rows, opts);
  const counts: Record<string, number> = {}; for (const c of CLASSES) counts[c] = 0;
  for (const r of rs) counts[classifyAttempt(r)]++;
  const total = rs.length;
  const unavailable = UNAVAILABLE_CLASSES.reduce((a, c) => a + counts[c], 0);
  const rate = (a: number, b: number) => (b > 0 ? Number((a / b).toFixed(4)) : null);
  const g = slotGrid(rs, { fromMs, endMs, cadenceMs });
  const pass = counts.AVAILABLE_EXECUTED_PASS, fail = counts.AVAILABLE_EXECUTED_FAIL, pol = counts.AVAILABLE_POLICY_REFUSED;
  const reached = pass + fail + pol, minN = MISSION_MIN_SAMPLE_N;
  const measured = minN !== null && reached >= minN;
  return Object.freeze({
    window: Object.freeze({ from: opts.from || (rs[0] && rs[0].recordedAt) || null, to: opts.to || opts.asOf || (rs[rs.length - 1] && rs[rs.length - 1].recordedAt) || null }),
    total, counts: Object.freeze(counts),
    availability: rate(total - unavailable, total),                                            // LOGGED-ROW SLI (kept for history; extra rows inflate it)
    availabilityExcludingLegitimate: rate(total - counts.REFUSED_ORGANIZATIONAL, total),       // what the main-worktree guard can recover
    scheduledSlot: Object.freeze({ cadenceMin: cadenceMs / 60000, slots: g.slots, good: g.good, missingTicks: g.missingTicks, driftSlips: g.driftSlips, refusedSlots: g.refusedSlots,
      sli: rate(g.good, g.slots), extraRowsIgnored: g.extraRowsIgnored, edgeRowsExcluded: g.edgeRowsExcluded, futureRowsExcluded: future, missingRuns: Object.freeze(g.missingRuns),
      definition: "epoch-aligned " + cadenceMs / 60000 + "-min slots, full slots inside [from, min(to, asOf)); slot good iff ≥1 row and every row in it available; empty slot = UNAVAILABLE_MISSING_TICK (driftSlips = empty slot whose bracketing rows are ≤1.5× cadence apart — still bad)" }),
    missionBreakdown: Object.freeze({ pass, fail, policyRefused: pol, reached }),
    missionMinSampleN: minN,
    missionReliability: measured ? rate(pass, reached) : null,
    missionReliabilityNote: measured ? "measured (fail-closed: policy refusals count as not-pass)" : (minN === null ? "NOT_MEASURED — slo-targets MISSION_SUCCESS_VERIFIED.minSampleN unavailable" : "NOT_MEASURED — only " + reached + " mission attempt(s) (< minSampleN " + minN + " from slo-targets MISSION_SUCCESS_VERIFIED)"),
  });
}

/* toEvents(rows, {slots?|includeMissing?, from?, to?, asOf?, cadenceMs?}) -> [{t, good, change}] for odg-slo-error-budget-view.eventBudgetAnalysis.
 * default: one event per logged row (clamped at asOf). slots/includeMissing ⇒ one event PER SCHEDULED SLOT (the slot SLI journey). */
function toEvents(rows: any, o?: any): any[] {
  const opts = isObj(o) ? o : {};
  const { rs } = windowRows(rows, opts);
  if (opts.slots !== true && opts.includeMissing !== true) return rs.map((r: any) => { const c = classifyAttempt(r); return { t: r.recordedAt, good: isAvailable(c), change: c }; });
  const { fromMs, endMs, cadenceMs } = bounds(opts);
  return slotGrid(rs, { fromMs, endMs, cadenceMs }).slotEvents;
}

/* ciSplit(runs) — runs = [{t, conclusion, status?, event, change(branch), attempt?, firstConclusion?}].
 * MED-1 fail-closed: a COMPLETED run counts GOOD only if its conclusion is "success"; "cancelled" is EXCLUDED (superseded by a
 * newer push whose run covers the same tree — reported as a count); every other completed conclusion — failure, timed_out,
 * startup_failure, action_required, skipped, neutral, stale, unknown — is BAD: the required check did not verify main.
 * A run with no conclusion (status not completed) is EXCLUDED as pending (counted).
 * MED-3: when `attempt` is present, the FIRST attempt's outcome counts (attempt>1 ⇒ firstConclusion; absent ⇒ BAD);
 * when absent, the data is LATEST-ATTEMPT-ONLY and red-then-green re-runs would count green — flagged as a bias.
 * mainPush = the reliability SLI (CI_MAIN_PUSH_SUCCESS); pullRequest = development signal (NOT an SLO). Window = actual first..last run. */
function ciSplit(runs: any): any {
  const rs = (Array.isArray(runs) ? runs : []).filter((r: any) => isObj(r) && typeof r.t === "string" && Number.isFinite(Date.parse(r.t))).slice().sort((a: any, b: any) => Date.parse(a.t) - Date.parse(b.t));
  const pending = (r: any) => typeof r.conclusion !== "string" || r.conclusion === "" || (typeof r.status === "string" && r.status !== "completed");
  const counted = (r: any) => !pending(r) && r.conclusion !== "cancelled";
  const outcome = (r: any) => (Number.isInteger(r.attempt) && r.attempt > 1 ? (typeof r.firstConclusion === "string" ? r.firstConclusion : "UNKNOWN_FIRST_ATTEMPT") : r.conclusion);
  const stat = (xs: any[]) => { const ys = xs.filter(counted); const good = ys.filter((r) => outcome(r) === "success").length;
    const withAttempt = ys.filter((r) => Number.isInteger(r.attempt)).length;
    const attemptInfo = ys.length && withAttempt === ys.length ? "FIRST_ATTEMPT" : (withAttempt === 0 ? "LATEST_ATTEMPT_ONLY" : "MIXED");
    const badBy: Record<string, number> = {}; for (const r of ys) { const oc = outcome(r); if (oc !== "success") badBy[oc] = (badBy[oc] || 0) + 1; }
    return { n: ys.length, good, bad: ys.length - good, badByConclusion: badBy, sli: ys.length ? Number((good / ys.length).toFixed(4)) : null, wilson: wilson(good, ys.length),
      attemptInfo, reruns: ys.filter((r) => Number.isInteger(r.attempt) && r.attempt > 1).length,
      attemptBias: attemptInfo === "FIRST_ATTEMPT" ? "none — first-attempt outcome counted" : "data has no attempt field: the conclusion is the LATEST attempt, so a red-then-green re-run counts green (bias toward success, size unknown)",
      events: ys.map((r) => ({ t: r.t, good: outcome(r) === "success", change: r.sha || r.change })),
      window: { from: ys.length ? ys[0].t : null, to: ys.length ? ys[ys.length - 1].t : null,
        days: ys.length > 1 ? Number(((Date.parse(ys[ys.length - 1].t) - Date.parse(ys[0].t)) / 86400000).toFixed(2)) : 0 } }; };
  const main = rs.filter((r: any) => r.event === "push" && r.change === "main");
  const pr = rs.filter((r: any) => r.event === "pull_request");
  return Object.freeze({
    mainPush: Object.freeze({ id: "CI_MAIN_PUSH_SUCCESS", role: "RELIABILITY_SLI", ...stat(main) }),
    pullRequest: Object.freeze({ role: "DEVELOPMENT_SIGNAL_NOT_SLO", note: "a failing PR run is the required check catching bad code — not an outage", ...stat(pr) }),
    excluded: Object.freeze({ cancelled: rs.filter((r: any) => !pending(r) && r.conclusion === "cancelled").length, pending: rs.filter(pending).length,
      otherPush: rs.filter((r: any) => r.event === "push" && r.change !== "main" && counted(r)).length,
      otherEvent: rs.filter((r: any) => r.event !== "push" && r.event !== "pull_request" && counted(r)).length }),
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
  id: "V375-LOT-A-AUTONOMY-AVAILABILITY", definitionVersion: "V15-SLI-DEFINITIONS-r2", classes: CLASSES, availableStatuses: AVAILABLE_STATUSES,
  startupRefusalStatuses: STARTUP_REFUSAL_STATUSES, cadenceMs: SCHEDULE_CADENCE_MS, missionMinSampleN: MISSION_MIN_SAMPLE_N,
  invariants: Object.freeze([
    "source = mission-attempt-log (attempt level); the proven-only mission-ledger is not replaced",
    "availability ≠ mission reliability ≠ CI reliability — reported separately",
    "fail-closed: only an explicit allowlist of producer statuses counts available; unknown ⇒ UNCLASSIFIED_FAIL_CLOSED (unavailable)",
    "scheduled-slot SLI: epoch-aligned cadence slots; a slot is good iff ≥1 row and all its rows available; empty slot = UNAVAILABLE_MISSING_TICK; extra rows never add slots",
    "availability is a LIVENESS signal (timer fired, tick passed startup with the repo on main) — NOT a measure that autonomy works",
    "CI fail-closed: completed non-success non-cancelled = bad; first-attempt outcome when attempt data exists, else the latest-attempt bias is flagged",
    "organizational refusals distinguished from legitimate Truth-Lock and integrity refusals",
    "mission reliability NOT_MEASURED below slo-targets MISSION_SUCCESS_VERIFIED.minSampleN; policy refusals reported separately, still not-pass",
    "CI: push-to-main = reliability SLI; pull_request runs = development signal, not an SLO",
  ]),
});
module.exports = { classifyAttempt, summarize, toEvents, ciSplit, wilson, minTicksToSupport, additionalGoodToSupport, CLASSES, UNAVAILABLE_CLASSES,
  AVAILABLE_STATUSES, STARTUP_REFUSAL_STATUSES, SCHEDULE_CADENCE_MS, AUTONOMY_AVAILABILITY_CONTRACT };
export {};
