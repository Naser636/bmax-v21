/**
 * V15 — MEASURED gate evidence. The canonical gate (odg-sandbox-integration-gate.decide via odg-improvement-chain.run)
 * takes 12 booleans; a caller can simply assert them. This module is the honest front: each condition is DERIVED from a
 * MEASUREMENT record { condition, method, observed, passed, artifactSha256? } produced by an experiment runner, and is
 * true ONLY when a well-formed measurement for it exists in THIS run and passed. Anything absent, malformed, duplicated or
 * not passed stays FALSE (deny-by-default) — the gate then RETURNs (soft) or REJECTs (hard), it is never told "true".
 * PURE, deterministic. It reuses the gate's own CONDITIONS list (no second gate, no second condition set).
 */
"use strict";
const GATE = require("./odg-sandbox-integration-gate.js");
const IC = require("./odg-improvement-chain.js");
const ATT = require("./odg-knowledge-attestation.js");
const INSPECTION_ANCHORS: readonly string[] = ATT.OWNER_ANCHORS.INSPECTION_RECORD;   // loaded in the attestation module

const KEYS: string[] = GATE.CONDITIONS.map((c: any) => c.key);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function wellFormed(m: any): boolean {
  return isObj(m) && KEYS.includes(m.condition) && typeof m.method === "string" && m.method.trim().length >= 8
    && "observed" in m && typeof m.passed === "boolean"
    && (m.artifactSha256 === undefined || (typeof m.artifactSha256 === "string" && /^[0-9a-f]{64}$/.test(m.artifactSha256)));
}

/* deriveEvidence(measurements) -> { evidence (12 booleans), basis (per condition: MEASURED_PASS / MEASURED_FAIL /
 * NOT_MEASURED / CONFLICTING / MALFORMED), measuredCount }. A condition with two contradictory measurements ⇒ false. */
function deriveEvidence(measurements: any): any {
  const list = Array.isArray(measurements) ? measurements : [];
  const evidence: Record<string, boolean> = {}; const basis: Record<string, string> = {};
  let malformed = 0;
  for (const k of KEYS) { evidence[k] = false; basis[k] = "NOT_MEASURED"; }
  const by: Record<string, any[]> = {};
  for (const m of list) { if (!wellFormed(m)) { malformed++; continue; } (by[m.condition] = by[m.condition] || []).push(m); }
  for (const k of KEYS) {
    const ms = by[k] || []; if (!ms.length) continue;
    const pass = ms.every((m: any) => m.passed === true), fail = ms.every((m: any) => m.passed === false);
    if (pass) { evidence[k] = true; basis[k] = "MEASURED_PASS (" + ms.map((m: any) => m.method).join(" + ") + ")"; }
    else if (fail) basis[k] = "MEASURED_FAIL (" + ms.map((m: any) => m.method).join(" + ") + ")";
    else basis[k] = "CONFLICTING (pass and fail measurements) ⇒ false";
  }
  return Object.freeze({ evidence: Object.freeze(evidence), basis: Object.freeze(basis), measuredCount: KEYS.filter((k) => basis[k] !== "NOT_MEASURED").length, malformedIgnored: malformed });
}

/* runMeasuredExperiment(experiment, measurements, opts?) -> the REAL chain verdict over DERIVED evidence. Any
 * experiment.evidence supplied by the caller is IGNORED (cannot assert a condition). */
function runMeasuredExperiment(experiment: any, measurements: any, opts?: any): any {
  const x = isObj(experiment) ? experiment : {};
  const d = deriveEvidence(measurements);
  const r = IC.run({ id: x.id, v124Link: x.v124Link, discovery: x.discovery, proposal: x.proposal, significant: x.significant !== false, evidence: d.evidence }, opts);
  return Object.freeze({ chain: r, derived: d, callerEvidenceIgnored: isObj(x.evidence) });
}

/* ownerAnchoredReview(record, signed, asOfEpochMs) -> { ok, reason }. signed = { attestation, publicKeyPem } over the
 * inspection record (purpose INSPECTION_RECORD). ok ONLY if the key fingerprint is anchored in TRUST_ANCHORS.json
 * INSPECTION_RECORD (owner-controlled) AND the Ed25519 attestation verifies over the exact record. The provider cannot
 * satisfy this: it holds no anchored key, and the anchor list is empty by design until the owner pins one. */
function ownerAnchoredReview(record: any, signed: any, asOfEpochMs: number): any {
  if (!isObj(record)) return Object.freeze({ ok: false, reason: "NO_RECORD" });
  return ATT.verifyOwnerAnchored("INSPECTION_RECORD", record, signed, asOfEpochMs);   // single implementation (attestation module)
}

const MEASURED_GATE_CONTRACT = Object.freeze({
  id: "V15-MEASURED-GATE-EVIDENCE",
  invariants: Object.freeze([
    "the 12 conditions are the gate's own (GATE.CONDITIONS); no second gate",
    "a condition is true only from a well-formed, passed measurement of THIS run; absent/malformed/conflicting ⇒ false",
    "caller-asserted booleans are ignored",
    "review / independent inspection count ONLY from an owner-anchored INSPECTION_RECORD signature (anchors loaded in-module; empty by design)",
    "INTEGRATE remains a merge-eligible decision only; deployment stays OWNER_GATED",
  ]),
});
module.exports = { deriveEvidence, runMeasuredExperiment, ownerAnchoredReview, INSPECTION_ANCHORS, KEYS, MEASURED_GATE_CONTRACT };
export {};
