#!/usr/bin/env node
"use strict";
/*
 * AUTONOMY MATURITY TRICHOTOMY — per-mission NATIVE_DEMONSTRATED / ASSISTED / ESCALATED, with THREE explicit
 * denominators and NO blended score. PURE, deterministic, fail-closed. Composes autonomy-claim-guard.
 *
 * THE GAP (reconciled): autonomy-program-aggregate.actorSplit buckets DISTINCT missions by raw EXECUTOR actor
 * (ODG / TECHNICAL_PROVIDER / HUMAN / AUTOMATED_SYSTEM) — it folds "assisted" into the provider share and has NO
 * ESCALATED bucket. autonomy-matrix reports a CAPABILITY level (REAL/SIMULATED/DECLARED), not demonstrated per-
 * mission autonomy. The mandate's native/assisted/escalated maturity view (§10 "measure excellence, don't claim it")
 * does not exist. This provides it, reusing autonomy-claim-guard.honestClaimFor as the single actor→claim source.
 *
 * Honesty invariants:
 *   - CAPABILITY ≠ DEMONSTRATED AUTONOMY. NATIVE_DEMONSTRATED requires BOTH an ODG-resolved actor AND independent
 *     REAL evidence. An ODG-claimed mission with simulated / declared / unverified evidence is NOT native — it is
 *     NOT_MEASURABLE (excluded), never counted as autonomy.
 *   - An ESCALATED mission (handed to an owner gate / deferred for a human decision) counts as NOT native and NOT
 *     assisted — it is its OWN bucket, and escalation OVERRIDES the actor.
 *   - NO misleading single global score: three counts over ONE explicit measured denominator, plus a separately-
 *     reported NOT_MEASURABLE set. The NATIVE_DEMONSTRATED share is NOT an "overall autonomy" number.
 * No network/clock/randomness.
 */

const G = require("./autonomy-claim-guard.js") as { honestClaimFor: (actor: any) => string; CLAIM: Record<string, string> };

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function rate4(n: number, d: number): number | null { return d > 0 ? Number((n / d).toFixed(4)) : null; }

export const BUCKET = Object.freeze({
  NATIVE_DEMONSTRATED: "NATIVE_DEMONSTRATED",
  ASSISTED: "ASSISTED",
  ESCALATED: "ESCALATED",
  NOT_MEASURABLE: "NOT_MEASURABLE",
});

// A mission is ESCALATED when it was handed to an owner gate / deferred for a human DECISION (not executed by the
// autonomy loop). Driven by EXPLICIT fields only — never inferred.
const ESCALATED_STATUSES = Object.freeze(new Set(["OWNER_GATED", "ESCALATED", "DEFERRED", "DEFERRED_TO_OWNER"]));
function isEscalated(m: any): boolean {
  return m.escalated === true || m.ownerGated === true || ESCALATED_STATUSES.has(String(m.status));
}
// Independent REAL evidence — the only thing that lets an ODG execution count as DEMONSTRATED (not merely claimed).
function hasRealEvidence(m: any): boolean {
  return m.independentlyVerified === true || m.evidence === "REAL";
}

/**
 * classifyMissionAutonomy(mission) -> { bucket, reason, claim, escalated }.
 * mission: { actor (EXECUTOR value), status?, escalated?, ownerGated?, evidence? ("REAL"|"SIMULATED"|"DECLARED"),
 *            independentlyVerified? }. Escalation OVERRIDES the actor. ODG + real evidence ⇒ NATIVE_DEMONSTRATED;
 * ODG + no real evidence ⇒ NOT_MEASURABLE (capability ≠ demonstrated); provider/human ⇒ ASSISTED; else NOT_MEASURABLE.
 */
function classifyMissionAutonomy(mission: any): any {
  if (!isObj(mission)) return freeze({ bucket: BUCKET.NOT_MEASURABLE, reason: "not a mission record", claim: null, escalated: false });
  if (isEscalated(mission)) return freeze({ bucket: BUCKET.ESCALATED, reason: "handed to an owner gate / deferred for a human decision — NOT native, NOT assisted", claim: null, escalated: true });

  const claim = G.honestClaimFor(mission.actor);
  if (claim === G.CLAIM.NATIVE_AUTONOMOUS) {
    return hasRealEvidence(mission)
      ? freeze({ bucket: BUCKET.NATIVE_DEMONSTRATED, reason: "ODG-resolved actor WITH independent REAL evidence", claim, escalated: false })
      : freeze({ bucket: BUCKET.NOT_MEASURABLE, reason: "ODG-claimed but no independent REAL evidence — capability ≠ demonstrated autonomy (never counted as native)", claim, escalated: false });
  }
  if (claim === G.CLAIM.PROVIDER_ASSISTED || claim === G.CLAIM.HUMAN)
    return freeze({ bucket: BUCKET.ASSISTED, reason: `executed with assistance (${claim})`, claim, escalated: false });
  return freeze({ bucket: BUCKET.NOT_MEASURABLE, reason: "no recognized/attributable execution actor (UNATTRIBUTED)", claim, escalated: false });
}

/**
 * aggregateMaturity(missions) -> { ok, total, measuredDenominator, buckets{ NATIVE_DEMONSTRATED, ASSISTED,
 * ESCALATED each {count, ids, rateOfMeasured} }, notMeasurable{count, ids}, note }.
 * The three bucket counts share ONE measured denominator; NOT_MEASURABLE is reported separately (never inferred into
 * a bucket). NO blended autonomy score. Fail-closed on a non-array input.
 */
function aggregateMaturity(missions: any): any {
  if (!Array.isArray(missions)) return freeze({ ok: false, code: "BAD_INPUT", detail: "missions must be an array" });
  const by: Record<string, string[]> = { NATIVE_DEMONSTRATED: [], ASSISTED: [], ESCALATED: [], NOT_MEASURABLE: [] };
  missions.forEach((m: any, i: number) => {
    const c = classifyMissionAutonomy(m);
    const id = (m && m.id !== undefined) ? String(m.id) : `#${i}`;
    by[c.bucket].push(id);
  });
  const measured = by.NATIVE_DEMONSTRATED.length + by.ASSISTED.length + by.ESCALATED.length;
  const mk = (k: string) => freeze({ count: by[k].length, ids: freeze(by[k].slice()), rateOfMeasured: rate4(by[k].length, measured) });
  return freeze({
    ok: true,
    total: missions.length,
    measuredDenominator: measured,
    buckets: freeze({
      NATIVE_DEMONSTRATED: mk("NATIVE_DEMONSTRATED"),
      ASSISTED: mk("ASSISTED"),
      ESCALATED: mk("ESCALATED"),
    }),
    notMeasurable: freeze({ count: by.NOT_MEASURABLE.length, ids: freeze(by.NOT_MEASURABLE.slice()) }),
    note: "THREE explicit buckets over ONE measured denominator (NATIVE_DEMONSTRATED + ASSISTED + ESCALATED); NOT_MEASURABLE is EXCLUDED and reported separately, never inferred into a bucket. CAPABILITY ≠ DEMONSTRATED AUTONOMY: an ODG claim without independent REAL evidence is NOT native. An ESCALATED mission is NOT native and NOT assisted. There is NO blended autonomy score — the NATIVE_DEMONSTRATED share is a share of measured missions, not an overall autonomy number.",
  });
}

const AUTONOMY_MATURITY_CONTRACT = Object.freeze({
  id: "AUTONOMY-MATURITY-TRICHOTOMY",
  purpose: "per-mission NATIVE_DEMONSTRATED / ASSISTED / ESCALATED maturity with three explicit denominators — the native/assisted/escalated view actorSplit (no ESCALATED bucket) and autonomy-matrix (capability, not demonstrated) lack",
  reuses: Object.freeze(["autonomy-claim-guard.honestClaimFor + CLAIM (single actor→claim source — not reimplemented)"]),
  invariants: Object.freeze([
    "CAPABILITY ≠ DEMONSTRATED AUTONOMY — NATIVE_DEMONSTRATED requires an ODG-resolved actor AND independent REAL evidence; a simulated/declared/unverified ODG claim is NOT_MEASURABLE, never native",
    "an ESCALATED mission (owner-gate / deferred human decision) is its OWN bucket — NOT native, NOT assisted; escalation OVERRIDES the actor",
    "NO blended global score — three counts over ONE measured denominator; NOT_MEASURABLE excluded and reported separately",
    "the NATIVE_DEMONSTRATED share is a share of MEASURED missions, NOT an overall autonomy number",
    "escalation and real-evidence are driven by EXPLICIT fields only (never inferred); PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { classifyMissionAutonomy, aggregateMaturity, BUCKET, AUTONOMY_MATURITY_CONTRACT };
export {};
