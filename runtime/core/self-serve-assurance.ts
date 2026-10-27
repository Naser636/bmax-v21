#!/usr/bin/env node
/**
 * self-serve-assurance — the smallest useful SELF-SERVE path over the assurance pilot (V20 Phase 2): a client-supplied
 * (synthetic) project descriptor goes in, the pilot runs end-to-end, and the result is TRIAGED into an AUTO_COMPLETE
 * dossier (no human needed — standard findings only) vs NEEDS_HUMAN_REVIEW (exceptions that require interpretation /
 * authorisation: UNKNOWN licenses, AI-Act HIGH flags, a failed/partial run, or exceeding a findings threshold). This
 * ISOLATES the human steps so effective human-time-per-delivery = reviewFraction × reviewHours — the lever that raises
 * the net factor. It does NOT make ODG a hosted SaaS (that needs a product + support + hosting — flagged); it proves the
 * no-human path exists and measures the automatable fraction. SYNTHETIC only; no client data; no cert/guarantee.
 * Pure/deterministic. Reuses assurance-pilot-runner.
 */
"use strict";

const RUNNER = require("./assurance-pilot-runner.js");

const DEFAULT_REVIEW_TRIGGERS = { maxAutoFindings: 8, unknownLicense: true, aiActHigh: true };

/** triage(result, triggers): AUTO_COMPLETE if no exception trigger fires, else NEEDS_HUMAN_REVIEW with reasons. */
function triage(result: any, triggers?: any): any {
  const t = Object.assign({}, DEFAULT_REVIEW_TRIGGERS, triggers || {});
  const reasons: string[] = [];
  if (!result || result.ok !== true) { reasons.push("run failed/partial"); return { status: "NEEDS_HUMAN_REVIEW", reasons }; }
  const findings = result.findings || [];
  if (t.unknownLicense && findings.some((f: any) => f.area === "license" && /UNKNOWN/.test(f.detail))) reasons.push("unknown license — human review");
  if (t.aiActHigh && findings.some((f: any) => f.area === "ai-act" && f.severity === "HIGH")) reasons.push("AI-Act HIGH flag — human/legal review");
  if (typeof t.maxAutoFindings === "number" && findings.length > t.maxAutoFindings) reasons.push(`>${t.maxAutoFindings} findings — human triage`);
  return { status: reasons.length ? "NEEDS_HUMAN_REVIEW" : "AUTO_COMPLETE", reasons };
}

/** runSelfServe(input, opts?): validate (fail-closed) → run pilot → triage → machine verdict + human-review queue. */
function runSelfServe(input: any, opts: any = {}): any {
  if (!input || typeof input !== "object" || !Array.isArray(input.dependencies)) return { ok: false, code: "INVALID_INPUT", detail: "structured project descriptor with dependencies[] required (synthetic)" };
  const result = RUNNER.runPilot(input, { at: opts.at, chain: opts.chain });
  if (!result.ok) return { ok: false, code: "RUN_FAILED", detail: result.detail, needsHuman: true };
  const tri = triage(result, opts.triggers);
  const autoComplete = tri.status === "AUTO_COMPLETE";
  return {
    ok: true, status: tri.status, autoComplete, reviewReasons: tri.reasons,
    machineVerdict: autoComplete ? "DELIVERABLE_WITHOUT_HUMAN" : "HOLD_FOR_HUMAN_REVIEW",
    dossier: { seal: result.seal, findingCount: result.findings.length, acceptance: result.acceptance, markdown: result.markdown },
    humanStepsRequired: autoComplete ? [] : tri.reasons,
    note: "SYNTHETIC; a green auto-complete proves the no-human path for this case — NOT a hosted product, NOT a client engagement, no cert/guarantee.",
  };
}

/**
 * batchThroughput(inputs, opts): run a batch, measure the automatable fraction and the EFFECTIVE human-time/delivery =
 * reviewFraction × reviewHours (auto cases ≈ 0 human time). The lever V19 identified.
 */
function batchThroughput(inputs: any[], opts: any = {}): any {
  const reviewHours = typeof opts.reviewHours === "number" && opts.reviewHours >= 0 ? opts.reviewHours : 4;
  const list = Array.isArray(inputs) ? inputs : [];
  let auto = 0, review = 0, failed = 0;
  for (const i of list) { const r = runSelfServe(i, opts); if (!r.ok) failed++; else if (r.autoComplete) auto++; else review++; }
  const n = list.length || 1;
  const autoFraction = Math.round((auto / n) * 1000) / 1000;
  const reviewFraction = Math.round(((review + failed) / n) * 1000) / 1000;
  const effectiveHumanHoursPerDelivery = Math.round(reviewFraction * reviewHours * 1000) / 1000;
  return { total: list.length, auto, review, failed, autoFraction, reviewFraction, reviewHoursPerException: reviewHours, effectiveHumanHoursPerDelivery, note: "effective human time/delivery = reviewFraction × reviewHours; auto-complete cases ≈ 0 human time. True hosted self-serve still needs product+support (flagged)." };
}

export { runSelfServe, triage, batchThroughput, DEFAULT_REVIEW_TRIGGERS };
module.exports = { runSelfServe, triage, batchThroughput, DEFAULT_REVIEW_TRIGGERS };
