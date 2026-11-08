#!/usr/bin/env node
"use strict";

/*
 * WI-MEM-08 — memory-taxonomy. Locks: family validation, §30 quality flags (NO_PROVENANCE/STALE/UNVERIFIED/
 * INVALIDATED/UNKNOWN_FAMILY), §28 consolidation rules, temporality (validUntil vs asOf), index counts, retrieve
 * filters (family/consolidation/stale/invalidated/minConfidence) and deterministic id-sort. Synthetic reproducible
 * records, fixed asOf (no clock). Run: node_modules/.bin/tsx runtime/core/memory-taxonomy.test.ts
 */
const assert = require("assert");
const T = require("./memory-taxonomy");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const ASOF = 1000;
console.log("WI-MEM-08 — MEMORY TAXONOMY");

check(T.FAMILIES.length === 14 && T.FAMILIES.includes("negative_knowledge") && T.FAMILIES.includes("episodic"), "14 §26 families incl. negative_knowledge/episodic");

// family + quality classification
check(T.classify({ id: "a", family: "semantic", provenance: "src1" }, ASOF).quality === "OK", "valid provenanced family ⇒ OK");
check(T.classify({ id: "b", family: "bogus", provenance: "s" }, ASOF).quality === "UNKNOWN_FAMILY", "unknown family ⇒ UNKNOWN_FAMILY");
check(T.classify({ id: "c", family: "episodic" }, ASOF).quality === "NO_PROVENANCE", "no provenance ⇒ NO_PROVENANCE (§30, never silently trusted)");
check(T.classify({ id: "d", family: "world", provenance: "s", validUntil: 500 }, ASOF).quality === "STALE", "validUntil < asOf ⇒ STALE");
check(T.classify({ id: "d2", family: "world", provenance: "s", validUntil: 2000 }, ASOF).stale === false, "validUntil > asOf ⇒ not stale");
check(T.classify({ id: "e", family: "failure", provenance: "s", status: "INVALIDATED" }, ASOF).quality === "INVALIDATED", "status INVALIDATED ⇒ INVALIDATED (history kept)");
check(T.classify({ id: "f", family: "procedural", provenance: "s", status: "UNVERIFIED" }, ASOF).quality === "UNVERIFIED", "status UNVERIFIED ⇒ UNVERIFIED");

// consolidation (§28)
check(T.classify({ id: "g", family: "semantic", provenance: "s", consolidated: true }, ASOF).consolidation === "CONSOLIDATED", "consolidated + provenance + fresh ⇒ CONSOLIDATED");
check(T.classify({ id: "h", family: "semantic", consolidated: true }, ASOF).consolidation === "RAW", "consolidated but NO provenance ⇒ RAW (not trusted)");
check(T.classify({ id: "i", family: "semantic", provenance: "s", consolidated: true, validUntil: 500 }, ASOF).consolidation === "RAW", "consolidated but STALE ⇒ RAW");
check(T.classify({ id: "j", family: "semantic", provenance: "s" }, ASOF).consolidation === "RAW", "default ⇒ RAW");
check(T.classify({ id: "k", family: "semantic", provenance: "s", consolidated: true, status: "INVALIDATED" }, ASOF).consolidation === "INVALIDATED", "invalidated overrides consolidated");

// index
{
  const recs = [
    { id: "1", family: "semantic", provenance: "s", consolidated: true },
    { id: "2", family: "semantic", provenance: "s" },
    { id: "3", family: "failure", status: "INVALIDATED" },
    { id: "4", family: "bogus" },
  ];
  const ix = T.index(recs, ASOF);
  check(ix.total === 4 && ix.byFamily.semantic === 2 && ix.byConsolidation.CONSOLIDATED === 1 && ix.byConsolidation.INVALIDATED === 1, "index: family + consolidation counts");
  check(ix.byQuality.UNKNOWN_FAMILY === 1 && ix.byQuality.OK === 2, "index: quality counts");
}

// retrieve filters + deterministic sort
{
  const recs = [
    { id: "z", family: "world", provenance: "s", confidence: 0.9 },
    { id: "a", family: "world", provenance: "s", confidence: 0.3 },
    { id: "s", family: "world", provenance: "s", validUntil: 500 },        // stale
    { id: "x", family: "world", provenance: "s", status: "INVALIDATED" },  // invalidated
    { id: "o", family: "episodic", provenance: "s" },
  ];
  const r1 = T.retrieve(recs, { family: "world", asOf: ASOF });
  check(JSON.stringify(r1.map((c: any) => c.id)) === JSON.stringify(["a", "z"]), "retrieve(world): stale+invalidated excluded by default, sorted by id");
  const r2 = T.retrieve(recs, { family: "world", asOf: ASOF, includeStale: true });
  check(r2.map((c: any) => c.id).includes("s"), "retrieve includeStale ⇒ stale included");
  const r3 = T.retrieve(recs, { family: "world", asOf: ASOF, minConfidence: 0.5 });
  check(JSON.stringify(r3.map((c: any) => c.id)) === JSON.stringify(["z"]), "retrieve minConfidence filters low-confidence");
  const r4 = T.retrieve(recs, { family: "world", asOf: ASOF, includeInvalidated: true });
  check(r4.map((c: any) => c.id).includes("x"), "retrieve includeInvalidated ⇒ invalidated included");
}

// determinism + empty
check(JSON.stringify(T.index([], ASOF)) === JSON.stringify(T.index([], ASOF)), "deterministic empty index");
check(T.retrieve(null, {}).length === 0 && T.index(null).total === 0, "null input ⇒ empty (no crash)");

console.log(failures === 0 ? "ALL PASS — WI-MEM-08 MEMORY TAXONOMY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
