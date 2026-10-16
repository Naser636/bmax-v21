#!/usr/bin/env node
"use strict";

/*
 * INCIDENT RECURRENCE — an explicit, read-only recurrence signal over the EXISTING self-diagnostic incident
 * ledger (autonomy-store key "self-diagnostic-incidents").
 *
 * ROOT CAUSE this closes (§V-B surface "root-cause intelligence & recurrence detection"): the ledger already
 * carries `attempts` (same stableId raised again ⇒ OPEN→FROZEN loop protection) and `createdAt`/`updatedAt`,
 * but the RECURRENCE fact is IMPLICIT — no consumer computes or surfaces "this incident keeps coming back".
 * The §V learning loop needs that signal to know whether a fix actually HELD (EFFECTIVE) or the same root
 * cause recurred. This module makes it explicit WITHOUT changing the dual-ported self-diagnostic or its
 * ledger record: it is a pure READ-MODEL over the ledger the writer already maintains.
 *
 * Pure core (analyzeRecurrence) — no fs/clock/network; the only I/O (loadRecurrence) is an INJECTABLE,
 * fail-closed read of the existing store. Creates NO new store, writer, or primitive; never mutates.
 */

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

const SEVERITY_RANK = { CRITICAL: 0, ERROR: 1 };

// analyzeRecurrence(ledger) — PURE. Derive per-incident recurrence facts + a summary verdict from the
// ledger { incidents: { [id]: incident } }. A malformed/empty ledger ⇒ an empty, well-formed result.
function analyzeRecurrence(ledger) {
  const incidents = ledger && isPlainObject(ledger.incidents) ? Object.values(ledger.incidents) : [];
  const records = incidents
    .filter((i) => isPlainObject(i) && typeof i.id === "string")
    .map((i) => {
      const attempts = Number.isInteger(i.attempts) ? i.attempts : (i.attempts ? Number(i.attempts) : 0);
      const createdAt = i.createdAt != null ? i.createdAt : null;
      const updatedAt = i.updatedAt != null ? i.updatedAt : null;
      return {
        id: i.id,
        mission: i.mission != null ? i.mission : null,
        attempts,
        maxAttempts: Number.isInteger(i.maxAttempts) ? i.maxAttempts : null,
        status: typeof i.status === "string" ? i.status : null,
        severity: typeof i.severity === "string" ? i.severity : null,
        recurring: attempts > 1,                              // raised more than once ⇒ it came back
        oscillating: i.status === "FROZEN",                   // hit the attempt ceiling ⇒ repeating/oscillating
        firstSeen: createdAt,
        lastSeen: updatedAt,
        spannedUpdates: createdAt != null && updatedAt != null && createdAt !== updatedAt, // recurred over time
      };
    })
    // most-recurring first; ties broken by severity (CRITICAL first) then id for determinism.
    .sort((a, b) =>
      b.attempts - a.attempts ||
      ((SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)) ||
      String(a.id).localeCompare(String(b.id)));

  const recurring = records.filter((r) => r.recurring);
  const frozen = records.filter((r) => r.oscillating);
  const verdict =
    records.length === 0 ? "NONE" :
    frozen.length > 0 ? "FROZEN_LOOP" :
    recurring.length > 0 ? "RECURRENCE" :
    "NO_RECURRENCE";

  return {
    verdict,
    summary: {
      total: records.length,
      recurring: recurring.length,
      frozen: frozen.length,
      maxAttempts: records.reduce((m, r) => Math.max(m, r.attempts), 0),
      topRecurring: recurring.slice(0, 3).map((r) => ({ id: r.id, attempts: r.attempts, status: r.status })),
    },
    records,
  };
}

// loadRecurrence(opts) — read the EXISTING incident ledger (injectable store; defaults to autonomy-store)
// and analyze it. Fail-closed: any read failure ⇒ an empty, well-formed NONE result (never throws).
function loadRecurrence(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const INCIDENTS_FILE = "self-diagnostic-incidents"; // the SAME key self-diagnostic.raiseIncident writes.
  let ledger = { incidents: {} };
  try {
    const store = o.store || require("./autonomy-store");
    ledger = store.read(INCIDENTS_FILE, { incidents: {} }) || { incidents: {} };
  } catch {
    ledger = { incidents: {} };
  }
  return analyzeRecurrence(ledger);
}

module.exports = { analyzeRecurrence, loadRecurrence };

// Read-only CLI: print the current recurrence signal; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify(loadRecurrence({}), null, 2) + "\n");
}
