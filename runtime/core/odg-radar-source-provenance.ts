#!/usr/bin/env node
"use strict";
/*
 * V218 §2/§3 — RADAR SOURCE-PROVENANCE RESOLVER. PURE, READ-ONLY, deterministic. Bridges a genuine partial-integration
 * break: the canonical source-VALUE/provenance model (source-registry, V40 — official vs aggregator, verified access/
 * cost/fit + observed qualified-yield for BOAMP/TED/France-Travail/…) had ZERO consumers, while the Radar cites ad-hoc
 * blog/news URLs that are never cross-checked against it. This resolver cross-references each Radar-cited source URL
 * against the canonical registry and classifies its provenance HONESTLY. It REUSES source-registry (no second registry,
 * no new orchestrator) and composes odg-global-opportunity-radar's opportunities as input.
 *
 * HARD HONESTY: a source NOT in the registry is UNREGISTERED — provenance stays AS-DECLARED and is NEVER upgraded to
 * "official/verified". Being a REGISTERED_OFFICIAL source does NOT make a cited claim true, nor an opportunity real. The
 * registry's qualifiedYield/cost are VERIFIED facts dated V38/V39 (2026-10-27/28), not live. Dual export.
 */

const REG = require("./source-registry.js");                 // canonical source-value model (reused, not duplicated)
const RADAR = require("./odg-global-opportunity-radar.js");  // opportunities whose cited sources we cross-check

function host(url: any): string {
  const s = typeof url === "string" ? url.trim() : "";
  const m = s.match(/^https?:\/\/([^/]+)/i);          // only real http(s) URLs have a resolvable host
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

/* classifySource(url) -> provenance classification against the canonical registry. */
function classifySource(url: any): any {
  const h = host(url);
  let match: any = null;
  if (h) {
    for (const s of REG.SOURCES) {
      const sh = host(s.url);                          // registry entries without a real URL (FORM_ONLY/portals) have sh="" ⇒ never match
      // match the registry host EXACTLY or as a SUBDOMAIN of it; NEVER a parent/bare domain (a parent like europa.eu or the
      // commercial host opendatasoft.com must stay UNREGISTERED — upgrading it would violate the never-upgrade invariant).
      if (sh && (h === sh || h.endsWith("." + sh))) { match = s; break; }
    }
  }
  if (!match) {
    return Object.freeze({
      url: typeof url === "string" ? url : null, registered: false, sourceId: null,
      provenanceClass: h ? "UNREGISTERED" : "NOT_A_URL",
      note: "NOT in the canonical source-registry — provenance stays AS-DECLARED, NOT cross-verified as official",
    });
  }
  return Object.freeze({
    url, registered: true, sourceId: match.id,
    provenanceClass: match.provenance === "official" ? "REGISTERED_OFFICIAL" : "REGISTERED_AGGREGATOR",
    access: match.access, costEurPerMonth: match.costEurPerMonth, odgFit: match.odgFit, qualifiedYield: match.qualifiedYield,
    note: "registered source (VERIFIED access/cost/fit, qualifiedYield dated V38/V39) — registration does NOT make a cited claim true or an opportunity real",
  });
}

/* qualifyOpportunity(opp) -> per-opportunity source verification over opp.sources[]. */
function qualifyOpportunity(opp: any): any {
  const srcs = Array.isArray(opp && opp.sources) ? opp.sources : [];
  const cited = srcs.map(classifySource);
  const official = cited.filter((c: any) => c.provenanceClass === "REGISTERED_OFFICIAL").length;
  const registered = cited.filter((c: any) => c.registered).length;
  const verification = srcs.length === 0 ? "NO_SOURCES"
    : registered === 0 ? "NONE_REGISTERED"
    : registered === srcs.length ? (official === srcs.length ? "ALL_OFFICIAL" : "ALL_REGISTERED")
    : "PARTIAL";
  return Object.freeze({
    id: opp.id, metier: opp.metier, declaredProvenance: opp.provenance || null,
    citedCount: srcs.length, registeredCount: registered, officialCount: official, unregisteredCount: srcs.length - registered,
    sourceVerification: verification, citedSources: Object.freeze(cited),
    note: "sourceVerification describes ONLY whether the cited URLs are in the canonical registry — it does NOT validate the claim; OBSERVED_EVIDENCE with UNREGISTERED sources stays a declared observation, not an official-cross-verified fact",
  });
}

/* audit(opts?) -> cross-check all radar opportunities + the registry's own recommendation. opts.opportunities overrides. */
function audit(opts?: any): any {
  const opps = opts && Array.isArray(opts.opportunities) ? opts.opportunities : RADAR.OPPORTUNITIES;
  const rows = opps.map(qualifyOpportunity);
  const by = (v: string) => rows.filter((r: any) => r.sourceVerification === v).map((r: any) => r.id);
  const rec = REG.recommend();
  return Object.freeze({
    total: rows.length, opportunities: Object.freeze(rows),
    byVerification: Object.freeze({
      ALL_OFFICIAL: by("ALL_OFFICIAL"), ALL_REGISTERED: by("ALL_REGISTERED"), PARTIAL: by("PARTIAL"),
      NONE_REGISTERED: by("NONE_REGISTERED"), NO_SOURCES: by("NO_SOURCES"),
    }),
    registry: Object.freeze({ count: REG.SOURCES.length, topFreeQueryable: rec.topFreeQueryable, anyFreeQualified: rec.anyFreeSourceWithQualifiedYield, ownerDecision: rec.ownerDecision }),
    finding: "most OBSERVED_EVIDENCE radar opportunities cite UNREGISTERED ad-hoc web sources (not in the official source-registry); the registry's vetted official feeds (BOAMP/TED/…) are a SEPARATE silo — provenance is honestly surfaced, not upgraded.",
    honesty: "UNREGISTERED provenance is NEVER upgraded to official; a REGISTERED_OFFICIAL source does not make a claim true or an opportunity real; registry yields are VERIFIED facts dated V38/V39, not live; read-only, reuses source-registry (no second registry).",
  });
}

const RADAR_SOURCE_PROVENANCE_CONTRACT = Object.freeze({
  id: "V218-RADAR-SOURCE-PROVENANCE",
  purpose: "§2/§3 — cross-check Radar-cited source URLs against the canonical source-registry; wire the unused registry to a consumer",
  invariants: Object.freeze([
    "REUSES source-registry (no second registry/orchestrator); composes odg-global-opportunity-radar opportunities",
    "a source NOT in the registry is UNREGISTERED — provenance AS-DECLARED, NEVER upgraded to official/verified",
    "REGISTERED_OFFICIAL does NOT make a cited claim true nor an opportunity real; qualifiedYield facts dated V38/V39",
    "read-only; deterministic; host-matched (www-stripped, suffix-tolerant); non-URL registry entries never match",
  ]),
});

module.exports = { host, classifySource, qualifyOpportunity, audit, RADAR_SOURCE_PROVENANCE_CONTRACT };
export {};
