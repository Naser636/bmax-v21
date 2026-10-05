#!/usr/bin/env node

/* Research Ranking — PURE math test.
 *
 * Proves: deterministic ordering, fail-closed on items lacking verified provenance or score
 * dimensions, and — critically — a STATIC assertion that the module carries NO fabricated research
 * data or provenance narrative (no hardcoded opportunities, URLs, WebSearch/WebFetch claims,
 * producedBy, liveResearch, internetCapabilityProof). Network-independent. */

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const ranking = require("./research-ranking");

const SCORES_HI = { incomePotential: 9, demandGrowth: 10, startupCostInverse: 9, timeToRevenueInverse: 8, skillAlignment: 10 };
const SCORES_LO = { incomePotential: 3, demandGrowth: 4, startupCostInverse: 5, timeToRevenueInverse: 3, skillAlignment: 4 };

// 1. Deterministic ordering (score desc, name asc tiebreak) + 1-based rank.
{
    const out = ranking.rank([
        { name: "Low", scores: SCORES_LO, provenance_ref: "ref-2" },
        { name: "High", scores: SCORES_HI, provenance_ref: "ref-1" },
    ]);
    ok("higher composite ranks first", out[0].name === "High" && out[0].rank === 1);
    ok("lower composite ranks second", out[1].name === "Low" && out[1].rank === 2);
    // Re-run with a different input order ⇒ identical result (pure/deterministic).
    const out2 = ranking.rank([
        { name: "High", scores: SCORES_HI, provenance_ref: "ref-1" },
        { name: "Low", scores: SCORES_LO, provenance_ref: "ref-2" },
    ]);
    ok("ranking is order-independent / deterministic", JSON.stringify(out2.map((r) => r.name)) === JSON.stringify(out.map((r) => r.name)));
}

// 2. Fail-closed: item with no provenance_ref is rejected (never scored).
{
    let threw = false;
    try { ranking.rank([{ name: "NoProv", scores: SCORES_HI }]); } catch { threw = true; }
    ok("item without provenance_ref is rejected (fail-closed)", threw === true);
}

// 3. Fail-closed: missing score dimension is an error, not a silent 0.
{
    let threw = false;
    try { ranking.rank([{ name: "Partial", scores: { incomePotential: 5 }, provenance_ref: "ref" }]); } catch { threw = true; }
    ok("missing score dimension fails closed", threw === true);
}

// 4. Inputs are not mutated.
{
    const input = [{ name: "A", scores: SCORES_HI, provenance_ref: "ref" }];
    ranking.rank(input);
    ok("input items are not mutated (no score/rank leaked back)", input[0].score === undefined && input[0].rank === undefined);
}

// 5. STATIC: the source contains NO fabricated research data / provenance narrative.
{
    const src = fs.readFileSync(path.resolve(__dirname, "research-ranking.js"), "utf8");
    const FORBIDDEN = ["producedBy", "liveResearch", "internetCapabilityProof", "WebSearch", "WebFetch", "http://", "https://", "Prompt Engineering", "affiliate", "dropshipping"];
    const hit = FORBIDDEN.find((t) => src.toLowerCase().includes(t.toLowerCase()));
    ok(`ranking module contains no fabricated data/provenance (checked: ${FORBIDDEN.length} tokens)`, hit === undefined);
}

console.log(`\nResearch Ranking — ${passed} assertions passed.`);
