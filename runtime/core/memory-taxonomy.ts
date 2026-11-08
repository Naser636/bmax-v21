#!/usr/bin/env node
"use strict";

/*
 * WI-MEM-08 — MEMORY TAXONOMY (§26 families, §28 consolidation, §30 protection). PURE, read-only classifier
 * and index OVER supplied memory records. It does NOT create a new persistent store and does NOT duplicate the
 * real stores (patch-memory, execution-memory, memory-engine, reuse-ledger, learning-chain) — it is the missing
 * TAXONOMY + provenance/temporality/consolidation lens those stores lacked. Deterministic (records + asOf in →
 * classification out; no clock/random). Dual export (CJS + ESM export {}) mirroring world-model/causal-graph.
 */

// §26 memory families (responsibilities, NOT separate engines).
const FAMILIES = Object.freeze([
  "constitutional", "operational", "working", "episodic", "semantic", "procedural",
  "world", "capability", "engineering", "economic", "resolution", "failure", "scenario", "negative_knowledge",
]);
// §28 consolidation states + §30 quality flags.
const CONSOLIDATION = Object.freeze(["RAW", "CONSOLIDATED", "INVALIDATED"]);
const QUALITY = Object.freeze(["OK", "NO_PROVENANCE", "STALE", "UNVERIFIED", "INVALIDATED", "UNKNOWN_FAMILY"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

// A record: { id, family?, value?, provenance?, createdAt?(epochMs), validUntil?(epochMs), confidence?(0..1),
//             consolidated?(bool), status?("UNVERIFIED"|"INVALIDATED"|...) }
function familyOf(rec: any): any { return isObj(rec) && FAMILIES.includes(rec.family) ? rec.family : null; }

function isStale(rec: any, asOf: any): boolean {
  if (!isObj(rec)) return false;
  return isNum(rec.validUntil) && isNum(asOf) && asOf > rec.validUntil;
}

// §30: a record carries provenance/date/confidence/status; quality is computed, never asserted blindly.
function qualityOf(rec: any, asOf: any, opts?: any): any {
  if (rec && rec.status === "INVALIDATED") return "INVALIDATED";
  if (!familyOf(rec)) return "UNKNOWN_FAMILY";
  if (!isStr(rec.provenance)) return "NO_PROVENANCE";
  if (isStale(rec, asOf)) return "STALE";
  const minConf = opts && isNum(opts.minConfidence) ? opts.minConfidence : 0.0;
  if (rec.status === "UNVERIFIED" || (isNum(rec.confidence) && rec.confidence < Math.max(minConf, 0.0) && minConf > 0)) return "UNVERIFIED";
  return "OK";
}

// §28: CONSOLIDATED only if explicitly consolidated AND provenanced AND not invalidated/stale; else RAW.
function consolidationOf(rec: any, asOf: any): any {
  if (rec && rec.status === "INVALIDATED") return "INVALIDATED";
  const consolidated = rec && (rec.consolidated === true || rec.consolidation === "CONSOLIDATED");
  if (consolidated && isStr(rec.provenance) && !isStale(rec, asOf)) return "CONSOLIDATED";
  return "RAW";
}

/** classify(record, asOf?, opts?) -> normalized memory item with family/quality/consolidation/temporality. Pure. */
function classify(rec: any, asOf?: any, opts?: any): any {
  const r = isObj(rec) ? rec : {};
  const family = familyOf(r);
  return Object.freeze({
    id: isStr(r.id) ? r.id : null,
    family: family || "UNKNOWN",
    quality: qualityOf(r, asOf, opts),
    consolidation: consolidationOf(r, asOf),
    stale: isStale(r, asOf),
    provenance: isStr(r.provenance) ? r.provenance : null,
    createdAt: isNum(r.createdAt) ? r.createdAt : null,
    validUntil: isNum(r.validUntil) ? r.validUntil : null,
    confidence: isNum(r.confidence) ? r.confidence : null,
    status: isStr(r.status) ? r.status : null,
  });
}

/** index(records, asOf?) -> { total, byFamily, byConsolidation, byQuality } counts. Pure, deterministic. */
function index(records: any, asOf?: any): any {
  const list = Array.isArray(records) ? records : [];
  const byFamily: any = {}; const byConsolidation: any = {}; const byQuality: any = {};
  for (const rec of list) {
    const c = classify(rec, asOf);
    byFamily[c.family] = (byFamily[c.family] || 0) + 1;
    byConsolidation[c.consolidation] = (byConsolidation[c.consolidation] || 0) + 1;
    byQuality[c.quality] = (byQuality[c.quality] || 0) + 1;
  }
  return Object.freeze({ total: list.length, byFamily: Object.freeze(byFamily), byConsolidation: Object.freeze(byConsolidation), byQuality: Object.freeze(byQuality) });
}

/**
 * retrieve(records, query) -> classified items matching the query, sorted by id (deterministic).
 * query: { family?, asOf?, consolidation?, minConfidence?, includeStale?(default false), includeInvalidated?(default false) }
 */
function retrieve(records: any, query?: any): any[] {
  const list = Array.isArray(records) ? records : [];
  const q = isObj(query) ? query : {};
  const asOf = isNum(q.asOf) ? q.asOf : null;
  const out: any[] = [];
  for (const rec of list) {
    const c = classify(rec, asOf, q);
    if (q.family && c.family !== q.family) continue;
    if (q.consolidation && c.consolidation !== q.consolidation) continue;
    if (!q.includeInvalidated && c.consolidation === "INVALIDATED") continue;
    if (!q.includeStale && c.stale) continue;
    if (isNum(q.minConfidence) && !(isNum(c.confidence) && c.confidence >= q.minConfidence)) continue;
    out.push(c);
  }
  out.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  return out;
}

const MEMORY_TAXONOMY_CONTRACT = Object.freeze({
  id: "WI-MEM-08-MEMORY-TAXONOMY",
  source: "FICHE §26 (memory families) + §28 (consolidation) + §30 (provenance/temporality/protection)",
  families: FAMILIES,
  consolidationStates: CONSOLIDATION,
  qualityFlags: QUALITY,
  notAuthority: "read-only taxonomy/lens over supplied memory records; creates no store, mutates nothing, asserts no reality",
  invariants: Object.freeze([
    "pure/deterministic: records + asOf in → classification out; no clock/random; retrieve() sorted by id",
    "a record with no provenance is flagged NO_PROVENANCE (never silently trusted, §30)",
    "CONSOLIDATED requires explicit consolidation + provenance + not stale/invalidated (§28)",
    "temporality is explicit: validUntil + asOf decide staleness; an INVALIDATED record keeps its status (history, §30)",
    "does NOT duplicate the real stores; organizes what they supply",
  ]),
});

module.exports = {
  FAMILIES, CONSOLIDATION, QUALITY, MEMORY_TAXONOMY_CONTRACT,
  familyOf, isStale, qualityOf, consolidationOf, classify, index, retrieve,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(MEMORY_TAXONOMY_CONTRACT, null, 2) + "\n");
}

export {};
