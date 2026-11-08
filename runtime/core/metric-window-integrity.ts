#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-7 (observability — world-research gap) — METRIC WINDOW INTEGRITY. PURE, deterministic. World
 * reference: OpenTelemetry Metrics Data Model — "a metric stream has a GAP where it is implicitly UNDEFINED anywhere
 * there is a range of time such that no point covers that range"; 2026 SLO guidance — missing/late telemetry must
 * return unknown/incomplete, never falsely improve the metric; "completeness is the fraction of expected source rows
 * that landed within the window." ODG verifies metric DENOMINATORS (dora-metrics null-with-reason) and event-stream
 * DELIVERY (integration-stream-reliability) but never checks a metric's series actually COVERS the window it claims
 * to measure (grep-verified: no windowCoverage/coverageRatio/largestGap/metric-window-integrity; dora-metrics computes
 * windowMs but never checks the transitions span it). This gate takes a timestamped series + the claimed window +
 * expected cadence and refuses a metric computed over a series with temporal holes/edge truncation. It is the
 * time-series twin of calibration-trust-gate. Pure (window bounds + cadence are inputs; no clock/fs/net). Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(6)); }

/**
 * assessWindowIntegrity({ timestamps, windowStart, windowEnd, expectedIntervalMs, minCoverage?, maxGapFactor?, edgeToleranceMs? })
 * -> { verdict: TRUSTWORTHY|UNTRUSTWORTHY, coverageRatio, largestInteriorGap, leadingGap, trailingGap, monotonic, reasons }.
 * Fail-closed: missing window bound / empty / single-point / non-monotonic / interior gap / edge truncation ⇒ UNTRUSTWORTHY.
 */
function assessWindowIntegrity(input: any): any {
  const o = isObj(input) ? input : {};
  const ts = arr(o.timestamps).filter((t) => typeof t === "number" && isFinite(t));
  const ws = o.windowStart; const we = o.windowEnd;
  const reasons: string[] = [];
  if (typeof ws !== "number" || typeof we !== "number" || !(we > ws)) return untrust(["missing/invalid window bounds (need windowEnd > windowStart)"], { coverageRatio: null, largestInteriorGap: null, leadingGap: null, trailingGap: null, monotonic: null });
  if (ts.length < 2) return untrust([ts.length === 0 ? "empty series" : "single-point series — cannot assess interior coverage"], { coverageRatio: 0, largestInteriorGap: null, leadingGap: null, trailingGap: null, monotonic: ts.length <= 1 });

  const windowMs = we - ws;
  const expectedInterval = Math.max(1, num(o.expectedIntervalMs, Math.ceil(windowMs / ts.length)));
  const minCoverage = Math.min(1, Math.max(0, num(o.minCoverage, 0.95)));
  const maxGapFactor = Math.max(1, num(o.maxGapFactor, 2));
  const edgeTol = Math.max(0, num(o.edgeToleranceMs, expectedInterval));

  let monotonic = true;
  for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1]) { monotonic = false; break; }

  const first = ts[0]; const last = ts[ts.length - 1];
  const leadingGap = Math.max(0, first - ws);
  const trailingGap = Math.max(0, we - last);

  // uncovered time = Σ over consecutive gaps (incl. both edges) of max(0, gap − expectedInterval).
  let uncovered = Math.max(0, leadingGap - expectedInterval) + Math.max(0, trailingGap - expectedInterval);
  let largestInteriorGap = 0;
  for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g > largestInteriorGap) largestInteriorGap = g; uncovered += Math.max(0, g - expectedInterval); }
  const coverageRatio = round(Math.max(0, (windowMs - uncovered) / windowMs));

  if (!monotonic) reasons.push("timestamps are non-monotonic (out-of-order telemetry)");
  if (coverageRatio < minCoverage) reasons.push(`coverage ${coverageRatio} < minCoverage ${minCoverage} (temporal holes)`);
  if (largestInteriorGap > expectedInterval * maxGapFactor) reasons.push(`largest interior gap ${largestInteriorGap}ms > ${expectedInterval * maxGapFactor}ms (undefined range — OTel)`);
  if (leadingGap > edgeTol) reasons.push(`leading gap ${leadingGap}ms > tolerance ${edgeTol}ms (window start not covered)`);
  if (trailingGap > edgeTol) reasons.push(`trailing gap ${trailingGap}ms > tolerance ${edgeTol}ms (window end truncated / stale)`);

  const verdict = reasons.length === 0 ? "TRUSTWORTHY" : "UNTRUSTWORTHY";
  return Object.freeze({ verdict, coverageRatio, largestInteriorGap, leadingGap, trailingGap, monotonic, reasons: Object.freeze(reasons), note: verdict === "TRUSTWORTHY" ? "series covers the claimed window with no temporal gap beyond cadence" : "metric computed over this window is UNTRUSTWORTHY — incomplete data must not be reported as a trustworthy value" });
}

function untrust(reasons: string[], m: any): any { return Object.freeze({ verdict: "UNTRUSTWORTHY", coverageRatio: m.coverageRatio, largestInteriorGap: m.largestInteriorGap, leadingGap: m.leadingGap, trailingGap: m.trailingGap, monotonic: m.monotonic, reasons: Object.freeze(reasons), note: "fail-closed: cannot establish window coverage ⇒ UNTRUSTWORTHY" }); }

const METRIC_WINDOW_INTEGRITY_CONTRACT = Object.freeze({
  id: "V124-METRIC-WINDOW-INTEGRITY",
  source: "SÉRIE 23/W7 observability — metric window coverage / temporal-gap trust (OpenTelemetry Metrics Data Model; 2026 SLO completeness)",
  reuses: Object.freeze(["consumes dora-metrics transition timestamps + windowMs", "shares dataset-freshness-volume edge-staleness semantics", "shares integration-stream-reliability monotonicity notion", "missing precondition for p7-burn-rate-alert / dora-metrics trust"]),
  notAuthority: "a read-only trust verdict on a metric's window coverage; it computes no metric and takes no action",
  invariants: Object.freeze([
    "TRUSTWORTHY only when the series is monotonic AND coverageRatio ≥ minCoverage AND no interior gap beyond cadence×factor AND no edge truncation",
    "a temporal gap range is UNDEFINED (OpenTelemetry) — a metric over it is UNTRUSTWORTHY, never a silent pass",
    "fail-closed: missing window bound / empty / single-point / non-monotonic ⇒ UNTRUSTWORTHY with a reason",
    "pure/deterministic: window bounds + cadence are INPUTS; no clock, no fs, no network",
  ]),
});

module.exports = { assessWindowIntegrity, METRIC_WINDOW_INTEGRITY_CONTRACT };

if (require.main === module) {
  const holed = assessWindowIntegrity({ timestamps: [0, 10, 20, 980, 990, 1000], windowStart: 0, windowEnd: 1000, expectedIntervalMs: 10 });
  process.stdout.write(JSON.stringify({ ...METRIC_WINDOW_INTEGRITY_CONTRACT, demo: { verdict: holed.verdict, coverageRatio: holed.coverageRatio, largestInteriorGap: holed.largestInteriorGap } }, null, 2) + "\n");
}

export {};
