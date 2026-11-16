#!/usr/bin/env node
"use strict";
/*
 * V221 §2.1/§5.3 — CLAIM CORROBORATION. PURE, deterministic, fail-closed. Closes a real gap: the radar chain distinguishes
 * source PROVENANCE (V218) but never COMPUTES corroboration — opportunity-detector.evidenceFrom hard-codes
 * `contradictions:false` (a placeholder, never derived) and contracts merely name "contradiction". This computes, for a
 * claim and its cited evidence, whether the claim is corroborated by INDEPENDENT sources, or CONTESTED by contradicting
 * ones. It REUSES odg-radar-source-provenance (host + registry classification) — no second registry/provenance model.
 *
 * HARD HONESTY: a SINGLE source (even REGISTERED_OFFICIAL) is NOT corroboration — corroboration needs ≥2 INDEPENDENT
 * sources (distinct hosts) that SUPPORT the claim. ANY contradicting source ⇒ CONTESTED (never silently "corroborated").
 * A speaker/blog claim is never a verified fact without independent official corroboration. NEUTRAL/UNKNOWN stance never
 * counts as support. Confidence is bounded by independence + official backing; it never asserts a "verified fact". Dual export.
 */

const RSP = require("./odg-radar-source-provenance.js");  // host() + classifySource() (reused, not duplicated)

const STANCES = Object.freeze(["SUPPORTS", "CONTRADICTS", "NEUTRAL"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function stanceOf(v: any): string { const s = typeof v === "string" ? v.toUpperCase() : ""; return STANCES.indexOf(s) >= 0 ? s : "NEUTRAL"; }

/* corroborate({claim, evidence}) — evidence: [{url, stance}]. Returns a frozen corroboration verdict. */
function corroborate(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const claim = typeof o.claim === "string" ? o.claim : null;
  const ev = Array.isArray(o.evidence) ? o.evidence : [];

  const items = ev.map((e: any) => {
    const url = e && typeof e.url === "string" ? e.url : null;
    const cls = RSP.classifySource(url);
    return Object.freeze({ url, host: RSP.host(url), stance: stanceOf(e && e.stance),
      registered: cls.registered, provenanceClass: cls.provenanceClass, sourceId: cls.sourceId });
  });

  const supports = items.filter((i: any) => i.stance === "SUPPORTS");
  const contradicts = items.filter((i: any) => i.stance === "CONTRADICTS");
  // INDEPENDENCE = distinct hosts (a non-URL host "" is never independent — cannot count toward corroboration).
  const supportHosts = Array.from(new Set(supports.map((i: any) => i.host).filter((h: string) => h.length > 0)));
  const contradictHosts = Array.from(new Set(contradicts.map((i: any) => i.host).filter((h: string) => h.length > 0)));
  const officialSupport = supports.filter((i: any) => i.provenanceClass === "REGISTERED_OFFICIAL");

  // level is based on VERIFIABLE-HOST supports (a support with no resolvable host cannot corroborate anything).
  const level = contradicts.length > 0 ? "CONTESTED"
    : supportHosts.length >= 2 ? "CORROBORATED"
    : supportHosts.length >= 1 ? "SINGLE_SOURCE"
    : "UNCORROBORATED";

  // confidence is bounded and NEVER a "verified fact" assertion.
  const confidence = level === "CONTESTED" ? "DISPUTED"
    : level === "CORROBORATED" ? (officialSupport.length >= 1 ? "HIGH" : "MEDIUM")
    : level === "SINGLE_SOURCE" ? "LOW"
    : "NONE";

  return Object.freeze({
    claim, level, confidence,
    independentSupportCount: supportHosts.length, independentSupportHosts: Object.freeze(supportHosts),
    officialCorroboration: officialSupport.length >= 1 && level === "CORROBORATED",
    contradictions: Object.freeze(contradicts.map((i: any) => ({ url: i.url, provenanceClass: i.provenanceClass }))),
    contradictionHostCount: contradictHosts.length,
    evidence: Object.freeze(items),
    note: level === "CONTESTED"
      ? "CONTESTED — at least one source contradicts; the claim is NOT presented as corroborated and the conflict is surfaced."
      : level === "CORROBORATED"
        ? "CORROBORATED by ≥2 INDEPENDENT sources" + (officialSupport.length ? " incl. ≥1 official" : " (none official — independent but not officially confirmed)") + "; still a MODEL conclusion, not an absolute fact."
        : level === "SINGLE_SOURCE"
          ? "SINGLE_SOURCE — one source only (even if official) is NOT corroboration; treat as a declared claim."
          : "UNCORROBORATED — no supporting independent source; never presented as a fact.",
  });
}

/* corroborateOpportunity(opp, extraEvidence?) — composes a radar opportunity's cited sources (treated as SUPPORTS by
 * default: they are cited AS evidence for the opportunity) with any extra retrieved evidence (e.g., an official source). */
function corroborateOpportunity(opp: any, extraEvidence?: any): any {
  const srcs = Array.isArray(opp && opp.sources) ? opp.sources : [];
  const base = srcs.map((u: any) => ({ url: u, stance: "SUPPORTS" }));
  const extra = Array.isArray(extraEvidence) ? extraEvidence : [];
  const r = corroborate({ claim: opp && opp.id ? ("opportunity:" + opp.id) : null, evidence: base.concat(extra) });
  return Object.freeze(Object.assign({ id: opp && opp.id, declaredProvenance: opp && opp.provenance }, r));
}

const CLAIM_CORROBORATION_CONTRACT = Object.freeze({
  id: "V221-CLAIM-CORROBORATION",
  purpose: "§2.1/§5.3 — compute cross-source corroboration + contradiction for a claim; reuse V218 provenance, no second registry",
  invariants: Object.freeze([
    "a SINGLE source (even official) is NOT corroboration; CORROBORATED needs ≥2 INDEPENDENT (distinct-host) supporting sources",
    "ANY contradicting source ⇒ CONTESTED (never silently corroborated); the conflict is surfaced",
    "NEUTRAL/UNKNOWN stance never counts as support; a non-URL host is never independent",
    "confidence is bounded by independence + official backing; it NEVER asserts an absolute verified fact",
    "REUSES odg-radar-source-provenance (host + classification); deterministic; no second provenance/registry model",
  ]),
});

module.exports = { STANCES, corroborate, corroborateOpportunity, CLAIM_CORROBORATION_CONTRACT };
export {};
