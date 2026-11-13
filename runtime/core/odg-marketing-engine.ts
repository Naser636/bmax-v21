#!/usr/bin/env node
"use strict";
/*
 * V182 §4.3 — marketing (one of V180's three MISSING capabilities). PURE, deterministic, fail-closed, governed.
 *
 * A MEASURABLE, governed marketing capability: segmentation, positioning / value proposition, controlled content
 * generation with an UNPROVEN-CLAIM detector, campaign preparation, CAC + contribution measurement. CRITICAL:
 * generating a campaign does NOT authorize publishing it, buying ads, or contacting prospects — all of that is
 * OWNER_GATED. Unsubstantiated commercial claims BLOCK publishability. CAC ≠ margin ≠ net (non-conflation preserved).
 *
 * No parallel system: reuses the economic-model non-conflation discipline; mints no second registry/economic model.
 */

// unproven-claim signals: superlatives, guarantees, and numeric performance claims need evidence or must be dropped.
// global (g) flag so String.match returns ONLY full matches, never capture groups; groups are non-capturing (?:...).
const CLAIM_RED_FLAGS = Object.freeze([
  /\b(?:best|n[°o]\s?1|number one|leader|guarantee[ds]?|guaranteed|100%|always|never fails?|unbeatable|fastest|cheapest)\b/gi,
  /\b(?:meilleur|num[ée]ro\s?1|leader|garanti[e]?s?|100\s?%|infaillible|imbattable|le plus rapide|le moins cher)\b/gi,
  /\b\d{2,}%\s*(?:faster|cheaper|more|better|de plus|plus rapide|moins cher)\b/gi,
]);

/* segment — rank candidate segments by a transparent weighted fit (deterministic). Inputs are structured signals only. */
function segment(candidates: any[]): any {
  const rows = (Array.isArray(candidates) ? candidates : []).map((c: any) => {
    const fit = (Number(c.needIntensity) || 0) * 0.4 + (Number(c.reachability) || 0) * 0.3 + (Number(c.budgetSignal) || 0) * 0.3;
    return Object.freeze({ id: c.id, fit: Math.round(fit * 100) / 100, evidence: c.evidence || "HYPOTHESIS" });
  });
  rows.sort((a: any, b: any) => b.fit - a.fit || (a.id < b.id ? -1 : 1));
  return Object.freeze({ segments: Object.freeze(rows), note: "fit is a transparent weighted score of structured signals; a high fit is NOT validated demand." });
}

/* positioning — a value proposition tied to STRUCTURED product evidence (no invented differentiators). */
function positioning(product: any, segment: any): any {
  const diff = Array.isArray(product && product.evidencedDifferentiators) ? product.evidencedDifferentiators : [];
  return Object.freeze({
    product: product && product.id, segment: segment && segment.id,
    valueProposition: diff.length ? `For ${segment && segment.id}: ${diff.join("; ")}` : "INSUFFICIENT_EVIDENCE — no evidenced differentiators to claim",
    evidencedDifferentiators: Object.freeze(diff.slice()),
    grounded: diff.length > 0,
    note: diff.length ? "value proposition built from evidenced differentiators only" : "abstain: cannot position without evidenced differentiators",
  });
}

/* claimAudit — detect unproven commercial claims; a claim survives only if backed by a provided evidence reference. */
function claimAudit(text: string, evidenceRefs?: any): any {
  const t = String(text || "");
  const refs = evidenceRefs || {};
  const flagged: string[] = [];
  for (const re of CLAIM_RED_FLAGS) { const m = t.match(re); if (m) for (const hit of m) if (!flagged.includes(hit)) flagged.push(hit); }
  const unproven = flagged.filter((f: string) => !refs[f.toLowerCase()]);
  return Object.freeze({ flagged: Object.freeze(flagged.sort()), unproven: Object.freeze(unproven.sort()), clean: unproven.length === 0, note: unproven.length ? "unproven commercial claims present — content NOT publishable until each is evidenced or removed" : "no unproven claims detected" });
}

/* generateContent — produces a DRAFT only, with a claim audit attached. Never publishable if unproven claims remain. */
function generateContent(brief: any): any {
  const body = String((brief && brief.body) || "");
  const audit = claimAudit(body, brief && brief.evidenceRefs);
  return Object.freeze({
    status: "DRAFT", channel: brief && brief.channel, locale: brief && brief.locale,
    body, claimAudit: audit, publishable: audit.clean,
    note: "DRAFT only — generation does NOT authorize publication, ad spend, or prospect contact (OWNER_GATED)",
  });
}

/* campaignPlan — assembles a plan; publication/ad-spend/contact are OWNER_GATED (never autonomous). */
function campaignPlan(plan: any): any {
  const contents = Array.isArray(plan && plan.contents) ? plan.contents : [];
  const anyUnproven = contents.some((c: any) => c && c.claimAudit && !c.claimAudit.clean);
  return Object.freeze({
    status: "OWNER_GATED", executed: false,
    channels: Object.freeze((plan && plan.channels) || []),
    contentCount: contents.length,
    publishableContents: contents.filter((c: any) => c && c.publishable).length,
    blockedByUnprovenClaims: anyUnproven,
    note: "campaign PREPARED only — publishing, buying ads, and contacting prospects are OWNER_GATED and require explicit authorization",
  });
}

/* attributeCAC — CAC + contribution; preserves non-conflation (CAC ≠ contribution ≠ margin ≠ net). */
function attributeCAC(spend: number, acquired: number, contributionPerCustomer: number): any {
  const s = Number(spend) || 0, a = Number(acquired) || 0, cpc = Number(contributionPerCustomer) || 0;
  const cac = a > 0 ? Math.round(s / a) : null;
  const totalContribution = cpc * a;
  const netOfCac = totalContribution - s;
  return Object.freeze({
    spend: s, acquired: a, cac, contributionPerCustomer: cpc, totalContribution, contributionNetOfCac: netOfCac,
    paybackRatio: cac != null && cpc > 0 ? Math.round((cpc / cac) * 100) / 100 : null,
    note: "CAC is acquisition cost per customer — NOT margin, NOT net profit. contributionNetOfCac is contribution minus spend, still NOT operating/net profit.",
  });
}

const MARKETING_CONTRACT = Object.freeze({
  id: "V182-MARKETING-ENGINE",
  purpose: "§4.3 — governed, measurable marketing: segmentation, positioning, content with claim audit, campaign prep, CAC",
  invariants: Object.freeze([
    "generating content/campaigns does NOT authorize publishing, buying ads, or contacting prospects — all OWNER_GATED",
    "unproven commercial claims BLOCK publishability (detected, must be evidenced or removed)",
    "positioning abstains without evidenced differentiators (no invented claims)",
    "CAC ≠ contribution ≠ margin ≠ net profit — non-conflation preserved",
    "deterministic; fail-closed; no parallel registry/economic model",
  ]),
});

module.exports = { CLAIM_RED_FLAGS, segment, positioning, claimAudit, generateContent, campaignPlan, attributeCAC, MARKETING_CONTRACT };
export {};
