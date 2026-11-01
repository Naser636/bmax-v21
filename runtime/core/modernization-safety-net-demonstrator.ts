#!/usr/bin/env node
/**
 * modernization-safety-net-demonstrator — ONE composed legacy-modernization safety-net run for profession P1
 * (Software & Full-Stack Engineering). CTO Master Campaign V3, Wave-2 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. capture a tamper-evident behavioral baseline of the CURRENT code → characterization-baseline.captureBaseline
 *   2. after a refactor, compare fresh samples to the sealed baseline  → characterization-baseline.compareToBaseline
 *   3. charter the verdict with method + (optional) ground-truth provenance → charter-record.makeCharter
 *   4. compose one verdict: MODERNIZATION_CHECKED (+ behavioralVerdict, chartered, gaps)
 *
 * HONEST SCOPE (preserved from characterization-baseline): the baseline pins OBSERVED behavior as a regression
 * net — it is BEHAVIORAL, NOT a correctness oracle (it can faithfully pin a pre-existing bug). FAIL-CLOSED: a
 * tampered/zero-entry baseline ⇒ BASELINE_TAMPERED/NO_BASELINE; a coverage gap ⇒ INCOMPLETE (never a pass); any
 * changed output ⇒ BEHAVIOR_CHANGED. PURE compute (samples passed in; no network/clock). NOTE: the evidence
 * seal (charter-record → evidence-provenance) reads git HEAD for provenance unless a `revision` is injected —
 * fail-closed + per-process cached, never network. ADDITIVE. Dual export.
 */
"use strict";

const CB = require("./characterization-baseline.js");
const CH = require("./charter-record.js");

const SCHEMA = "odg.modernization-safety-net-demonstrator.v1";
const BASIS = "BEHAVIORAL_NOT_CORRECTNESS";
const VERDICT = Object.freeze({ CHECKED: "MODERNIZATION_CHECKED", INCOMPLETE: "MODERNIZATION_INCOMPLETE" });
const PRESERVED = "BEHAVIOR_PRESERVED";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runModernizationCheck(input) — capture → compare → charter. input:
 *   { target, baselineSamples:[{input,output}], newSamples:[{input,output}], method?, groundTruth?, key?, revision?, runId? }
 * NEVER throws on bad input (fail-closed).
 */
function runModernizationCheck(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — capture + seal the behavioral baseline of the current code.
  const cap = CB.captureBaseline({ target: input.target, samples: input.baselineSamples, key: input.key, revision: input.revision, runId: input.runId });
  steps.capture = cap;
  if (!cap.ok) {
    gaps.push(`baseline capture failed: ${cap.code} (${cap.reason}).`);
    return { ok: true, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, basis: BASIS, summary: { captured: false, behavioralVerdict: null, chartered: false, gapCount: gaps.length }, gaps, steps, note: "No baseline ⇒ no safety net. Capture must succeed before a refactor is checkable." };
  }

  // STEP 2 — compare post-refactor samples to the sealed baseline (fail-closed on tamper/gap/change).
  const cmp = CB.compareToBaseline(cap.baseline, input.newSamples, { key: input.key });
  steps.compare = cmp;
  const behavioralVerdict = cmp && (cmp.verdict || (cmp.ok ? "UNKNOWN" : "NO_COMPARISON"));
  const preserved = !!(cmp && cmp.ok && cmp.verdict === PRESERVED);
  if (!(cmp && cmp.ok)) gaps.push(`comparison not conclusive: ${behavioralVerdict} (${cmp && cmp.reason ? cmp.reason : "see compare step"}).`);
  else if (cmp.verdict === "BEHAVIOR_CHANGED") gaps.push(`behavior CHANGED on ${Array.isArray(cmp.changed) ? cmp.changed.length : "?"} input(s) — refactor altered observable behavior (review required).`);
  else if (cmp.verdict === "INCOMPLETE") gaps.push(`coverage gap: ${Array.isArray(cmp.missing) ? cmp.missing.length : "?"} baseline input(s) not re-sampled — NOT a pass.`);

  // STEP 3 — charter the verdict (subject/method/ground-truth provenance). Honest: grounded only if a source given.
  const charter = CH.makeCharter({
    subject: `modernization of ${typeof input.target === "string" ? input.target : "target"}`,
    method: isObj(input.method) || typeof input.method === "string" ? input.method : "characterization-baseline capture+compare (behavioral regression net)",
    verdict: { verdict: preserved ? "ACCEPT" : (behavioralVerdict === "BEHAVIOR_CHANGED" ? "REJECT" : "UNKNOWN") },
    groundTruth: input.groundTruth,
    key: input.key, revision: input.revision, runId: input.runId,
  });
  steps.charter = charter;
  const chartered = !!(charter && charter.ok);
  if (!chartered) gaps.push(`charter not produced: ${charter && charter.reason ? charter.reason : "unknown"}.`);

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.CHECKED,
    basis: BASIS,
    summary: { captured: true, behavioralVerdict, preserved, chartered, grounded: chartered && charter.charter ? charter.charter.grounded === true : false, gapCount: gaps.length },
    gaps,
    steps,
    note: "Composed modernization safety-net: sealed behavioral baseline → post-refactor comparison → chartered verdict. BEHAVIORAL, not a correctness oracle (can pin a pre-existing bug). BEHAVIOR_PRESERVED means observable behavior is unchanged on the sampled inputs — nothing more.",
  };
}

export { runModernizationCheck, SCHEMA, VERDICT, BASIS };
module.exports = { runModernizationCheck, SCHEMA, VERDICT, BASIS };
