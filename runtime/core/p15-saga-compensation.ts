#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (P15 excellence) — SAGA COMPENSATION. PURE, deterministic. World reference: the Saga pattern for long-lived
 * / distributed transactions (Garcia-Molina & Salem 1987; microservices orchestration) — when a multi-step transaction
 * fails at step N, the already-COMMITTED steps N−1…1 must be UNDONE by running their COMPENSATING actions in REVERSE
 * order, so the system is never left in a partially-applied state. ODG's P15 workflow-engine halts on failure
 * (PENDING_APPROVAL / FAILED) but did not COMPENSATE committed work. This adds saga compensation, fail-closed (a failed
 * compensation is surfaced, never swallowed). Complements workflow-engine; no new engine. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** runSaga(steps, opts) -> { status, committed, compensated, failedStep, compensationFailed }.
 * steps: [{ id, forward:(ctx)=>bool, compensate:(ctx)=>bool }]. forward returns true on success. On the first forward
 * failure, compensate the already-committed steps in REVERSE. status: COMMITTED | COMPENSATED | COMPENSATION_FAILED. */
function runSaga(steps: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const ctx = isObj(o.ctx) ? o.ctx : {};
  const ss = arr(steps).filter((s) => isObj(s) && typeof s.id === "string");
  const committed: string[] = [];
  let failedStep: string | null = null;

  for (const s of ss) {
    let ok = false;
    try { ok = typeof s.forward === "function" ? s.forward(ctx) === true : false; } catch { ok = false; }
    if (ok) committed.push(s.id);
    else { failedStep = s.id; break; }
  }

  if (failedStep === null) {
    return Object.freeze({ status: "COMMITTED", committed: Object.freeze(committed.slice()), compensated: Object.freeze([]), failedStep: null, compensationFailed: Object.freeze([]), note: "all forward steps committed" });
  }

  // compensate committed steps in REVERSE order.
  const byId: any = {}; for (const s of ss) byId[s.id] = s;
  const compensated: string[] = []; const compensationFailed: string[] = [];
  for (let i = committed.length - 1; i >= 0; i--) {
    const s = byId[committed[i]];
    let ok = false;
    try { ok = typeof s.compensate === "function" ? s.compensate(ctx) === true : false; } catch { ok = false; }
    if (ok) compensated.push(s.id); else compensationFailed.push(s.id);
  }
  const status = compensationFailed.length === 0 ? "COMPENSATED" : "COMPENSATION_FAILED";
  return Object.freeze({
    status, committed: Object.freeze(committed.slice()), compensated: Object.freeze(compensated),
    failedStep, compensationFailed: Object.freeze(compensationFailed),
    note: status === "COMPENSATION_FAILED"
      ? "a compensation FAILED — the system may be partially applied; fail-closed ALERT (manual intervention)"
      : "forward failed at a step; all committed steps compensated in reverse (consistent)",
  });
}

const P15_SAGA_CONTRACT = Object.freeze({
  id: "V124-P15-SAGA-COMPENSATION",
  source: "SÉRIE 14 P15 — Saga pattern compensation (Garcia-Molina & Salem 1987; microservices orchestration)",
  complements: "workflow-engine (adds compensation on failure, not a replacement)",
  notAuthority: "a pure saga orchestrator over injected forward/compensate callbacks; it performs no real side effect",
  invariants: Object.freeze([
    "on a forward failure at step N, committed steps N−1…1 are compensated in REVERSE order",
    "status COMMITTED (all forward ok) | COMPENSATED (failure, all committed undone) | COMPENSATION_FAILED (fail-closed alert)",
    "a failed compensation is SURFACED (compensationFailed), never swallowed — the system may be partially applied",
    "complements workflow-engine; no new engine; pure given injected callbacks",
  ]),
});

module.exports = { runSaga, P15_SAGA_CONTRACT };

if (require.main === module) {
  const demo = runSaga([
    { id: "reserve", forward: () => true, compensate: () => true },
    { id: "charge", forward: () => true, compensate: () => true },
    { id: "ship", forward: () => false, compensate: () => true },
  ]);
  process.stdout.write(JSON.stringify({ ...P15_SAGA_CONTRACT, demo }, null, 2) + "\n");
}

export {};
