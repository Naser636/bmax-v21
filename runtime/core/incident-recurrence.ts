#!/usr/bin/env node
"use strict";

/*
 * INCIDENT RECURRENCE — TypeScript port; parity with runtime/core/incident-recurrence.js.
 *
 * An explicit, read-only recurrence signal over the EXISTING self-diagnostic incident ledger (autonomy-store
 * key "self-diagnostic-incidents"). The ledger already carries `attempts`/`createdAt`/`updatedAt`, but the
 * RECURRENCE fact is IMPLICIT. This module makes it explicit WITHOUT changing the self-diagnostic writer or
 * its ledger record: it is a pure READ-MODEL over the ledger the writer already maintains.
 *
 * Pure core (analyzeRecurrence) — no fs/clock/network; the only I/O (loadRecurrence) is an INJECTABLE,
 * fail-closed read of the existing store. Creates NO new store, writer, or primitive; never mutates.
 * Strict TS port: public exports (analyzeRecurrence, loadRecurrence, recordFor), sort order, verdict rules,
 * summary shape and fail-closed behaviour are preserved EXACTLY. The historical .js is the reference.
 */

function isPlainObject(v: unknown): v is Record<string, any> { return v !== null && typeof v === "object" && !Array.isArray(v); }

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, ERROR: 1 };

export interface RecurrenceRecord {
  id: string;
  mission: any;
  attempts: number;
  maxAttempts: number | null;
  status: string | null;
  severity: string | null;
  recurring: boolean;
  oscillating: boolean;
  firstSeen: any;
  lastSeen: any;
  spannedUpdates: boolean;
}

export interface RecurrenceAnalysis {
  verdict: "NONE" | "FROZEN_LOOP" | "RECURRENCE" | "NO_RECURRENCE";
  summary: {
    total: number;
    recurring: number;
    frozen: number;
    maxAttempts: number;
    topRecurring: Array<{ id: string; attempts: number; status: string | null }>;
  };
  records: RecurrenceRecord[];
}

// analyzeRecurrence(ledger) — PURE. Derive per-incident recurrence facts + a summary verdict from the
// ledger { incidents: { [id]: incident } }. A malformed/empty ledger ⇒ an empty, well-formed result.
function analyzeRecurrence(ledger: any): RecurrenceAnalysis {
  const incidents: any[] = ledger && isPlainObject(ledger.incidents) ? Object.values(ledger.incidents) : [];
  const records: RecurrenceRecord[] = incidents
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
      ((SEVERITY_RANK[a.severity as string] ?? 9) - (SEVERITY_RANK[b.severity as string] ?? 9)) ||
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
function loadRecurrence(opts?: any): RecurrenceAnalysis {
  const o = isPlainObject(opts) ? opts : {};
  const INCIDENTS_FILE = "self-diagnostic-incidents"; // the SAME key self-diagnostic.raiseIncident writes.
  let ledger: any = { incidents: {} };
  try {
    const store = o.store || require("./autonomy-store");
    ledger = store.read(INCIDENTS_FILE, { incidents: {} }) || { incidents: {} };
  } catch {
    ledger = { incidents: {} };
  }
  return analyzeRecurrence(ledger);
}

// recordFor(analysis, incidentId) — the per-incident OBSERVED recurrence record for one id, or null. Pure.
function recordFor(analysis: any, incidentId: unknown): RecurrenceRecord | null {
  if (!analysis || !Array.isArray(analysis.records) || typeof incidentId !== "string" || !incidentId) return null;
  return analysis.records.find((r: any) => r && r.id === incidentId) || null;
}

export { analyzeRecurrence, loadRecurrence, recordFor };
module.exports = { analyzeRecurrence, loadRecurrence, recordFor };

// Read-only CLI: print the current recurrence signal; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify(loadRecurrence({}), null, 2) + "\n");
}
