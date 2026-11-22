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
/* V15 closure (audit D2): review/inspection are NEVER derivable from a measurement — a caller could simply write
 * {condition:"independentInspection", passed:true}. They are computed only by runMeasuredExperiment from an
 * OWNER-anchored, candidate-bound inspection record (ownerAnchoredReview). */
const REVIEW_KEYS = Object.freeze(["codeAndDepsReviewed", "independentInspection"]);
function deriveEvidence(measurements: any): any {
  const list = Array.isArray(measurements) ? measurements : [];
  const evidence: Record<string, boolean> = {}; const basis: Record<string, string> = {};
  let malformed = 0;
  for (const k of KEYS) { evidence[k] = false; basis[k] = "NOT_MEASURED"; }
  const by: Record<string, any[]> = {};
  let reviewIgnored = 0;
  for (const m of list) { if (!wellFormed(m)) { malformed++; continue; } if (REVIEW_KEYS.includes(m.condition)) { reviewIgnored++; continue; } (by[m.condition] = by[m.condition] || []).push(m); }
  for (const k of REVIEW_KEYS) basis[k] = "NOT_MEASURED (owner-anchored review only — measurements for this condition are ignored)";
  for (const k of KEYS) {
    const ms = by[k] || []; if (!ms.length) continue;
    const pass = ms.every((m: any) => m.passed === true), fail = ms.every((m: any) => m.passed === false);
    if (pass) { evidence[k] = true; basis[k] = "MEASURED_PASS (" + ms.map((m: any) => m.method).join(" + ") + ")"; }
    else if (fail) basis[k] = "MEASURED_FAIL (" + ms.map((m: any) => m.method).join(" + ") + ")";
    else basis[k] = "CONFLICTING (pass and fail measurements) ⇒ false";
  }
  return Object.freeze({ evidence: Object.freeze(evidence), basis: Object.freeze(basis), measuredCount: KEYS.filter((k) => !/^NOT_MEASURED/.test(basis[k])).length, malformedIgnored: malformed, reviewMeasurementsIgnored: reviewIgnored });
}

/* runMeasuredExperiment(experiment, measurements, opts?) -> the REAL chain verdict over DERIVED evidence. Any
 * experiment.evidence supplied by the caller is IGNORED (cannot assert a condition). experiment.ownerReview =
 * { record, signed, candidateCommit } is the ONLY way to satisfy codeAndDepsReviewed / independentInspection. */
function runMeasuredExperiment(experiment: any, measurements: any, opts?: any): any {
  const x = isObj(experiment) ? experiment : {};
  const d0 = deriveEvidence(measurements);
  const orvIn = snapshot(x.ownerReview);
  const orv = isObj(orvIn) ? ownerAnchoredReview(orvIn.record, orvIn.signed, orvIn.candidateCommit, orvIn.experimentId) : Object.freeze({ ok: false, reason: "NO_OWNER_REVIEW" });
  const evidence: Record<string, boolean> = { ...d0.evidence }; const basis: Record<string, string> = { ...d0.basis };
  for (const k of REVIEW_KEYS) { evidence[k] = orv.ok === true; basis[k] = (orv.ok ? "OWNER_REVIEW_PASS" : "OWNER_REVIEW_FAIL") + " (" + orv.reason + ")"; }
  const d = Object.freeze({ ...d0, evidence: Object.freeze(evidence), basis: Object.freeze(basis), ownerReview: orv });
  const r = IC.run({ id: x.id, v124Link: x.v124Link, discovery: x.discovery, proposal: x.proposal, significant: x.significant !== false, evidence: d.evidence }, opts);
  return Object.freeze({ chain: r, derived: d, callerEvidenceIgnored: isObj(x.evidence) });
}

/* ownerAnchoredReview(record, signed, candidateCommit) -> { ok, reason } (wall clock only — audit D4).
 * V15 closure (audit D3): the record must be BOUND to the candidate under review — record.subjectCommit === candidateCommit
 * (full 40-hex) and record.verdict === "ACCEPT" — so one owner signature never counts for later, different code. signed = { attestation, publicKeyPem } over the
 * inspection record (purpose INSPECTION_RECORD). ok ONLY if the key fingerprint is anchored in TRUST_ANCHORS.json
 * INSPECTION_RECORD (owner-controlled) AND the Ed25519 attestation verifies over the exact record. The provider cannot
 * satisfy this: it holds no anchored key, and the anchor list is empty by design until the owner pins one. */
/* snapshot(v): plain-JSON deep copy (inspection M1: a getter could return the candidate on the binding check and the
 * signed commit on the signature check — every check below runs on ONE frozen plain copy). Non-JSON ⇒ null. */
function snapshot(v: any): any { try { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch { return null; } }
function ownerAnchoredReview(record0: any, signed0: any, candidateCommit: any, experimentId?: any): any {
  const record = snapshot(record0), signed = snapshot(signed0);
  if (!isObj(record)) return Object.freeze({ ok: false, reason: "NO_RECORD" });
  // V15 closure (inspection L2): when the caller names its experiment, the record must name the same one (if it names any)
  if (experimentId !== undefined && record.experiment !== experimentId) return Object.freeze({ ok: false, reason: "RECORD_FOR_ANOTHER_EXPERIMENT (" + String(record.experiment) + ")" });
  if (typeof candidateCommit !== "string" || !/^[0-9a-f]{40}$/.test(candidateCommit)) return Object.freeze({ ok: false, reason: "NO_CANDIDATE_COMMIT (full 40-hex sha required)" });
  if (record.subjectCommit !== candidateCommit) return Object.freeze({ ok: false, reason: "RECORD_NOT_BOUND_TO_CANDIDATE (subjectCommit " + String(record.subjectCommit) + ")" });
  if (record.verdict !== "ACCEPT") return Object.freeze({ ok: false, reason: "RECORD_VERDICT_NOT_ACCEPT (" + String(record.verdict) + ")" });
  return ATT.verifyOwnerAnchored("INSPECTION_RECORD", record, signed);   // single implementation (attestation module)
}

const MEASURED_GATE_CONTRACT = Object.freeze({
  id: "V15-MEASURED-GATE-EVIDENCE",
  invariants: Object.freeze([
    "the 12 conditions are the gate's own (GATE.CONDITIONS); no second gate",
    "a condition is true only from a well-formed, passed measurement of THIS run; absent/malformed/conflicting ⇒ false",
    "caller-asserted booleans are ignored",
    "review/inspection come ONLY from an owner-anchored inspection record bound to the candidate commit (measurements for them are ignored)",
    "review / independent inspection count ONLY from an owner-anchored INSPECTION_RECORD signature (anchors loaded in-module; empty by design)",
    "INTEGRATE remains a merge-eligible decision only; deployment stays OWNER_GATED",
  ]),
});
module.exports = { deriveEvidence, runMeasuredExperiment, ownerAnchoredReview, INSPECTION_ANCHORS, KEYS, MEASURED_GATE_CONTRACT };
export {};
