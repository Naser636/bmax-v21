#!/usr/bin/env node
"use strict";
/*
 * IMP-P1-DORA-VIEW (V189-A contract, owner-authorized block) — P1 Delivery: the 4 DORA metrics computed ONLY from
 * supplied REAL events. PURE, deterministic, READ-ONLY. No new engine. Fail-closed: a metric with no underlying events
 * is NOT_MEASURED (never fabricated as 0). deploy-freq is explicitly NOT_MEASURED when no deployment events are supplied.
 *
 * Acceptance (contract): metrics computed only from real events (no fabricated numbers); deploy-freq NOT_MEASURED flagged.
 */

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

/* doraMetrics(events) -> the 4 metrics + honesty. events = {
 *   deployments:[{at}], changes:[{committedAt, deployedAt}], incidents:[{detectedAt, resolvedAt, causedByChange?}],
 *   windowDays } */
function doraMetrics(events: any): any {
  const e = events && typeof events === "object" ? events : {};
  const deployments = arr(e.deployments), changes = arr(e.changes), incidents = arr(e.incidents);
  const windowDays = num(e.windowDays);

  // 1. Deployment frequency — deploys per day over the window. No deploys / no window ⇒ NOT_MEASURED.
  const deployFreq = deployments.length > 0 && windowDays && windowDays > 0
    ? { value: Number((deployments.length / windowDays).toFixed(4)), unit: "deploys/day", status: "MEASURED" }
    : { value: null, unit: "deploys/day", status: "NOT_MEASURED", reason: deployments.length === 0 ? "no deployment events supplied" : "no window declared" };

  // 2. Lead time for changes — median(committedAt→deployedAt). No paired changes ⇒ NOT_MEASURED.
  const leadTimes = changes.map((c: any) => (num(c.deployedAt) !== null && num(c.committedAt) !== null) ? c.deployedAt - c.committedAt : null).filter((x: any) => x !== null && x >= 0) as number[];
  const leadTime = leadTimes.length > 0
    ? { value: median(leadTimes), unit: "ms", status: "MEASURED", samples: leadTimes.length }
    : { value: null, unit: "ms", status: "NOT_MEASURED", reason: "no committed→deployed pairs" };

  // 3. Change failure rate — incidents causedByChange / deployments. Needs both.
  const failures = incidents.filter((i: any) => i.causedByChange === true).length;
  const cfr = deployments.length > 0
    ? { value: Number((failures / deployments.length).toFixed(4)), unit: "fraction", status: "MEASURED", failures, deployments: deployments.length }
    : { value: null, unit: "fraction", status: "NOT_MEASURED", reason: "no deployments to divide by" };

  // 4. MTTR — median(detectedAt→resolvedAt) over resolved incidents.
  const ttrs = incidents.map((i: any) => (num(i.resolvedAt) !== null && num(i.detectedAt) !== null) ? i.resolvedAt - i.detectedAt : null).filter((x: any) => x !== null && x >= 0) as number[];
  const mttr = ttrs.length > 0
    ? { value: median(ttrs), unit: "ms", status: "MEASURED", samples: ttrs.length }
    : { value: null, unit: "ms", status: "NOT_MEASURED", reason: "no resolved incidents" };

  const measuredCount = [deployFreq, leadTime, cfr, mttr].filter((m: any) => m.status === "MEASURED").length;
  return Object.freeze({
    deploymentFrequency: Object.freeze(deployFreq), leadTimeForChanges: Object.freeze(leadTime),
    changeFailureRate: Object.freeze(cfr), meanTimeToRestore: Object.freeze(mttr),
    measuredCount, metier: "P1",
    honesty: "every metric is computed ONLY from supplied real events; absent evidence ⇒ NOT_MEASURED (never fabricated 0); no performance level is claimed without the underlying events.",
  });
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

const DORA_METRICS_VIEW_CONTRACT = Object.freeze({
  id: "IMP-P1-DORA-VIEW",
  purpose: "P1 — the 4 DORA metrics computed only from real events; fail-closed NOT_MEASURED; no fabrication",
  invariants: Object.freeze([
    "every metric computed ONLY from supplied real events — no fabricated numbers",
    "deploy-freq is NOT_MEASURED when no deployment events are supplied (flagged, never 0)",
    "a metric with no underlying evidence ⇒ NOT_MEASURED; no DORA performance tier is asserted without events",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { doraMetrics, DORA_METRICS_VIEW_CONTRACT };
export {};
