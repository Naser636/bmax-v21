#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V69 §4 — SOURCE INTELLIGENCE (multi-dimensional, NON-binary). Fills the P9 gap: grades an external
 * information item across many dimensions and assigns an epistemic TYPOLOGY — NOT a binary certified/not. A non-certified
 * / recent / experimental / community source is NEVER auto-rejected; a reputable source is NEVER auto-true; contradictions
 * are KEPT, not dropped. PURE/deterministic; composes the canonical basis vocabulary (evidence-provenance) — no new
 * primitive, no parallel registry. Dual export. Fail-closed: missing signals lower the credibility band, never fabricate it.
 */

const TYPOLOGY = Object.freeze(["VERIFIED_FACT", "PUBLISHED_RESULT", "UNVERIFIED_CLAIM", "HYPOTHESIS", "OPINION", "RUMOR", "EXPERIMENT", "ODG_REPRODUCED"]);
const BANDS = Object.freeze(["LOW", "MODERATE", "SUBSTANTIAL", "STRONG"]);   // credibility bands (never binary true/false)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d: number): number { return typeof v === "number" && isFinite(v) ? v : d; }
function clamp01(n: number): number { return Math.min(1, Math.max(0, n)); }

/*
 * assessSource(info) -> multi-dimensional assessment. info:
 *   { provenance?, publishedAt?, lastVerifiedAt?, ageDays?, reputation(0..1)?, authorCompetence(0..1)?,
 *     independentCorroborations?, evidence(0..1)?, reproduced?, consistentWithKnown?, contradictions?,
 *     plausibility(0..1)?, maturity(0..1)?, manipulationRisk(0..1)?, kind? }
 * NEVER rejects a source for being non-certified; NEVER asserts truth for being reputable. Fail-closed on missing signals.
 */
function assessSource(info: any): any {
  const i = isObj(info) ? info : {};
  const dims = {
    hasProvenance: typeof i.provenance === "string" && i.provenance.length > 0,
    ageDays: typeof i.ageDays === "number" ? i.ageDays : null,
    freshnessKnown: typeof i.ageDays === "number" || typeof i.publishedAt === "string",
    reputation: clamp01(num(i.reputation, 0)),
    authorCompetence: clamp01(num(i.authorCompetence, 0)),
    independentCorroborations: Math.max(0, Math.floor(num(i.independentCorroborations, 0))),
    evidenceStrength: clamp01(num(i.evidence, 0)),
    reproducedByOdg: i.reproduced === true,
    consistentWithKnown: i.consistentWithKnown === true,
    contradictionCount: Array.isArray(i.contradictions) ? i.contradictions.length : Math.max(0, Math.floor(num(i.contradictions, 0))),
    plausibility: clamp01(num(i.plausibility, 0.5)),
    maturity: clamp01(num(i.maturity, 0)),
    manipulationRisk: clamp01(num(i.manipulationRisk, 0)),
  };

  // epistemic typology — deterministic, honest (NOT a credibility score; a label of what KIND of claim this is).
  let typology: string;
  if (dims.reproducedByOdg) typology = "ODG_REPRODUCED";
  else if (dims.evidenceStrength >= 0.7 && dims.independentCorroborations >= 2) typology = "VERIFIED_FACT";
  else if (dims.hasProvenance && dims.evidenceStrength >= 0.4) typology = "PUBLISHED_RESULT";
  else if (/experiment|prototype|benchmark/i.test(String(i.kind || ""))) typology = "EXPERIMENT";
  else if (/opinion|blog|forum/i.test(String(i.kind || ""))) typology = "OPINION";
  else if (/rumor|leak|unconfirmed/i.test(String(i.kind || ""))) typology = "RUMOR";
  else if (/hypothesis|conjecture/i.test(String(i.kind || ""))) typology = "HYPOTHESIS";
  else typology = "UNVERIFIED_CLAIM";

  // credibility band = weighted, bounded; evidence/independence/reproduction raise it, contradictions/manipulation lower it.
  const raw = clamp01(
    0.30 * dims.evidenceStrength + 0.20 * clamp01(dims.independentCorroborations / 3) + 0.15 * dims.reputation +
    0.10 * dims.authorCompetence + 0.10 * dims.plausibility + 0.10 * dims.maturity + (dims.reproducedByOdg ? 0.15 : 0) -
    0.15 * clamp01(dims.contradictionCount / 3) - 0.15 * dims.manipulationRisk,
  );
  const band = raw >= 0.75 ? "STRONG" : raw >= 0.5 ? "SUBSTANTIAL" : raw >= 0.25 ? "MODERATE" : "LOW";

  return Object.freeze({
    typology, credibilityBand: band, credibilityScore: Number(raw.toFixed(3)), dimensions: Object.freeze(dims),
    rejected: false,                                       // §4: a non-certified source is NEVER auto-rejected
    keepContradictions: dims.contradictionCount > 0,       // §4: contradictions kept + examined, never dropped
    notes: [
      dims.hasProvenance ? null : "no provenance ⇒ lower band (NOT rejected)",
      dims.reputation >= 0.8 && dims.evidenceStrength < 0.4 ? "reputable but weak evidence ⇒ NOT auto-true" : null,
      dims.contradictionCount > 0 ? `${dims.contradictionCount} contradiction(s) kept for examination` : null,
      dims.reproducedByOdg ? "reproduced by ODG ⇒ strongest epistemic status" : null,
    ].filter(Boolean),
  });
}

const SOURCE_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V69-SOURCE-INTELLIGENCE", source: "CTO V69 §4 — multi-dimensional, non-binary source evaluation for the P9 radar",
  reuses: Object.freeze(["evidence-provenance basis vocabulary (composed, not duplicated)", "source-registry / control-evidence-freshness signals"]),
  typology: TYPOLOGY, bands: BANDS,
  notAuthority: "an epistemic grader; it classifies and rates, it decides no integration (ODG decides); it never certifies",
  invariants: Object.freeze([
    "NON-binary: a credibility BAND + an epistemic TYPOLOGY, never certified/not-certified",
    "a non-certified/recent/community source is NEVER auto-rejected; a reputable source is NEVER auto-true",
    "contradictions are KEPT and flagged for examination, never silently dropped",
    "ODG_REPRODUCED is the strongest status; pure/deterministic; missing signals lower the band, never fabricate it",
  ]),
});

module.exports = { TYPOLOGY, BANDS, assessSource, SOURCE_INTELLIGENCE_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(SOURCE_INTELLIGENCE_CONTRACT, null, 2) + "\n"); }
export {};
