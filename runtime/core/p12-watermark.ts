#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (P12 excellence) — EVENT-TIME WATERMARKS + LATE-EVENT POLICY. PURE, deterministic. World reference: Apache
 * Flink / Beam / the Dataflow model — correct stream processing uses EVENT-TIME WATERMARKS to bound out-of-orderness:
 * a watermark W(t) asserts "no event with timestamp < W is expected"; an event arriving with ts < W − allowedLateness
 * is LATE and must be dropped or side-outputted, never silently folded into a closed window. ODG's P12 reference
 * ordered + deduped by sequence but had no EVENT-TIME watermark / late-event policy. This adds it, fail-closed (too-late
 * ⇒ DROPPED). Complements profession-p12-streaming-reference; no new engine. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

/** process(events, {allowedLatenessMs}) -> { watermark, onTime, late, dropped, results }.
 * Watermark advances to (max event-time seen − allowedLateness) as events arrive in ARRIVAL order (ts = event time).
 * An event with ts < watermark is LATE; ts < watermark − allowedLateness is DROPPED (fail-closed, never processed late). */
function processEvents(events: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const allowed = Math.max(0, num(o.allowedLatenessMs, 0));
  const evs = arr(events).filter(isObj);
  let maxTs = -Infinity; let watermark = -Infinity;
  const results: any[] = []; let onTime = 0; let late = 0; let dropped = 0;
  for (const e of evs) {
    const ts = num(e.ts);
    // classify against the CURRENT watermark (before advancing for this event).
    let status: string;
    if (watermark === -Infinity) status = "ON_TIME";
    else if (ts >= watermark) status = "ON_TIME";
    else if (ts >= watermark - allowed) status = "LATE";        // within allowed lateness ⇒ accepted but flagged late
    else status = "DROPPED";                                     // too late ⇒ fail-closed drop
    if (status === "ON_TIME") onTime++; else if (status === "LATE") late++; else dropped++;
    results.push({ id: e.id, ts, status });
    // advance watermark from arrival order (bounded out-of-orderness).
    if (ts > maxTs) maxTs = ts;
    watermark = maxTs - allowed;
  }
  return Object.freeze({ allowedLatenessMs: allowed, finalWatermark: watermark === -Infinity ? null : watermark, onTime, late, dropped, results: Object.freeze(results) });
}

const P12_WATERMARK_CONTRACT = Object.freeze({
  id: "V124-P12-WATERMARK",
  source: "SÉRIE 14 P12 — event-time watermarks + late-event policy (Flink / Beam / Dataflow model)",
  complements: "profession-p12-streaming-reference (adds event-time watermarks, not a replacement)",
  notAuthority: "a pure watermark/late-event classifier; it consumes no real broker",
  invariants: Object.freeze([
    "watermark = max event-time seen − allowedLateness (bounded out-of-orderness)",
    "an event with ts < watermark is LATE; ts < watermark − allowedLateness is DROPPED (fail-closed, never processed as on-time)",
    "a too-late event is never silently folded into a closed window",
    "complements the P12 streaming reference; no new engine",
  ]),
});

module.exports = { processEvents, P12_WATERMARK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P12_WATERMARK_CONTRACT, demo: processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 20 }, { id: "c", ts: 12 }], { allowedLatenessMs: 5 }) }, null, 2) + "\n"); }

export {};
