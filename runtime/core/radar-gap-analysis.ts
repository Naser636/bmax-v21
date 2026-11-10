#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V37 LOT D — RADAR STRATEGIC GAP ANALYSIS. PURE, deterministic, fail-closed. It does NOT build a second
 * Radar — it COMPOSES the existing Radar (frontier-radar / roadmap-manager) with ODG's real capability inventory to add
 * the judgement the Radar needs (§5): given a discovered method/opportunity, decide whether it is ALREADY_AVAILABLE in
 * ODG, an IMPROVEMENT of an existing capability, a USEFUL_NEW capability, REDUNDANT, or INSUFFICIENTLY_DEMONSTRATED — and
 * produce a PROPOSED improvement only when it is genuinely useful + demonstrated. A proposal NEVER self-authorizes
 * (roadmap-manager discipline). It also measures the Radar's OWN relevance over its proposal history. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function norm(s: any): string { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

const CLASS = Object.freeze(["ALREADY_AVAILABLE", "IMPROVEMENT", "USEFUL_NEW", "REDUNDANT", "INSUFFICIENTLY_DEMONSTRATED"]);

/**
 * analyzeOpportunity(opportunity, capabilities) -> { classification, matchedCapability, proposalEligible, reason }.
 * opportunity: { title, competencies:[...], demonstrated:boolean, improvesExisting?:string }. capabilities: the existing
 * capability inventory [{ id, competencies:[...] }]. FAIL-CLOSED: an undemonstrated opportunity is INSUFFICIENTLY_
 * DEMONSTRATED (never promoted on a claim); one fully covered by an existing capability is ALREADY_AVAILABLE/REDUNDANT.
 */
function analyzeOpportunity(opportunity: any, capabilities: any): any {
  const o = isObj(opportunity) ? opportunity : {};
  const caps = arr(capabilities).filter(isObj);
  const need = arr(o.competencies).map(norm).filter(Boolean);
  // demonstrated? an opportunity with no evidence is not promotable.
  if (o.demonstrated !== true) return Object.freeze({ classification: "INSUFFICIENTLY_DEMONSTRATED", matchedCapability: null, proposalEligible: false, reason: "no demonstrated evidence of real utility — not promotable (fail-closed; a claim is not a proof)" });
  // an EXPLICIT improvement intent on a named existing capability takes precedence over "already covered".
  if (typeof o.improvesExisting === "string" && caps.some((c) => c.id === o.improvesExisting)) return Object.freeze({ classification: "IMPROVEMENT", matchedCapability: o.improvesExisting, proposalEligible: true, reason: `a demonstrated improvement of the existing ${o.improvesExisting} — propose as an enhancement (not a new engine)` });
  // is it already covered? a capability whose competencies cover ALL of the need ⇒ ALREADY_AVAILABLE.
  const covering = caps.find((c) => { const cc = arr(c.competencies).map(norm); return need.length > 0 && need.every((n) => cc.includes(n)); });
  if (covering) return Object.freeze({ classification: "ALREADY_AVAILABLE", matchedCapability: covering.id, proposalEligible: false, reason: `already covered by ${covering.id} — redundant, not proposed (avoid decorative additions)` });
  // partial overlap with several ⇒ still possibly redundant if MOST of the need is covered.
  const partial = caps.find((c) => { const cc = arr(c.competencies).map(norm); const hits = need.filter((n) => cc.includes(n)).length; return need.length > 0 && hits >= Math.ceil(need.length / 2); });
  if (partial) return Object.freeze({ classification: "REDUNDANT", matchedCapability: partial.id, proposalEligible: false, reason: `mostly overlaps ${partial.id} — treat as REDUNDANT unless a sharper gap is shown` });
  return Object.freeze({ classification: "USEFUL_NEW", matchedCapability: null, proposalEligible: true, reason: "a demonstrated, non-covered capability — eligible to be PROPOSED (still requires governed authorization)" });
}

/** toProposal(opportunity, analysis) -> a PROPOSED record (authorized:false) or null when not eligible. Never self-authorizes. */
function toProposal(opportunity: any, analysis: any): any {
  if (!analysis || analysis.proposalEligible !== true) return null;
  const o = isObj(opportunity) ? opportunity : {};
  return Object.freeze({ title: o.title || "(radar proposal)", kind: analysis.classification, improves: analysis.matchedCapability || null, status: "PROPOSED", authorized: false, grantsNoPermission: true, reason: "radar proposal — requires governed authorization (discovery ≠ authorization; no self-promotion)" });
}

/**
 * radarSelfEvaluation(history) -> { proposals, integrated, rejectedRedundant, undemonstrated, relevanceRate, note }.
 * Measures the Radar's OWN quality (§5): how many proposals were genuinely useful vs redundant/undemonstrated, and how
 * many were actually integrated. history: [{ classification, integrated?:boolean }].
 */
function radarSelfEvaluation(history: any): any {
  const h = arr(history).filter(isObj);
  const proposals = h.length;
  const integrated = h.filter((x) => x.integrated === true).length;
  const redundant = h.filter((x) => x.classification === "ALREADY_AVAILABLE" || x.classification === "REDUNDANT").length;
  const undemonstrated = h.filter((x) => x.classification === "INSUFFICIENTLY_DEMONSTRATED").length;
  const useful = h.filter((x) => x.classification === "USEFUL_NEW" || x.classification === "IMPROVEMENT").length;
  return Object.freeze({
    proposals, integrated, rejectedRedundant: redundant, undemonstrated,
    relevanceRate: proposals ? Number((useful / proposals).toFixed(4)) : null,
    note: proposals === 0 ? "no proposals to evaluate" : `${useful}/${proposals} proposals were useful/improvement; ${redundant} redundant, ${undemonstrated} undemonstrated — the Radar is measured on real relevance, not volume`,
  });
}

const RADAR_GAP_ANALYSIS_CONTRACT = Object.freeze({
  id: "V124-RADAR-GAP-ANALYSIS",
  source: "CTO V37 LOT D — strategic gap analysis composing the existing Radar + capability inventory",
  reuses: Object.freeze(["frontier-radar / roadmap-manager (the existing Radar + discovery ≠ authorization)", "capability-map (ODG's real capability inventory)"]),
  notAuthority: "classifies an opportunity vs ODG's capabilities and PROPOSES only genuinely-useful demonstrated ones; it promotes nothing and authorizes nothing",
  invariants: Object.freeze([
    "an undemonstrated opportunity ⇒ INSUFFICIENTLY_DEMONSTRATED (a claim is not a proof) — never promoted",
    "a capability fully/mostly covered by an existing one ⇒ ALREADY_AVAILABLE/REDUNDANT — not proposed (no decorative additions)",
    "a demonstrated improvement of a named existing capability ⇒ IMPROVEMENT (enhance, not a new engine)",
    "a proposal is PROPOSED (authorized:false) and grants no permission — discovery ≠ authorization, no self-promotion",
    "the Radar is measured on real relevance (useful vs redundant/undemonstrated/integrated), not on proposal volume",
  ]),
});

module.exports = { CLASS, analyzeOpportunity, toProposal, radarSelfEvaluation, RADAR_GAP_ANALYSIS_CONTRACT };

if (require.main === module) {
  const caps = [{ id: "fdir-engine", competencies: ["fault", "recovery"] }];
  const covered = analyzeOpportunity({ title: "generic FDIR", competencies: ["fault", "recovery"], demonstrated: true }, caps);
  const novel = analyzeOpportunity({ title: "formal verification gate", competencies: ["formal-methods", "model-checking"], demonstrated: true }, caps);
  const unproven = analyzeOpportunity({ title: "hype method", competencies: ["x"], demonstrated: false }, caps);
  process.stdout.write(JSON.stringify({ ...RADAR_GAP_ANALYSIS_CONTRACT, demo: { covered: covered.classification, novel: novel.classification, unproven: unproven.classification } }, null, 2) + "\n");
}

export {};
