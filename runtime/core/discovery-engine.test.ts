#!/usr/bin/env node
"use strict";

/*
 * GM-CI-8 / WI-DISC-10 — discovery-engine. Locks: gap maturity confidence, unmet-dependency (CONFIRMED absent /
 * HYPOTHESIS unverified), duplicate (duplicateOf CONFIRMED / same-provides HYPOTHESIS), reuse-opportunity,
 * aggregate verdict + priority sort, NO_DATA, determinism. Synthetic inventory; pure (no I/O).
 * Run: node_modules/.bin/tsx runtime/core/discovery-engine.test.ts
 */
const assert = require("assert");
const D = require("./discovery-engine");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("GM-CI-8 — DISCOVERY ENGINE");

const inv = [
  { id: "capA", need: true, declared: true, implemented: false },                 // gap: declared not implemented
  { id: "capB", need: true, implemented: true, tested: false },                   // gap: implemented not tested
  { id: "capC", verified: true, provides: "parse" },                              // operational
  { id: "capD", need: true, provides: "parse" },                                  // reuse-opportunity (capC provides parse)
  { id: "capE", deps: ["capC", "ghostDep"] },                                     // unmet: ghostDep absent (CONFIRMED)
  { id: "capF", deps: ["capA"] },                                                 // unmet: capA not verified (HYPOTHESIS)
  { id: "capG", duplicateOf: "capC" },                                            // duplicate (CONFIRMED)
  { id: "capH", provides: "report" }, { id: "capI", provides: "report" },         // duplicate same-provides (HYPOTHESIS)
];

const gaps = D.discoverGaps(inv);
check(gaps.find((f: any) => f.subject === "capA").confidence >= 0.8, "gap: declared-not-implemented ⇒ high confidence");
check(gaps.every((f: any) => f.verdict === "HYPOTHESIS"), "gaps are HYPOTHESES (to verify, not accusations)");
check(!gaps.find((f: any) => f.subject === "capC"), "operational (verified) capability is NOT a gap");

const deps = D.discoverUnmetDeps(inv);
check(deps.find((f: any) => f.subject === "capE→ghostDep").verdict === "CONFIRMED", "unmet-dep: absent id ⇒ CONFIRMED (hard)");
check(deps.find((f: any) => f.subject === "capF→capA").verdict === "HYPOTHESIS", "unmet-dep: unverified existing dep ⇒ HYPOTHESIS");

const dups = D.discoverDuplicates(inv);
check(dups.find((f: any) => f.subject === "capG").verdict === "CONFIRMED", "duplicate: explicit duplicateOf ⇒ CONFIRMED");
check(dups.find((f: any) => f.verdict === "HYPOTHESIS" && String(f.subject).includes("capH")), "duplicate: same provides 'report' ⇒ HYPOTHESIS consolidation candidate");

const reuse = D.discoverReuse(inv);
check(reuse.find((f: any) => f.subject === "capD" && f.evidence.includes("capC")), "reuse-opportunity: capD can reuse verified capC (same provides 'parse')");

const all = D.discover({ inventory: inv });
check(all.summary.verdict === "CONFIRMED" && all.summary.total >= 6, "discover: aggregate verdict CONFIRMED (hard facts present) + findings");
check(all.findings[0].priority >= all.findings[all.findings.length - 1].priority, "discover: findings sorted by priority desc");
check(all.summary.byKind.gap >= 2 && all.summary.byKind["unmet-dependency"] >= 2, "discover: byKind counts");

// NO_DATA + determinism
check(D.discover({ inventory: [] }).summary.verdict === "NO_DATA", "empty inventory ⇒ NO_DATA");
check(JSON.stringify(D.discover({ inventory: inv })) === JSON.stringify(D.discover({ inventory: inv })), "deterministic: identical inventory ⇒ identical result");

console.log(failures === 0 ? "ALL PASS — GM-CI-8 DISCOVERY ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
