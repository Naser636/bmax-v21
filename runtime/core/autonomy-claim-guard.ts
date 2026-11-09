#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V27 §2C/§2D — AUTONOMY-CLAIM GUARD. PURE, deterministic, fail-closed. Code-enforces the rule "une
 * réalisation déléguée n'est pas une preuve d'autonomie native": a mission may be labelled NATIVE_AUTONOMOUS ONLY when
 * its EXECUTION-EVIDENCE provenance (resolved by the existing actor-provenance, NOT the Git author) attributes the work
 * to ODG with a CONCORDANT author+executor. Provider-authored work (TECHNICAL_PROVIDER), human work, or absent/ambiguous
 * provenance ⇒ the native-autonomy claim is REFUSED and downgraded to the honest actual actor.
 *
 * Context (audited 2026-11-09): ODG's runtime has NO code path that auto-delegates a mission to an external AI provider —
 * capability-executors runs the LOCAL model/provider only; the `api.anthropic.com` references are a connectivity PROBE
 * (detection), not an invocation. ODG's NATIVE engineering = the local-model repair loop (repair-retry + model-router).
 * This guard ensures that whoever actually did the work, the AUTONOMY CLAIM can never over-state it. It composes
 * actor-provenance (reuse) and adds no provenance of its own. Dual export.
 */

const AP = require("./actor-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const CLAIM = Object.freeze({ NATIVE_AUTONOMOUS: "NATIVE_AUTONOMOUS", PROVIDER_ASSISTED: "PROVIDER_ASSISTED", HUMAN: "HUMAN", UNATTRIBUTED: "UNATTRIBUTED" });

/** honestClaimFor(actor) -> the ONLY claim the resolved actor supports. ODG ⇒ NATIVE_AUTONOMOUS; TECHNICAL_PROVIDER ⇒
 *  PROVIDER_ASSISTED; HUMAN ⇒ HUMAN; null/other ⇒ UNATTRIBUTED. */
function honestClaimFor(actor: any): string {
  if (actor === AP.EXECUTOR.ODG) return CLAIM.NATIVE_AUTONOMOUS;
  if (actor === AP.EXECUTOR.TECHNICAL_PROVIDER) return CLAIM.PROVIDER_ASSISTED;
  if (actor === AP.EXECUTOR.HUMAN) return CLAIM.HUMAN;
  return CLAIM.UNATTRIBUTED;
}

/**
 * evaluateAutonomyClaim({ claimed, report, actor }) -> { admitted, resolvedActor, honestClaim, downgraded, reason }.
 * The resolved actor comes from actor-provenance over the mission's execution evidence (`report`), or an explicitly
 * supplied `actor` (for tests). FAIL-CLOSED: a NATIVE_AUTONOMOUS claim is ADMITTED only if the resolved actor is ODG;
 * otherwise it is REFUSED and downgraded to the honest claim. A claim never exceeds what the evidence attributes.
 */
function evaluateAutonomyClaim(input: any): any {
  const o = isObj(input) ? input : {};
  const claimed = typeof o.claimed === "string" ? o.claimed : CLAIM.NATIVE_AUTONOMOUS;
  const resolvedActor = o.actor !== undefined ? o.actor : (isObj(o.report) && typeof AP.resolveMissionActor === "function" ? AP.resolveMissionActor(o.report) : null);
  const honestClaim = honestClaimFor(resolvedActor);
  // A NATIVE_AUTONOMOUS claim requires the actor to BE ODG. Any other claim must also not exceed the honest one.
  const rank: any = { [CLAIM.UNATTRIBUTED]: 0, [CLAIM.HUMAN]: 1, [CLAIM.PROVIDER_ASSISTED]: 1, [CLAIM.NATIVE_AUTONOMOUS]: 2 };
  const admitted = claimed === honestClaim || (rank[claimed] || 0) <= (rank[honestClaim] || 0);
  const downgraded = !admitted;
  return Object.freeze({
    admitted,
    resolvedActor: resolvedActor || null,
    claimed,
    honestClaim,
    effectiveClaim: admitted ? claimed : honestClaim,
    downgraded,
    reason: admitted
      ? `claim '${claimed}' is supported by the evidence-attributed actor (${resolvedActor || "none"} ⇒ ${honestClaim})`
      : `claim '${claimed}' OVER-STATES the evidence: the work is attributed to ${resolvedActor || "no confident actor"} (${honestClaim}) — a delegated/unattributed realization is NOT native autonomy; downgraded to '${honestClaim}'`,
  });
}

const AUTONOMY_CLAIM_GUARD_CONTRACT = Object.freeze({
  id: "V124-AUTONOMY-CLAIM-GUARD",
  source: "CTO V27 §2C/§2D — code-enforce that a delegated realization is not native autonomy",
  reuses: Object.freeze(["actor-provenance.resolveMissionActor (honest execution-evidence attribution — NOT the Git author)"]),
  notAuthority: "evaluates whether an autonomy claim is supported by the evidence-attributed actor; invents no provenance; composes actor-provenance",
  invariants: Object.freeze([
    "NATIVE_AUTONOMOUS is admitted ONLY when the evidence-attributed actor is ODG (concordant author AND executor)",
    "provider-authored work ⇒ PROVIDER_ASSISTED; human ⇒ HUMAN; absent/ambiguous ⇒ UNATTRIBUTED — a claim is downgraded to the honest actor, never upgraded",
    "the Git author alone is NOT evidence of native autonomy (provenance comes from execution events)",
    "fail-closed: no confident actor ⇒ UNATTRIBUTED ⇒ a NATIVE_AUTONOMOUS claim is REFUSED",
    "a delegated or unattributed realization can never be declared native autonomy",
  ]),
});

module.exports = { CLAIM, honestClaimFor, evaluateAutonomyClaim, AUTONOMY_CLAIM_GUARD_CONTRACT };

if (require.main === module) {
  const providerWork = evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", actor: AP.EXECUTOR.TECHNICAL_PROVIDER });
  const odgWork = evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", actor: AP.EXECUTOR.ODG });
  process.stdout.write(JSON.stringify({ ...AUTONOMY_CLAIM_GUARD_CONTRACT, demo: { providerWorkRefused: providerWork.downgraded && providerWork.effectiveClaim === "PROVIDER_ASSISTED", odgWorkAdmitted: odgWork.admitted } }, null, 2) + "\n");
}

export {};
