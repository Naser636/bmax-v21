#!/usr/bin/env node
/**
 * seo-strategy — Phase 6 of the CTO excellence mandate: the organic-visibility + positioning plan for the P-01 product,
 * grounded on the REAL product dossier (demand-evidence) and Google Search Central guidance. It is a PURE, preparatory
 * decision model — it publishes nothing, promises no ranking, and fabricates no testimonials. No new primitive.
 *
 * Honesty gates (fail-closed):
 *  - reviewSeoCopy REUSES excellence-policy.evaluateClaim (refuses unbacked superlatives) AND refuses guaranteed-ranking
 *    language and fabricated social proof.
 *  - validateStructuredData refuses Review/Rating/AggregateRating markup unless real verified reviews exist (0 now ⇒
 *    refused), and only permits schema.org types that match real page content + Google's guidelines.
 *  - keyword intents are explicitly HYPOTHESES until real Search Console data exists (no invented traffic/volume).
 */
"use strict";

const DE = require("./demand-evidence.js");
const EX = require("./excellence-policy.js");

const OFFER = Object.freeze({ offerId: DE.DOSSIER.offerId, segment: DE.DOSSIER.segment, problem: DE.DOSSIER.problem });

const INTENT_TYPES = ["informational", "commercial", "transactional", "navigational"];
const PAGE_TYPES = ["product", "docs", "demo", "proof", "comparison", "article", "home"];

// Search-intent HYPOTHESES by use-case (keyword research, NOT measured volume). Each ties to a target page + rationale.
const INTENTS = Object.freeze([
  { id: "intent-pre-merge-verify", query: "pre-merge code verification tool", intentType: "commercial", targetPage: "product", rationale: "buyers evaluating a packaged pre-merge check for JS/TS/Python" },
  { id: "intent-ci-syntax-check", query: "ci syntax check javascript typescript python", intentType: "informational", targetPage: "docs", rationale: "teams wiring syntax/type checks into CI — top of funnel" },
  { id: "intent-catch-type-errors", query: "catch typescript type errors before ci", intentType: "informational", targetPage: "article", rationale: "problem-aware search; educational content demonstrating expertise" },
  { id: "intent-evidence-report", query: "shareable code health evidence report", intentType: "commercial", targetPage: "proof", rationale: "the differentiator — an objective, shareable pass/fail with proof" },
  { id: "intent-vs-free-diy", query: "tsc noemit vs paid code health check", intentType: "commercial", targetPage: "comparison", rationale: "honest comparison vs the strong FREE DIY alternative (disclosed, not hidden)" },
]);

// Site architecture: pages by use-case with internal linking. Proof/comparison pages must be honest (no fabrication).
const SITE = Object.freeze([
  { path: "/", type: "home", title: "Code Health Check — objective pre-merge verification", linksTo: ["/product", "/docs", "/proof"] },
  { path: "/product", type: "product", title: "Code Health Check for JS/TS/Python CI", linksTo: ["/docs", "/proof", "/compare", "/demo"] },
  { path: "/docs", type: "docs", title: "Documentation — how the check works", linksTo: ["/product", "/demo"] },
  { path: "/demo", type: "demo", title: "Live demo — run a check, get an evidence report", linksTo: ["/product", "/proof"] },
  { path: "/proof", type: "proof", title: "Evidence & limitations (what is and isn't verified)", linksTo: ["/product", "/compare"] },
  { path: "/compare", type: "comparison", title: "Code Health Check vs free DIY CI checks", linksTo: ["/product", "/proof"] },
  { path: "/blog/catch-type-errors-before-ci", type: "article", title: "How to catch TypeScript type errors before CI", linksTo: ["/docs", "/product"] },
]);

// schema.org types permitted for THIS site, and those that require evidence we do not have.
const STRUCTURED_DATA = Object.freeze({
  allowed: ["WebSite", "Organization", "SoftwareApplication", "TechArticle", "FAQPage", "BreadcrumbList"],
  requiresVerifiedReviews: ["Review", "AggregateRating", "Rating"],
});

// Instrumentation plan — metric DEFINITIONS only (no fabricated numbers).
const INSTRUMENTATION = Object.freeze([
  { metric: "impressions", source: "Google Search Console", definition: "times a result appeared in search" },
  { metric: "clicks", source: "Google Search Console", definition: "clicks from search results" },
  { metric: "ctr", source: "derived", definition: "clicks / impressions" },
  { metric: "conversions", source: "site analytics (consented)", definition: "demo-request or contact events" },
  { metric: "qualified_demand", source: "demand-experiment", definition: "verified WTP signals (fail-closed; see demand-experiment)" },
]);

const GUARANTEE_RE = /\b(guarantee[d]?|#1 on google|rank(ing)? (first|1st|number one)|top of google|instant(ly)? rank)\b/i;
const FABRICATED_SOCIAL_RE = /\b(thousands of (happy )?customers|5[-\s]?star|rated #1|trusted by \d+)\b/i;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * reviewSeoCopy(claims[], opts?): fail-closed copy gate. Rejects (a) unbacked superlatives (via excellence-policy),
 * (b) guaranteed-ranking language, (c) fabricated social proof. Returns { admitted[], refused[{claim,reason}] }.
 */
function reviewSeoCopy(claims: any, opts: any = {}): any {
  const list = Array.isArray(claims) ? claims : [];
  const admitted: string[] = []; const refused: any[] = [];
  for (const c of list) {
    const claim = String(c || "");
    if (GUARANTEE_RE.test(claim)) { refused.push({ claim, reason: "guaranteed-ranking language refused (search engines guarantee no ranking)" }); continue; }
    if (FABRICATED_SOCIAL_RE.test(claim) && !(opts && opts.verifiedEvidenceRef)) { refused.push({ claim, reason: "social-proof claim without verified evidence refused (no fabricated testimonials)" }); continue; }
    const ex = EX.evaluateClaim(claim, opts && opts.benchmarkRef ? { benchmarkRef: opts.benchmarkRef, benchmarkResult: opts.benchmarkResult } : undefined);
    if (!ex.justified) { refused.push({ claim, reason: ex.reason }); continue; }
    admitted.push(claim);
  }
  return { admitted, refused, ok: refused.length === 0 };
}

/**
 * validateStructuredData(type, ctx): fail-closed. Review/Rating/AggregateRating require real verified reviews
 * (ctx.verifiedReviews > 0). Any type outside the allowed set for this site is refused. Allowed types require
 * ctx.contentMatches === true (markup must reflect real on-page content per Google guidelines).
 */
function validateStructuredData(type: string, ctx: any = {}): any {
  if (STRUCTURED_DATA.requiresVerifiedReviews.includes(type)) {
    const n = Number(ctx.verifiedReviews);
    if (!(Number.isFinite(n) && n > 0)) return { allowed: false, type, reason: `${type} markup requires real verified reviews (have ${ctx.verifiedReviews || 0}) — refused (no fabricated review/rating markup)` };
    return { allowed: true, type, reason: "backed by real verified reviews" };
  }
  if (!STRUCTURED_DATA.allowed.includes(type)) return { allowed: false, type, reason: `${type} not in the approved schema set for this site` };
  if (ctx.contentMatches !== true) return { allowed: false, type, reason: `${type} refused: markup must reflect real on-page content (contentMatches!=true) per Google structured-data guidelines` };
  return { allowed: true, type, reason: "approved type + content matches" };
}

/** assess(): the preparatory SEO/positioning status. Honest: nothing published; no guaranteed ranking; demand unvalidated. */
function assess(opts: any = {}): any {
  const intentsValid = INTENTS.every((i) => INTENT_TYPES.includes(i.intentType) && SITE.some((p) => p.type === i.targetPage));
  return {
    status: "PREPARED_NOT_PUBLISHED",
    offer: OFFER,
    intents: INTENTS.length,
    pages: SITE.length,
    intentsValid,
    structuredDataPolicy: STRUCTURED_DATA,
    instrumentation: INSTRUMENTATION.map((m) => m.metric),
    caveats: [
      "no site is published; this is a plan, not live SEO",
      "keyword intents are HYPOTHESES until real Search Console data exists (no invented volume)",
      "no guaranteed ranking; follows Google Search Central guidance",
      "no review/rating structured data (0 verified reviews); no fabricated testimonials",
      "demand remains DEMAND_NOT_VALIDATED (see demand-experiment) — SEO does not substitute for willingness-to-pay",
    ],
  };
}

export { OFFER, INTENT_TYPES, PAGE_TYPES, INTENTS, SITE, STRUCTURED_DATA, INSTRUMENTATION, reviewSeoCopy, validateStructuredData, assess };
module.exports = { OFFER, INTENT_TYPES, PAGE_TYPES, INTENTS, SITE, STRUCTURED_DATA, INSTRUMENTATION, reviewSeoCopy, validateStructuredData, assess };

if (require.main === module) {
  process.stdout.write(JSON.stringify(assess(), null, 2) + "\n");
}
