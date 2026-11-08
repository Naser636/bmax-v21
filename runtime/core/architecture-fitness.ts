#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 1 / M-FIT-01 (Architecture Fitness Functions — program PARTIE XIII) — ARCHITECTURE FITNESS REGISTRY +
 * GOVERNANCE REGRESSION SUITE. PURE, deterministic. Turns ODG's architectural principles into PERMANENTLY testable
 * properties (an idea from evolutionary-architecture "fitness functions"): each invariant is a fail-closed predicate
 * over SUPPLIED canonical evidence. It does NOT replace the existing guards — it AGGREGATES them into one scorecard,
 * composing campaign-controller.staleAcceptances (register coherence) + actor-provenance.resolveEntryActor (UNKNOWN
 * never NATIVE) + the anti-fabrication rule (executed state ⇒ evidence). Fail-closed: an invariant with no evidence to
 * judge it is UNVERIFIED (never silently PASS); any detected breach is a VIOLATION. It grants no authority and
 * executes nothing. Dual export.
 */

const CC = require("./campaign-controller");           // staleAcceptances — register coherence
const ACTOR = require("./actor-provenance");           // resolveEntryActor / EXECUTOR — UNKNOWN never NATIVE

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function hasEvidence(x: any): boolean { return isObj(x) && typeof x.evidence === "string" && x.evidence.length > 0; }

const RESULT = Object.freeze(["PASS", "VIOLATION", "UNVERIFIED"]);
const EXECUTED_STATES = Object.freeze(["COMPLETED", "VALIDATED", "ACCEPTED"]);

// The architecture invariants (program §13.2) as fail-closed predicates over injected evidence.
const FITNESS_INVARIANTS = Object.freeze([
  { id: "FIT-01", desc: "register coherence: every ACCEPTED item carries evidence AND there are no stale acceptances", category: "governance" },
  { id: "FIT-02", desc: "anti-fabrication: no mission in an executed state (COMPLETED/VALIDATED/ACCEPTED) without evidence", category: "honesty" },
  { id: "FIT-03", desc: "every mission has a stable string identity", category: "identity" },
  { id: "FIT-04", desc: "UNKNOWN is never counted as NATIVE", category: "autonomy" },
  { id: "FIT-05", desc: "every repair has an initial state AND a retained diff", category: "recovery" },
  { id: "FIT-06", desc: "every promotion requires applicable validation criteria", category: "promotion" },
  { id: "FIT-07", desc: "preservation: historical acquis (DEC-V60-166, 9 primitives, 15 métiers) intact", category: "preservation" },
  { id: "FIT-08", desc: "no agent modifies its own permissions (self-authorization refused)", category: "truth-lock" },
  { id: "FIT-09", desc: "Truth Lock is present and independent of agent will", category: "truth-lock" },
  { id: "FIT-10", desc: "a radar proposal never becomes a mission without authorization", category: "radar" },
]);

function pass(id: string, detail: string): any { return Object.freeze({ id, result: "PASS", detail }); }
function fail(id: string, detail: string): any { return Object.freeze({ id, result: "VIOLATION", detail }); }
function unver(id: string, detail: string): any { return Object.freeze({ id, result: "UNVERIFIED", detail }); }

/** evaluateFitness(evidence) -> { verdict, results, violations, unverified, summary }. Fail-closed. */
function evaluateFitness(evidence: any): any {
  const e = isObj(evidence) ? evidence : {};
  const results: any[] = [];

  // FIT-01 register coherence (compose campaign-controller.staleAcceptances).
  const register = isObj(e.register) ? e.register : null;
  if (!register || !Array.isArray(register.items)) results.push(unver("FIT-01", "no register supplied"));
  else {
    const accepted = register.items.filter((i: any) => isObj(i) && i.status === "ACCEPTED");
    const missingEv = accepted.filter((i: any) => !hasEvidence(i));
    let stale: any[] = []; try { stale = CC.staleAcceptances(register) || []; } catch { stale = []; }
    if (missingEv.length === 0 && stale.length === 0) results.push(pass("FIT-01", `${accepted.length} ACCEPTED all carry evidence; 0 stale`));
    else results.push(fail("FIT-01", `${missingEv.length} ACCEPTED missing evidence; ${stale.length} stale acceptances`));
  }

  // FIT-02 anti-fabrication.
  if (e.missions === undefined) results.push(unver("FIT-02", "no missions supplied"));
  else {
    const fabricated = arr(e.missions).filter((m: any) => isObj(m) && EXECUTED_STATES.includes(m.status) && !hasEvidence(m));
    results.push(fabricated.length === 0 ? pass("FIT-02", "no executed-state mission lacks evidence") : fail("FIT-02", `${fabricated.length} executed-state mission(s) without evidence`));
  }

  // FIT-03 stable identity.
  if (e.missions === undefined) results.push(unver("FIT-03", "no missions supplied"));
  else {
    const noId = arr(e.missions).filter((m: any) => !(isObj(m) && typeof m.id === "string" && m.id.length > 0));
    results.push(noId.length === 0 ? pass("FIT-03", "every mission has a stable id") : fail("FIT-03", `${noId.length} mission(s) without a stable id`));
  }

  // FIT-04 UNKNOWN never NATIVE (compose actor-provenance).
  if (e.actorEntries === undefined) results.push(unver("FIT-04", "no actor entries supplied"));
  else {
    const bad = arr(e.actorEntries).filter((a: any) => isObj(a) && a.labeledNative === true && ACTOR.resolveEntryActor(a) !== ACTOR.EXECUTOR.ODG);
    results.push(bad.length === 0 ? pass("FIT-04", "no UNKNOWN/non-ODG entry is counted NATIVE") : fail("FIT-04", `${bad.length} entry(ies) labeled NATIVE but not resolvably ODG`));
  }

  // FIT-05 repair baseline + diff.
  if (e.repairs === undefined) results.push(unver("FIT-05", "no repairs supplied"));
  else {
    const bad = arr(e.repairs).filter((r: any) => !(isObj(r) && r.initialState !== undefined && typeof r.diff === "string"));
    results.push(bad.length === 0 ? pass("FIT-05", "every repair has initial state + diff") : fail("FIT-05", `${bad.length} repair(s) missing initial state or diff`));
  }

  // FIT-06 promotion criteria.
  if (e.promotions === undefined) results.push(unver("FIT-06", "no promotions supplied"));
  else {
    const bad = arr(e.promotions).filter((p: any) => !(isObj(p) && Array.isArray(p.validationCriteria) && p.validationCriteria.length > 0));
    results.push(bad.length === 0 ? pass("FIT-06", "every promotion declares validation criteria") : fail("FIT-06", `${bad.length} promotion(s) without validation criteria`));
  }

  // FIT-07 preservation.
  const pres = isObj(e.preservation) ? e.preservation : null;
  if (!pres) results.push(unver("FIT-07", "no preservation evidence supplied"));
  else {
    const ok = arr(pres.decisions).some((d: any) => /DEC-V60-166-RETIREMENT/.test(String(d))) && Array.isArray(pres.ninePrimitives) && pres.ninePrimitives.length === 9 && Array.isArray(pres.fifteenMetiers) && pres.fifteenMetiers.length === 15;
    results.push(ok ? pass("FIT-07", "DEC-V60-166 + 9 primitives + 15 métiers preserved") : fail("FIT-07", "preservation evidence incomplete"));
  }

  // FIT-08/09/10 guard-presence meta-checks (asserted facts; fail-closed if absent).
  const g = isObj(e.guardsPresent) ? e.guardsPresent : {};
  results.push(e.guardsPresent === undefined ? unver("FIT-08", "no guard evidence") : (g.agentCannotSelfAuthorize === true ? pass("FIT-08", "self-authorization refused") : fail("FIT-08", "agent self-authorization not provably refused")));
  results.push(e.guardsPresent === undefined ? unver("FIT-09", "no guard evidence") : (g.truthLockPresent === true ? pass("FIT-09", "Truth Lock present") : fail("FIT-09", "Truth Lock not provably present")));
  results.push(e.guardsPresent === undefined ? unver("FIT-10", "no guard evidence") : (g.radarProposalGated === true ? pass("FIT-10", "radar proposals are authorization-gated") : fail("FIT-10", "radar proposal gating not provably present")));

  const violations = results.filter((r) => r.result === "VIOLATION");
  const unverified = results.filter((r) => r.result === "UNVERIFIED");
  const verdict = violations.length > 0 ? "VIOLATIONS" : (unverified.length > 0 ? "INCOMPLETE" : "ALL_PASS");
  return Object.freeze({ verdict, results: Object.freeze(results), violations: Object.freeze(violations.map((v) => v.id)), unverified: Object.freeze(unverified.map((u) => u.id)), summary: Object.freeze({ total: results.length, pass: results.filter((r) => r.result === "PASS").length, violation: violations.length, unverified: unverified.length }) });
}

const ARCHITECTURE_FITNESS_CONTRACT = Object.freeze({
  id: "V5-ARCHITECTURE-FITNESS",
  source: "ODG Master program PARTIE XIII — Architecture Fitness Functions (evolutionary-architecture; program §13.2)",
  invariantsCount: FITNESS_INVARIANTS.length,
  reuses: Object.freeze(["campaign-controller.staleAcceptances (register coherence)", "actor-provenance.resolveEntryActor (UNKNOWN never NATIVE)", "aggregates existing guards — does NOT replace them"]),
  notAuthority: "a read-only governance regression scorecard over supplied canonical evidence; it executes nothing and grants no authority",
  invariants: Object.freeze([
    "each architecture invariant is a fail-closed predicate: a detected breach ⇒ VIOLATION; no evidence to judge it ⇒ UNVERIFIED (never silently PASS)",
    "verdict ALL_PASS only when every invariant PASSES; any VIOLATION ⇒ VIOLATIONS; any UNVERIFIED (no violation) ⇒ INCOMPLETE",
    "composes campaign-controller + actor-provenance; aggregates existing guards rather than reimplementing them",
    "pure/deterministic: evidence in → scorecard out; no clock/random/network; grants no authority",
  ]),
});

module.exports = { FITNESS_INVARIANTS, evaluateFitness, ARCHITECTURE_FITNESS_CONTRACT };

if (require.main === module) {
  const reg = require("../../docs/odg/closure-register.json");
  const demo = evaluateFitness({ register: reg });
  process.stdout.write(JSON.stringify({ ...ARCHITECTURE_FITNESS_CONTRACT, demo: { fit01: demo.results[0], summary: demo.summary } }, null, 2) + "\n");
}

export {};
