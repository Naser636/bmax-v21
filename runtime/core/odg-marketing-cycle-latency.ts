#!/usr/bin/env node
"use strict";
/*
 * MARKETING CYCLE LATENCY — measure the time between a detected opportunity, a decision, a production, and an
 * observable result, and flag the bottleneck stage. PURE, deterministic, fail-closed, clock-free (caller supplies
 * the recorded timestamps). MODEL-ONLY / MEASURE-ONLY.
 *
 * THE GAP (reconciled): odg-speed-marketing-chain (segment→fit→funnel) and odg-opportunity-5m-bridge model FIT and
 * ECONOMICS but measure NO time; odg-dora-metrics-view measures CODE lead-time, not the marketing chain. V324 §12
 * asks to "mesurer le délai entre une opportunité détectée, une décision, une production et un résultat observable".
 * This computes those leg durations + the end-to-end total and names the slowest leg.
 *
 * Honesty (mirrors odg-speed-marketing-chain.honest): it measures ONLY the supplied/recorded timestamps of MODEL
 * stages. A "result observed" timestamp is a RECORDED EVENT — NEVER a qualified client, a sale, or realized revenue.
 * SHORTER LATENCY IS NOT A BETTER OUTCOME (speed ≠ quality/conversion). A missing / unparseable / out-of-order
 * timestamp ⇒ that leg is UNDETERMINED (fail-closed) — never a fabricated or negative duration. No blended "speed score".
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function toMs(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}
const DAY_MS = 86400000;
function days(ms: number): number { return Number((ms / DAY_MS).toFixed(3)); }

// The four model stages (V324 §12), in order. A leg spans two consecutive stages.
const STAGES = Object.freeze(["opportunityDetectedAt", "decidedAt", "producedAt", "resultObservedAt"]);
const LEGS = Object.freeze([
  { name: "detect_to_decide", from: "opportunityDetectedAt", to: "decidedAt" },
  { name: "decide_to_produce", from: "decidedAt", to: "producedAt" },
  { name: "produce_to_result", from: "producedAt", to: "resultObservedAt" },
]);

function legOf(name: string, from: any, to: any): any {
  const a = toMs(from), b = toMs(to);
  if (a === null || b === null) return freeze({ name, ms: null, days: null, status: "UNDETERMINED", reason: "a boundary timestamp is missing or unparseable" });
  if (b < a) return freeze({ name, ms: null, days: null, status: "INVALID_ORDER", reason: "end timestamp precedes start (out-of-order) — not a negative duration" });
  return freeze({ name, ms: b - a, days: days(b - a), status: "OK" });
}

/**
 * chainLatency(timestamps) -> { ok, legs[], totalMs, totalDays, totalStatus, bottleneck, note }.
 *   timestamps: { opportunityDetectedAt, decidedAt, producedAt, resultObservedAt } (ISO strings or epoch ms).
 * Each leg is OK / UNDETERMINED / INVALID_ORDER. total is the detect→result span (UNDETERMINED unless both ends
 * resolve in order). bottleneck is the slowest OK leg (null if none). Fail-closed on a non-object input.
 */
function chainLatency(timestamps: any): any {
  if (!isObj(timestamps)) return freeze({ ok: false, code: "BAD_INPUT", detail: "timestamps must be an object { opportunityDetectedAt, decidedAt, producedAt, resultObservedAt }" });
  const legs = LEGS.map((l) => legOf(l.name, timestamps[l.from], timestamps[l.to]));

  const start = toMs(timestamps.opportunityDetectedAt), end = toMs(timestamps.resultObservedAt);
  let totalMs: number | null = null, totalStatus = "UNDETERMINED";
  if (start !== null && end !== null) {
    if (end < start) totalStatus = "INVALID_ORDER";
    else { totalMs = end - start; totalStatus = "OK"; }
  }

  const okLegs = legs.filter((l: any) => l.status === "OK");
  // bottleneck = slowest OK leg; ties broken by earliest stage order (stable — legs are already in order).
  let bottleneck: any = null;
  for (const l of okLegs) if (bottleneck === null || l.ms > bottleneck.ms) bottleneck = l;

  return freeze({
    ok: true,
    legs: freeze(legs),
    totalMs,
    totalDays: totalMs === null ? null : days(totalMs),
    totalStatus,
    bottleneck: bottleneck ? freeze({ name: bottleneck.name, ms: bottleneck.ms, days: bottleneck.days }) : null,
    note: "MODEL-ONLY latency of recorded stage timestamps. A 'result observed' timestamp is a RECORDED EVENT, NEVER a qualified client, a sale, or realized revenue; SHORTER LATENCY IS NOT A BETTER OUTCOME (speed ≠ conversion/quality). Missing/unparseable/out-of-order ⇒ UNDETERMINED/INVALID_ORDER (never a fabricated or negative duration). No blended speed score.",
  });
}

/**
 * cycleLatencyStats(cycles) -> { ok, total, determinable, medianTotalDays, meanTotalDays, bottleneckFrequency, note }.
 * Aggregate over cycles, each `cycles[i]` a timestamps object. Statistics are over DETERMINABLE cycles ONLY (total
 * resolved OK) — explicit denominator, NO blended speed score. bottleneckFrequency counts the slowest-leg name per
 * determinable cycle.
 */
function cycleLatencyStats(cycles: any): any {
  if (!Array.isArray(cycles)) return freeze({ ok: false, code: "BAD_INPUT", detail: "cycles must be an array of timestamp objects" });
  const results = cycles.map((c) => chainLatency(c));
  const determinable = results.filter((r: any) => r.ok && r.totalStatus === "OK");
  const totalsDays = determinable.map((r: any) => r.totalDays).sort((a: number, b: number) => a - b);
  const median = totalsDays.length === 0 ? null
    : totalsDays.length % 2 === 1 ? totalsDays[(totalsDays.length - 1) / 2]
      : Number(((totalsDays[totalsDays.length / 2 - 1] + totalsDays[totalsDays.length / 2]) / 2).toFixed(3));
  const mean = totalsDays.length === 0 ? null : Number((totalsDays.reduce((a: number, b: number) => a + b, 0) / totalsDays.length).toFixed(3));
  const bottleneckFrequency: Record<string, number> = {};
  for (const r of determinable) if (r.bottleneck) bottleneckFrequency[r.bottleneck.name] = (bottleneckFrequency[r.bottleneck.name] || 0) + 1;

  return freeze({
    ok: true,
    total: results.length,
    determinable: determinable.length,
    medianTotalDays: median,
    meanTotalDays: mean,
    bottleneckFrequency: freeze(bottleneckFrequency),
    note: "statistics over DETERMINABLE cycles ONLY (total latency resolved in order); non-determinable cycles are excluded from the denominator, never imputed. Latency is time, NOT outcome quality — a faster chain is not a better one; no blended speed score.",
  });
}

const MARKETING_CYCLE_LATENCY_CONTRACT = Object.freeze({
  id: "MARKETING-CYCLE-LATENCY",
  purpose: "measure the opportunity→decision→production→result marketing cycle time and name the bottleneck leg (V324 §12) — the time dimension odg-speed-marketing-chain / odg-opportunity-5m-bridge / DORA (code-only) do not cover",
  reuses: Object.freeze(["mirrors odg-speed-marketing-chain's MODEL-ONLY honesty discipline; complements its fit/economics (which measure no time)"]),
  invariants: Object.freeze([
    "measures ONLY supplied/recorded timestamps of MODEL stages — a 'result observed' is a RECORDED EVENT, NEVER a qualified client, a sale, or realized revenue",
    "SHORTER LATENCY IS NOT A BETTER OUTCOME — speed ≠ conversion/quality; there is NO blended speed score",
    "a missing / unparseable / out-of-order timestamp ⇒ UNDETERMINED / INVALID_ORDER (fail-closed) — never a fabricated or negative duration",
    "the bottleneck is the slowest OK leg (null if none); aggregate statistics are over DETERMINABLE cycles ONLY (explicit denominator, never imputed)",
    "PURE/deterministic/frozen/clock-free (caller supplies timestamps); accepts ISO strings or epoch ms",
  ]),
});

module.exports = { chainLatency, cycleLatencyStats, STAGES, MARKETING_CYCLE_LATENCY_CONTRACT };
export {};
