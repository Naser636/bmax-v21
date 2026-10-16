#!/usr/bin/env node
"use strict";

/*
 * LEARNING REVIEW (§V S5 — continuous application) — a thin CONSUMER that composes the §V evaluation
 * capabilities on REAL signals and turns the result into an authorized DECISION (a gate), so the learning
 * chain is not just observable (S2) and measurable (S4) but ACTED ON.
 *
 * It creates NO engine/primitive: it drives learning-chain.classifyLearningState (S2) over the learning
 * records and reads an improvement-baseline snapshot (S4) of REAL repo signals, then emits a gate verdict.
 *
 * THE DECISION IT INFLUENCES (deny-by-default, honest): the loop is reported EFFECTIVE only when the
 * evidence supports it. It is GATED (block=true ⇒ a non-zero exit, usable as a CI / post-event gate) when
 *   - a real DEBT signal shows a REGRESSION — a FROZEN_LOOP / recurring incidents mean prior fixes did NOT
 *     hold, so the self-improvement loop is NOT demonstrably effective; OR
 *   - any learning record OVER-CLAIMS — asserts a `claim` state its evidence does not reach (never
 *     fabricate progress).
 * OBSERVED (measured) facts are kept strictly separate from HYPOTHESES (signals that were null/unmeasured).
 *
 * Pure: a deterministic function of its inputs (baseline snapshot + learning records). No fs/clock/network.
 */

const { classifyLearningState, STATES }: any = require("../../runtime/core/learning-chain");

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const rank = (s: any) => { const i = STATES.indexOf(s); return i < 0 ? -1 : i; };

export interface LearningReviewInput {
  baseline?: any;              // an improvement-baseline snapshot { signals: {...} } of REAL repo signals
  records?: any[];             // learning records (each may carry an optional `claim` = asserted state)
}

/**
 * reviewLearning(input) -> { verdict, block, observed, hypotheses, records, reason }.
 *   verdict: "EFFECTIVE" | "REGRESSED" | "INCONCLUSIVE".
 *   block:   the DECISION — true ⇒ gate/stop (regression or over-claim); false ⇒ proceed.
 */
export function reviewLearning(input: LearningReviewInput): any {
  const baseline = input && isPlainObject(input.baseline) ? input.baseline : { signals: {} };
  const signals = isPlainObject(baseline.signals) ? baseline.signals : {};
  const records = input && Array.isArray(input.records) ? input.records : [];

  // Grade every learning record via S2; detect OVER-CLAIM (claimed a state the evidence does not reach).
  const graded = records.map((r: any) => {
    const cls = classifyLearningState(r);
    const claim = isPlainObject(r) && typeof r.claim === "string" ? r.claim : null;
    const overClaim = claim != null && rank(cls.state) < rank(claim);
    return { id: isPlainObject(r) && r.id ? r.id : null, claim, overClaim, ...cls };
  });
  const overClaims = graded.filter((g: any) => g.overClaim);

  // REAL debt signals (lower-is-better). A number > 0 is an OBSERVED regression; null is an UNMEASURED
  // hypothesis (never counted as a regression — honest observed-vs-hypothesis separation).
  const debtKeys = ["frozenIncidents", "recurringIncidents", "hazardBlocked"];
  const observed: any = { records: graded.filter((g: any) => g.state !== null).length, effectiveRecords: graded.filter((g: any) => g.complete).length };
  const hypotheses: string[] = [];
  const regressedSignals: string[] = [];
  for (const k of debtKeys) {
    const v = signals[k];
    if (typeof v === "number") { observed[k] = v; if (v > 0) regressedSignals.push(`${k}=${v}`); }
    else hypotheses.push(`${k} unmeasured (null) — not observed, treated as hypothesis`);
  }

  const regression = regressedSignals.length > 0 || overClaims.length > 0;
  const allEffective = graded.length > 0 && graded.every((g: any) => g.complete);
  const verdict = regression ? "REGRESSED" : (allEffective ? "EFFECTIVE" : "INCONCLUSIVE");
  const block = regression; // the authorized DECISION (gate)

  const reasonParts: string[] = [];
  if (regressedSignals.length) reasonParts.push(`debt regression: ${regressedSignals.join(", ")} (prior fixes did not hold)`);
  if (overClaims.length) reasonParts.push(`over-claim: ${overClaims.map((g: any) => `${g.id} claims ${g.claim} but graded ${g.state}`).join("; ")}`);
  if (!regression && allEffective) reasonParts.push("all learning records EFFECTIVE and no debt regression observed");
  if (!regression && !allEffective) reasonParts.push("no regression, but not every learning is proven EFFECTIVE yet");

  return {
    verdict,
    block,
    observed,
    hypotheses,
    records: graded,
    reason: reasonParts.join(" | ") || "no signals",
  };
}

module.exports = { reviewLearning };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
