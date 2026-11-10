#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V35 LOT B2 — MISSION OUTCOME LEDGER. PURE, deterministic, fail-closed. Records the REAL outcome of each
 * mission ATTEMPT (success AND failure) so calibration.ts can be fed an UNBIASED sample — closing the survivorship bias
 * V34 found (the closure-register records only accepted governance decisions). It is NOT a parallel memory: it is a thin
 * append-only outcome record over an injected store (same seam as the other ledgers), and it COMPOSES with calibration.
 *
 * §3 — distinct outcome kinds (never conflated): SUCCESS / FAILURE / BLOCKED / CANCELLED / DEFERRED / UNKNOWN. A POLICY
 * BLOCKED is NOT a technical failure; a never-executed mission is NOT an execution failure; a failed attempt followed by a
 * success keeps BOTH events. §5 — only an INDEPENDENTLY-VERIFIED outcome feeds a calibration presented as reliable; the
 * rest is censored/excluded, never silently counted. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

const OUTCOME = Object.freeze(["SUCCESS", "FAILURE", "BLOCKED", "CANCELLED", "DEFERRED", "UNKNOWN"]);

/** recordOutcome(outcomes, entry) -> { ok, outcomes } | { ok:false }. Append-only, deduped by (missionId, attempt).
 *  FAIL-CLOSED: a malformed entry (missing missionId/outcome, outcome not in the set) is REJECTED, never stored. */
function recordOutcome(outcomes: any, entry: any): any {
  const list = arr(outcomes).filter(isObj);
  const e = isObj(entry) ? entry : {};
  if (!isStr(e.missionId) || OUTCOME.indexOf(e.outcome) === -1) return Object.freeze({ ok: false, reason: "entry needs missionId + a known outcome", outcomes: Object.freeze(list) });
  const attempt = Number.isFinite(Number(e.attempt)) ? Math.max(1, Math.floor(Number(e.attempt))) : 1;
  if (list.some((x) => x.missionId === e.missionId && x.attempt === attempt)) return Object.freeze({ ok: true, deduped: true, reason: "duplicate (missionId, attempt) — not re-recorded", outcomes: Object.freeze(list) });
  const rec = Object.freeze({
    missionId: e.missionId, attempt, metier: e.metier || null, type: e.type || e.missionType || "unknown",
    outcome: e.outcome, at: isStr(e.at) ? e.at : null,
    independentlyVerified: e.independentlyVerified === true,
    evidence: isStr(e.evidence) ? e.evidence : null, provenance: e.provenance || null, componentVersion: e.componentVersion || null,
  });
  return Object.freeze({ ok: true, deduped: false, outcomes: Object.freeze(list.concat([rec])) });
}

/** classifyForCalibration(o) -> { counts, reason }. counts ∈ "SUCCESS" | "FAILURE" | "EXCLUDED". Only a VERIFIED SUCCESS/
 *  FAILURE counts; BLOCKED(policy)/CANCELLED/DEFERRED/UNKNOWN and any unverified outcome are EXCLUDED (censored). */
function classifyForCalibration(o: any): any {
  const x = isObj(o) ? o : {};
  if (x.outcome === "BLOCKED") return { counts: "EXCLUDED", reason: "POLICY/BLOCKED is not a technical execution failure — censored" };
  if (x.outcome === "CANCELLED" || x.outcome === "DEFERRED") return { counts: "EXCLUDED", reason: "not executed — censored, not a failure" };
  if (x.outcome === "UNKNOWN") return { counts: "EXCLUDED", reason: "unknown outcome — censored" };
  if (x.independentlyVerified !== true) return { counts: "EXCLUDED", reason: "no independent verification — excluded from a reliable calibration" };
  if (x.outcome === "SUCCESS") return { counts: "SUCCESS", reason: "verified success" };
  if (x.outcome === "FAILURE") return { counts: "FAILURE", reason: "verified failure" };
  return { counts: "EXCLUDED", reason: "unmapped" };
}

/**
 * buildCalibrationSample(outcomes, opts) -> { successes, failures, censored, unverified, n, basis }. basis: "attempt"
 * (every verified attempt) | "mission" (the FINAL verified outcome of the latest attempt per mission). Dedup by
 * (missionId, attempt). The output feeds calibration.calibratedEstimate / brierScore WITHOUT double counting.
 */
function buildCalibrationSample(outcomes: any, opts: any = {}): any {
  const basis = opts.basis === "mission" ? "mission" : "attempt";
  let list = arr(outcomes).filter(isObj);
  // dedup (missionId, attempt)
  const seen = new Set<string>(); list = list.filter((x) => { const k = x.missionId + "#" + x.attempt; if (seen.has(k)) return false; seen.add(k); return true; });
  if (basis === "mission") { const byMission: any = {}; for (const x of list) { const cur = byMission[x.missionId]; if (!cur || (x.attempt > cur.attempt)) byMission[x.missionId] = x; } list = Object.values(byMission); }
  let successes = 0, failures = 0, censored = 0, unverified = 0;
  for (const x of list) { const c = classifyForCalibration(x); if (c.counts === "SUCCESS") successes++; else if (c.counts === "FAILURE") failures++; else { censored++; if (x.independentlyVerified !== true && (x.outcome === "SUCCESS" || x.outcome === "FAILURE")) unverified++; } }
  return Object.freeze({ successes, failures, censored, unverified, n: successes + failures, basis, note: `${basis}-basis sample: ${successes} verified success / ${failures} verified failure (${censored} censored incl. ${unverified} unverified)` });
}

const MISSION_OUTCOME_LEDGER_CONTRACT = Object.freeze({
  id: "V124-MISSION-OUTCOME-LEDGER",
  source: "CTO V35 LOT B2 — real per-attempt outcome record to un-bias calibration",
  reuses: Object.freeze(["an injected store (same seam as reuse-ledger — no new DB)", "calibration.ts (consumes the sample; not replaced)"]),
  notAuthority: "records outcomes and builds a calibration sample; it estimates nothing and authorizes nothing",
  invariants: Object.freeze([
    "outcome kinds are distinct: BLOCKED(policy)/CANCELLED/DEFERRED/UNKNOWN are NOT technical failures (censored, not counted as failure)",
    "a failed attempt followed by a success keeps BOTH events (attempt basis); mission basis uses the final verified outcome",
    "only an INDEPENDENTLY-VERIFIED success/failure feeds a reliable calibration; unverified/no-evidence ⇒ censored",
    "append-only + deduped by (missionId, attempt); a malformed entry is rejected, never stored",
    "it never rewrites prior history and never produces artificial confidence; pure/deterministic",
  ]),
});

module.exports = { OUTCOME, recordOutcome, classifyForCalibration, buildCalibrationSample, MISSION_OUTCOME_LEDGER_CONTRACT };

if (require.main === module) {
  let s: any = { outcomes: [] };
  for (const e of [{ missionId: "m1", attempt: 1, outcome: "FAILURE", independentlyVerified: true }, { missionId: "m1", attempt: 2, outcome: "SUCCESS", independentlyVerified: true }, { missionId: "m2", attempt: 1, outcome: "BLOCKED" }]) s = recordOutcome(s.outcomes, e);
  const sample = buildCalibrationSample(s.outcomes, { basis: "attempt" });
  process.stdout.write(JSON.stringify({ ...MISSION_OUTCOME_LEDGER_CONTRACT, demo: { successes: sample.successes, failures: sample.failures, blockedNotCountedAsFailure: sample.failures === 1 } }, null, 2) + "\n");
}

export {};
