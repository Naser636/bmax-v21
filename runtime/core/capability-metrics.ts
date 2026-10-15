#!/usr/bin/env node

/*
 * P7 — Capability Metrics Engine (TypeScript port; parity with runtime/core/capability-metrics.js).
 *
 * Aggregates per-capability outcomes (recorded by P6 Capability Learning, shared autonomy-store list
 * "capability-outcomes") into usage / success / failure counts and a success rate, which P8 (Capability
 * Router) uses to prefer the highest-performing LOCAL capability.
 *
 * Strict TS port: the public exports (record, stats, successRate, best, OUTCOMES), signatures, return
 * shapes, tie-break (first candidate), unseen-capability-rates-0 and the autonomy-store dependency are
 * preserved EXACTLY. The historical .js remains the behavioural reference. `record` keeps its real
 * `new Date().toISOString()` timestamp and store write (unchanged, not injected).
 */

"use strict";

const store = require("./autonomy-store");

const OUTCOMES = "capability-outcomes";

function read(): any {
  return store.read(OUTCOMES, { version: 1, outcomes: [] });
}

// Directly record an outcome (for capabilities invoked outside the mission-learning path).
function record(capability: any, success: any): number {
  const db = read();
  db.outcomes.push({ capability, success: success === true, at: new Date().toISOString(), direct: true });
  store.write(OUTCOMES, db);
  return db.outcomes.length;
}

function stats(): any {
  const byCap: any = {};
  for (const o of read().outcomes) {
    const c = o.capability || "unknown";
    byCap[c] = byCap[c] || { capability: c, uses: 0, successes: 0, failures: 0, successRate: 0 };
    byCap[c].uses += 1;
    if (o.success) byCap[c].successes += 1;
    else byCap[c].failures += 1;
  }
  for (const c of Object.values(byCap) as any[]) c.successRate = c.uses ? c.successes / c.uses : 0;
  return byCap;
}

function successRate(capability: any): number {
  const s = stats()[capability];
  return s ? s.successRate : 0;
}

// Pick the capability with the highest success rate among the candidates. Ties break on the first
// candidate (stable). An unseen capability rates 0. Returns null for an empty candidate list.
function best(candidates: any): any {
  let winner = null;
  let rate = -1;
  for (const c of candidates || []) {
    const r = successRate(c);
    if (r > rate) { rate = r; winner = c; }
  }
  return winner;
}

module.exports = { record, stats, successRate, best, OUTCOMES };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal helpers (read) are
// MODULE-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API above is unchanged.
export {};
