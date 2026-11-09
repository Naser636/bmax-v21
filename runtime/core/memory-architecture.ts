#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 1 / M-CH1-02 (Central Intelligence — memory architecture, program §8.3). PURE, deterministic. The memory
 * ACCESS layer for Central Intelligence: it does NOT reimplement memory storage or classification (anti-gas-factory)
 * — it COMPOSES the existing pieces. Each recalled record is (a) trust-gated by memory-trust-gate.assessMemoryTrust
 * (fresh + untampered + attributed + not-suppressed) and (b) classified into one of the 5 memories (working/episodic/
 * semantic/procedural/strategic) by compounding-pattern-library.classifyMemory. Only TRUSTED records are returned,
 * grouped by family; an untrusted/stale/unattributed record is EXCLUDED (never served as trusted knowledge). Empty
 * trustedAuthors ⇒ nothing trusted (deny-by-default). It reads/routes; it stores nothing and grants no authority. Dual export.
 */

const TRUST = require("./memory-trust-gate");          // assessMemoryTrust — retrieval-time trust
const LIB = require("./compounding-pattern-library");   // classifyMemory — the 5 memory families

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * accessMemory(records, { asOf, trustedAuthors, minConfidence, reuseHealthById }) ->
 *   { total, trustedCount, excludedCount, byFamily, trusted, excluded, note }.
 * Only TRUSTED records are returned (grouped by family); untrusted ones are EXCLUDED (never trusted knowledge).
 */
function accessMemory(records: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const list = arr(records).filter(isObj);
  const byFamily: Record<string, any[]> = {}; const trusted: any[] = []; const excluded: any[] = [];

  for (const rec of list) {
    const reuseHealth = isObj(o.reuseHealthById) ? o.reuseHealthById[rec.id] : undefined;
    const verdict = TRUST.assessMemoryTrust(rec, { asOf: o.asOf, trustedAuthors: o.trustedAuthors, minConfidence: o.minConfidence, reuseHealth });
    if (verdict.trusted === true) {
      const cls = LIB.classifyMemory(rec, o.asOf);
      const fam = cls.family || "working";
      (byFamily[fam] = byFamily[fam] || []).push(Object.freeze({ id: rec.id, family: fam, isFact: cls.isFact, isProcedure: cls.isProcedure }));
      trusted.push(Object.freeze({ id: rec.id, family: fam }));
    } else {
      excluded.push(Object.freeze({ id: rec.id, verdict: verdict.verdict }));
    }
  }

  const frozenByFamily: any = {}; for (const k of Object.keys(byFamily)) frozenByFamily[k] = Object.freeze(byFamily[k]);
  return Object.freeze({
    total: list.length, trustedCount: trusted.length, excludedCount: excluded.length,
    byFamily: Object.freeze(frozenByFamily),
    trusted: Object.freeze(trusted), excluded: Object.freeze(excluded),
    note: excluded.length > 0 ? `${excluded.length} record(s) EXCLUDED (untrusted/stale/unattributed) — never served as trusted knowledge (fail-closed)` : "all recalled records trusted",
  });
}

const MEMORY_ARCHITECTURE_CONTRACT = Object.freeze({
  id: "V5-MEMORY-ARCHITECTURE",
  source: "ODG Master program PHASE-1 M-CH1-02 — Central Intelligence memory architecture (§8.3 five memories)",
  reuses: Object.freeze(["memory-trust-gate.assessMemoryTrust (retrieval-time trust)", "compounding-pattern-library.classifyMemory (5 families) — composes, does NOT reimplement (anti-gas-factory)"]),
  notAuthority: "a memory access/router over existing trust + classification modules; it stores nothing and grants no authority",
  invariants: Object.freeze([
    "only TRUSTED records (fresh + untampered + attributed + not-suppressed) are returned, grouped by family",
    "an untrusted/stale/unattributed record is EXCLUDED — never served as trusted knowledge (fail-closed)",
    "memory families (working/episodic/semantic/procedural/strategic) come from the existing classifier — no reimplementation",
    "empty trustedAuthors ⇒ nothing trusted (deny-by-default, via memory-trust-gate)",
    "pure/deterministic: records + asOf in → trusted-by-family out; no clock/random/network; stores nothing",
  ]),
});

module.exports = { accessMemory, MEMORY_ARCHITECTURE_CONTRACT };

if (require.main === module) {
  const recs = [
    { id: "m1", provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic" },
    { id: "m2", provenance: "x", authoredBy: "MYSTERY", family: "working" },
  ];
  const r = accessMemory(recs, { asOf: 100, trustedAuthors: ["ODG"] });
  process.stdout.write(JSON.stringify({ ...MEMORY_ARCHITECTURE_CONTRACT, demo: { trusted: r.trustedCount, excluded: r.excludedCount } }, null, 2) + "\n");
}

export {};
