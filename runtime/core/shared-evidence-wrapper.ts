#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V46.2 (O2) — SHARED EVIDENCE & TRACEABILITY WRAPPER. PURE, deterministic, fail-closed. It does NOT create a
 * second source of truth — it COMPOSES the canonical `evidence-provenance` primitive (stampProvenance/verifyProvenance) so
 * the 15 métiers attach uniform, verifiable evidence to their results. Each justified item carries an explicit BASIS —
 * PROVEN | OBSERVED | ESTIMATED | SIMULATED | UNKNOWN — and the wrapper NEVER upgrades a basis (an absence of proof is
 * never turned into PROVEN). It links each conclusion to its source refs and lets an independent controller re-verify
 * WITHOUT trusting the producer. Reuses, never duplicates, evidence-provenance. Dual export.
 */

const PROV = require("./evidence-provenance.js");

const BASIS = Object.freeze(["PROVEN", "OBSERVED", "ESTIMATED", "SIMULATED", "UNKNOWN"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function normBasis(b: any): string { const x = String(b || "").toUpperCase(); return BASIS.indexOf(x) >= 0 ? x : "UNKNOWN"; }  // fail-closed: unknown ⇒ UNKNOWN, never PROVEN

/**
 * wrapEvidence(items, opts) -> { items:[{claim, basis, sourceRef}], provenance, integrity, summary }. items: [{claim,
 * basis, sourceRef?}]. opts: { sourceRevision?/sourceCommit?, producer? } forwarded to evidence-provenance. FAIL-CLOSED:
 * an item with no recognized basis is UNKNOWN; the wrapper never asserts PROVEN on its own.
 */
function wrapEvidence(items: any, opts: any = {}): any {
  const list = arr(items).filter(isObj).map((it) => Object.freeze({ claim: String(it.claim || "(unspecified)"), basis: normBasis(it.basis), sourceRef: it.sourceRef ? String(it.sourceRef) : null }));
  const counts: any = {}; for (const b of BASIS) counts[b] = list.filter((i) => i.basis === b).length;
  // stamp provenance over the (frozen) evidence set using the canonical primitive — single source of truth.
  const body = { items: list, counts };
  const stamped = PROV.stampProvenance(body, isObj(opts) ? opts : {});
  return Object.freeze({
    items: Object.freeze(list), counts: Object.freeze(counts),
    provenance: stamped && stamped.provenance ? stamped.provenance : null,
    integrity: Object.freeze({ digest: (stamped && stamped.provenance && stamped.provenance.contentSha256) || null, primitive: "evidence-provenance" }),
    summary: Object.freeze({ total: list.length, proven: counts.PROVEN, nonProven: list.length - counts.PROVEN, note: "basis is never upgraded; an absence of proof is UNKNOWN, never PROVEN; provenance via the canonical evidence-provenance primitive (not duplicated)" }),
  });
}

/** verifyEvidence(wrapped, opts) -> { ok, reason }. Re-verifies the provenance WITHOUT trusting the producer, by composing
 *  evidence-provenance.verifyProvenance over the same canonical body. Fail-closed on a malformed wrapper. */
function verifyEvidence(wrapped: any, opts: any = {}): any {
  if (!isObj(wrapped) || !Array.isArray(wrapped.items)) return Object.freeze({ ok: false, reason: "malformed evidence wrapper" });
  const body = { items: wrapped.items.map((i: any) => ({ claim: i.claim, basis: i.basis, sourceRef: i.sourceRef })), counts: wrapped.counts };
  const restamped = PROV.stampProvenance(body, isObj(opts) ? opts : {});
  const expected = restamped && restamped.provenance && restamped.provenance.contentSha256;
  const actual = wrapped.integrity && wrapped.integrity.digest;
  if (!expected || !actual) return Object.freeze({ ok: false, reason: "missing digest (cannot independently verify)" });
  return Object.freeze({ ok: expected === actual, reason: expected === actual ? "digest matches — evidence integrity verified independently" : "digest mismatch — evidence set altered since stamping" });
}

const SHARED_EVIDENCE_WRAPPER_CONTRACT = Object.freeze({
  id: "V124-SHARED-EVIDENCE-WRAPPER", source: "CTO V46.2 O2 — one evidence/traceability layer for the 15 métiers",
  reuses: Object.freeze(["evidence-provenance (stampProvenance/verifyProvenance/contentDigest — THE canonical primitive; composed, never duplicated)"]),
  notAuthority: "attaches uniform, independently-verifiable evidence with an explicit basis; it produces no métier result and upgrades no basis",
  invariants: Object.freeze([
    "basis ∈ PROVEN|OBSERVED|ESTIMATED|SIMULATED|UNKNOWN; an unrecognized/absent basis ⇒ UNKNOWN (never PROVEN) — fail-closed",
    "provenance/integrity come from the canonical evidence-provenance primitive — NO second source of truth",
    "verifyEvidence re-derives the digest independently (an auditor need not trust the producer)",
    "the wrapper never invents a claim nor alters a métier conclusion; pure/deterministic",
  ]),
});

module.exports = { BASIS, wrapEvidence, verifyEvidence, SHARED_EVIDENCE_WRAPPER_CONTRACT };

if (require.main === module) {
  const w = wrapEvidence([{ claim: "485-component SBOM produced", basis: "PROVEN", sourceRef: "P3_CRA_SBOM_READINESS.json" }, { claim: "~107 clients/yr", basis: "SIMULATED" }], { producer: "demo" });
  process.stdout.write(JSON.stringify({ ...SHARED_EVIDENCE_WRAPPER_CONTRACT, demo: { counts: w.counts, verify: verifyEvidence(w).ok } }, null, 2) + "\n");
}

export {};
