#!/usr/bin/env node

/*
 * P7 — Capability Metrics Engine.
 *
 * Aggregates the per-capability outcomes recorded by P6 (Capability Learning) into usage / success
 * / failure counts and a success rate. These metrics are what P8 (Capability Router) uses to prefer
 * the highest-performing LOCAL capability before ever considering external AI.
 *
 * Reads/writes the SAME shared autonomy-store list P6 writes ("capability-outcomes") — no duplicate
 * store, no new format.
 */

"use strict";

const store = require("./autonomy-store");

const OUTCOMES = "capability-outcomes";

function read() {
    return store.read(OUTCOMES, { version: 1, outcomes: [] });
}

// Directly record an outcome (for capabilities invoked outside the mission-learning path).
function record(capability, success) {
    const db = read();
    db.outcomes.push({ capability, success: success === true, at: new Date().toISOString(), direct: true });
    store.write(OUTCOMES, db);
    return db.outcomes.length;
}

function stats() {
    const byCap = {};
    for (const o of read().outcomes) {
        const c = o.capability || "unknown";
        byCap[c] = byCap[c] || { capability: c, uses: 0, successes: 0, failures: 0, successRate: 0 };
        byCap[c].uses += 1;
        if (o.success) byCap[c].successes += 1;
        else byCap[c].failures += 1;
    }
    for (const c of Object.values(byCap)) c.successRate = c.uses ? c.successes / c.uses : 0;
    return byCap;
}

function successRate(capability) {
    const s = stats()[capability];
    return s ? s.successRate : 0;
}

// Pick the capability with the highest success rate among the candidates. Ties break on the first
// candidate (stable). An unseen capability rates 0. Returns null for an empty candidate list.
function best(candidates) {
    let winner = null;
    let rate = -1;
    for (const c of candidates || []) {
        const r = successRate(c);
        if (r > rate) { rate = r; winner = c; }
    }
    return winner;
}

module.exports = { record, stats, successRate, best, OUTCOMES };
