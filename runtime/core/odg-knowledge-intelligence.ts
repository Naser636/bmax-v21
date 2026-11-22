/**
 * V373 KNOWLEDGE INTELLIGENCE V2 — Lot 1 (structured claims, source identity, four independent dimensions).
 * PURE, deterministic (injected clock), no network/fs. A LAYER over the EXISTING memory (memory-taxonomy record shape,
 * memory-trust-gate admission, actor-provenance attribution) and the step-2 claim↔quote binding — NO second memory,
 * NO second radar, NO new orchestrator, no 10th primitive.
 *
 * What changes vs the step-1/2 FACT path (odg-radar-gate-chain.runChain, unchanged):
 *  - claims are STRUCTURED {subject, relation, value, scope, time, version, qualifiers} + per-source {url, citation};
 *  - independence is judged by PUBLISHER ORGANIZATION (source identity), not by domain: two Toyota domains = ONE source family;
 *  - a single verified OFFICIAL primary source documenting its OWN statement ⇒ SUPPORTED (never CORROBORATED);
 *    CORROBORATED requires ≥2 INDEPENDENT organizations whose structured keys match — never lexical similarity alone;
 *  - four dimensions are computed SEPARATELY and never collapsed: epistemic · maturity · authorization · risk;
 *  - candidate/supported knowledge is KEPT in memory (not discarded for lack of a 2nd source), but it is never a "fact".
 * HONESTY: structured keys are AUTHORED (by the caller/extractor), not inferred by a model; a matching key is a controlled
 * comparison, not proof of truth. Unknown publisher ⇒ UNKNOWN identity ⇒ cannot count toward independence.
 */
const crypto = require("crypto");
const MTG = require("./memory-trust-gate.js");
const ACTOR = require("./actor-provenance.js");
const BIND = require("./odg-claim-quote-binding.js");   // reuse the step-2 claim↔quote binding (supports/covered)

const EPISTEMIC = Object.freeze(["UNKNOWN", "CANDIDATE", "SUPPORTED", "CORROBORATED", "CONTRADICTED", "INVALIDATED"]);
const MATURITY = Object.freeze(["DISCOVERED", "USABLE", "EXPERIMENTAL", "QUALIFIED", "OPERATIONALLY_DEMONSTRATED"]);
const AUTHORIZATION = Object.freeze(["READ_ONLY_ANALYSIS", "DESIGN_PROPOSAL", "SANDBOX_EXPERIMENT", "INTERNAL_IMPLEMENTATION", "INTERNAL_INTEGRATION", "BLOCKED"]);
const RISK = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const NATURE = Object.freeze(["OFFICIAL_DOCUMENTATION", "TECHNICAL_METHOD", "PERFORMANCE_CLAIM", "SCIENTIFIC_PUBLICATION", "SECURITY_CRITICAL", "INTERNAL_OBSERVATION", "STRATEGIC_HYPOTHESIS", "EXPERIENCE_REPORT"]);

/* SOURCE IDENTITY — who really publishes. Keyed by exact host; explicit, versioned, extendable (unknown ⇒ UNKNOWN).
 * family groups sources with a common documentary origin (same organization ⇒ same family ⇒ NOT independent). */
const PUBLISHERS: Record<string, any> = Object.freeze({
  "global.toyota": { organization: "Toyota Motor Corporation", family: "toyota", role: "PRIMARY_OFFICIAL" },
  "www.toyota-europe.com": { organization: "Toyota Motor Europe (Toyota group)", family: "toyota", role: "PRIMARY_OFFICIAL" },
  "sre.google": { organization: "Google", family: "google", role: "PRIMARY_OFFICIAL" },
  "www.nist.gov": { organization: "NIST (US Dept. of Commerce)", family: "nist", role: "PRIMARY_OFFICIAL" },
  "www.nasa.gov": { organization: "NASA", family: "nasa", role: "PRIMARY_OFFICIAL" },
  "sma.nasa.gov": { organization: "NASA Office of Safety and Mission Assurance", family: "nasa", role: "PRIMARY_OFFICIAL" },
});
function hostOf(u: any): string { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ""; } }
function identityOf(url: string): any {
  const p = PUBLISHERS[hostOf(url)];
  return p ? Object.freeze({ host: hostOf(url), ...p, known: true }) : Object.freeze({ host: hostOf(url), organization: null, family: null, role: "UNKNOWN", known: false });
}

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function sha(v: any): string { return crypto.createHash("sha256").update(JSON.stringify(v === undefined ? null : v)).digest("hex"); }
function nkey(v: any): string { return String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim(); }
/* structured key used for cross-source comparison: subject+relation+value (+scope). Qualifiers/time/version are KEPT and
 * compared separately: a key match with differing qualifiers is reported as a DIVERGENCE, not silently merged. */
function structuredKey(c: any): string { return [nkey(c.subject), nkey(c.relation), nkey(c.value), nkey(c.scope)].join("|"); }

/*
 * assessClaim(claim, opts) -> four-dimensional, explainable assessment.
 * claim: { id?, subject, relation, value, scope?, time?, version?, qualifiers?: string[], nature, text,
 *          sources: [{ url, citation, text?: the source's own statement, structured?: {subject, relation, value, scope} }] }
 * opts:  { asOfEpochMs (required), byUrl: { [url]: {quotes[]} } (recorded page quotes), quarantined?: string[],
 *          missionAuthorization?: one of AUTHORIZATION (granted by the mission contract), risk?: one of RISK,
 *          contradictingSources?: [{url, citation}], invalidatedBy?: string }
 */
function assessClaim(claim: any, opts: any): any {
  const c = isObj(claim) ? claim : {};
  const o = isObj(opts) ? opts : {};
  if (!Number.isFinite(o.asOfEpochMs)) throw new Error("assessClaim: asOfEpochMs required (deterministic)");
  const byUrl = isObj(o.byUrl) ? o.byUrl : {};
  const quarantined = new Set<string>(Array.isArray(o.quarantined) ? o.quarantined : []);
  const reasons: string[] = [];

  // 1-3. verify each source separately: citation verbatim on ITS page + bound to the claim text (step-2 binding).
  const srcList = Array.isArray(c.sources) ? c.sources : [];
  // a source may contribute SEVERAL citations to one statement (e.g. two sentences of the same page): coverage is judged on
  // the UNION of that url's citations (same rule as the step-2 replay); each citation must still be verbatim + substantive.
  const citationsOf = (u: any) => srcList.filter((x: any) => x && x.url === u && typeof x.citation === "string").map((x: any) => x.citation);
  const perSource = srcList.map((s: any) => {
    const id = identityOf(s && s.url);
    const sp = { url: s && s.url, quote: s && s.citation };
    // each source may state the claim in ITS OWN words (s.text); its citation is bound to THAT text, never to another
    // source's wording. Cross-source agreement is then decided by the structured key, not by lexical similarity.
    const ownText = typeof (s && s.text) === "string" && s.text ? s.text : c.text;
    const bound = BIND.supports(sp, ownText, byUrl, quarantined) && BIND.covered(ownText, citationsOf(sp.url), sp.url);
    const key = isObj(s && s.structured) ? structuredKey(s.structured) : structuredKey(c);
    return Object.freeze({ url: sp.url, identity: id, citationVerified: bound, structuredKey: key, quarantined: quarantined.has(sp.url) });
  });
  const seenUrl = new Set<string>();
  const verified = perSource.filter((p: any) => p.citationVerified && !p.quarantined && !seenUrl.has(p.url) && (seenUrl.add(p.url), true));
  const claimKey = structuredKey(c);

  // 4-7. independence by ORGANIZATION FAMILY among verified sources whose structured key matches the claim.
  const matching = verified.filter((p: any) => p.structuredKey === claimKey);
  const divergent = verified.filter((p: any) => p.structuredKey !== claimKey);
  const knownFamilies = Array.from(new Set(matching.filter((p: any) => p.identity.known).map((p: any) => p.identity.family)));
  const unknownIdentity = matching.filter((p: any) => !p.identity.known).length;
  const officialPrimary = matching.some((p: any) => p.identity.role === "PRIMARY_OFFICIAL");

  // EPISTEMIC (independent of maturity/authorization/risk).
  let epistemic = "UNKNOWN";
  const contradicted = Array.isArray(o.contradictingSources) && o.contradictingSources.some((x: any) => BIND.supports({ url: x.url, quote: x.citation }, x.text || x.citation, byUrl, quarantined));
  if (typeof o.invalidatedBy === "string" && o.invalidatedBy) { epistemic = "INVALIDATED"; reasons.push("invalidated by " + o.invalidatedBy); }
  else if (contradicted) { epistemic = "CONTRADICTED"; reasons.push("a verified source contradicts the claim"); }
  else if (knownFamilies.length >= 2) { epistemic = "CORROBORATED"; reasons.push("matching structured key from " + knownFamilies.length + " independent publisher families: " + knownFamilies.join(", ")); }
  else if (matching.length >= 1 && officialPrimary && c.nature === "OFFICIAL_DOCUMENTATION") { epistemic = "SUPPORTED"; reasons.push("verified OFFICIAL primary source documenting its own statement (" + (knownFamilies[0] || "?") + ") — supports WHAT THE PUBLISHER STATES, not a general truth"); }
  else if (matching.length >= 1) { epistemic = "CANDIDATE"; reasons.push("verified citation, but nature '" + (c.nature || "?") + "' needs " + (c.nature === "PERFORMANCE_CLAIM" ? "an independent reproducible benchmark" : c.nature === "SCIENTIFIC_PUBLICATION" ? "methodology/reproducibility review" : "evidence appropriate to its nature")); }
  else if (perSource.length) { epistemic = "UNKNOWN"; reasons.push("no source citation verified against the recorded page text"); }
  if (matching.length >= 2 && knownFamilies.length < 2) reasons.push("repetition within ONE publisher family (" + (knownFamilies.join(",") || "unknown") + ") is NOT independent corroboration");
  if (unknownIdentity) reasons.push(unknownIdentity + " source(s) with UNKNOWN publisher identity — not counted for independence");
  if (divergent.length) reasons.push(divergent.length + " verified source(s) with a DIFFERENT structured key kept as divergence (not merged)");

  // MATURITY (operational, NOT truth): starts at DISCOVERED; USABLE once a citation is verified; higher levels require
  // evidence supplied by a mission (experiment / qualification / demonstrated benefit) — never inferred here.
  let maturity = verified.length ? "USABLE" : "DISCOVERED";
  if (o.experimentApproved === true && verified.length) maturity = "EXPERIMENTAL";
  if (o.qualificationEvidence === true && maturity === "EXPERIMENTAL") maturity = "QUALIFIED";
  if (o.demonstratedBenefit === true && maturity === "QUALIFIED") maturity = "OPERATIONALLY_DEMONSTRATED";

  // RISK (drives verification/authorization requirements). Default from nature; caller may only RAISE it.
  const natureRisk: Record<string, string> = { SECURITY_CRITICAL: "HIGH", PERFORMANCE_CLAIM: "MEDIUM", STRATEGIC_HYPOTHESIS: "MEDIUM" };
  const base = natureRisk[c.nature] || "LOW";
  const risk = RISK.indexOf(o.risk) > RISK.indexOf(base) ? o.risk : base;

  // AUTHORIZATION — from the MISSION CONTRACT (permissions/risk), never from confidence. Capped by epistemic+risk:
  const requested = AUTHORIZATION.includes(o.missionAuthorization) ? o.missionAuthorization : "READ_ONLY_ANALYSIS";
  let authorization = requested;
  if (epistemic === "INVALIDATED" || epistemic === "CONTRADICTED" || epistemic === "UNKNOWN") authorization = epistemic === "UNKNOWN" ? "READ_ONLY_ANALYSIS" : "BLOCKED";
  else if ((risk === "HIGH" || risk === "CRITICAL") && epistemic !== "CORROBORATED" && AUTHORIZATION.indexOf(requested) > AUTHORIZATION.indexOf("SANDBOX_EXPERIMENT")) {
    authorization = "SANDBOX_EXPERIMENT"; reasons.push("high-risk + not corroborated ⇒ capped at SANDBOX_EXPERIMENT");
  }

  return Object.freeze({
    id: c.id || "kc:" + sha({ k: claimKey, t: c.text }).slice(0, 16),
    structured: Object.freeze({ subject: c.subject, relation: c.relation, value: c.value, scope: c.scope || null, time: c.time || null, version: c.version || null, qualifiers: Object.freeze((c.qualifiers || []).slice()) }),
    text: c.text, nature: c.nature || null,
    dimensions: Object.freeze({ epistemic, maturity, authorization, risk }),
    isFact: epistemic === "CORROBORATED",          // only corroborated knowledge may be presented as an established fact
    sources: Object.freeze(perSource), independentFamilies: Object.freeze(knownFamilies),
    reasons: Object.freeze(reasons),
  });
}

/* toMemory(assessment, asOf) -> record in the EXISTING memory shape (family "semantic"); kept even when not a fact.
 * status mirrors the epistemic level; memory-trust-gate decides admission/reuse as before. */
function toMemory(a: any, asOf: number): any {
  const urls = (a.sources || []).filter((s: any) => s.citationVerified).map((s: any) => s.url).sort();
  return Object.freeze({
    id: a.id, family: "semantic", claim: a.text, structured: a.structured, dimensions: a.dimensions,
    provenance: urls.length ? "KI_V2_VERIFIED_CITATION:" + urls.join("|") : undefined,
    status: a.dimensions.epistemic === "CORROBORATED" ? "VERIFIED" : a.dimensions.epistemic === "INVALIDATED" ? "INVALIDATED" : a.dimensions.epistemic === "SUPPORTED" ? "SUPPORTED" : "UNVERIFIED",
    confidence: a.dimensions.epistemic === "CORROBORATED" ? 0.9 : a.dimensions.epistemic === "SUPPORTED" ? 0.7 : 0.3,
    learnedAt: asOf, validUntil: asOf + 90 * 86400000,
    authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR",
    isFact: a.isFact,
  });
}
function admissible(rec: any, asOf: number): any {
  return MTG.assessMemoryTrust(rec, { asOf, trustedAuthors: [ACTOR.EXECUTOR.ODG], minConfidence: 0.5 });
}

const KNOWLEDGE_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V373-KI-V2-LOT1",
  dimensions: Object.freeze({ EPISTEMIC, MATURITY, AUTHORIZATION, RISK }), natures: NATURE,
  invariants: Object.freeze([
    "four dimensions computed separately; never collapsed to one status",
    "independence = distinct PUBLISHER FAMILIES (source identity), never distinct domains alone",
    "single verified official primary source ⇒ SUPPORTED at most (what the publisher states), never CORROBORATED",
    "only CORROBORATED is presented as a fact (isFact); SUPPORTED/CANDIDATE are kept, usable with reservations",
    "authorization comes from the mission contract, capped by epistemic level and risk — never from confidence",
    "structured keys are authored, compared exactly; divergent qualifiers/keys are kept, not merged",
    "layer over existing memory/trust-gate/binding — no second memory/radar/orchestrator",
  ]),
});

module.exports = { assessClaim, toMemory, admissible, identityOf, structuredKey, PUBLISHERS, EPISTEMIC, MATURITY, AUTHORIZATION, RISK, NATURE, KNOWLEDGE_INTELLIGENCE_CONTRACT };
export {};
