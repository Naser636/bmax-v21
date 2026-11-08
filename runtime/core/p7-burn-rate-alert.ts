#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 13 (P7 excellence) — MULTI-WINDOW MULTI-BURN-RATE SLO ALERTING. PURE, deterministic. World reference: the
 * Google SRE Workbook (Ch.5 "Alerting on SLOs") recommends MULTI-WINDOW, MULTI-BURN-RATE error-budget alerts — a PAGE
 * fires only when BOTH a long window AND a short confirmation window exceed the burn threshold, which balances fast
 * detection against false alarms far better than a single-window threshold. ODG's P7 reference computed an
 * error-budget burn but used a single window. This adds the multi-window alerter (fail-closed: a page requires BOTH
 * windows). Complements profession-p7-sre-reference; no new engine. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

/** burnRate(errorRate, slo) -> how fast the error budget is consumed (1.0 = exactly at budget). */
function burnRate(errorRate: any, slo: any): number {
  const budget = 1 - num(slo, 0.999);         // e.g. 99.9% SLO ⇒ 0.1% budget
  if (budget <= 0) return Infinity;
  return Number((num(errorRate) / budget).toFixed(4));   // round to avoid float noise (1-0.999 ≠ exactly 0.001)
}

// Standard Google SRE multi-burn-rate tiers (Workbook Ch.5, for a 30-day window): [long, short] windows + burn factor.
const TIERS = Object.freeze([
  { severity: "PAGE", longHours: 1, shortMin: 5, burn: 14.4, budgetConsumedPct: 2 },   // 2% of budget in 1h
  { severity: "PAGE", longHours: 6, shortMin: 30, burn: 6, budgetConsumedPct: 5 },     // 5% in 6h
  { severity: "TICKET", longHours: 24, shortMin: 120, burn: 3, budgetConsumedPct: 10 }, // 10% in 1d
  { severity: "TICKET", longHours: 72, shortMin: 360, burn: 1, budgetConsumedPct: 10 }, // 10% in 3d
]);

/** evaluateAlert({slo, longErrorRate, shortErrorRate, burnThreshold}) -> { fire, severity, longBurn, shortBurn }.
 * Fail-closed multi-window: an alert fires ONLY when BOTH the long and short windows exceed the burn threshold. */
function evaluateAlert(input: any): any {
  const o = isObj(input) ? input : {};
  const slo = num(o.slo, 0.999);
  const longBurn = burnRate(o.longErrorRate, slo);
  const shortBurn = burnRate(o.shortErrorRate, slo);
  const threshold = num(o.burnThreshold, 14.4);
  const fire = longBurn >= threshold && shortBurn >= threshold;   // BOTH windows — the Google multi-window rule
  return Object.freeze({
    fire, severity: fire ? (o.severity || "PAGE") : "NONE",
    longBurn: Number(longBurn.toFixed(2)), shortBurn: Number(shortBurn.toFixed(2)), threshold,
    note: "multi-window: a page requires BOTH long AND short windows over the burn threshold (reduces false alarms vs single-window)",
  });
}

/** classify({slo, errorRate}) -> the highest tier whose burn factor is exceeded (advisory severity). */
function classify(input: any): any {
  const o = isObj(input) ? input : {};
  const br = burnRate(o.errorRate, num(o.slo, 0.999));
  let hit: any = null;
  for (const t of TIERS) if (br >= t.burn) { if (!hit || t.burn > hit.burn) hit = t; }
  return Object.freeze({ burn: Number(br.toFixed(2)), severity: hit ? hit.severity : "OK", tier: hit ? { longHours: hit.longHours, burn: hit.burn } : null });
}

const P7_BURN_RATE_CONTRACT = Object.freeze({
  id: "V124-P7-BURN-RATE-ALERT",
  source: "SÉRIE 13 P7 — Google SRE Workbook Ch.5 multi-window multi-burn-rate SLO alerting",
  reference: Object.freeze({ primary: "Google SRE Workbook, Ch.5 'Alerting on SLOs'", tiers: "14.4×/6×/3×/1× burn for 1h/6h/1d/3d windows" }),
  tiers: TIERS, complements: "profession-p7-sre-reference (adds multi-window alerting, not a replacement)",
  notAuthority: "a pure SLO-alert evaluator; it pages nothing and reads no live telemetry",
  invariants: Object.freeze([
    "a PAGE fires ONLY when BOTH the long and short windows exceed the burn threshold (multi-window, fail-closed)",
    "burnRate = errorRate / (1 − SLO); a zero/negative budget ⇒ Infinity burn (fail-closed)",
    "tiers follow the Google SRE Workbook (14.4×/6×/3×/1×); severity escalates PAGE→TICKET by window",
    "complements the P7 SLO reference; adds multi-window alerting; no new engine",
  ]),
});

module.exports = { burnRate, evaluateAlert, classify, TIERS, P7_BURN_RATE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P7_BURN_RATE_CONTRACT, demo: evaluateAlert({ slo: 0.999, longErrorRate: 0.02, shortErrorRate: 0.02 }) }, null, 2) + "\n"); }

export {};
