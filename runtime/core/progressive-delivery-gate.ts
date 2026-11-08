#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 21 (P5/P14 platform — world-research gap) — PROGRESSIVE-DELIVERY ANALYSIS GATE. PURE, deterministic. World
 * reference: Argo Rollouts `AnalysisRun` / Flagger (the 2026 progressive-delivery standard): shift traffic in steps
 * and run an AUTOMATED canary analysis comparing the canary cohort's SLIs vs the baseline/stable cohort — auto-PROMOTE
 * within tolerance, auto-ROLLBACK outside it ("deploy and verify, not deploy and hope"). ODG had `canary-decision-pack`
 * (authorization dossier) + `dora-metrics` (a read-model) but NOTHING turned a canary-vs-baseline comparison into a
 * PROMOTE/HOLD/ROLLBACK verdict. This adds it, COMPOSING dora-metrics.fourKeys (run on each cohort) + deployment-
 * readiness (admission) — no new engine, no network, triggers nothing. Fail-closed: insufficient evidence ⇒ HOLD
 * (never auto-PROMOTE); a canary materially worse than baseline ⇒ ROLLBACK (names deploy/odg-rollback.sh, owner-gated).
 * Dual export.
 */

const DORA = require("./dora-metrics");
const READINESS = require("./deployment-readiness");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }

/** analyze({baseline, canary, tolerance, readinessEvidence?}) -> { verdict, baselineCfr, canaryCfr, deltaCfr, reasons }.
 * baseline/canary are DORA transition streams ({transitions:[{event:"COMPLETED"|"FAILED", ...}]}). Fail-closed. */
function analyze(input: any): any {
  const o = isObj(input) ? input : {};
  const tol = isObj(o.tolerance) ? o.tolerance : {};
  const maxCfrDelta = isNum(tol.maxCfrDelta) ? tol.maxCfrDelta : 0.05;      // canary CFR may exceed baseline by at most this
  const maxAbsoluteCfr = isNum(tol.maxAbsoluteCfr) ? tol.maxAbsoluteCfr : 0.15; // absolute canary CFR ceiling
  const reasons: string[] = [];

  // admission precondition: if readiness evidence is supplied, it must be READY (reuse deployment-readiness).
  if (o.readinessEvidence !== undefined) {
    const rd = READINESS.evaluateReadiness(o.readinessEvidence);
    if (rd.state !== "READY") { reasons.push(`admission blocked: deployment-readiness is ${rd.state}`); return Object.freeze({ verdict: "HOLD", baselineCfr: null, canaryCfr: null, deltaCfr: null, reasons: Object.freeze(reasons), rollbackAction: null, note: "not READY ⇒ HOLD (no canary analysis run)" }); }
  }

  const bCfr = DORA.fourKeys(isObj(o.baseline) ? o.baseline : {}).keys.changeFailureRate;
  const cCfr = DORA.fourKeys(isObj(o.canary) ? o.canary : {}).keys.changeFailureRate;
  // fail-closed: without observed CFR on BOTH cohorts we cannot compare ⇒ HOLD (never auto-PROMOTE on no evidence).
  if (bCfr.observed !== true || cCfr.observed !== true) {
    reasons.push(`insufficient evidence: baseline CFR observed=${bCfr.observed}, canary CFR observed=${cCfr.observed}`);
    return Object.freeze({ verdict: "HOLD", baselineCfr: bCfr.value, canaryCfr: cCfr.value, deltaCfr: null, reasons: Object.freeze(reasons), rollbackAction: null, note: "HOLD: cannot promote without observed canary+baseline change-failure-rate (fail-closed)" });
  }

  const deltaCfr = Number((cCfr.value - bCfr.value).toFixed(3));
  let verdict: string;
  if (cCfr.value > maxAbsoluteCfr) { verdict = "ROLLBACK"; reasons.push(`canary CFR ${cCfr.value} exceeds absolute ceiling ${maxAbsoluteCfr}`); }
  else if (deltaCfr > maxCfrDelta) { verdict = "ROLLBACK"; reasons.push(`canary CFR worse than baseline by ${deltaCfr} (> tolerance ${maxCfrDelta})`); }
  else { verdict = "PROMOTE"; reasons.push(`canary CFR ${cCfr.value} within tolerance of baseline ${bCfr.value} (delta ${deltaCfr})`); }

  return Object.freeze({
    verdict, baselineCfr: bCfr.value, canaryCfr: cCfr.value, deltaCfr,
    reasons: Object.freeze(reasons),
    rollbackAction: verdict === "ROLLBACK" ? "deploy/odg-rollback.sh (owner-gated; this gate triggers nothing)" : null,
    note: "automated canary-vs-baseline analysis (Argo Rollouts/Flagger pattern); PROMOTE within tolerance, ROLLBACK outside, HOLD on insufficient evidence",
  });
}

const PROGRESSIVE_DELIVERY_CONTRACT = Object.freeze({
  id: "V124-PROGRESSIVE-DELIVERY-GATE",
  source: "SÉRIE 21 P5/P14 — automated canary-vs-baseline promotion gate (Argo Rollouts AnalysisRun / Flagger, 2026)",
  reuses: Object.freeze(["dora-metrics.fourKeys (change-failure-rate per cohort)", "deployment-readiness.evaluateReadiness (admission)"]),
  notAuthority: "a pure analysis gate; it computes a verdict but TRIGGERS NOTHING (promotion/rollback remain owner/canonical actions)",
  invariants: Object.freeze([
    "PROMOTE only when the canary CFR is within tolerance of baseline AND below the absolute ceiling",
    "a canary CFR materially worse than baseline (delta > tolerance) or above the ceiling ⇒ ROLLBACK (names deploy/odg-rollback.sh)",
    "fail-closed: insufficient evidence (unobserved CFR on either cohort) or NOT_READY admission ⇒ HOLD, never auto-PROMOTE",
    "composes dora-metrics + deployment-readiness; no new engine; triggers no deploy/rollback itself",
  ]),
});

module.exports = { analyze, PROGRESSIVE_DELIVERY_CONTRACT };

if (require.main === module) {
  const stream = (c: number, f: number) => ({ transitions: [...Array(c)].map(() => ({ event: "COMPLETED" })).concat([...Array(f)].map(() => ({ event: "FAILED" }))) });
  process.stdout.write(JSON.stringify({ ...PROGRESSIVE_DELIVERY_CONTRACT, demo: analyze({ baseline: stream(95, 5), canary: stream(90, 10) }) }, null, 2) + "\n");
}

export {};
