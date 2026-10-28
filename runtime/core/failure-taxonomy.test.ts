#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the failure taxonomy is honest: real seed defects (this session), a classifier,
// rank-by-expected-reduction (severity-weighted), and the honest caveats (0 shipped this session ≠ a success-rate
// claim; broad failure study = NO_DATA).
"use strict";
const assert = require("assert");
const F = require("./failure-taxonomy.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) categories + real seed (this session) with provenance (lot + caughtBy); all caught, none shipped.
ok("category set covers the V42 failure modes", F.CATEGORIES.length >= 12 && F.CATEGORIES.includes("INADEQUATE_TESTS") && F.CATEGORIES.includes("HALLUCINATED_OR_STALE_API"));
ok("seed = real this-session defects with lot+caughtBy; 0 shipped", F.OBSERVED.length >= 5 && F.OBSERVED.every(f => f.lot && f.caughtBy && f.shipped === false && f.detail));

// (2) classify validates against the known set.
ok("classify known category", F.classify({ category: "INADEQUATE_TESTS", severity: "MED" }).category === "INADEQUATE_TESTS");
ok("classify unknown ⇒ UNCLASSIFIED", F.classify({ category: "MADE_UP" }).category === "UNCLASSIFIED");
ok("classify fail-closed", F.classify(null).code === "INVALID_INPUT");

// (3) ranking by severity-weight; dominant category surfaced with an intervention.
const ranked = F.rankInterventions();
ok("ranked by weight desc; each has an intervention", ranked.length > 0 && ranked[0].weight >= ranked[ranked.length - 1].weight && ranked.every(r => r.intervention));
ok("INADEQUATE_TESTS is a top-weighted cause (2 occurrences this session)", ranked.some(r => r.category === "INADEQUATE_TESTS" && r.count >= 2));

// (4) summary: honest caught-vs-shipped + NO_DATA broad caveat + the non-claim.
const s = F.summary();
ok("summary: all caught pre-merge, 0 shipped", s.caughtPreMerge === F.OBSERVED.length && s.shipped === 0);
ok("summary: broad study NO_DATA + '0 shipped is NOT a success-rate claim'", /NO_DATA/.test(s.broadFailureStudy) && /NOT a VERIFIED_SUCCESS_RATE claim/i.test(s.headline));

// (5) a shipped defect would be reflected honestly (not hidden).
const withShipped = F.summary([...F.OBSERVED, { id: "X", lot: "hypo", category: "FRAGILE_PATCH", severity: "HIGH", caughtBy: "none", shipped: true, detail: "x" }]);
ok("a shipped defect increments shipped count (not hidden)", withShipped.shipped === 1 && withShipped.sampleSize === F.OBSERVED.length + 1);

console.log(`\nFAILURE-TAXONOMY suite — ${pass} assertions passed. (real seed; classifier; severity-weighted ranking; honest caught-vs-shipped; NO_DATA broad study)`);
