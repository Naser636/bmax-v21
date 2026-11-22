#!/usr/bin/env node
"use strict";
/*
 * IMP-P7-SLO-VIEW (lot-4 contract, owner-authorized block) — P7 SRE: SLO attainment + error-budget computed ONLY from
 * supplied REAL request events. PURE, deterministic. Fail-closed: no events ⇒ NOT_MEASURED (never a fabricated SLI).
 * Alerting is explicitly NOT_MEASURED (needs a real alerting pipeline, not modelled here).
 *
 * Acceptance (contract): computed from real events, no fabricated SLI; alerting NOT_MEASURED flagged.
 */

function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

/* sloErrorBudget(input) -> SLI/SLO/error-budget. input = { goodEvents, totalEvents, sloTarget (0..1), windowDays? }. */
function sloErrorBudget(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const good = num(i.goodEvents), total = num(i.totalEvents), target = num(i.sloTarget);

  if (total === null || total <= 0 || good === null || good < 0 || good > total) {
    return Object.freeze({ metier: "P7", sli: { status: "NOT_MEASURED", reason: total === null || total <= 0 ? "no request events supplied" : "good/total invalid" }, errorBudget: { status: "NOT_MEASURED" }, alerting: alerting(), honesty: honest() });
  }
  const sli = good / total;
  const slo = (target !== null && target > 0 && target <= 1) ? target : null;
  let errorBudget: any = { status: "NOT_MEASURED", reason: "no valid SLO target (0,1]" };
  if (slo !== null) {
    const allowedBad = (1 - slo) * total;
    const actualBad = total - good;
    const remainingFraction = allowedBad > 0 ? Math.max(-1, (allowedBad - actualBad) / allowedBad) : (actualBad === 0 ? 1 : -1);
    errorBudget = Object.freeze({
      status: "MEASURED", sloTarget: slo, allowedBad: Number(allowedBad.toFixed(2)), actualBad,
      remainingFraction: Number(remainingFraction.toFixed(4)),
      exhausted: actualBad >= allowedBad,
      burnRate: allowedBad > 0 ? Number((actualBad / allowedBad).toFixed(4)) : null,
    });
  }
  return Object.freeze({
    metier: "P7",
    sli: Object.freeze({ status: "MEASURED", value: Number(sli.toFixed(6)), good, total }),
    slo: slo, errorBudget, alerting: alerting(), honesty: honest(),
  });
}

/* V374 Lot 3 — eventBudgetAnalysis(events, opts): the SAME error-budget definition (allowedBad = (1 − SLO) × total), applied to
 * REAL timestamped good/bad events, plus: per-day burn, EARLY degradation (burn-rate alert BEFORE exhaustion), incident
 * correlation with the change (branch) that produced it, and time-to-recovery. PURE (injected events/clock).
 * events: [{ t: ISO, good: boolean, change?: string }] — callers must EXCLUDE non-decisive events (e.g. cancelled runs).
 * opts: { sloTarget (REQUIRED, from a contract — never invented), windowDays, burnAlertFactor? (default 2 ⇒ consuming the
 *         budget twice as fast as the window allows), asOf (ISO, injected) }. */
function eventBudgetAnalysis(events: any, opts: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const ev = (Array.isArray(events) ? events : []).filter((e: any) => e && typeof e.t === "string" && typeof e.good === "boolean").slice().sort((a: any, b: any) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const windowDays = num(o.windowDays);
  if (!ev.length || windowDays === null || windowDays <= 0) return Object.freeze({ status: "NOT_MEASURED", reason: !ev.length ? "no decisive events supplied" : "windowDays required" });
  const total = ev.length, good = ev.filter((e: any) => e.good).length;
  const base = sloErrorBudget({ goodEvents: good, totalEvents: total, sloTarget: o.sloTarget, windowDays });
  if (base.errorBudget.status !== "MEASURED") return Object.freeze({ status: "NOT_MEASURED", reason: base.errorBudget.reason, base });
  const allowedPerDay = base.errorBudget.allowedBad / windowDays;
  const factor = num(o.burnAlertFactor) !== null ? (o.burnAlertFactor as number) : 2;
  const byDay: Record<string, { good: number; bad: number }> = {};
  for (const e of ev) { const d = e.t.slice(0, 10); (byDay[d] = byDay[d] || { good: 0, bad: 0 })[e.good ? "good" : "bad"]++; }
  const days = Object.keys(byDay).sort();
  let cum = 0; let exhaustedOn: string | null = null; let firstAlert: string | null = null;
  const daily = days.map((d) => {
    cum += byDay[d].bad;
    const burnRate = allowedPerDay > 0 ? Number((byDay[d].bad / allowedPerDay).toFixed(3)) : null;
    if (!firstAlert && burnRate !== null && burnRate >= factor) firstAlert = d;
    if (!exhaustedOn && cum >= base.errorBudget.allowedBad) exhaustedOn = d;
    return Object.freeze({ day: d, good: byDay[d].good, bad: byDay[d].bad, burnRate, cumulativeBad: cum });
  });
  // incident ↔ change correlation + time-to-recovery: a bad event is recovered by the next GOOD event on the same change.
  const incidents: any[] = [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].good) continue;
    const ch = typeof ev[i].change === "string" ? ev[i].change : null;
    const next = ch ? ev.slice(i + 1).find((x: any) => x.change === ch && x.good) : null;
    incidents.push(Object.freeze({ t: ev[i].t, change: ch, recoveredAt: next ? next.t : null, recoveryMinutes: next ? Math.round((Date.parse(next.t) - Date.parse(ev[i].t)) / 60000) : null }));
  }
  const rec = incidents.map((x: any) => x.recoveryMinutes).filter((x: any) => typeof x === "number").sort((a: number, b: number) => a - b);
  const pct = (q: number) => (rec.length ? rec[Math.min(rec.length - 1, Math.ceil(q * rec.length) - 1)] : null);
  const byChange: Record<string, number> = {}; for (const x of incidents) if (x.change) byChange[x.change] = (byChange[x.change] || 0) + 1;
  return Object.freeze({
    status: "MEASURED", window: Object.freeze({ from: ev[0].t, to: ev[ev.length - 1].t, days: windowDays }),
    sli: base.sli, errorBudget: base.errorBudget,
    earlyWarning: Object.freeze({ burnAlertFactor: factor, firstAlertDay: firstAlert, exhaustedOn, alertBeforeExhaustion: !!firstAlert && (!exhaustedOn || firstAlert <= exhaustedOn) }),
    daily: Object.freeze(daily),
    incidents: Object.freeze({ count: incidents.length, unrecovered: incidents.filter((x: any) => x.recoveredAt === null).length,
      recoveryMinutes: Object.freeze({ p50: pct(0.5), p95: pct(0.95), n: rec.length }), byChange: Object.freeze(byChange) }),
    honesty: "measured on the supplied real events only; recovery = next success on the SAME change (proxy for detect+fix time); alert thresholds are a policy choice, not a fact",
  });
}

function alerting(): any { return Object.freeze({ status: "NOT_MEASURED", reason: "alerting requires a real alerting/paging pipeline — not modelled here (would be a separate owner-gated integration)" }); }
function honest(): string { return "SLI/error-budget computed ONLY from supplied real events; absent/invalid events ⇒ NOT_MEASURED (never a fabricated SLI); alerting is NOT_MEASURED."; }

const SLO_ERROR_BUDGET_CONTRACT = Object.freeze({
  id: "IMP-P7-SLO-VIEW",
  purpose: "P7 — SLO attainment + error-budget from real events; fail-closed NOT_MEASURED; alerting NOT_MEASURED",
  invariants: Object.freeze([
    "SLI/error-budget computed ONLY from supplied real events — no fabricated SLI",
    "no/invalid events ⇒ NOT_MEASURED (never a fabricated SLI value)",
    "alerting is explicitly NOT_MEASURED (needs a real pipeline; not modelled here)",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { sloErrorBudget, eventBudgetAnalysis, SLO_ERROR_BUDGET_CONTRACT };
export {};
