#!/usr/bin/env node
/**
 * source-registry — V40 §3: the source-VALUE decision model. A small typed registry of the opportunity sources ODG
 * has actually researched + queried (V38/V39), each with VERIFIED access/terms/cost/fit and the OBSERVED qualified
 * yield from the independent evaluation set — plus a transparent ranking so the "where to invest" decision is
 * evidence-based, not volume-driven. No new orchestrator; composes nothing live (pure decision model).
 *
 * HONESTY (mandate): qualifiedYield comes from the independently-labelled opportunity-eval-set (strict QUALIFIED),
 * NOT from record counts. Access is labelled truthfully (ANONYMOUS_API / FREE_OAUTH / FORM_ONLY / AUTH_MEMBERSHIP /
 * PAID). A free, high-volume source with 0 qualified yield ranks BELOW its volume — volume is not value. Absence of a
 * feed ≠ absence of demand (flagged). Pure/deterministic.
 */
"use strict";

const ACCESS = Object.freeze({ ANONYMOUS_API: "ANONYMOUS_API", FREE_OAUTH: "FREE_OAUTH", FORM_ONLY: "FORM_ONLY", AUTH_MEMBERSHIP: "AUTH_MEMBERSHIP", PAID: "PAID" });
const FIT = Object.freeze({ NICHE: "NICHE", ADJACENT: "ADJACENT", SIGNAL_ONLY: "SIGNAL_ONLY", NONE: "NONE" });

// VERIFIED facts (V38/V39 research + live queries 2026-10-27/28). qualifiedYield = strict-QUALIFIED observed in the
// eval sample (null = not yet measurable / not an opportunity feed). liveStatus = what ODG actually observed.
const SOURCES: readonly any[] = Object.freeze([
  { id: "BOAMP", owner: "DILA (FR)", kind: "public-tender", url: "https://boamp-datadila.opendatasoft.com", access: ACCESS.ANONYMOUS_API, costEurPerMonth: 0, coverage: "FR public procurement", sectors: "all", updateFreq: "2×/day", freshnessDays: 1, provenance: "official", odgFit: FIT.ADJACENT, liveStatus: "QUERIED_OK", qualifiedYield: 0, note: "free+anonymous; but 0 strictly-qualified ODG-niche in sample (low fit)" },
  { id: "TED", owner: "EU Publications Office", kind: "public-tender", url: "https://api.ted.europa.eu/v3/notices/search", access: ACCESS.ANONYMOUS_API, costEurPerMonth: 0, coverage: "EU public procurement", sectors: "all incl. IT-services category", updateFreq: "daily", freshnessDays: 1, provenance: "official", odgFit: FIT.ADJACENT, liveStatus: "QUERIED_OK", qualifiedYield: 0, note: "free+anonymous; IT-services category gives higher niche potential than BOAMP, still 0 strictly-qualified in sample" },
  { id: "FRANCE_TRAVAIL", owner: "France Travail (FR)", kind: "demand-signal", url: "https://francetravail.io/data/api", access: ACCESS.FREE_OAUTH, costEurPerMonth: 0, coverage: "FR recruitment postings", sectors: "all", updateFreq: "daily", freshnessDays: 1, provenance: "official", odgFit: FIT.SIGNAL_ONLY, liveStatus: "NOT_QUERIED", qualifiedYield: null, note: "free but requires a free-registration OAuth account (human step); RECRUITMENT postings = weak demand PROXY, NOT purchase opportunities" },
  { id: "IT_SUPPLIER_PORTALS", owner: "Capgemini / Sopra Steria / Atos", kind: "supplier-portal", url: "(vendor supplier portals)", access: ACCESS.FORM_ONLY, costEurPerMonth: 0, coverage: "subcontracting with IT primes", sectors: "IT services", updateFreq: "n/a (onboarding)", freshnessDays: null, provenance: "official", odgFit: FIT.NICHE, liveStatus: "NOT_QUERIED", qualifiedYield: null, note: "FORM-only supplier onboarding (not a feed); genuine niche subcontracting route but human web-form application" },
  { id: "PARTNER_APIS", owner: "Microsoft Partner Center / AWS Partner Central", kind: "partner-api", url: "(partner co-sell APIs)", access: ACCESS.AUTH_MEMBERSHIP, costEurPerMonth: 0, coverage: "co-sell referrals (members only)", sectors: "cloud/IT", updateFreq: "n/a", freshnessDays: null, provenance: "official", odgFit: FIT.NICHE, liveStatus: "NOT_QUERIED", qualifiedYield: null, note: "API exists but membership-gated (admitted partner only); own referrals, not an open market" },
  { id: "PRIVATE_RFP_AGGREGATOR", owner: "Dématis / Marchés Online / France Marchés", kind: "paid-aggregator", url: "(paid veille products)", access: ACCESS.PAID, costEurPerMonth: 100, coverage: "FR public + PRIVATE RFPs", sectors: "all", updateFreq: "daily", freshnessDays: 1, provenance: "aggregator", odgFit: FIT.ADJACENT, liveStatus: "NOT_QUERIED", qualifiedYield: null, note: "covers PRIVATE RFPs but PAID subscription (owner authorization + budget required)" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const ACCESS_SCORE: Record<string, number> = { ANONYMOUS_API: 30, FREE_OAUTH: 20, FORM_ONLY: 8, AUTH_MEMBERSHIP: 8, PAID: 3 };
const FIT_SCORE: Record<string, number> = { NICHE: 25, ADJACENT: 12, SIGNAL_ONLY: 4, NONE: 0 };

/** scoreSource(s): transparent, evidence-based value score. VOLUME is NOT a factor; qualified YIELD is. */
function scoreSource(s: any): any {
  const accessW = ACCESS_SCORE[s.access] || 0;
  const fitW = FIT_SCORE[s.odgFit] || 0;
  // qualifiedYield null (not yet measurable) scores 0 — not penalised below a measured 0, but not credited either.
  const yieldW = typeof s.qualifiedYield === "number" ? Math.min(40, s.qualifiedYield * 20) : 0;
  const freshW = typeof s.freshnessDays === "number" ? Math.max(0, 10 - s.freshnessDays) : 0;
  const costW = -(Number(s.costEurPerMonth) > 0 ? 15 : 0);
  const liveW = s.liveStatus === "QUERIED_OK" ? 5 : 0;
  const total = accessW + fitW + yieldW + freshW + costW + liveW;
  return { accessW, fitW, yieldW, freshW, costW, liveW, total };
}

/** rankSources(opts?): sources ranked by evidence-based value (descending), with score components exposed. */
function rankSources(opts: any = {}): any {
  const list = (Array.isArray(opts.sources) ? opts.sources : SOURCES).map((s: any) => ({ ...s, score: scoreSource(s) }));
  list.sort((a: any, b: any) => b.score.total - a.score.total);
  return list;
}

/** recommend(opts?): the honest evidence-based recommendation — which free source to query, and the owner decision. */
function recommend(opts: any = {}): any {
  const ranked = rankSources(opts);
  const freeQueryable = ranked.filter((s: any) => s.access === ACCESS.ANONYMOUS_API);
  const anyQualifiedYield = ranked.some((s: any) => typeof s.qualifiedYield === "number" && s.qualifiedYield > 0);
  const nicheButGated = ranked.filter((s: any) => s.odgFit === FIT.NICHE && s.access !== ACCESS.ANONYMOUS_API);
  return {
    ranked,
    topFreeQueryable: freeQueryable.length ? freeQueryable[0].id : null,
    anyFreeSourceWithQualifiedYield: anyQualifiedYield,
    nicheSourcesRequiringAuthorization: nicheButGated.map((s: any) => ({ id: s.id, access: s.access })),
    ownerDecision: anyQualifiedYield ? null : {
      why: "no FREE source yields a strictly-QUALIFIED ODG-niche opportunity (BOAMP/TED fit is adjacent, yield 0 in sample); the niche channels are human/paid-gated",
      options: ["authorize a PAID private-RFP aggregator (budget + terms)", "pursue IT-prime SUPPLIER onboarding (human web-form, axis D)", "pursue PARTNER-programme membership (auth, axis D)", "direct relationship/outreach (HA-1 Gmail + HA-2 lead)"],
      material: true,
    },
    note: "Volume ≠ value: free high-volume tenders (BOAMP/TED) rank on access/freshness but 0 qualified yield. Absence of a free private feed ≠ absence of demand — the qualified channel exists but is external/owner-gated. No fabricated yield.",
  };
}

export { ACCESS, FIT, SOURCES, scoreSource, rankSources, recommend };
module.exports = { ACCESS, FIT, SOURCES, scoreSource, rankSources, recommend };

if (require.main === module) {
  const r = recommend();
  process.stdout.write(JSON.stringify({ topFreeQueryable: r.topFreeQueryable, anyFreeQualified: r.anyFreeSourceWithQualifiedYield, ownerDecision: r.ownerDecision, ranking: r.ranked.map((s: any) => ({ id: s.id, access: s.access, fit: s.odgFit, qualifiedYield: s.qualifiedYield, score: s.score.total })) }, null, 2) + "\n");
}
