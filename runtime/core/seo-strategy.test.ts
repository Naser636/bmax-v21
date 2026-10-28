#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the SEO/positioning plan is HONEST + fail-closed: anti-overclaim copy gate
// (superlatives via excellence-policy, guaranteed-ranking, fabricated social proof), structured-data policy (no
// Review/Rating without real reviews, only approved types with matching content), intents grounded + valid, and the
// status is PREPARED_NOT_PUBLISHED with explicit caveats (no guaranteed ranking, demand still NOT_VALIDATED).
"use strict";
const assert = require("assert");
const S = require("./seo-strategy.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) status + grounding: nothing published; intents tie to real pages; offer grounded on the product dossier.
const a = S.assess();
ok("status PREPARED_NOT_PUBLISHED (nothing live)", a.status === "PREPARED_NOT_PUBLISHED" && a.intentsValid === true);
ok("offer grounded on the real product dossier", a.offer.offerId === "code-health-check-v1" && typeof a.offer.segment === "string");
ok("caveats include no-guaranteed-ranking + demand-not-validated", a.caveats.some((c) => /guaranteed ranking/.test(c)) && a.caveats.some((c) => /DEMAND_NOT_VALIDATED/.test(c)));

// (2) anti-overclaim copy gate.
ok("honest factual claim admitted", S.reviewSeoCopy(["Objective pre-merge syntax and type verification for JS/TS/Python"]).ok === true);
ok("guaranteed-ranking copy REFUSED", S.reviewSeoCopy(["We guarantee #1 ranking on Google"]).refused.some((r) => /guaranteed-ranking/.test(r.reason)));
ok("unbacked superlative REFUSED (via excellence-policy)", S.reviewSeoCopy(["The world-class best code checker"]).refused.length === 1);
ok("fabricated social proof REFUSED without evidence", S.reviewSeoCopy(["Trusted by thousands of customers"]).refused.some((r) => /social-proof/.test(r.reason)));
ok("social proof ADMITTED when a verified evidence ref is supplied", S.reviewSeoCopy(["Trusted by 1200 customers"], { verifiedEvidenceRef: "crm-export-2026" }).ok === true);

// (3) structured-data policy.
ok("Review markup refused with 0 verified reviews (no fabricated reviews)", S.validateStructuredData("Review", { verifiedReviews: 0 }).allowed === false);
ok("AggregateRating allowed only with real reviews", S.validateStructuredData("AggregateRating", { verifiedReviews: 5 }).allowed === true && S.validateStructuredData("AggregateRating", {}).allowed === false);
ok("approved type allowed when content matches", S.validateStructuredData("SoftwareApplication", { contentMatches: true }).allowed === true);
ok("approved type refused when content does NOT match (per Google guidelines)", S.validateStructuredData("FAQPage", { contentMatches: false }).allowed === false);
ok("unapproved type refused", S.validateStructuredData("JobPosting", { contentMatches: true }).allowed === false);

// (4) intents + site are internally consistent (every intent targets a real page type).
ok("every intent targets an existing page type", S.INTENTS.every((i) => S.SITE.some((p) => p.type === i.targetPage)) && S.INTENTS.length >= 4);
ok("comparison page exists (honest vs free DIY)", S.SITE.some((p) => p.type === "comparison"));

console.log(`\nSEO-STRATEGY suite — ${pass} assertions passed. (anti-overclaim copy gate; no review markup without real reviews; grounded intents; PREPARED_NOT_PUBLISHED; demand still NOT_VALIDATED)`);
