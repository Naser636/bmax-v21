#!/usr/bin/env node
"use strict";
/*
 * AUTONOMY MATURITY REPORT — raccords the native/assisted/escalated trichotomy to the INTERNAL measurement
 * substrate (the mission-ledger). PURE, deterministic, fail-closed, read-only. Composes, reimplements nothing.
 *
 * V324 §6.4 / §14: "raccorder NATIVE / ASSISTED / ESCALATED aux mécanismes de mesure internes; dénominateurs
 * distincts; preuve par mission; ne pas confondre existence d'un module et capacité démontrée."
 *
 * It takes the mission-ledger, reduces it to DISTINCT missions (latest entry per id — reusing
 * autonomy-program-aggregate.latestPerMission), maps each entry to a trichotomy input, and runs
 * odg-autonomy-maturity-trichotomy.aggregateMaturity.
 *
 * HONEST LIMIT surfaced (not masked): the ledger records WHETHER a mission was validated/proven, NOT WHO executed
 * it. Without a per-mission execution ACTOR, native-vs-assisted autonomy is NON-MEASURABLE from the ledger (every
 * mission resolves to NOT_MEASURABLE). `validated`/`proven` establish that a RESULT was validated — never that ODG
 * executed it natively (capability/validation ≠ demonstrated native autonomy). The report exposes actor-attribution
 * COVERAGE so this limit is explicit. As slice-2 provenance stamps an actor on new entries, the measure sharpens.
 * No network/clock/randomness.
 */

const AGG = require("./autonomy-program-aggregate.js") as { latestPerMission: (entries: any[]) => any[] };
const TRI = require("./odg-autonomy-maturity-trichotomy.js") as { aggregateMaturity: (missions: any[]) => any };

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function rate4(n: number, d: number): number | null { return d > 0 ? Number((n / d).toFixed(4)) : null; }

// Ledger states that denote an owner gate / deferred human decision (escalation). Explicit set — never inferred.
const ESCALATED_STATES = Object.freeze(new Set(["OWNER_GATED", "SIGN_OFF_GATED", "ESCALATED", "DEFERRED", "DEFERRED_TO_OWNER"]));

function entriesOf(ledger: any): any[] {
  if (Array.isArray(ledger)) return ledger.filter((e) => e && typeof e === "object" && !Array.isArray(e));
  if (ledger && Array.isArray(ledger.entries)) return ledger.entries.filter((e: any) => e && typeof e === "object" && !Array.isArray(e));
  return [];
}

/**
 * mapLedgerEntry(e) -> a trichotomy mission input { id, actor?, evidence?, status, escalated }.
 *  - actor: the ledger's execution actor if stamped (absent on legacy/historical entries ⇒ UNATTRIBUTED).
 *  - evidence: "REAL" iff the entry records validated/proven (a VALIDATED RESULT) — note this is NOT an actor claim;
 *    with no ODG actor it still resolves to NOT_MEASURABLE (validation ≠ native autonomy).
 *  - escalated: explicit ownerGated/escalated flag OR an owner-gate ledger state.
 */
function mapLedgerEntry(e: any): any {
  return {
    id: typeof e.mission === "string" ? e.mission : undefined,
    actor: typeof e.actor === "string" ? e.actor : undefined,
    evidence: (e.validated === true || e.proven === true) ? "REAL" : undefined,
    status: typeof e.state === "string" ? e.state : undefined,
    escalated: e.ownerGated === true || e.escalated === true || ESCALATED_STATES.has(String(e.state)),
  };
}

/**
 * reportMaturityFromLedger(ledger) -> { ok, distinctMissions, attribution, nativeAutonomyMeasurable, maturity, note }.
 * PURE: accepts the ledger object/array; performs no I/O. `attribution` makes the actor-coverage limit explicit.
 */
function reportMaturityFromLedger(ledger: any): any {
  const entries = entriesOf(ledger);
  const distinct = AGG.latestPerMission(entries);
  const missions = distinct.map(mapLedgerEntry).filter((m: any) => m.id !== undefined);

  const withActor = missions.filter((m: any) => typeof m.actor === "string" && m.actor.length > 0).length;
  const attribution = freeze({
    distinct: missions.length,
    withExecutionActor: withActor,
    withoutExecutionActor: missions.length - withActor,
    actorCoverageRate: rate4(withActor, missions.length),
  });

  const maturity = TRI.aggregateMaturity(missions);
  // Native vs assisted is only measurable when SOME mission carries an execution actor; else the trichotomy is
  // dominated by NOT_MEASURABLE and native autonomy cannot be read from the ledger (honest, not masked).
  const nativeAutonomyMeasurable = withActor > 0;

  return freeze({
    ok: true,
    distinctMissions: missions.length,
    attribution,
    nativeAutonomyMeasurable,
    maturity,
    note: nativeAutonomyMeasurable
      ? "native/assisted/escalated measured over the missions carrying an execution actor; NOT_MEASURABLE (no actor, or ODG-claimed without REAL evidence) is reported separately — three distinct denominators, no blended score."
      : "NATIVE AUTONOMY NON-MEASURABLE from this ledger: it records no per-mission execution ACTOR (actorCoverageRate=0). validated/proven establish that a RESULT was validated — NOT that ODG executed it natively (validation ≠ demonstrated native autonomy). Escalation is still read from explicit gate states. The limit is surfaced, not masked; it sharpens as provenance stamps an actor on new entries.",
  });
}

const AUTONOMY_MATURITY_REPORT_CONTRACT = Object.freeze({
  id: "AUTONOMY-MATURITY-REPORT",
  purpose: "raccord the native/assisted/escalated maturity trichotomy to the internal mission-ledger (V324 §6.4/§14) — a read-only report with distinct denominators and an EXPLICIT actor-attribution coverage limit",
  reuses: Object.freeze(["autonomy-program-aggregate.latestPerMission (distinct missions)", "odg-autonomy-maturity-trichotomy.aggregateMaturity (the trichotomy)"]),
  invariants: Object.freeze([
    "read-only over the ledger — changes nothing, authorizes nothing, performs no I/O (caller supplies the ledger)",
    "native-vs-assisted is NON-MEASURABLE without a per-mission execution ACTOR; validated/proven establish a validated RESULT, NOT native authorship (validation ≠ demonstrated native autonomy)",
    "the actor-attribution COVERAGE is reported explicitly so the measurement limit is never masked",
    "an owner-gate / deferred ledger state ⇒ ESCALATED (explicit states only, never inferred); three distinct denominators, no blended score",
    "composes latestPerMission + aggregateMaturity — reimplements neither; PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { reportMaturityFromLedger, mapLedgerEntry, AUTONOMY_MATURITY_REPORT_CONTRACT };
export {};
