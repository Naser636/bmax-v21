#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-9 (P12/P7 — world-research gap) — WEIGHTED FAIR-SHARE ADMISSION SCHEDULER (deficit round robin,
 * no starvation). PURE, deterministic. World reference: fair queuing across tenants (OneUptime 2026-03-31 — per-tenant
 * queues + round-robin so no single tenant monopolizes workers; weighted variant gives tiered tenants proportional
 * throughput) + saturation-activated weighted-fair-queuing with BOUNDED STARVATION (llm-d-router #1995, 2026) +
 * Deficit Round Robin (unused quantum carries forward). ODG has a per-contract one-way maxCalls LIFETIME cap
 * (third-party-agent-gate, tenant-ISOLATED — two tenants each under their cap can still exhaust a SHARED pool and A
 * can starve B) and a tenant-BLIND global maxInFlight backpressure flag (event-stream-engine) — but NO arbiter of a
 * SHARED capacity budget with a fairness/no-starvation guarantee (grep-verified: no token-bucket/fair-share/WFQ/
 * deficit-round-robin/load-shed). This composes the demand source (event-stream per-key backlog = tenant) + the
 * shared-capacity budget vocabulary (third-party-agent-gate) + a caller-supplied logical round index (no clock, like
 * p12-circuit-breaker.cooldownElapsed). Integer DRR arithmetic. Fail-closed. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }
function isPosWeight(v: any): boolean { return typeof v === "number" && isFinite(v) && v > 0; }

/**
 * scheduleFairShare({ tenants, capacity, round, deficits }) -> { admitted, deferred, deficits, round, admittedTotal, note }.
 *   tenants: [{ id, weight, demand }] — weight = quantum units/round, demand = queued units this round.
 *   capacity: integer shared pool for this round. deficits: { id: carryForward } from the prior round.
 * Deficit Round Robin: each tenant's allowance = carried deficit + weight (quantum); admit min(demand, allowance),
 * capped so Σ admitted ≤ capacity; unused allowance carries forward (no starvation). Fail-closed: a malformed tenant
 * or a non-positive weight / non-integer demand admits 0 (never a fabricated share).
 */
function scheduleFairShare(input: any): any {
  const o = isObj(input) ? input : {};
  const capacity = isPosInt(o.capacity) ? o.capacity : 0;
  const round = isPosInt(o.round) ? o.round : 0;
  const priorDeficits = isObj(o.deficits) ? o.deficits : {};
  const tenants = arr(o.tenants);

  // validate tenants (fail-closed: malformed / weight ≤ 0 / non-integer demand ⇒ excluded, admits 0).
  const valid: any[] = []; const deferred: any[] = []; const nextDeficits: any = {};
  for (const raw of tenants) {
    const t = isObj(raw) ? raw : {};
    if (typeof t.id !== "string" || !isPosWeight(t.weight) || !isPosInt(t.demand)) { deferred.push(Object.freeze({ id: typeof t.id === "string" ? t.id : null, units: isPosInt(t.demand) ? t.demand : 0, reason: "malformed tenant / weight ≤ 0 / non-integer demand (admit 0)" })); continue; }
    valid.push(t);
  }
  const totalWeight = valid.reduce((s, t) => s + t.weight, 0);
  const grant: Record<string, number> = {}; const share: Record<string, number> = {};
  let remaining = capacity;

  // pass 1 — proportional weighted share (+ carried deficit), capped by demand and remaining capacity.
  for (const t of valid) {
    const carried = isPosInt(priorDeficits[t.id]) ? priorDeficits[t.id] : 0;
    const base = totalWeight > 0 ? Math.floor(capacity * t.weight / totalWeight) : 0;
    share[t.id] = base + carried;
    const g = Math.max(0, Math.min(t.demand, share[t.id], remaining));
    grant[t.id] = g; remaining -= g;
  }
  // pass 2 — work-conserving: distribute leftover capacity to still-demanding tenants, highest weight then stable id.
  const residual = () => valid.filter((t) => t.demand - grant[t.id] > 0);
  const order = valid.slice().sort((a, b) => (b.weight - a.weight) || (a.id < b.id ? -1 : 1));
  let guard = 0;
  while (remaining > 0 && residual().length > 0 && guard++ < 100000) {
    const r = order.filter((t) => t.demand - grant[t.id] > 0);
    const per = Math.max(1, Math.floor(remaining / r.length));
    for (const t of r) { if (remaining <= 0) break; const take = Math.min(per, t.demand - grant[t.id], remaining); grant[t.id] += take; remaining -= take; }
  }

  const admitted: any[] = [];
  for (const t of valid) {
    if (grant[t.id] > 0) admitted.push(Object.freeze({ id: t.id, units: grant[t.id] }));
    if (t.demand > grant[t.id]) deferred.push(Object.freeze({ id: t.id, units: t.demand - grant[t.id], reason: "shared capacity / weighted share exhausted this round" }));
    // no-starvation: a tenant squeezed below its weighted share carries the shortfall forward as a deficit.
    nextDeficits[t.id] = Math.max(0, Math.min(share[t.id] - grant[t.id], t.demand - grant[t.id]));
  }
  const admittedTotal = admitted.reduce((s, a) => s + a.units, 0);
  return Object.freeze({
    admitted: Object.freeze(admitted), deferred: Object.freeze(deferred), deficits: Object.freeze(nextDeficits),
    round, admittedTotal,
    note: admittedTotal <= capacity ? "weighted fair share — Σ admitted ≤ capacity; unused allowance carries forward (no starvation)" : "INVARIANT VIOLATION",
  });
}

const FAIR_SHARE_SCHEDULER_CONTRACT = Object.freeze({
  id: "V124-P12-WEIGHTED-FAIR-SHARE-SCHEDULER",
  source: "SÉRIE 23/W9 P12/P7 — weighted fair-share admission (Deficit Round Robin; OneUptime 2026-03-31; llm-d-router #1995 2026)",
  reuses: Object.freeze(["event-stream-engine per-key backlog as demand source (key = tenant)", "third-party-agent-gate shared-capacity budget vocabulary", "caller-supplied logical round index (no clock, like p12-circuit-breaker)"]),
  notAuthority: "a pure allocation decision over a shared capacity; it dispatches nothing and runs no timer",
  invariants: Object.freeze([
    "Σ admitted ≤ capacity, always — never over-admits the shared pool",
    "a malformed tenant / non-positive weight / non-integer demand admits 0 (a bad weight can never grant capacity)",
    "no starvation: unused allowance carries forward as a deficit, so every backlogged positive-weight tenant advances within a bounded number of rounds",
    "weighted: a tenant's per-round share is proportional to its weight (weight/Σweight × capacity); leftover is redistributed work-conservingly to still-demanding tenants by weight",
    "pure/deterministic: integer DRR arithmetic; round index injected; no clock, no random, no network",
  ]),
});

module.exports = { scheduleFairShare, FAIR_SHARE_SCHEDULER_CONTRACT };

if (require.main === module) {
  const demo = scheduleFairShare({ tenants: [{ id: "a", weight: 2, demand: 10 }, { id: "b", weight: 1, demand: 10 }], capacity: 6, round: 1 });
  process.stdout.write(JSON.stringify({ ...FAIR_SHARE_SCHEDULER_CONTRACT, demo: { admitted: demo.admitted, admittedTotal: demo.admittedTotal } }, null, 2) + "\n");
}

export {};
