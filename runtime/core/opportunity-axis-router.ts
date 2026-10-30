#!/usr/bin/env node
/**
 * opportunity-axis-router — V34: the MISSING link between the existing discovery pipeline and the six-axis portfolio.
 * COMPOSES opportunity-detector.detect (provenance/dedup/scoring/nextAction already done — NOT duplicated) and routes
 * each discovered opportunity to axis A/B/C/D/E/F, attaches the ODG-executable next action, and ranks by FIT (evidence/
 * feasibility/time-to-act), NOT headline contract value. Adds a live-source RUNNER that returns an explicit NO_RESULTS
 * when no authorized source connector is wired (the honest state in this runtime).
 *
 * HONESTY (mandate): a synthetic source is a TEST, not a customer. ODG invents NO prospect, demand, eligibility,
 * conversion or revenue. Provenance + timestamp come from opportunity-detector; economics stay HYPOTHESIS. Nothing is
 * sent/submitted/committed. ISO is readiness (routes to the dossier), never certification. Pure/deterministic.
 */
"use strict";

const DET = require("./opportunity-detector.js");

const AXES = Object.freeze(["A", "B", "C", "D", "E", "F"]);

// V38 capability-fit vocabulary — ODG's ACTUAL deliverable surface. The first LIVE run exposed that naive substring
// matching is low-precision (e.g. "ssi" matches inside "aussi/assistance") — so matching is now TOKEN-based for single
// stems and SUBSTRING only for distinctive multi-word PHRASES. EN + FR. Precision favoured over recall (park, not drop).
const CAPABILITY_STEMS: readonly string[] = Object.freeze([
  "cyber", "cybersécurité", "cybersecurity", "logiciel", "logicielle", "software", "sbom", "rgpd", "gdpr", "devsecops",
  "pentest", "informatique", "numérique", "applicatif", "application", "intégration", "vulnérab", "27001", "42001",
]);
const CAPABILITY_PHRASES: readonly string[] = Object.freeze([
  "iso 27001", "iso 42001", "sécurité informatique", "sécurité des systèmes", "système d'information", "assurance logicielle",
  "software assurance", "cartographie applicative", "développement logiciel", "test d'intrusion", "intelligence artificielle",
  "ai act", "supply chain", "chaîne d'approvisionnement logiciel",
]);
const CAPABILITY_KEYWORDS: readonly string[] = Object.freeze([...CAPABILITY_STEMS, ...CAPABILITY_PHRASES]);

function str(v: any): string { return typeof v === "string" ? v : ""; }
function tokens(s: string): string[] { return s.split(/[^a-z0-9àâäéèêëïîôöùûüç]+/i).filter(Boolean); }
// The languages the EN+FR capability vocabulary can actually ASSESS. A subject in any other language that matches no
// keyword is UNDETERMINED (unassessable), NOT a confident negative — hence covered vs not-covered must be distinguished.
function langCovered(lang: string): boolean { return lang === "" || /^(en|fr|eng|fra|fre)(-|$)/.test(lang); }

/**
 * capabilityFit(opp): is the subject within ODG's actual deliverable surface? HIGH-PRECISION: single stems match a
 * word token (startsWith, so logiciel→logicielle); phrases match as a substring. Explainable (returns the matches).
 * FAIRNESS/HONESTY: when a keyword matches, relevant=true regardless of language (a match is a match). When NOTHING
 * matches AND the subject's language is KNOWN and NOT covered by the EN/FR vocabulary, the result is UNDETERMINED
 * (coverage:"LANGUAGE_NOT_COVERED") — NEVER silently relevant:false — so a German/Italian/Spanish ODG-relevant tender
 * is flagged "cannot assess" (needs multilingual vocab/translation), not lumped with a genuine EN/FR non-match.
 */
function capabilityFit(opp: any): any {
  const subj = str(opp && opp.subject).toLowerCase();
  const lang = str(opp && opp.language).toLowerCase();
  const toks = tokens(subj);
  const stemHits = CAPABILITY_STEMS.filter((k) => toks.some((t) => t === k || (k.length >= 5 && t.startsWith(k))));
  const phraseHits = CAPABILITY_PHRASES.filter((p) => subj.includes(p));
  const matched = [...new Set([...stemHits, ...phraseHits])];
  if (matched.length) {
    return { relevant: true, undetermined: false, coverage: "ASSESSED", fitScore: Math.min(5, matched.length), matchedKeywords: matched, reason: `matches ODG capability: ${matched.slice(0, 4).join(", ")}` };
  }
  if (lang && !langCovered(lang)) {
    // Known, non-EN/FR language with no keyword hit ⇒ we literally cannot assess it ⇒ UNDETERMINED, not a confident "no".
    return { relevant: false, undetermined: true, coverage: "LANGUAGE_NOT_COVERED", language: lang, fitScore: 0, matchedKeywords: [], reason: `subject language '${lang}' is NOT covered by the EN/FR capability vocabulary — UNDETERMINED (not assessed as non-relevant); needs multilingual vocabulary or translation before a fit decision` };
  }
  return { relevant: false, undetermined: false, coverage: "ASSESSED", fitScore: 0, matchedKeywords: [], reason: "no ODG capability keyword in subject — parked (not dropped)" };
}

/** routeToAxis(opp): six-axis routing from subject keywords + value band. No fabricated eligibility. */
function routeToAxis(opp: any): any {
  const subj = str(opp && opp.subject).toLowerCase();
  // EN + FR vocabulary (FR added: homologation/accréditation = certification; revendeur/distributeur/distribution/
  // partenaire/sous-traitance/accord-cadre = partner) so FR tenders route to F/D instead of silently defaulting to A.
  if (/\b(iso|27001|42001|soc ?2|certification|compliance audit|homologation|accréditation|accreditation)\b/.test(subj)) return { axis: "F", reason: "standards/certification-readiness subject" };
  // FR partner terms kept SPECIFIC: bare "distribution"/"distributeur"/"accord-cadre" are too generic in FR tender text
  // ("distribution électrique", "accord-cadre de fourniture de papier" = ordinary supply contracts, NOT reseller/partner),
  // so only distinctly-partner terms are used (revendeur, partenaire, sous-traitance/-ant, "accord de distribution").
  if (/\b(partner|reseller|subcontract|framework agreement|channel|distributor|partenaire|revendeur|sous-traitance|sous-traitant|accord de distribution)\b/.test(subj)) return { axis: "D", reason: "partner/distribution subject" };
  const b = (opp && typeof opp.budgetEur === "number") ? opp.budgetEur : null;
  if (b === null) return { axis: "A", reason: "no published budget ⇒ entry diagnostic default (lowest barrier)" };
  if (b < 1500) return { axis: "A", reason: "value < €1.5k ⇒ entry" };
  if (b < 8000) return { axis: "B", reason: "€1.5k–€8k ⇒ mid-market" };
  if (b <= 50000) return { axis: "C", reason: "€8k–€50k ⇒ enterprise" };
  return { axis: "E", reason: "> €50k ⇒ premium mission (price by scope, NOT the headline value)" };
}

/** nextOdgAction(axis): the ODG-executable PREPARE step (never a send/submit/sign). */
function nextOdgAction(axis: any): string {
  switch (axis) {
    case "A": return "entry-diagnostic-offer: qualify + prepare entry diagnostic pack (outreach human-gated)";
    case "B": return "mid-market-offer: prepare audit+remediation package";
    case "C": return "enterprise-qualification → enterprise-proposal-template: qualify + prepare proposal (signature human-gated)";
    case "D": return "partner-channel: qualify partner + prepare proposition (no acceptance assumed)";
    case "E": return "enterprise-mission-model: build scope-justified SOW (price by scope, never to a target)";
    case "F": return "iso-dossier: map requirement→evidence (NOT_CERTIFIED; no cert claimed)";
    default: return "MONITOR (insufficient evidence)";
  }
}

/** rankByFit(opps): transparent multi-factor fit score — evidence + feasibility + time-to-act, value only lightly. */
function rankByFit(opps: any[]): any[] {
  const comp = (o: any) => {
    const grade = str(o.grade);
    const evidenceW = ({ A: 25, B: 15, C: 0, REJECTED: -1000 } as any)[grade] || 0;
    const feasW = o.feasible === true ? 30 : (o.feasible === false ? -20 : 0);
    const deadlineW = o.deadlinePassed === true ? -40 : (o.deadlineDays === null || o.deadlineDays === undefined ? 0 : (o.deadlineDays >= 7 ? 15 : 5));
    const budgetKnownW = (typeof o.budgetEur === "number") ? 10 : 0;   // value KNOWN helps; magnitude deliberately NOT dominant
    const scamW = Array.isArray(o.scamFlags) && o.scamFlags.length ? -1000 : 0;
    const fitScore = evidenceW + feasW + deadlineW + budgetKnownW + scamW;
    return { evidenceW, feasW, deadlineW, budgetKnownW, scamW, fitScore };
  };
  return opps.map((o: any) => ({ ...o, fit: comp(o) })).sort((a: any, b: any) => b.fit.fitScore - a.fit.fitScore);
}

/**
 * runDiscovery(opts): opts.source = a function returning raw opportunity items from an AUTHORIZED connector.
 * No source / empty ⇒ explicit NO_RESULTS (live discovery honestly yields nothing without a wired connector).
 */
function runDiscovery(opts: any = {}): any {
  const externalGate = { need: "an authorized public-tender/OCDS/RFP/partner source connector + its usage terms", classification: "EXTERNAL_PROVIDER_OR_CREDENTIAL_REQUIRED", candidates: ["OCDS-based open procurement APIs", "EU TED", "FR BOAMP"] };
  if (typeof opts.source !== "function") {
    return { status: "NO_RESULTS", reason: "no authorized live source connector wired in this runtime — ODG invents no opportunities; live discovery yields NO_RESULTS", externalGate, opportunities: [] };
  }
  let raw: any;
  try { raw = opts.source(); } catch (e: any) { return { status: "SOURCE_ERROR", detail: e && e.message, externalGate, opportunities: [] }; }
  if (!Array.isArray(raw) || raw.length === 0) return { status: "NO_RESULTS", reason: "source returned no items", externalGate, opportunities: [] };

  let det: any;
  try { det = DET.detect(raw, opts.detectOpts || {}); } catch (e: any) { return { status: "DETECT_ERROR", detail: e && e.message, externalGate, opportunities: [] }; }
  let kept = det.shortlist.filter((o: any) => o.grade !== "REJECTED");
  // V38 capability-fit filter (opt-in): PARK (never drop) subjects outside ODG's deliverable surface so a raw
  // public-tender feed yields a QUALIFIED ODG shortlist instead of noise.
  const parked: any[] = [];
  const undetermined: any[] = [];   // FAIRNESS: subjects we CANNOT assess (language not covered) — distinct from a confident non-match.
  if (opts.requireCapabilityFit === true) {
    const relevant: any[] = [];
    for (const o of kept) {
      const f = capabilityFit(o);
      if (f.relevant) relevant.push({ ...o, capabilityFit: f });
      else if (f.undetermined) undetermined.push({ id: o.id, subject: o.subject, language: f.language || null, coverage: f.coverage, reason: f.reason });
      else parked.push({ id: o.id, subject: o.subject, reason: f.reason });
    }
    kept = relevant;
  }
  const routed = kept.map((o: any) => { const r = routeToAxis(o); return { ...o, axis: r.axis, axisReason: r.reason, nextOdgAction: nextOdgAction(r.axis) }; });
  const ranked = rankByFit(routed);
  const byAxis: Record<string, number> = {}; for (const a of AXES) byAxis[a] = 0;
  for (const o of ranked) byAxis[o.axis] = (byAxis[o.axis] || 0) + 1;
  return {
    status: ranked.length ? "RESULTS" : "NO_RESULTS",
    synthetic: opts.synthetic === true,
    counts: Object.assign({}, det.counts, { parked: parked.length, undetermined: undetermined.length, capabilityFiltered: opts.requireCapabilityFit === true }),
    byAxis, parked, undetermined,
    opportunities: ranked,
    note: (opts.synthetic === true ? "SYNTHETIC source ⇒ these are TESTS, not customers. " : "") + "Provenance/timestamp from opportunity-detector; economics are HYPOTHESIS; eligibility not assumed; nothing sent/submitted/committed; ISO routes to readiness (NOT certification).",
  };
}

export { AXES, CAPABILITY_KEYWORDS, capabilityFit, routeToAxis, nextOdgAction, rankByFit, runDiscovery };
module.exports = { AXES, CAPABILITY_KEYWORDS, capabilityFit, routeToAxis, nextOdgAction, rankByFit, runDiscovery };

if (require.main === module) {
  process.stdout.write(JSON.stringify(runDiscovery({}), null, 2) + "\n");   // no connector ⇒ NO_RESULTS
}
