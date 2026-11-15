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

module.exports = { sloErrorBudget, SLO_ERROR_BUDGET_CONTRACT };
export {};
