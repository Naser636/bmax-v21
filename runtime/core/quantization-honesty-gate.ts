#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (P13 AI-infra — world-research gap) — QUANTIZATION HONESTY GATE. PURE, deterministic. World reference:
 * the 2026 norm for inference optimization is that a quantized model's speed/cost win is valid ONLY when a declared,
 * task-specific accuracy-degradation tolerance is met — speed never excuses silent quality loss ("Give Me BF16 or
 * Give Me Death?", arXiv 2411.02355v4 2026: FP8≈lossless, INT8≈1-3%, INT4≈1-15%+; Traversaal.ai 2026 decision
 * framework: "accept if MMLU degradation <1.5% and GSM8K <2%; else switch to QAT / lower the ratio"). ODG has the
 * SPEED side (inference-engine.benchmark: latency/cost) and the QUALITY side (p2-passk-reliability.passAtK: held-out
 * pass^k) but NOTHING ties one to the other (grep-verified: no quantiz/int8/fp8/perplexity module). This gate composes
 * both: it credits a speedup/cost win ONLY when the held-out accuracy/reliability drop is within the DECLARED
 * tolerance; otherwise REFUSED. No new engine, no network, no GPU, no clock/random. Dual export.
 */

const ENGINE = require("./inference-engine");          // benchmark — latency/cost per precision
const PASSK = require("./p2-passk-reliability");        // passAtK — held-out pass^1 / pass^k / reliabilityDrop

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(6)); }

const DECISION = Object.freeze(["ACCEPT", "REFUSED_REGRESSION", "NO_WIN", "INSUFFICIENT_EVIDENCE"]);

/**
 * assess({baseline, quantized, requests, baselineRollouts, quantizedRollouts, maxAccuracyDrop, maxReliabilityDrop})
 *   baseline/quantized: { provider } inference-engine providers (quantized labelled gpu-simulated/deterministic)
 *   requests: the SAME request set run through both (speed/cost side)
 *   baselineRollouts/quantizedRollouts: { taskId: [bool,...] } held-out rollouts (quality side, passAtK)
 *   maxAccuracyDrop / maxReliabilityDrop: DECLARED tolerances (fractions, e.g. 0.015). Missing ⇒ 0 (strict).
 * -> { decision, speedup, costReduction, accuracyDrop, reliabilityRegression, evidence, reasons }.
 */
function assess(input: any): any {
  const o = isObj(input) ? input : {};
  const baseP = isObj(o.baseline) ? o.baseline.provider : null;
  const quantP = isObj(o.quantized) ? o.quantized.provider : null;
  const reasons: string[] = [];
  if (!baseP || !quantP) return refuse("INSUFFICIENT_EVIDENCE", ["baseline and quantized providers required (fail-closed)"], {});

  // SPEED/COST side — benchmark both precisions over the SAME requests.
  const bBase = ENGINE.benchmark(baseP, o.requests);
  const bQuant = ENGINE.benchmark(quantP, o.requests);
  const speedup = bQuant.estLatencyMs > 0 ? round(bBase.estLatencyMs / bQuant.estLatencyMs) : (bBase.estLatencyMs > 0 ? Infinity : 1);
  const costReduction = bBase.estCost > 0 ? round((bBase.estCost - bQuant.estCost) / bBase.estCost) : 0;

  // QUALITY side — held-out pass^k for each precision.
  const aBase = PASSK.passAtK(isObj(o.baselineRollouts) ? o.baselineRollouts : {});
  const aQuant = PASSK.passAtK(isObj(o.quantizedRollouts) ? o.quantizedRollouts : {});
  // fail-closed: a speedup claim with NO held-out rollouts on either side is never credited.
  if (aBase.tasks === 0 || aQuant.tasks === 0) return refuse("INSUFFICIENT_EVIDENCE", ["no held-out rollouts for one or both precisions — a speed/cost win is never credited without a measured accuracy check"], { speedup, costReduction });

  const accuracyDrop = round(aBase.passAtK - aQuant.passAtK);          // held-out pass^k drop (positive = worse)
  const pass1Drop = round(aBase.passAt1 - aQuant.passAt1);
  const reliabilityRegression = round(aQuant.reliabilityDrop - aBase.reliabilityDrop); // flakiness introduced by quantization
  const maxAcc = Math.max(0, num(o.maxAccuracyDrop, 0));
  const maxRel = Math.max(0, num(o.maxReliabilityDrop, 0));

  const evidence = Object.freeze({ speedup, costReduction, accuracyDrop, pass1Drop, reliabilityRegression, maxAccuracyDrop: maxAcc, maxReliabilityDrop: maxRel, baseline: { passAtK: aBase.passAtK, estLatencyMs: bBase.estLatencyMs, estCost: bBase.estCost }, quantized: { passAtK: aQuant.passAtK, estLatencyMs: bQuant.estLatencyMs, estCost: bQuant.estCost } });

  // a real win must exist to have anything to accept.
  const realWin = speedup > 1 || costReduction > 0;
  if (!realWin) { reasons.push("no measured speed or cost win over the baseline precision"); return Object.freeze({ decision: "NO_WIN", ...evidence, reasons: Object.freeze(reasons) }); }

  // REGRESSION gate — the win is credited ONLY if the accuracy/reliability drop is within the DECLARED tolerance.
  if (accuracyDrop > maxAcc) reasons.push(`held-out accuracy drop ${accuracyDrop} exceeds declared tolerance ${maxAcc}`);
  if (reliabilityRegression > maxRel) reasons.push(`reliability regression ${reliabilityRegression} exceeds declared tolerance ${maxRel}`);
  if (reasons.length > 0) return Object.freeze({ decision: "REFUSED_REGRESSION", ...evidence, reasons: Object.freeze(reasons) });

  return Object.freeze({ decision: "ACCEPT", ...evidence, reasons: Object.freeze([`measured win (speedup ${speedup}, costReduction ${costReduction}) with accuracy drop ${accuracyDrop} ≤ ${maxAcc} and reliability regression ${reliabilityRegression} ≤ ${maxRel}`]) });
}

function refuse(decision: string, reasons: string[], evidence: any): any { return Object.freeze({ decision, speedup: null, costReduction: null, accuracyDrop: null, reliabilityRegression: null, evidence: Object.freeze(evidence || {}), reasons: Object.freeze(reasons) }); }

const QUANTIZATION_HONESTY_CONTRACT = Object.freeze({
  id: "V124-P13-QUANTIZATION-HONESTY",
  source: "SÉRIE 22 P13 — quantization accuracy-vs-speed honesty (arXiv 2411.02355v4 2026; Traversaal.ai 2026)",
  decisions: DECISION,
  reuses: Object.freeze(["inference-engine.benchmark (latency/cost)", "p2-passk-reliability.passAtK (held-out pass^k)"]),
  notAuthority: "a deterministic honesty gate over measured speed+accuracy; it does not quantize, deploy, or run a model",
  invariants: Object.freeze([
    "a speed/cost win is ACCEPTED only when the held-out accuracy drop ≤ the DECLARED tolerance (speed never excuses silent quality loss)",
    "accuracy drop beyond tolerance ⇒ REFUSED_REGRESSION; reliability (pass^k flakiness) regression beyond tolerance ⇒ REFUSED_REGRESSION",
    "a speedup claim with NO held-out rollouts ⇒ INSUFFICIENT_EVIDENCE — never credited (fail-closed)",
    "no measured speed/cost win ⇒ NO_WIN (nothing to accept)",
    "pure/deterministic: composes benchmark + passAtK; no network, no GPU, no clock/random; missing tolerance ⇒ 0 (strict)",
  ]),
});

module.exports = { assess, QUANTIZATION_HONESTY_CONTRACT };

if (require.main === module) {
  const cpu = ENGINE.defineProvider({ name: "fp16-ref", kind: "cpu-reference", fn: (x: any) => x, latencyPerUnit: 10, costPerUnit: 0.001 });
  const q = ENGINE.defineProvider({ name: "int8-sim", kind: "gpu-simulated", fn: (x: any) => x, latencyPerUnit: 4, costPerUnit: 0.0004 });
  const reqs = [{ input: "hello" }, { input: "world!!" }];
  const demo = assess({ baseline: { provider: cpu }, quantized: { provider: q }, requests: reqs,
    baselineRollouts: { t1: [true, true], t2: [true, true] }, quantizedRollouts: { t1: [true, true], t2: [true, false] },
    maxAccuracyDrop: 0.6, maxReliabilityDrop: 0.6 });
  process.stdout.write(JSON.stringify({ ...QUANTIZATION_HONESTY_CONTRACT, demo: { decision: demo.decision, speedup: demo.speedup, accuracyDrop: demo.accuracyDrop } }, null, 2) + "\n");
}

export {};
