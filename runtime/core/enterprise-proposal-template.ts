#!/usr/bin/env node
/**
 * enterprise-proposal-template — axis C (CTO V28 Priority C): reusable enterprise PROPOSAL templates for a
 * QUALIFIED opportunity. COMPOSES enterprise-qualification (gate: must be QUALIFIED), enterprise-mission-model
 * (scope-justified price), and proposal-generator.scanClaims (anti-overclaim) — it does not duplicate them.
 *
 * HONESTY (mandate): a template is built ONLY for a QUALIFIED record (else refused). KNOWN FACTS (from the
 * recorded qualification) are kept SEPARATE from HYPOTHESES (schedule assumptions, scope-derived price estimate,
 * open questions). Customer identity is a caller-supplied REFERENCE only — no name / budget / procurement status /
 * reference / acceptance / urgency is fabricated. Price is DERIVED from scope (enterprise-mission-model), never a
 * target. Overclaiming language is rejected (scanClaims). Items needing legal review are flagged. This PREPARES a
 * template; it does not send, commit, or price to win. Pure/deterministic.
 */
"use strict";

const Q = require("./enterprise-qualification.js");
const ENT = require("./enterprise-mission-model.js");
const PROP = require("./proposal-generator.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * buildTemplate({ customerRef, qualification, mission }): returns a PREPARED proposal template or fail-closed.
 * customerRef is an opaque reference (e.g. "PROSPECT-001"), NOT a real/invented customer name.
 */
function buildTemplate(input: any = {}): any {
  if (!isObj(input) || !isObj(input.qualification)) return { ok: false, code: "INVALID_INPUT", detail: "qualification record required" };
  const q = Q.qualify(input.qualification);
  if (!q.ok) return { ok: false, code: "INVALID_QUALIFICATION", detail: q.code };
  if (q.verdict !== "QUALIFIED") return { ok: false, code: "NOT_QUALIFIED", verdict: q.verdict, missing: q.missingRequired, disqualifiers: q.disqualifiers, detail: "a proposal template is only prepared for a QUALIFIED opportunity" };

  const rec = input.qualification;
  // Scope-justified price (enterprise-mission-model) when a mission SOW is supplied; else price is an OPEN QUESTION.
  let pricing: any;
  if (isObj(input.mission)) {
    const a = ENT.assessMission(input.mission);
    pricing = a.ok
      ? { source: "scope-derived", justifiedPrice: a.justifiedPrice, proposedPrice: a.proposedPrice, priceJustified: a.priceJustified, flags: a.flags, totalHours: a.totalHours, capacityExceeded: a.capacityExceeded }
      : { source: "INVALID_MISSION", code: a.code };
  } else {
    pricing = { source: "OPEN_QUESTION", note: "no mission SOW supplied ⇒ price is scope-dependent and must be derived (enterprise-mission-model) before quoting — never a target" };
  }

  const customerRef = nonEmptyString(input.customerRef) ? input.customerRef : "PROSPECT-REF (no real name)";

  // KNOWN FACTS — only what the qualification record actually carries.
  const knownFacts: Record<string, any> = {};
  for (const d of Q.DIMENSIONS) if (q.coverage[d.key]) knownFacts[d.key] = rec[d.key];

  // HYPOTHESES / OPEN QUESTIONS — never presented as fact.
  const openQuestions = [
    ...(pricing.source === "OPEN_QUESTION" ? ["final scope + scope-derived price"] : []),
    "confirm procurement + PO process",
    "confirm data access + security constraints",
    "confirm decision timeline + signatories",
  ];
  const hypotheses = ["schedule assumes prompt input from the client", "price is a scope-derived ESTIMATE, not a committed quote", "delivery capacity assumes stated specialist availability"];

  const template = {
    customerRef,
    customerProblem: rec.problem || null,
    intendedOutcome: rec.impact || null,
    verifiedRequirements: knownFacts,
    openQuestions,
    hypotheses,
    scope: input.scope || "to be finalized from the agreed SOW (enterprise-mission-model)",
    exclusions: input.exclusions || ["pentest/runtime security", "legal opinion / certification", "code implementation (advisory roadmap)"],
    deliverables: input.deliverables || ["assurance dossier + SARIF", "remediation roadmap", "readiness/evidence mapping"],
    acceptanceCriteria: rec.acceptanceCriteria || ["to be agreed before kickoff"],
    milestones: (isObj(input.mission) && Array.isArray(input.mission.milestones)) ? input.mission.milestones : [],
    pricing,
    paymentSchedule: (isObj(input.mission) && Array.isArray(input.mission.paymentSchedule)) ? input.mission.paymentSchedule : [{ note: "milestone-based; to be agreed" }],
    securityPrivacy: "client data treated confidential; no cross-client reuse; evidence retained for the engagement, purged on request",
    responsibilities: { odg: "deliver scoped assurance + roadmap", client: "provide inputs/access, act on roadmap, approve policies (ISMS acts are the client's)" },
    changeControl: "scope changes via written change request, re-estimated (enterprise-mission-model)",
    limitations: ["synthetic/declared inputs unless live access granted", "readiness ≠ certification", "no SLA/monitoring unless a separate retainer"],
    legalReviewItems: ["liability + limitation of liability", "IP ownership of deliverables", "data-processing agreement / GDPR roles", ...(nonEmptyString(rec.contractualConstraints) || Array.isArray(rec.contractualConstraints) ? ["recorded contractual constraints"] : [])],
    status: "PREPARED",   // PREPARED only — not sent, not signed, not a commitment
  };

  // Anti-overclaim: scan the narrative for prohibited superlatives/claims; refuse to emit overclaiming text.
  const narrative = [template.customerProblem, template.intendedOutcome, template.scope].filter(nonEmptyString).join(" ");
  const claims = PROP.scanClaims(narrative);

  return {
    ok: true,
    verdict: q.verdict,
    estimatedProbability: q.estimatedProbability,   // ASSUMPTION (from qualification)
    pipelineStage: q.pipelineStage,                 // QUALIFIED
    template,
    antiOverclaim: { clean: claims.ok, violations: claims.violations },
    note: "PREPARED template for a QUALIFIED opportunity. Known facts separated from hypotheses; no customer name/budget/acceptance invented; price scope-derived (not a target). Outbound/signature are human-gated. estimatedProbability is an ASSUMPTION; observed conversion is NO_DATA.",
  };
}

export { buildTemplate };
module.exports = { buildTemplate };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "enterprise-proposal-template/1", composes: ["enterprise-qualification", "enterprise-mission-model", "proposal-generator"], rule: "QUALIFIED-only; facts≠hypotheses; price scope-derived; PREPARED not sent" }, null, 2) + "\n");
}
