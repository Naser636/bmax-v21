#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V24 (transversal) — PROMOTION-ASSURANCE GATE. PURE, deterministic, fail-closed. The §6 invariant "no
 * promotion bypasses POLICY, Truth Lock, or independent assurance, and no proposal self-authorizes" is currently enforced
 * IMPLICITLY across the frontier pipeline (POLICY in action-gate, external authorization at the boundary, the frontier-lab
 * independent verifier, the chain stopping at PROPOSED). This gate makes that invariant a SINGLE composable, auditable
 * enforcement point: it DECIDES PROMOTE only when ALL of the required controls are positively satisfied, and REFUSES with
 * the exact missing control otherwise. It COMPOSES the existing signals (it re-implements none and performs no promotion
 * itself — the governed caller promotes only on PROMOTE). A promotion is a consequential, owner-authorized act; this gate
 * is deny-by-default on every axis. Dual export.
 *
 * Crucially (mirroring the métier-parcours assurance discipline): independent assurance ≠ the proposer's own measurement.
 * A claimed gain re-confirmed only by the proposer is REFUSED; promotion requires an INDEPENDENT verifier's PASS on a
 * path distinct from the proposer.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// The required promotion controls (ALL must hold). Each maps to an existing canonical signal.
const REQUIRED_CONTROLS = Object.freeze([
  "proposalWellFormed",     // a PROPOSED/READY proposal that grants no permission by itself (proposition ≠ autorisation)
  "notSelfAuthorized",      // the proposal/chain never self-authorizes
  "policyAllow",            // action-gate POLICY admission === ALLOW
  "truthLockSatisfied",     // Truth Lock repo-safety satisfied
  "externalAuthorization",  // an EXTERNAL (owner/CTO) authorization — the Radar cannot self-authorize
  "independentVerification", // an INDEPENDENT verifier PASS on a path distinct from the proposer (not proposer-measured)
]);

/**
 * evaluatePromotion(proposal, context) -> { verdict:"PROMOTE"|"REFUSE", controls:{...bool}, missing:[...], reason }.
 * proposal: { candidateId|id, status, grantsNoPermission, selfAuthorized? }.
 * context: { policy:"ALLOW"|..., truthLock:"SATISFIED"|..., externalAuthorization:{ approved, authorizedBy }|null,
 *            independentVerification:{ verdict:"PASS"|..., by, proposerMeasured? }|null }.
 * FAIL-CLOSED: any missing/false/ambiguous control ⇒ REFUSE (deny-by-default). No side effects.
 */
function evaluatePromotion(proposal: any, context: any): any {
  const p = isObj(proposal) ? proposal : {};
  const c = isObj(context) ? context : {};
  const iv = isObj(c.independentVerification) ? c.independentVerification : null;
  const ea = isObj(c.externalAuthorization) ? c.externalAuthorization : null;

  const controls: any = {
    proposalWellFormed: (isStr(p.candidateId) || isStr(p.id)) && (p.status === "PROPOSED" || p.status === "READY") && p.grantsNoPermission === true,
    notSelfAuthorized: p.selfAuthorized !== true,
    policyAllow: c.policy === "ALLOW",
    truthLockSatisfied: c.truthLock === "SATISFIED",
    externalAuthorization: !!(ea && ea.approved === true && isStr(ea.authorizedBy)),
    // independent: a PASS AND NOT proposer-measured (a proposer re-confirming its own claim is NOT independent assurance).
    independentVerification: !!(iv && iv.verdict === "PASS" && iv.proposerMeasured !== true && isStr(iv.by)),
  };

  const missing = REQUIRED_CONTROLS.filter((k) => controls[k] !== true);
  const verdict = missing.length === 0 ? "PROMOTE" : "REFUSE";
  return Object.freeze({
    verdict,
    controls: Object.freeze(controls),
    missing: Object.freeze(missing),
    reason: verdict === "PROMOTE"
      ? "all promotion controls satisfied (POLICY ALLOW + Truth Lock + external authorization + independent verification; proposal grants no permission and does not self-authorize)"
      : `promotion REFUSED — missing/failed control(s): ${missing.join(", ")} (deny-by-default; no promotion bypasses POLICY / Truth Lock / independent assurance)`,
  });
}

const PROMOTION_ASSURANCE_CONTRACT = Object.freeze({
  id: "V124-PROMOTION-ASSURANCE",
  source: "CTO V24 transversal — single auditable promotion gate for the self-improvement / Radar chain",
  reuses: Object.freeze(["action-gate (POLICY ALLOW)", "truth-lock-gate (repo-safety)", "objective-authorization / external owner authorization", "frontier-lab independent verifier (PASS on a distinct path)", "frontier-radar-store (proposals grant no permission)"]),
  notAuthority: "decides PROMOTE/REFUSE by composing existing controls; performs no promotion; a proposal never self-authorizes; the governed caller promotes only on PROMOTE",
  invariants: Object.freeze([
    "deny-by-default: any missing/false control ⇒ REFUSE (POLICY, Truth Lock, external authorization, independent verification, well-formed proposal, not self-authorized — ALL required)",
    "independent assurance ≠ the proposer's own measurement: a proposer-measured verification is REFUSED; promotion needs an INDEPENDENT verifier PASS on a distinct path",
    "the Radar cannot self-authorize: externalAuthorization (owner/CTO) is mandatory",
    "a proposal must grant no permission by itself (proposition ≠ autorisation) and must not be flagged self-authorized",
    "pure/no side effects: it decides; the governed caller performs the promotion only on PROMOTE",
  ]),
});

module.exports = { REQUIRED_CONTROLS, evaluatePromotion, PROMOTION_ASSURANCE_CONTRACT };

if (require.main === module) {
  const ok = evaluatePromotion(
    { candidateId: "frontier-prop:cand:x", status: "PROPOSED", grantsNoPermission: true },
    { policy: "ALLOW", truthLock: "SATISFIED", externalAuthorization: { approved: true, authorizedBy: "odg-cto" }, independentVerification: { verdict: "PASS", by: "frontier-lab/independent" } },
  );
  const selfMeasured = evaluatePromotion(
    { candidateId: "y", status: "PROPOSED", grantsNoPermission: true },
    { policy: "ALLOW", truthLock: "SATISFIED", externalAuthorization: { approved: true, authorizedBy: "odg-cto" }, independentVerification: { verdict: "PASS", by: "proposer", proposerMeasured: true } },
  );
  process.stdout.write(JSON.stringify({ ...PROMOTION_ASSURANCE_CONTRACT, demo: { fullyControlled: ok.verdict, proposerMeasuredRefused: selfMeasured.verdict === "REFUSE" } }, null, 2) + "\n");
}

export {};
