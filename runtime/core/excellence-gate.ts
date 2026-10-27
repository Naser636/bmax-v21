#!/usr/bin/env node
/**
 * excellence-gate — applies the SHARED excellence boundary (excellence-policy.requireExcellence) to the LEARNING and
 * RECOVERY decision points, and binds every decision to tamper-evident provenance via audit-log. NOT a new primitive,
 * NOT a router: a thin decision helper the learning/recovery paths call. No duplication of the rule (reuses
 * requireExcellence), no recursion. Pure, deterministic, no clock (now is DATA).
 *
 * LEARNING: a recorded learning may INFLUENCE a later decision only if (a) its sealed provenance verifies, (b) the
 * excellence review admits it (a prohibited unproven-superlative claim blocks; stale/offline is advisory, non-blocking)
 * and (c) it is actually APPLIED. "Recorded" alone is never "reused" — `applied` is true only when the learning's
 * practice is handed back to the decision (and decideWithLearning proves it changes the outcome).
 *
 * RECOVERY: a recovery action proceeds only if the excellence review admits AND (when supplied) the recovery evidence's
 * provenance verifies and is not self-contradictory. Fail-closed on a prohibited claim or tampered evidence.
 *
 * Every gate call appends a hash-chained audit entry (decision + provenance result + verdict + outcome).
 */
"use strict";

const EXC = require("./excellence-policy.js");
const AUDIT = require("./audit-log.js");
const prov = require("./evidence-provenance.js");

function safeReview(reviewer: any, subject: any, fallback: any): { review: any; errored: boolean } {
  if (typeof reviewer !== "function") return { review: fallback, errored: false };
  try { const r = reviewer(subject); return { review: r && typeof r === "object" ? r : fallback, errored: false }; }
  catch { return { review: fallback, errored: true }; }
}

/**
 * gateLearningReuse — decide whether a recorded learning may be REUSED to influence a decision.
 *   input = { learning:{id,practice,provenanceSealed,claims?}, registry, now, reviewer?, chain? }
 */
function gateLearningReuse(input: any): any {
  const chain = Array.isArray(input && input.chain) ? input.chain : [];
  const learning = input && input.learning;
  const now = (input && input.now) || "";
  // (a) provenance — FAIL-CLOSED: no/invalid sealed provenance ⇒ cannot be reused.
  let provOk = false, provReason = "absent provenance";
  if (learning && learning.provenanceSealed) { const v = prov.verifyProvenance(learning.provenanceSealed); provOk = v.ok === true; provReason = v.reason || (provOk ? "ok" : "tampered"); }
  // (b) excellence review (shared boundary). Prohibited claim blocks; stale/offline advisory.
  const fallback = EXC.reviewForExcellence({ domain: "learning", now, registry: (input && input.registry) || [], currentPractices: learning ? [learning.practice] : [], thresholds: {}, measured: {}, claims: (learning && learning.claims) || [] });
  const { review, errored } = safeReview(input && input.reviewer, learning, fallback);
  const gate = EXC.requireExcellence(review, {});
  // (c) applied only when present + provenance ok + gate admits. Reviewer error is advisory (non-blocking).
  const applied = !!learning && provOk && gate.admit === true;
  const appliedPractice = applied ? learning.practice : null;
  const outcome = { kind: "learning-reuse", learningId: (learning && learning.id) || null, provOk, provReason, reviewVerdict: review && review.verdict, gateAdmit: gate.admit, reviewerErrored: errored, applied, appliedPractice };
  const newChain = AUDIT.appendEntry(chain, { at: now, ...outcome });
  return { ...outcome, excellence: { verdict: review && review.verdict, admit: gate.admit, advisory: gate.advisory, reason: gate.reason }, chain: newChain, auditVerified: AUDIT.verifyChain(newChain).ok };
}

/**
 * decideWithLearning — PROOF of effective reuse: pick an option. When a learning was `applied`, its practice is used
 * (if available among options), demonstrating the learning changed the decision — not merely that it was stored.
 */
function decideWithLearning(options: string[], learningResult: any): { chosen: string | null; influencedByLearning: boolean } {
  const opts = Array.isArray(options) ? options : [];
  if (learningResult && learningResult.applied && learningResult.appliedPractice && opts.includes(learningResult.appliedPractice)) {
    return { chosen: learningResult.appliedPractice, influencedByLearning: true };
  }
  return { chosen: opts.length ? opts[0] : null, influencedByLearning: false };
}

/**
 * gateRecovery — decide whether a recovery action proceeds.
 *   input = { action:{id,kind}, evidence?(sealed), contradictory?:bool, registry, now, reviewer?, chain? }
 */
function gateRecovery(input: any): any {
  const chain = Array.isArray(input && input.chain) ? input.chain : [];
  const action = input && input.action;
  const now = (input && input.now) || "";
  // recovery evidence provenance (when supplied) — tampered/contradictory ⇒ do not proceed.
  let evidenceOk = true, evidenceReason = "no evidence supplied (advisory)";
  if (input && input.evidence) { const v = prov.verifyProvenance(input.evidence); evidenceOk = v.ok === true; evidenceReason = v.reason || (evidenceOk ? "ok" : "tampered"); }
  if (input && input.contradictory === true) { evidenceOk = false; evidenceReason = "contradictory recovery evidence"; }
  const fallback = EXC.reviewForExcellence({ domain: "recovery", now, registry: (input && input.registry) || [], currentPractices: action ? [action.kind] : [], thresholds: {}, measured: {}, claims: (action && action.claims) || [] });
  const { review, errored } = safeReview(input && input.reviewer, action, fallback);
  const gate = EXC.requireExcellence(review, {});
  const proceed = !!action && evidenceOk && gate.admit === true;
  const outcome = { kind: "recovery", actionId: (action && action.id) || null, evidenceOk, evidenceReason, reviewVerdict: review && review.verdict, gateAdmit: gate.admit, reviewerErrored: errored, proceed };
  const newChain = AUDIT.appendEntry(chain, { at: now, ...outcome });
  return { ...outcome, excellence: { verdict: review && review.verdict, admit: gate.admit, advisory: gate.advisory, reason: gate.reason }, chain: newChain, auditVerified: AUDIT.verifyChain(newChain).ok };
}

export { gateLearningReuse, decideWithLearning, gateRecovery };
module.exports = { gateLearningReuse, decideWithLearning, gateRecovery };
