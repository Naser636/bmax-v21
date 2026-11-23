#!/usr/bin/env node
"use strict";
/* V16.0 — assess the V160 engineering-practices collection (docs/odg/evidence/V160_PRACTICES_COLLECTION.json) with the
 * CANONICAL knowledge path, REUSING runtime/bin/odg-v158-knowledge-run.ts derive()/main() with a V160 config (no second
 * engine): attestCollection (repo pin) → assessClaim → toMemory / admissible / usableFor. OFFLINE, deterministic.
 * Structured keys are AUTHORED from the recorded quotes AFTER the live collection (never before, never model-inferred);
 * fragment:true marks title/heading/TOC/index/list fragments (capped at CANDIDATE by assessClaim). A cycle without an authored
 * key stays UNKNOWN (cannot ground) — reported, never filled in. Nature per target: OFFICIAL_DOCUMENTATION for guides/
 * playbooks/handbook/blog, SCIENTIFIC_PUBLICATION for research.google paper abstracts (findings need methodology review).
 * Usage: [--write] | [--check] (exit 1 on drift). */
const KR = require("./odg-v158-knowledge-run.ts");
const V160 = require("./odg-v160-practices-collection-run.ts");

const OUT_PATH = "docs/odg/evidence/V160_PRACTICES_KNOWLEDGE.json";
// pattern id → key, AUTHORED from the committed quotes once the LIVE collection exists (empty until then ⇒ all UNKNOWN).
const STRUCT: Record<string, any> = {};
const NATURE_BY_URL: Record<string, string> = {}; for (const t of V160.TARGETS) NATURE_BY_URL[t.url] = t.nature;
/** natureOf(source): from the pre-registered target; an unknown url gets an INVALID nature ⇒ never SUPPORTED (fail-closed). */
function natureOf(source: any): string { return (source && NATURE_BY_URL[source.url]) || "UNREGISTERED_TARGET"; }

const CONFIG = Object.freeze({
  collectionPath: V160.COLLECTION_PATH, outPath: OUT_PATH, struct: STRUCT, natureOf, freshnessDays: {}, sourceMetaKeys: ["org", "practiceArea"],
  lot: "V16.0 — V160 engineering-practices Radar collection → canonical knowledge assessment (KI-V2 four dimensions)",
  limits: [
    "each claim is SINGLE-SOURCE (one page) ⇒ at most SUPPORTED ('what the publisher states'), never CORROBORATED on its own; same-family pages (e.g. two Google sites, or GitHub + Microsoft) never corroborate each other",
    "fragment quotes (titles, headings, TOC/index entries, checklist lines) are capped at CANDIDATE",
    "research.google abstracts are SCIENTIFIC_PUBLICATION ⇒ CANDIDATE until a methodology/reproducibility review",
    "structured keys authored by the provider from the recorded quotes, not model-inferred; quotes from a deterministic pattern extractor, verbatim w.r.t. the documented normalisation",
    "knowledge usefulness for ODG is NOT_MEASURED until a mission applies it",
  ],
});

function derive(col: any, registry: any): any { return KR.derive(col, registry, CONFIG); }
if (require.main === module) KR.main(CONFIG);
module.exports = { CONFIG, STRUCT, OUT_PATH, natureOf, derive };
export {};
