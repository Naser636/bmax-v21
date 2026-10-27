#!/usr/bin/env node
/**
 * pipeline-forecast — probability-weighted expected value over the commercial-pipeline (V21 Phase 10 /
 * benchmark ref #20 HubSpot). Each opportunity sits in exactly ONE current stage; a per-stage probability
 * weight yields expected = Σ(amount × P(stage)). This sharpens the €500k planning WITHOUT the dishonesty
 * that the mandate forbids:
 *
 *   1. FORECAST ≠ CASH. Realized cash (CASHED, P=1) is reported in its OWN bucket, separate from the
 *      probability-weighted OPEN pipeline. The weighted figure is an expectation over not-yet-cashed deals,
 *      never counted as money received.
 *   2. NO INVENTED NUMBERS. The stage probabilities are an explicit, overridable HYPOTHESIS (not measured
 *      win-rates). Pass measured probabilities via opts.stageProbabilities when you have them; fail-closed
 *      on any probability outside [0,1].
 *   3. NO DOUBLE-COUNTING. Each opportunity contributes once at its current stage (stages are mutually
 *      exclusive current states) — not at every stage it passed through. SIGNED is weighted < 1 because a
 *      signed contract is not yet cash (preserves prepared≠sent≠signed≠cashed).
 *   4. FORECAST IS GROSS. This expects gross cash-in, NOT net — convert with net-cash-model/economic-profiles.
 *
 * Pure/deterministic; no fs/clock/network. Reuses the commercial-pipeline STAGES ordering.
 */
"use strict";

const CP = require("./commercial-pipeline.js");

// DEFAULT per-stage probability — an explicit HYPOTHESIS (monotonic, conservative), NOT measured win-rates.
// SIGNED < 1 on purpose: a signed contract is not yet cash (some signed deals never pay / are refunded).
const DEFAULT_STAGE_PROBABILITY: Readonly<Record<string, number>> = Object.freeze({
  DETECTED: 0.02, VERIFIED: 0.05, QUALIFIED: 0.10, INTERESTED: 0.20,
  PROPOSAL_PREPARED: 0.30, PROPOSAL_AUTHORIZED: 0.40, PROPOSAL_SENT: 0.50,
  NEGOTIATION: 0.65, SIGNED: 0.90, DELIVERY_ACCEPTED: 0.95, INVOICED: 0.98, CASHED: 1.0,
});

function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** validateProbabilities(map): every value must be a number in [0,1]; returns {ok} or {ok:false,code,detail}. */
function validateProbabilities(map: any): any {
  if (map === null || typeof map !== "object" || Array.isArray(map)) return { ok: false, code: "INVALID_PROBABILITIES", detail: "stageProbabilities must be an object" };
  for (const k of Object.keys(map)) {
    const p = map[k];
    if (!isNum(p) || p < 0 || p > 1) return { ok: false, code: "INVALID_PROBABILITIES", detail: `probability for ${k} must be a number in [0,1]` };
  }
  return { ok: true };
}

/**
 * forecast(entries, opts?): weighted expected value over opportunities.
 * opts.stageProbabilities overrides the DEFAULT hypothesis (fail-closed validated).
 * Returns { ok, realizedCash, weightedOpenPipeline, weightedTotal, counted, lost, byStage, probabilitySource, note }.
 */
function forecast(entries: any, opts: any = {}): any {
  if (!Array.isArray(entries)) return { ok: false, code: "INVALID_INPUT", detail: "entries[] (opportunities) required" };
  const probs: Record<string, number> = Object.assign({}, DEFAULT_STAGE_PROBABILITY, opts.stageProbabilities || {});
  if (opts.stageProbabilities) { const v = validateProbabilities(opts.stageProbabilities); if (!v.ok) return v; }

  const byStage: Record<string, any> = {};
  for (const s of CP.STAGES) byStage[s] = { count: 0, amount: 0, probability: probs[s], weighted: 0 };

  let realizedCash = 0, weightedOpenPipeline = 0, counted = 0, lost = 0;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    if (e.lost === true) { lost++; continue; }
    const stage = String(e.stage || "");
    if (!(stage in probs)) continue;                 // unknown stage ⇒ ignored (deny-by-default), never guessed
    const amount = isNum(e.amount) && e.amount >= 0 ? e.amount : 0;
    const p = probs[stage];
    const weighted = amount * p;
    counted++;
    byStage[stage].count += 1; byStage[stage].amount = r2(byStage[stage].amount + amount); byStage[stage].weighted = r2(byStage[stage].weighted + weighted);
    if (stage === "CASHED") realizedCash += amount;  // realized money — its OWN bucket
    else weightedOpenPipeline += weighted;           // expectation over not-yet-cashed deals
  }

  return {
    ok: true,
    realizedCash: r2(realizedCash),
    weightedOpenPipeline: r2(weightedOpenPipeline),
    weightedTotal: r2(realizedCash + weightedOpenPipeline),
    counted, lost,
    byStage,
    probabilitySource: opts.stageProbabilities ? "CALLER_SUPPLIED" : "DEFAULT_HYPOTHESIS",
    note: "weightedOpenPipeline is a probability-weighted FORECAST (gross, HYPOTHESIS probabilities), NOT cash. Only realizedCash (CASHED, P=1) is money received. Convert gross→net with net-cash-model. No double-counting: one weight per opportunity at its current stage.",
  };
}

export { DEFAULT_STAGE_PROBABILITY, validateProbabilities, forecast };
module.exports = { DEFAULT_STAGE_PROBABILITY, validateProbabilities, forecast };

// Read-only CLI: print the default (hypothesis) probability ladder; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "pipeline-forecast/1", defaultStageProbability: DEFAULT_STAGE_PROBABILITY, note: "HYPOTHESIS, not measured win-rates" }, null, 2) + "\n");
}
