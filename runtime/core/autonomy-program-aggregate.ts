#!/usr/bin/env node
/**
 * Autonomy Program Aggregate (P0-AUTONOMY-MEASURE slice 1) — PURE, read-only aggregator that turns the
 * mission-ledger into an HONEST PROGRAM-LEVEL §S-2 autonomy picture with EXPLICIT denominators. The existing
 * autonomy-rate / autonomy-measure instruments report only the LAST single run; this composes EVIDENCE + STATE
 * to report across the whole ledger — WITHOUT fabricating the one number the data cannot support.
 *
 * Hard honesty rules (§S-2 + §S-1 anti-false-success):
 *  - FAIL-CLOSED: empty/invalid ledger ⇒ measurable:false + reason; never a fabricated number.
 *  - NO blending: separate counts + denominators; dedup lifecycle re-records by mission id (report BOTH the raw
 *    ledger-entry count AND the distinct-mission count — they differ because one mission is re-recorded across
 *    CREATED→PLANNED→PREPARED→…→ARCHIVED and across runs; the raw append count is NOT a work-item denominator).
 *  - The ODG-vs-provider-vs-human ACTOR share — the core §S-2 question — is NON-MEASURABLE at program level: the
 *    mission-ledger records NO per-entry actor/provenance (no executedBy/actor field). We say so explicitly with
 *    the single next step to close it. `proven`/`validated` are OUTCOME gates, NOT actor signals ⇒ they are never
 *    read as "ODG executed" (that would fabricate ~100% autonomy from a ledger where every entry is proven=true).
 *  - Pure/deterministic: the ledger is INJECTED; no fs/clock/net/mutable-state in the core function.
 *  - Composes EVIDENCE + STATE; no tenth primitive.
 */
"use strict";

// Lifecycle state values observed in the real ledger (documentary; the aggregate tolerates unknown states too).
const LIFECYCLE_STATES = Object.freeze(["CREATED", "PLANNED", "PREPARED", "VERIFIED", "ARCHIVED"]);
// States that mean a mission reached a terminal verified/archived outcome (vs still in an earlier lifecycle stage).
const TERMINAL_STATES = Object.freeze(new Set(["VERIFIED", "ARCHIVED"]));

// The core §S-2 question, HONESTLY not answerable at program level today. Frozen so callers cannot mutate it.
const ACTOR_NOT_MEASURABLE = Object.freeze({
  measurable: false,
  reason: "mission-ledger records NO per-entry actor/provenance (no executedBy/actor field) ⇒ the §S-2 ODG-vs-provider-vs-human share cannot be computed at program level without fabrication. `proven`/`validated` are OUTCOME gates, not actor signals, so they are deliberately NOT read as ODG execution.",
  nextStep: "slice 2 (separately gated, execution-path): stamp an `actor`/`executedBy` provenance field on the mission-ledger write path at record time, then this aggregator can split the §S-2 counts by actor over the new entries.",
  odgShare: null,
  providerShare: null,
  humanShare: null,
});

function entriesOf(ledger: any): any[] {
  if (Array.isArray(ledger)) return ledger.filter((e) => e && typeof e === "object" && !Array.isArray(e));
  if (ledger && Array.isArray(ledger.entries)) return ledger.entries.filter((e: any) => e && typeof e === "object" && !Array.isArray(e));
  return [];
}

// Distinct missions = latest entry per mission id. recordedAt is an ISO string ⇒ lexical max == chronological max;
// ties (or missing recordedAt) ⇒ the later occurrence wins. An entry without a string mission id is NOT a distinct
// mission (it cannot be keyed) — counted separately as entriesWithoutMissionId, never silently merged.
function latestPerMission(entries: any[]): any[] {
  const byId = new Map<string, any>();
  for (const e of entries) {
    if (typeof e.mission !== "string") continue;
    const prev = byId.get(e.mission);
    if (!prev) { byId.set(e.mission, e); continue; }
    const a = typeof e.recordedAt === "string" ? e.recordedAt : "";
    const b = typeof prev.recordedAt === "string" ? prev.recordedAt : "";
    if (a >= b) byId.set(e.mission, e);
  }
  return [...byId.values()];
}

function tallyBy(entries: any[], key: (e: any) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) { const k = key(e); out[k] = (out[k] || 0) + 1; }
  return out;
}

const rate4 = (num: number, den: number): number => (den > 0 ? Number((num / den).toFixed(4)) : 0);

/**
 * aggregateProgramAutonomy(ledger) — PURE program-level §S-2 aggregate. Returns the raw ledger-entry count, the
 * distinct-mission count (deduped by id), by-state + validated/authorized/proven tallies over DISTINCT missions
 * (each with the explicit denominator), a terminal-vs-in-lifecycle split, and a FAIL-CLOSED actor block. Never
 * fabricates an actor autonomy percentage. Deterministic.
 */
function aggregateProgramAutonomy(ledger: any): any {
  const entries = entriesOf(ledger);
  if (entries.length === 0) {
    return Object.freeze({
      measurable: false,
      reason: "no ledger entries (empty or invalid ledger) — nothing to aggregate",
      ledgerEntries: 0,
      distinctMissions: 0,
      entriesWithoutMissionId: 0,
      byState: {},
      outcome: null,
      actorAutonomy: ACTOR_NOT_MEASURABLE,
    });
  }
  const distinct = latestPerMission(entries);
  const dm = distinct.length;
  // FAIL-CLOSED (verifier-hardened): entries exist but NONE carries a string mission id ⇒ no keyable work unit
  // to aggregate ⇒ measurable:false (never a measurable:true with a 0 denominator). The raw entry count and the
  // unkeyable-entry count are still surfaced for transparency.
  if (dm === 0) {
    return Object.freeze({
      measurable: false,
      reason: "ledger has entries but none carries a string mission id ⇒ no keyable work unit to aggregate",
      ledgerEntries: entries.length,
      distinctMissions: 0,
      entriesWithoutMissionId: entries.filter((e) => typeof e.mission !== "string").length,
      byState: {},
      outcome: null,
      actorAutonomy: ACTOR_NOT_MEASURABLE,
    });
  }
  const byState = tallyBy(distinct, (e) => (typeof e.state === "string" ? e.state : "UNKNOWN"));
  const terminal = distinct.filter((e) => TERMINAL_STATES.has(String(e.state))).length;
  const validated = distinct.filter((e) => e.validated === true).length;
  const authorized = distinct.filter((e) => e.authorized === true).length;
  const proven = distinct.filter((e) => e.proven === true).length;
  const entriesWithoutMissionId = entries.filter((e) => typeof e.mission !== "string").length;
  return Object.freeze({
    measurable: true,
    ledgerEntries: entries.length,
    distinctMissions: dm,
    entriesWithoutMissionId,
    note: "distinctMissions dedups lifecycle re-records (CREATED→…→ARCHIVED) + re-runs by mission id, keeping the latest entry; ledgerEntries is the raw append-only count and is NOT a work-item denominator.",
    byState, // distribution over DISTINCT missions, e.g. { ARCHIVED: n, CREATED: n, ... }
    outcome: {
      denominator: dm,
      terminalVerifiedOrArchived: terminal, // reached a terminal lifecycle outcome (VERIFIED/ARCHIVED)
      stillInLifecycle: dm - terminal, // CREATED/PLANNED/PREPARED/unknown — not a terminal outcome
      validated: { count: validated, denominator: dm, rate: rate4(validated, dm) },
      authorized: { count: authorized, denominator: dm, rate: rate4(authorized, dm) },
      proven: { count: proven, denominator: dm, rate: rate4(proven, dm), note: "ledger-entry gate, NOT an actor/verified-autonomy signal" },
    },
    actorAutonomy: ACTOR_NOT_MEASURABLE,
  });
}

module.exports = { aggregateProgramAutonomy, latestPerMission, LIFECYCLE_STATES, TERMINAL_STATES, ACTOR_NOT_MEASURABLE };
export {};

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const p = process.argv[2] || path.join("runtime", "generated", "mission-ledger.json");
  let ledger: any = null;
  try { ledger = JSON.parse(fs.readFileSync(p, "utf8")); } catch { ledger = null; }
  process.stdout.write(JSON.stringify(aggregateProgramAutonomy(ledger), null, 2) + "\n");
}
