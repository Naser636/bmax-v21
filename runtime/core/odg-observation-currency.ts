#!/usr/bin/env node
"use strict";

/*
 * V12.4-EXT §18/§19/§20 — OBSERVATION CURRENCY DECIDER (memoire != etat actuel). PURE, deterministic (asOf injected,
 * no clock/random). It answers the central rule of the extension directive: "ODG ne doit jamais confondre une
 * information memorisee avec une observation actuelle." A memorized observation was true at ITS commit and ITS instant;
 * crossing a commit/scope/time boundary demotes it from CURRENT_OBSERVED to HISTORICAL_OBSERVED, and it may then be used
 * to understand history but NOT to assert that the repo/VPS is still in that state — it must be RE-VERIFIED first.
 *
 * This is NOT a second memory store, NOT a 10th primitive, NOT a parallel truth base (§16). It is the missing CURRENCY
 * lens the existing stores lacked: memory-taxonomy classifies family/quality at WRITE time; memory-trust-gate checks
 * author/tamper/staleness at RETRIEVAL time; neither decides "does this observation still describe the CURRENT world,
 * or only a PAST one?". It COMPOSES memory-taxonomy.isStale for the expiry signal (no duplicated staleness math).
 *
 * DENY-BY-DEFAULT: mayAssertCurrent is true ONLY for a method-backed, non-superseded, non-expired observation whose
 * world is PROVABLY unchanged in the claim's scope — same commit, or a known changed-set that provably misses the scope.
 * Unknown changed-set ⇒ cannot prove untouched ⇒ HISTORICAL_OBSERVED (reverify). A hypothesis/proposal is never current.
 *
 * Forensic motive: V234 observed "no resident campaign-loop driver; odg-radar-weekly.timer runs" at commit d1c042f on
 * 2026-11-16 — a CURRENT_OBSERVED fact THEN. Reused next week, at a new commit, without re-observing, it is only
 * HISTORICAL_OBSERVED and must not assert present VPS state. This module makes that demotion explicit and testable.
 */

const TAX = require("./memory-taxonomy.js");   // isStale(rec, asOf) — the canonical staleness check (composed, not re-derived)

const DAY_MS = 86400000;
// §18 currency ladder (observation currency, distinct from memory-taxonomy QUALITY/CONSOLIDATION).
const CURRENCY = Object.freeze([
  "CURRENT_OBSERVED", "HISTORICAL_OBSERVED", "VERIFIED", "CORROBORATED",
  "HYPOTHESIS", "PROPOSED", "SUPERSEDED", "EXPIRED", "UNKNOWN",
]);
// currencies that are allowed to assert present state (deny-by-default: everything else cannot).
const ASSERTABLE = Object.freeze(["CURRENT_OBSERVED", "VERIFIED", "CORROBORATED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): string[] { return Array.isArray(v) ? v.filter(isStr) : []; }

// Do any of the claim's scope paths intersect the changed set? Prefix-aware: "runtime" matches "runtime/core/x.ts".
function scopeIntersectsChanged(scope: string[], changed: string[]): boolean {
  return scope.some((s) => changed.some((c) => c === s || c.startsWith(s + "/") || s.startsWith(c + "/")));
}

/*
 * assess(observation, context) -> { currency, mayAssertCurrent, reverifyRequired, reasons }.
 * observation: { id, claim, kind?("OBSERVATION"|"HYPOTHESIS"|"PROPOSED"), observedAtEpochMs, observedCommit, scope:[],
 *                method, confidence?, validityDays?, independentlyVerified?, corroboratingSources?, supersededBy? }
 * context: { asOfEpochMs, currentCommit, changedPaths?:[], changedPathsKnown?:bool }
 * Deterministic. Fail-closed: any un-provable "still current" lands on HISTORICAL_OBSERVED (reverify), never on current.
 */
function assess(observation: any, context: any): any {
  const rec = isObj(observation) ? observation : {};
  const ctx = isObj(context) ? context : {};
  const reasons: string[] = [];
  const out = (currency: string, mayAssertCurrent: boolean, reverifyRequired: boolean) =>
    Object.freeze({ currency, mayAssertCurrent, reverifyRequired, reasons: Object.freeze(reasons.slice()) });

  // 0. malformed — not even a usable observation.
  if (!isStr(rec.claim) || !isNum(rec.observedAtEpochMs) || !isStr(rec.method)) {
    reasons.push("malformed observation (claim/observedAtEpochMs/method required) ⇒ UNKNOWN; cannot assert current");
    return out("UNKNOWN", false, true);
  }
  // 1. kind gating — a hypothesis/proposal is never an observation of the present.
  const kind = isStr(rec.kind) ? rec.kind : "OBSERVATION";
  if (kind === "HYPOTHESIS") { reasons.push("kind=HYPOTHESIS — never asserts present state (not an observation)"); return out("HYPOTHESIS", false, false); }
  if (kind === "PROPOSED") { reasons.push("kind=PROPOSED — never asserts present state (not an observation)"); return out("PROPOSED", false, false); }

  // 2. explicit supersession by a newer contradicting observation.
  if (isStr(rec.supersededBy)) { reasons.push("supersededBy=" + rec.supersededBy + " — a newer observation replaces it ⇒ must re-verify"); return out("SUPERSEDED", false, true); }

  // 3. expiry — COMPOSE memory-taxonomy.isStale via a validUntil derived from validityDays (no duplicated math).
  if (isNum(rec.validityDays) && isNum(ctx.asOfEpochMs)) {
    const validUntil = rec.observedAtEpochMs + rec.validityDays * DAY_MS;
    if (TAX.isStale({ validUntil }, ctx.asOfEpochMs)) {
      reasons.push("age > validityDays (" + rec.validityDays + "d) ⇒ EXPIRED (memory-taxonomy.isStale) — must re-observe");
      return out("EXPIRED", false, true);
    }
  }

  // 4. commit/scope boundary — the core "memoire != etat actuel" rule. Deny-by-default.
  const scope = arr(rec.scope);
  const sameCommit = isStr(rec.observedCommit) && isStr(ctx.currentCommit) && rec.observedCommit === ctx.currentCommit;
  let worldUnchangedInScope = false;
  if (sameCommit) {
    worldUnchangedInScope = true;
    reasons.push("observedCommit === currentCommit — world has not moved under this observation");
  } else if (isStr(rec.observedCommit) && isStr(ctx.currentCommit)) {
    // commit advanced: only CURRENT if we have a KNOWN changed-set that PROVABLY misses the claim's scope.
    if (ctx.changedPathsKnown === true && scope.length > 0 && !scopeIntersectsChanged(scope, arr(ctx.changedPaths))) {
      worldUnchangedInScope = true;
      reasons.push("commit advanced but the KNOWN changed-set provably misses this scope — observation still describes it");
    } else {
      reasons.push("commit advanced and scope-untouched is NOT provable (unknown changed-set or scope intersects changes) ⇒ HISTORICAL");
    }
  } else {
    reasons.push("observedCommit/currentCommit missing — cannot prove same world ⇒ HISTORICAL (deny-by-default)");
  }

  if (!worldUnchangedInScope) return out("HISTORICAL_OBSERVED", false, true);

  // 5. the observation still describes the present world — grade its strength.
  if (rec.independentlyVerified === true && isNum(rec.corroboratingSources) && rec.corroboratingSources >= 2) {
    reasons.push("independently verified with ≥2 corroborating sources ⇒ CORROBORATED");
    return out("CORROBORATED", true, false);
  }
  if (rec.independentlyVerified === true) { reasons.push("independently verified (single path) ⇒ VERIFIED"); return out("VERIFIED", true, false); }
  reasons.push("method-backed, in-scope, non-stale, world unchanged ⇒ CURRENT_OBSERVED (assertable)");
  return out("CURRENT_OBSERVED", true, false);
}

/*
 * reconcile(observations, context) -> the §19 anti-rediscovery decision: partition a memory set into what may be
 * REUSED as current (skip re-observation) vs what MUST be re-verified vs what is not an assertable observation.
 * "ne refaire que le travail reellement necessaire." Pure projection over assess(); mutates nothing.
 */
function reconcile(observations: any, context: any): any {
  const list = Array.isArray(observations) ? observations : [];
  const assertableCurrent: any[] = [], mustReverify: any[] = [], notAnObservation: any[] = [];
  for (const o of list) {
    const a = assess(o, context);
    const row = Object.freeze({ id: isObj(o) && isStr(o.id) ? o.id : null, currency: a.currency, mayAssertCurrent: a.mayAssertCurrent, reverifyRequired: a.reverifyRequired });
    if (a.mayAssertCurrent) assertableCurrent.push(row);
    else if (a.reverifyRequired) mustReverify.push(row);
    else notAnObservation.push(row);
  }
  return Object.freeze({
    total: list.length,
    reusableCount: assertableCurrent.length,
    reverifyCount: mustReverify.length,
    notObservationCount: notAnObservation.length,
    assertableCurrent: Object.freeze(assertableCurrent),
    mustReverify: Object.freeze(mustReverify),
    notAnObservation: Object.freeze(notAnObservation),
    note: "§19 anti-rediscovery: reuse assertableCurrent as present fact; re-observe mustReverify; notAnObservation cannot assert present state",
  });
}

/*
 * demonstrate() -> deterministic real-shaped scenarios, including the V234 forensic observation, proving the demotion
 * from CURRENT_OBSERVED to HISTORICAL_OBSERVED across a commit/scope boundary. All epochs fixed (no clock).
 */
function demonstrate(): any {
  const T0 = Date.UTC(2026, 10, 16);                 // 2026-11-16 (deterministic constant, not a live clock)
  const v234 = Object.freeze({ id: "v234-no-resident-driver", claim: "no resident campaign-loop driver process; odg-radar-weekly.timer runs",
    kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "d1c042f", scope: ["runtime", "systemd-user"], method: "pgrep + systemctl --user list-timers", validityDays: 7 });

  const sameCommitNow = { asOfEpochMs: T0 + DAY_MS, currentCommit: "d1c042f" };                                  // 1 day later, same commit
  const advancedTouched = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234", changedPathsKnown: true, changedPaths: ["runtime/core/x.ts"] };
  const advancedUntouched = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234", changedPathsKnown: true, changedPaths: ["docs/readme.md"] };
  const advancedUnknown = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234" };                            // changed-set unknown
  const expiredCtx = { asOfEpochMs: T0 + 30 * DAY_MS, currentCommit: "d1c042f" };                                // 30d > 7d validity

  const scenarios = Object.freeze({
    v234_sameCommitFresh: assess(v234, sameCommitNow),                                                           // CURRENT_OBSERVED
    v234_commitAdvancedScopeTouched: assess(v234, advancedTouched),                                              // HISTORICAL_OBSERVED
    v234_commitAdvancedScopeUntouched: assess(v234, advancedUntouched),                                          // CURRENT_OBSERVED (provably untouched)
    v234_commitAdvancedUnknownChanges: assess(v234, advancedUnknown),                                            // HISTORICAL_OBSERVED (deny-by-default)
    v234_expired: assess(v234, expiredCtx),                                                                      // EXPIRED
    superseded: assess({ claim: "x", observedAtEpochMs: T0, method: "m", observedCommit: "d1c042f", supersededBy: "obs-99" }, sameCommitNow), // SUPERSEDED
    hypothesis: assess({ claim: "maybe", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "guess" }, sameCommitNow),                        // HYPOTHESIS
    malformed: assess({ claim: "x" }, sameCommitNow),                                                            // UNKNOWN
  });

  const recon = reconcile([v234, { id: "hyp", claim: "maybe", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "g" }], advancedUnknown);
  return Object.freeze({ scenarios, reconcileExample: recon,
    demotionProven: scenarios.v234_sameCommitFresh.currency === "CURRENT_OBSERVED" && scenarios.v234_commitAdvancedScopeTouched.currency === "HISTORICAL_OBSERVED" });
}

const OBSERVATION_CURRENCY_CONTRACT = Object.freeze({
  id: "V124EXT-OBSERVATION-CURRENCY",
  purpose: "§18/§19/§20 — decide whether a memorized observation may be asserted as CURRENT state or is only HISTORICAL and must be re-verified; the memoire != etat actuel rule",
  invariants: Object.freeze([
    "DENY-BY-DEFAULT: mayAssertCurrent true ONLY for CURRENT_OBSERVED/VERIFIED/CORROBORATED with a PROVABLY-unchanged world in the claim's scope",
    "commit advanced + scope-untouched NOT provable (unknown changed-set or intersection) ⇒ HISTORICAL_OBSERVED (reverify), never current",
    "a hypothesis/proposal/superseded/expired/malformed observation NEVER asserts present state",
    "COMPOSES memory-taxonomy.isStale for expiry; adds NO second store, NO 10th primitive, NO parallel truth base; deterministic (asOf injected)",
  ]),
});

module.exports = { CURRENCY, ASSERTABLE, assess, reconcile, demonstrate, OBSERVATION_CURRENCY_CONTRACT };
export {};
