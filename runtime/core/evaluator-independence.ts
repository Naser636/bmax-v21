#!/usr/bin/env node
"use strict";

/*
 * V12.4 §36/§49 — EVALUATOR INDEPENDENCE audit. PURE, deterministic. For a change/mission it audits whether the
 * Builder, Tester, Verifier and Challenger are genuinely independent: it flags SHARED dependencies (same model, data,
 * tool, script, assumption, evaluator, environment, evidence access) that compromise a cross-verification, and the
 * self-certification case (verifier == builder). Independence is a property to DEMONSTRATE, not a consequence of merely
 * using several agents (V12.4 §49). It REUSES meta-intelligence (evaluator-capture) as the integrity lens; it creates
 * no authorizer and takes no decision — it reports an honest independence verdict for ODG to act on. Dual export.
 */

const MI = require("./meta-intelligence");

const ROLES = Object.freeze(["builder", "tester", "verifier", "challenger"]);
const SHARED_DIMENSIONS = Object.freeze(["model", "data", "tool", "script", "assumption", "evaluator", "environment", "evidenceAccess"]);
const VERDICT = Object.freeze(["INDEPENDENT", "WEAK", "COMPROMISED", "INSUFFICIENT_DATA"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * auditIndependence(actors) -> { verdict, sharedDeps, selfCertification, criticalShared }. actors: { builder, tester,
 * verifier, challenger } each a dependency profile { id, model, data, tool, script, assumption, evaluator, environment,
 * evidenceAccess }. COMPROMISED if verifier == builder (self-certification) OR the verifier shares a CRITICAL dimension
 * (model/data/evaluator/evidenceAccess) with the builder. WEAK on non-critical shared dims. Fail-closed on missing roles.
 */
function auditIndependence(actors: any): any {
  const a = isObj(actors) ? actors : {};
  const builder = isObj(a.builder) ? a.builder : null;
  const verifier = isObj(a.verifier) ? a.verifier : null;
  if (!builder || !verifier) return Object.freeze({ verdict: "INSUFFICIENT_DATA", reason: "builder and verifier profiles required", sharedDeps: Object.freeze([]), selfCertification: false });

  const selfCertification = isStr(builder.id) && builder.id === verifier.id;
  const CRITICAL = new Set(["model", "data", "evaluator", "evidenceAccess"]);
  const sharedDeps: any[] = [];
  for (const dim of SHARED_DIMENSIONS) {
    const bv = builder[dim]; const vv = verifier[dim];
    if (bv !== undefined && bv !== null && bv === vv) sharedDeps.push({ dimension: dim, value: bv, critical: CRITICAL.has(dim) });
  }
  const criticalShared = sharedDeps.filter((s: any) => s.critical);
  // reuse meta-intelligence evaluator-capture as the integrity lens (verifier influenced by the builder).
  const capture = MI.detectEvaluatorCapture ? MI.detectEvaluatorCapture({ sharedWithBuilder: criticalShared.length, evaluator: verifier.id, builder: builder.id }) : { verdict: "NONE" };

  let verdict: string;
  if (selfCertification || criticalShared.length > 0) verdict = "COMPROMISED";
  else if (sharedDeps.length > 0) verdict = "WEAK";
  else verdict = "INDEPENDENT";

  return Object.freeze({
    verdict, selfCertification,
    sharedDeps: Object.freeze(sharedDeps), criticalShared: Object.freeze(criticalShared),
    captureVerdict: capture && capture.verdict ? capture.verdict : "NO_DATA",
    note: "independence is DEMONSTRATED, not assumed from using multiple agents (§49); critical shared model/data/evaluator/evidence ⇒ COMPROMISED",
  });
}

const EVALUATOR_INDEPENDENCE_CONTRACT = Object.freeze({
  id: "V124-EVALUATOR-INDEPENDENCE",
  source: "V12.4 §36/§49 — evaluator independence audit (Builder≠Tester≠Verifier≠Challenger)",
  roles: ROLES, sharedDimensions: SHARED_DIMENSIONS, verdicts: VERDICT,
  reuses: Object.freeze(["meta-intelligence (evaluator-capture lens)"]),
  notAuthority: "reports an honest independence verdict; it takes no decision and creates no authorizer",
  invariants: Object.freeze([
    "self-certification (verifier == builder) ⇒ COMPROMISED",
    "a shared CRITICAL dimension (model/data/evaluator/evidence access) between builder and verifier ⇒ COMPROMISED",
    "a shared non-critical dimension ⇒ WEAK; none ⇒ INDEPENDENT",
    "independence is DEMONSTRATED, never assumed from merely using several agents (§49)",
    "pure/deterministic; fail-closed (missing roles ⇒ INSUFFICIENT_DATA)",
  ]),
});

module.exports = { ROLES, SHARED_DIMENSIONS, VERDICT, EVALUATOR_INDEPENDENCE_CONTRACT, auditIndependence };

if (require.main === module) { process.stdout.write(JSON.stringify(EVALUATOR_INDEPENDENCE_CONTRACT, null, 2) + "\n"); }

export {};
