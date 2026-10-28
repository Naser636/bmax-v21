#!/usr/bin/env node
/**
 * canary-decision-pack — V58 §2: PREPARES (does NOT activate) the owner decision for a single-mission canary
 * authorization of the autonomous dispatch loop. The lock (V57) is `ODG_CANARY_ALLOWLIST` deny-by-default + empty.
 * This module (a) validates that a candidate mission is genuinely SAFE for a bounded canary (read-only, no network,
 * no spend, non-destructive), and (b) assembles a structured decision dossier incl. the EXACT minimal change.
 *
 * It NEVER sets the allowlist, never mutates env/config, never fabricates a mission id, and never weakens the
 * deny-by-default. The minimal change is surfaced for the OWNER to apply (a one-shot env var for a single tick) —
 * not a code change, not committed. Pure/deterministic; no new primitive.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const VALID_ID = /^[A-Z0-9][A-Z0-9_]{2,100}$/;   // canonical mission-id shape; no shell metachars, no injection

/**
 * assessCanaryCandidate(spec): is a mission SAFE for a bounded read-only canary? A candidate is SAFE only if it is
 * read-only (requiresEngineering !== true AND no authorizedPaths) and declares no network/spend/destructive need.
 * Returns { safe, blockers[], checks }. Fail-closed: anything uncertain ⇒ NOT safe.
 */
function assessCanaryCandidate(spec: any): any {
  if (!isObj(spec) || typeof spec.mission !== "string") return { safe: false, blockers: ["no mission spec/id"], checks: {} };
  const blockers: string[] = [];
  if (!VALID_ID.test(spec.mission)) blockers.push(`mission id '${spec.mission}' is not a valid canonical id`);
  const readOnly = spec.requiresEngineering !== true && (!Array.isArray(spec.authorizedPaths) || spec.authorizedPaths.length === 0);
  if (!readOnly) blockers.push("mission is NOT read-only (requiresEngineering/authorizedPaths present) — out of canary scope");
  if (spec.network === true || spec.requiresNetwork === true) blockers.push("mission declares network use");
  if (spec.spend === true || (typeof spec.budgetEur === "number" && spec.budgetEur > 0)) blockers.push("mission declares spend");
  if (spec.destructive === true) blockers.push("mission declares destructive effects");
  const checks = { validId: VALID_ID.test(spec.mission), readOnly, noNetwork: !(spec.network === true || spec.requiresNetwork === true), noSpend: !(spec.spend === true || (typeof spec.budgetEur === "number" && spec.budgetEur > 0)), nonDestructive: spec.destructive !== true };
  return { safe: blockers.length === 0, blockers, checks };
}

/**
 * buildDecisionPack(spec, opts?): assemble the owner decision dossier. `opts.priorEvidence` may carry a verified
 * prior non-destructive run (e.g. V57's direct odg-run G10 13/13). Returns a structured, non-activating record.
 */
function buildDecisionPack(spec: any, opts: any = {}): any {
  const assessment = assessCanaryCandidate(spec);
  return {
    kind: "CANARY_AUTHORIZATION_DECISION",
    activated: false,                      // this module NEVER activates
    recommendedMission: spec && spec.mission,
    safeForCanary: assessment.safe,
    safetyChecks: assessment.checks,
    blockers: assessment.blockers,
    operationsItCanTouch: assessment.safe ? "read-only pipeline stages + runtime/generated/* (gitignored, transient); NO repo writes for a read-only mission" : "n/a (unsafe candidate)",
    sideEffects: "for a read-only mission: none tracked (effects confined to gitignored runtime/generated/)",
    noNetworkSpendDestructive: assessment.checks.noNetwork === true && assessment.checks.noSpend === true && assessment.checks.nonDestructive === true,
    bounds: {
      selection: "scheduler injects a SYNTHETIC one-item queue from the allowlist id (isolated canary interface, not the canonical queue)",
      duration: "mission-scheduler policy maxDurationMs; single tick (one dispatch)",
      repeat: "proven-gate dedup ⇒ a proven mission is not re-dispatched (idempotence)",
      resume: "checkpoint-engine RC-2 (FAILED not auto-resumable); interrupt/complete persisted",
      stop: "ODG_SCHEDULER_STOP=1 / stopSignal ⇒ STOPPED before any dispatch",
    },
    priorEvidence: opts.priorEvidence || "V57: direct governed `odg-run.js G10_READONLY_AUTONOMY_PROBE` ⇒ PIPELINE SUCCESS 13/13, tree clean (non-destructive) — the executor path is proven; only the AUTONOMOUS tick path remains allowlist-gated",
    acceptance: "canary PASSES iff: tickOnce selects the allowlisted mission, dispatch runs the real pipeline, the VE returns a verdict, evidence is produced, the audit chain verifies, and interrupt/timeout/missing-proof/out-of-scope never yield a false success; a re-tick does not duplicate effects",
    revocation: "remove the id from ODG_CANARY_ALLOWLIST (or set it empty) ⇒ immediate return to deny-by-default IDLE",
    minimalChange: {
      type: "ENV (one-shot, owner-applied, NOT committed, NOT a code change)",
      exact: assessment.safe ? `ODG_CANARY_ALLOWLIST=${spec.mission} (single id) for ONE tick run` : "none — resolve blockers first",
      forbidden: ["editing deny-by-default", "committing the allowlist", "adding >1 id", "authorizing a non-read-only mission"],
    },
    verdict: assessment.safe ? "READY_FOR_OWNER_AUTHORIZATION (not activated; awaiting explicit owner grant in-scope)" : "NOT_READY (unsafe candidate — blockers listed)",
    note: "ODG prepared this decision; it did NOT authorize, set the allowlist, or run the autonomous canary. Deny-by-default preserved.",
  };
}

export { assessCanaryCandidate, buildDecisionPack, VALID_ID };
module.exports = { assessCanaryCandidate, buildDecisionPack, VALID_ID };
