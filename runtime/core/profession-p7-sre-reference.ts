#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P7 — SRE/Distributed/Performance reference project (E2 executed + E3 adversarial/chaos). PURE,
 * deterministic. Over a CLEARLY-LABELLED SYNTHETIC latency series + incident timeline it computes latency percentiles
 * (p50/p95/p99), SLO compliance (latency + availability), and a chaos/recovery drill (RTO/RPO) — the real SRE signals.
 * Synthetic only; real production telemetry (E5) is owner-gated NOT_RUN. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** percentiles(latencies) -> { p50, p95, p99, max, count }. Deterministic nearest-rank. */
function percentiles(latencies: any): any {
  const xs = arr(latencies).filter((n: any) => typeof n === "number" && isFinite(n)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return Object.freeze({ p50: null, p95: null, p99: null, max: null, count: 0 });
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)];
  return Object.freeze({ p50: at(0.5), p95: at(0.95), p99: at(0.99), max: xs[xs.length - 1], count: xs.length });
}

/** evaluateSLO(latencies, slo) -> { compliant, p99, availability, errorBudgetBurn }. */
function evaluateSLO(latencies: any, slo: any): any {
  const s = isObj(slo) ? slo : {};
  const p = percentiles(latencies);
  const targetP99 = num(s.targetP99Ms, Infinity);
  const availability = num(s.observedAvailability, 1);
  const availabilityTarget = num(s.availabilityTarget, 0.99);
  const latencyOk = p.p99 !== null && p.p99 <= targetP99;
  const availabilityOk = availability >= availabilityTarget;
  const errorBudget = 1 - availabilityTarget;
  const burn = errorBudget > 0 ? round((1 - availability) / errorBudget) : 0;
  return Object.freeze({ compliant: latencyOk && availabilityOk, latencyOk, availabilityOk, p99: p.p99, availability, errorBudgetBurn: burn });
}

/** chaosRecovery(incident) -> { rto, rpo, withinRto, withinRpo }. RTO=recover-fail; RPO=lastGoodCheckpoint gap. */
function chaosRecovery(incident: any): any {
  const i = isObj(incident) ? incident : {};
  const rto = num(i.recoveredAt) - num(i.failedAt);
  const rpo = num(i.failedAt) - num(i.lastCheckpointAt);
  return Object.freeze({ rto, rpo, withinRto: rto <= num(i.rtoTargetMs, Infinity), withinRpo: rpo <= num(i.rpoTargetMs, Infinity), recovered: num(i.recoveredAt) > num(i.failedAt) });
}

/** runReferenceProject({latencies, slo, incident}) -> E2/E3 result (measured, reproducible). */
function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const latencies = arr(o.latencies).length ? o.latencies : Array.from({ length: 100 }, (_, k) => 10 + (k % 20));
  const slo = isObj(o.slo) ? o.slo : { targetP99Ms: 100, observedAvailability: 0.999, availabilityTarget: 0.99 };
  const sloResult = evaluateSLO(latencies, slo);
  const chaos = o.incident ? chaosRecovery(o.incident) : null;
  const degraded = !sloResult.compliant || (chaos && (!chaos.withinRto || !chaos.recovered));
  return Object.freeze({
    synthetic: true, profession: "P7",
    percentiles: percentiles(latencies), slo: sloResult, chaos,
    level: chaos ? "E3" : "E2", degraded: !!degraded,
    note: "SYNTHETIC latency/incident data (not real production telemetry, not E5); p50/p95/p99 + SLO + chaos RTO/RPO; real prod telemetry (E5) owner-gated NOT_RUN",
  });
}

const P7_SRE_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P7-SRE-REFERENCE",
  source: "V12.4 §43 P7 (SRE/Distributed/Performance) — E2 reference + E3 chaos/recovery",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  notAuthority: "a runnable SRE reference over SYNTHETIC telemetry; no real production run, no E5 claim",
  invariants: Object.freeze([
    "SYNTHETIC telemetry only; real production (E5) owner-gated NOT_RUN (no inflated level)",
    "latency percentiles p50/p95/p99 + SLO (latency+availability) + chaos RTO/RPO measured deterministically",
    "degradation flagged (SLO breach or failed/slow recovery); reproducible",
    "pure/deterministic",
  ]),
});

module.exports = { percentiles, evaluateSLO, chaosRecovery, runReferenceProject, P7_SRE_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P7_SRE_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
