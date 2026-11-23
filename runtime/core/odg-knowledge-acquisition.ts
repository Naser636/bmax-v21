#!/usr/bin/env node
"use strict";
/*
 * V227 §2/§3 — AUTONOMOUS KNOWLEDGE ACQUISITION. PURE, deterministic, fail-closed. Closes the "research not converted
 * into tested capability" gap AND demonstrates one real autonomous media cycle: DISCOVER (search) → ACCESS (fetch licit
 * content) → EXTRACT claims → CORROBORATE (reuse odg-claim-corroboration) → CLASSIFY (fact/opinion/hypothesis; corroborated
 * vs single-source vs contested) → APPLY (link to an ODG capability). The discovery/retrieval are performed by the authorized
 * search/fetch tools OUTSIDE this module; their REAL results are injected here so the pipeline is deterministic + testable.
 *
 * HARD HONESTY: a retrieved page is NOT verified knowledge — only a claim CORROBORATED by ≥2 INDEPENDENT accessible sources
 * becomes FACT_CORROBORATED; a single source stays CLAIM_SINGLE_SOURCE (even if plausible); any contradiction ⇒ CONTESTED.
 * An INACCESSIBLE source (e.g. HTTP 403) is recorded as such and NEVER counted as support or circumvented. OPINION /
 * HYPOTHESIS / RECOMMENDATION are kept as that type and never promoted to fact. Reuses odg-claim-corroboration +
 * odg-radar-source-provenance — NO second radar/registry/provenance model. Dual export.
 */

const COR = require("./odg-claim-corroboration.js");   // corroboration (independent-host supports, CONTESTED, freshness)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function norm(s: any): string { return typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : ""; }
const CLAIM_TYPES = Object.freeze(["FACT", "OPINION", "HYPOTHESIS", "RECOMMENDATION"]);
// FAIL-CLOSED typing: a missing/unknown claim type is a HYPOTHESIS (recorded, never promoted to fact). Defaulting to FACT
// would let an untyped opinion become FACT_CORROBORATED merely because two sources repeat it.
function claimType(v: any): string { const s = typeof v === "string" ? v.trim().toUpperCase() : ""; return CLAIM_TYPES.indexOf(s) >= 0 ? s : "HYPOTHESIS"; }

/* acquire({query, capability, sources, asOfEpochMs?}) — sources: [{url, status:"RETRIEVED"|"INACCESSIBLE", httpStatus?,
 * publishedDate?, consultedDate?, claims:[{text, type, stance?}]}]. Returns frozen knowledge records + inaccessible list. */
function acquire(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const query = typeof o.query === "string" ? o.query : null;
  const capability = typeof o.capability === "string" ? o.capability : null;
  const sources = Array.isArray(o.sources) ? o.sources : [];

  const accessible = sources.filter((s: any) => s && s.status === "RETRIEVED");
  const inaccessible = sources.filter((s: any) => s && s.status === "INACCESSIBLE")
    .map((s: any) => Object.freeze({ url: s.url || null, httpStatus: Number.isFinite(s.httpStatus) ? s.httpStatus : null, note: "recorded INACCESSIBLE — not counted as support, not circumvented" }));

  // group claims by normalized text across accessible sources; collect supporting/contradicting urls + dates.
  const byClaim: Record<string, any> = {};
  for (const s of accessible) {
    const cs = Array.isArray(s.claims) ? s.claims : [];
    for (const c of cs) {
      const key = norm(c && c.text); if (!key) continue;
      if (!byClaim[key]) byClaim[key] = { text: c.text, type: claimType(c && c.type), evidence: [] as any[] };
      byClaim[key].evidence.push({ url: s.url, stance: (c && c.stance) === "CONTRADICTS" ? "CONTRADICTS" : "SUPPORTS", date: s.consultedDate || s.publishedDate });
    }
  }

  const knowledge = Object.keys(byClaim).map((k: string) => {
    const c = byClaim[k];
    const cor = COR.corroborate({ claim: c.text, evidence: c.evidence, asOfEpochMs: Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : undefined });
    // classification: type first (opinion/hypothesis never become fact), then corroboration for FACT claims.
    let classification: string;
    if (cor.level === "CONTESTED") classification = "CONTESTED";
    else if (c.type !== "FACT") classification = c.type + "_RECORDED";           // kept as opinion/hypothesis/recommendation
    else if (cor.level === "CORROBORATED") classification = "FACT_CORROBORATED";  // ≥2 independent accessible sources
    else if (cor.level === "SINGLE_SOURCE") classification = "CLAIM_SINGLE_SOURCE";
    else classification = "UNCORROBORATED";
    return Object.freeze({
      claim: c.text, type: c.type, classification,
      corroborationLevel: cor.level, independentSupportCount: cor.independentSupportCount,
      officialCorroboration: cor.officialCorroboration, freshness: cor.freshness,
      sources: Object.freeze(c.evidence.map((e: any) => ({ url: e.url, stance: e.stance, date: e.date }))),
      verifiedKnowledge: classification === "FACT_CORROBORATED",   // ONLY a corroborated fact counts as verified
      note: classification === "FACT_CORROBORATED"
        ? "corroborated by ≥2 INDEPENDENT accessible sources" + (cor.officialCorroboration ? " incl. official" : " (secondary sources — official primary not confirmed)") + "; still a MODEL conclusion, not an absolute fact"
        : classification === "CLAIM_SINGLE_SOURCE" ? "single accessible source — NOT verified knowledge; needs independent corroboration"
        : classification === "CONTESTED" ? "sources disagree — CONTESTED; not recorded as fact"
        : classification.endsWith("_RECORDED") ? "recorded as " + c.type + " — never promoted to fact"
        : "no independent support — not knowledge",
    });
  });

  return Object.freeze({
    query, capability,
    accessibleCount: accessible.length, inaccessibleCount: inaccessible.length, inaccessible: Object.freeze(inaccessible),
    knowledge: Object.freeze(knowledge),
    verifiedCount: knowledge.filter((x: any) => x.verifiedKnowledge).length,
    honesty: "a retrieved page is NOT verified knowledge; only a claim corroborated by ≥2 INDEPENDENT accessible sources is FACT_CORROBORATED; INACCESSIBLE (403/etc.) sources are recorded, never circumvented or counted; opinion/hypothesis never promoted to fact. Discovery/retrieval done by the authorized search/fetch tools; results injected for determinism.",
  });
}

// REAL executed cycle (V227, 2026-11-16): autonomous discovery (WebSearch) + access (WebFetch) on SWE-bench Verified
// (relevant to ODG's P6 eval/benchmark métier). honeyhive.ai + layer3labs.io retrieved with real content ("500 tasks");
// openai.com + capitalandcompute.net returned HTTP 403 (access-controlled — NOT circumvented).
const REAL_CYCLE = Object.freeze({
  query: "SWE-bench Verified number of human-validated tasks",
  capability: "P6 — evaluation/benchmark reference (external benchmark fact)",
  asOfEpochMs: Date.UTC(2026, 10, 16),
  sources: Object.freeze([
    { url: "https://www.honeyhive.ai/learn/swe-bench", status: "RETRIEVED", publishedDate: "2026-10-30", consultedDate: "2026-11-16", claims: [{ text: "SWE-bench Verified is a 500-instance human-validated subset", type: "FACT" }] },
    { url: "https://www.layer3labs.io/guides/ai-coding-benchmarks", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "SWE-bench Verified is a 500-instance human-validated subset", type: "FACT" }] },
    { url: "https://openai.com/index/introducing-swe-bench-verified/", status: "INACCESSIBLE", httpStatus: 403, claims: [] },
    { url: "https://capitalandcompute.net/ai-benchmarks/swe-bench-verified/", status: "INACCESSIBLE", httpStatus: 403, claims: [] },
  ]),
});

const KNOWLEDGE_ACQUISITION_CONTRACT = Object.freeze({
  id: "V227-KNOWLEDGE-ACQUISITION",
  purpose: "§2/§3 — autonomous discover→access→extract→corroborate→classify→apply over REAL retrieved sources; reuse corroboration",
  invariants: Object.freeze([
    "only a claim CORROBORATED by ≥2 INDEPENDENT accessible sources is FACT_CORROBORATED (verifiedKnowledge); a single source is NOT verified",
    "INACCESSIBLE sources (403/etc.) are recorded, NEVER counted as support and NEVER circumvented",
    "any contradiction ⇒ CONTESTED; opinion/hypothesis/recommendation kept as type, never promoted to fact",
    "REUSES odg-claim-corroboration + odg-radar-source-provenance — no second radar/registry; deterministic (injected results)",
  ]),
});

module.exports = { CLAIM_TYPES, acquire, REAL_CYCLE, KNOWLEDGE_ACQUISITION_CONTRACT };
export {};
