#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V73 Lot A — RESOURCE METER. Measures the REALLY-measurable local resources of a run: wall-clock, CPU
 * (user/system), RSS and heap-used delta — basis OBSERVED. Tokens and monetary cost stay NOT_MEASURED (no local model-
 * call/billing meter): the meter never fabricates a price or a token count. It wraps a thunk without changing its logic
 * (a measurement wrapper, not a new engine). Dual export. meter(fn) runs fn and returns {result, resources}.
 */

function isFn(v: any): boolean { return typeof v === "function"; }

/* meter(fn) -> { result, resources }. resources: OBSERVED wall/cpu/memory; tokens/monetary NOT_MEASURED. */
function meter(fn: any): any {
  if (!isFn(fn)) return { ok: false, reason: "meter(fn): a function is required" };
  const c0 = process.cpuUsage();
  const m0 = process.memoryUsage();
  const t0 = Date.now();
  let result: any, threw: any = null;
  try { result = fn(); } catch (e: any) { threw = e && e.message ? e.message : String(e); }
  const wallMs = Date.now() - t0;
  const c1 = process.cpuUsage(c0);
  const m1 = process.memoryUsage();
  return {
    ok: threw === null, error: threw, result,
    resources: Object.freeze({
      wallMs: { value: wallMs, unit: "ms", basis: "OBSERVED" },
      cpuUserMs: { value: Number((c1.user / 1000).toFixed(3)), unit: "ms", basis: "OBSERVED" },
      cpuSystemMs: { value: Number((c1.system / 1000).toFixed(3)), unit: "ms", basis: "OBSERVED" },
      rssBytes: { value: m1.rss, unit: "bytes", basis: "OBSERVED" },
      heapUsedDeltaBytes: { value: m1.heapUsed - m0.heapUsed, unit: "bytes", basis: "OBSERVED" },
      modelCalls: { value: null, basis: "NOT_MEASURED", reason: "no model-call meter in a local pure-compute run" },
      tokens: { value: null, basis: "NOT_MEASURED", reason: "no token meter locally" },
      monetaryEur: { value: null, basis: "NOT_MEASURED", reason: "no measured consumption × reliable tariff ⇒ never fabricated" },
    }),
  };
}

/* meterN(fn, n) -> aggregate over n runs: min/median/max wallMs (reproducibility of the MEASUREMENT, not the value). */
function meterN(fn: any, n: any): any {
  const runs = Math.max(1, Math.floor(typeof n === "number" ? n : 1));
  const walls: number[] = [];
  let last: any = null;
  for (let i = 0; i < runs; i++) { last = meter(fn); walls.push(last.resources.wallMs.value); }
  walls.sort((a, b) => a - b);
  return Object.freeze({ runs, last, wallMsMin: walls[0], wallMsMedian: walls[Math.floor(walls.length / 2)], wallMsMax: walls[walls.length - 1], basis: "OBSERVED" });
}

const RESOURCE_METER_CONTRACT = Object.freeze({
  id: "V73-RESOURCE-METER", source: "CTO V73 Lot A — real local resource instrumentation",
  measures: Object.freeze(["wallMs", "cpuUserMs", "cpuSystemMs", "rssBytes", "heapUsedDeltaBytes"]),
  notMeasured: Object.freeze(["modelCalls", "tokens", "monetaryEur"]),
  notAuthority: "a measurement wrapper; it changes no logic and fabricates no price/token",
  invariants: Object.freeze([
    "OBSERVED only for wall/cpu/memory which the OS really reports; tokens/monetary stay NOT_MEASURED (never fabricated)",
    "measurement distinguishes OBSERVED from NOT_MEASURED; monetary requires measured-consumption × reliable-tariff, else NOT_MEASURED",
    "wraps a thunk without altering its behaviour; instrumentation overhead acknowledged",
  ]),
});

module.exports = { meter, meterN, RESOURCE_METER_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(RESOURCE_METER_CONTRACT, null, 2) + "\n"); }
export {};
