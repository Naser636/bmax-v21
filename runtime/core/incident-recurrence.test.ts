#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * INCIDENT RECURRENCE (§V-B recurrence detection) — hermetic unit proof. PURE: synthetic ledgers + an
 * INJECTED store ⇒ NO fs / autonomy-store / clock / network. Proves the explicit recurrence signal derived
 * from the existing incident ledger: NONE (empty), NO_RECURRENCE (all first-time), RECURRENCE (attempts>1),
 * FROZEN_LOOP (an oscillating/frozen incident), deterministic ranking (most-recurring first), and a
 * fail-closed load (store throws ⇒ empty NONE, never throws).
 *
 * Run: node runtime/core/incident-recurrence.test.js   (or via tsx under `npm test`)
 */

const path = require("path");
const REPO = process.cwd();
const { analyzeRecurrence, loadRecurrence, recordFor } = require(path.join(REPO, "runtime", "core", "incident-recurrence.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("INCIDENT RECURRENCE (§V-B) — hermetic unit proof");

// (1) empty / malformed ledger ⇒ NONE, well-formed
check(analyzeRecurrence({ incidents: {} }).verdict === "NONE" && analyzeRecurrence({ incidents: {} }).records.length === 0, "empty ledger ⇒ NONE, 0 records");
check(analyzeRecurrence(null).verdict === "NONE" && analyzeRecurrence({}).verdict === "NONE", "malformed ledger ⇒ NONE (fail-closed, well-formed)");

// (2) all first-time incidents (attempts===1) ⇒ NO_RECURRENCE
const freshLedger = { incidents: {
  A: { id: "A", attempts: 1, maxAttempts: 3, status: "OPEN", severity: "ERROR", createdAt: 100, updatedAt: 100, mission: "M1" },
  B: { id: "B", attempts: 1, maxAttempts: 3, status: "OPEN", severity: "CRITICAL", createdAt: 100, updatedAt: 100, mission: "M1" },
} };
const fresh = analyzeRecurrence(freshLedger);
check(fresh.verdict === "NO_RECURRENCE" && fresh.summary.recurring === 0 && fresh.summary.total === 2, "all attempts===1 ⇒ NO_RECURRENCE (0 recurring)");
check(fresh.records.every((r) => r.recurring === false && r.spannedUpdates === false), "first-time incidents: recurring=false, spannedUpdates=false");

// (3) a recurring incident (attempts>1, createdAt<updatedAt) ⇒ RECURRENCE
const recurLedger = { incidents: {
  A: { id: "A", attempts: 1, maxAttempts: 3, status: "OPEN", severity: "ERROR", createdAt: 100, updatedAt: 100 },
  R: { id: "R", attempts: 2, maxAttempts: 3, status: "OPEN", severity: "ERROR", createdAt: 100, updatedAt: 250 },
} };
const recur = analyzeRecurrence(recurLedger);
check(recur.verdict === "RECURRENCE" && recur.summary.recurring === 1, "attempts>1 ⇒ RECURRENCE (1 recurring)");
const rRec = recur.records.find((r) => r.id === "R");
check(rRec.recurring === true && rRec.spannedUpdates === true && rRec.firstSeen === 100 && rRec.lastSeen === 250, "recurring incident: recurring+spannedUpdates true, first/last seen preserved");
check(recur.records[0].id === "R", "ranking: most-recurring incident (R, attempts 2) ranked first");

// (4) a FROZEN (oscillating) incident ⇒ FROZEN_LOOP dominates the verdict
const frozenLedger = { incidents: {
  R: { id: "R", attempts: 2, maxAttempts: 5, status: "OPEN", severity: "ERROR", createdAt: 1, updatedAt: 9 },
  F: { id: "F", attempts: 5, maxAttempts: 5, status: "FROZEN", severity: "CRITICAL", createdAt: 1, updatedAt: 50 },
} };
const frz = analyzeRecurrence(frozenLedger);
check(frz.verdict === "FROZEN_LOOP" && frz.summary.frozen === 1 && frz.summary.maxAttempts === 5, "a FROZEN incident ⇒ FROZEN_LOOP (loop protection surfaced)");
check(frz.records[0].id === "F" && frz.records[0].oscillating === true, "ranking: the frozen/most-recurring incident first; oscillating=true");
check(frz.summary.topRecurring.length === 2 && frz.summary.topRecurring[0].id === "F", "summary.topRecurring lists recurring incidents, most first");

// (5) loadRecurrence with an injected store (fail-closed + real analyze path)
const okStore = { read: () => recurLedger };
check(loadRecurrence({ store: okStore }).verdict === "RECURRENCE", "loadRecurrence reads the injected ledger ⇒ RECURRENCE");
const throwStore = { read: () => { throw new Error("store unavailable"); } };
check(loadRecurrence({ store: throwStore }).verdict === "NONE", "loadRecurrence store-throws ⇒ NONE (fail-closed, never throws)");

// (6) recordFor — the per-incident OBSERVED record (operational-coherence helper for odg triage)
const analysis = analyzeRecurrence(frozenLedger);
check(recordFor(analysis, "F") && recordFor(analysis, "F").oscillating === true && recordFor(analysis, "F").attempts === 5, "recordFor('F') ⇒ the FROZEN record (attempts 5, oscillating) — same observed fact the summary surfaces");
check(recordFor(analysis, "NOPE") === null && recordFor(null, "F") === null && recordFor(analysis, "") === null, "recordFor: unknown id / null analysis / empty id ⇒ null (fail-closed)");

console.log(failures === 0 ? "ALL PASS — incident-recurrence" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
