#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-7 (knowledge/memory integrity — world-research gap) — MEMORY TRUST GATE (retrieval-time). PURE,
 * deterministic. World reference: MemoryGraft (arXiv 2512.16962 2025 — agents treat retrieved memories as ground
 * truth because retrieval is "based purely on similarity without provenance checks or sanitization"); "When Stale
 * Constraints Go Unchecked" (arXiv 2608.25553 2026 — "retrieval must reason about supersession and provenance, not
 * just similarity"). ODG's reuse de-selection is REACTIVE (reuse-ledger needs ≥2 measured regressions) + opt-in claim
 * checks; at retrieval, "memory always wins" on raw signature equality with NO staleness/tamper/author check (grep-
 * verified: patch-memory.lookup reads neither learnedAt nor authoredBy to gate; memory-taxonomy's isStale/qualityOf
 * reach only consolidation WRITE-time, never the live recall path). This gate composes those existing primitives into
 * ONE retrieval-time verdict: memory-taxonomy.qualityOf/isStale (staleness/invalidated/unverified) + actor-provenance
 * .resolveEntryActor + a trusted-author allowlist + evidence-provenance.verifyProvenance (optional tamper stamp) +
 * an injected reuse-ledger signal. Deny-by-default. It is a non-blocking pre-check; promotes nothing. Dual export.
 */

const TAX = require("./memory-taxonomy");              // qualityOf / isStale — staleness + INVALIDATED/UNVERIFIED/NO_PROVENANCE
const ACTOR = require("./actor-provenance");           // resolveEntryActor — trusted-author mapping
const PROV = require("./evidence-provenance");         // verifyProvenance — optional tamper/digest check on a stamped record

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }

const VERDICT = Object.freeze(["TRUSTED", "INVALIDATED", "TAMPERED", "STALE", "UNATTRIBUTED", "UNTRUSTED_AUTHOR", "SUPPRESSED", "UNVERIFIED", "INSUFFICIENT_SIGNAL"]);

/**
 * assessMemoryTrust(recalled, { asOf, trustedAuthors, minConfidence, reuseHealth, stamp, key }) -> { trusted, verdict, reasons }.
 * recalled: a memory record { id, provenance (string label), validUntil, status, confidence, authoredBy/executedBy }.
 * Fail-closed (deny-by-default): TRUSTED only if ALL hold — not invalidated, untampered, not stale, attributed to a
 * trusted author, not reuse-suppressed, and quality OK; ANY missing required signal ⇒ INSUFFICIENT_SIGNAL (trusted:false).
 */
function assessMemoryTrust(recalled: any, opts: any): any {
  const rec = isObj(recalled) ? recalled : {};
  const o = isObj(opts) ? opts : {};
  const reasons: string[] = [];
  const quality = TAX.qualityOf(rec, o.asOf, { minConfidence: o.minConfidence });

  // 1. explicitly invalidated/superseded.
  if (quality === "INVALIDATED") return gate(false, "INVALIDATED", ["record status INVALIDATED (superseded)"]);

  // 2. tamper (optional): if a provenance STAMP is supplied, it must verify.
  if (isObj(o.stamp)) {
    const v = PROV.verifyProvenance(o.stamp, { key: o.key });
    if (!v.ok) return gate(false, "TAMPERED", [`provenance stamp failed: ${v.reason}`]);
  }

  // 3. staleness — requires asOf when a validUntil is declared (else we cannot establish freshness).
  if (isNum(rec.validUntil) && !isNum(o.asOf)) return gate(false, "INSUFFICIENT_SIGNAL", ["record declares validUntil but no asOf supplied — cannot verify staleness (fail-closed)"]);
  if (quality === "STALE") return gate(false, "STALE", ["record is past its validUntil (stale)"]);

  // 4. attribution — a trusted-author allowlist MUST be supplied; author MUST resolve and be on it.
  const author = ACTOR.resolveEntryActor(rec);
  if (quality === "NO_PROVENANCE") reasons.push("no provenance label");
  if (!Array.isArray(o.trustedAuthors)) return gate(false, "INSUFFICIENT_SIGNAL", ["no trustedAuthors allowlist supplied — cannot establish author trust (deny-by-default)"]);
  if (!author) return gate(false, "UNATTRIBUTED", reasons.concat(["author could not be resolved (UNKNOWN) — poisoning vector"]));
  if (!arr(o.trustedAuthors).map(String).includes(String(author))) return gate(false, "UNTRUSTED_AUTHOR", [`author '${author}' not in trustedAuthors`]);

  // 5. reactive reuse-ledger suppression (injected signal — this module stays pure/no-fs).
  if (isObj(o.reuseHealth) && o.reuseHealth.suppressed === true) return gate(false, "SUPPRESSED", ["reuse-ledger has suppressed this signature (prior measured regressions)"]);

  // 6. residual quality.
  if (quality === "UNVERIFIED") return gate(false, "UNVERIFIED", ["record quality UNVERIFIED"]);
  if (quality !== "OK") return gate(false, "INSUFFICIENT_SIGNAL", [`memory quality ${quality} — not trustable for reuse`]);

  return gate(true, "TRUSTED", [`fresh + untampered + authored by trusted '${author}' + not suppressed + quality OK`]);
}

function gate(trusted: boolean, verdict: string, reasons: string[]): any { return Object.freeze({ trusted, verdict, reasons: Object.freeze(reasons), selfAuthorized: false }); }

const MEMORY_TRUST_GATE_CONTRACT = Object.freeze({
  id: "V124-MEMORY-TRUST-GATE",
  source: "SÉRIE 23/W7 knowledge-memory — retrieval-time memory trust (MemoryGraft 2512.16962; Stale-Constraints 2608.25553 2026)",
  verdicts: VERDICT,
  reuses: Object.freeze(["memory-taxonomy.qualityOf/isStale (staleness/invalidated/unverified)", "actor-provenance.resolveEntryActor (author)", "evidence-provenance.verifyProvenance (optional tamper stamp)", "reuse-ledger signal injected (no fs)"]),
  notAuthority: "a non-blocking retrieval-time pre-check; it promotes nothing and creates no store",
  invariants: Object.freeze([
    "TRUSTED only if ALL hold: not INVALIDATED, untampered, not STALE, author ∈ trustedAuthors, not reuse-suppressed, quality OK",
    "a validUntil with no asOf ⇒ INSUFFICIENT_SIGNAL; no trustedAuthors allowlist ⇒ INSUFFICIENT_SIGNAL (deny-by-default)",
    "an unresolved/UNKNOWN author ⇒ UNATTRIBUTED (MemoryGraft poisoning vector) — never trusted",
    "a supplied provenance stamp that fails to verify ⇒ TAMPERED",
    "pure/deterministic: asOf injected (no clock), reuse signal injected (no fs); never a silent pass",
  ]),
});

module.exports = { assessMemoryTrust, MEMORY_TRUST_GATE_CONTRACT };

if (require.main === module) {
  const rec = { id: "m1", provenance: "mission:M123", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "capability" };
  const demo = assessMemoryTrust(rec, { asOf: 100, trustedAuthors: ["ODG"] });
  process.stdout.write(JSON.stringify({ ...MEMORY_TRUST_GATE_CONTRACT, demo: { verdict: demo.verdict, trusted: demo.trusted } }, null, 2) + "\n");
}

export {};
