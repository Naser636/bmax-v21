#!/usr/bin/env node
"use strict";

/*
 * ODG5 shared-core promotion — eval-metrics (confusion matrix + calibration).
 * TypeScript port (strict) of docs/odg-operational/shared-core/eval-metrics.mjs. Pure, deterministic, no I/O.
 * Domain-agnostic: A (action outcomes), B (eval harness), C (reconciliation verifier). Closes the Domain-B
 * inventory gap "no explicit precision/recall/FP/FN confusion-matrix metric". Behaviour is identical to the .mjs
 * reference (which remains the operational demonstrator). No new permanent primitive — a pure measurement helper.
 */

export interface ConfusionResult {
  TP: number; FP: number; FN: number;
  precision: number | null; recall: number | null; f1: number | null;
  falsePositives: string[]; falseNegatives: string[]; truePositives: string[];
}

// Compare PREDICTED vs EXPECTED (ground-truth) keyed by keyOf. precision/recall are null (not a fake 1.0) when the
// denominator is 0 — never report success from nothing.
export function confusionMatrix<T>(predicted: T[], expected: T[], keyOf: (x: T) => string = (x) => String(x)): ConfusionResult {
  const pk = new Map<string, T>(), ek = new Map<string, T>();
  for (const p of predicted) pk.set(keyOf(p), p);
  for (const e of expected) ek.set(keyOf(e), e);
  const tp: string[] = [], fp: string[] = [], fn: string[] = [];
  for (const [k] of pk) (ek.has(k) ? tp : fp).push(k);
  for (const [k] of ek) if (!pk.has(k)) fn.push(k);
  const TP = tp.length, FP = fp.length, FN = fn.length;
  const precision = (TP + FP) === 0 ? null : +(TP / (TP + FP)).toFixed(4);
  const recall = (TP + FN) === 0 ? null : +(TP / (TP + FN)).toFixed(4);
  const f1 = (precision == null || recall == null || (precision + recall) === 0) ? null : +(2 * precision * recall / (precision + recall)).toFixed(4);
  return { TP, FP, FN, precision, recall, f1, falsePositives: fp, falseNegatives: fn, truePositives: tp };
}

export interface CalibrationSample { p: number; outcome: 0 | 1 | boolean; }

// Brier score (0 = perfect). null if no samples.
export function brierScore(samples: CalibrationSample[]): number | null {
  if (!samples || samples.length === 0) return null;
  let s = 0;
  for (const { p, outcome } of samples) { const x = Math.max(0, Math.min(1, Number(p))); s += (x - (outcome ? 1 : 0)) ** 2; }
  return +(s / samples.length).toFixed(4);
}

export interface ReliabilityBin { bin: number; range: [number, number]; n: number; meanPredicted: number | null; observed: number | null; }

export function reliabilityBins(samples: CalibrationSample[], nBins = 10): ReliabilityBin[] {
  const bins = Array.from({ length: nBins }, () => ({ n: 0, sumP: 0, sumOutcome: 0 }));
  for (const { p, outcome } of (samples || [])) {
    const x = Math.max(0, Math.min(1, Number(p)));
    const idx = Math.min(nBins - 1, Math.floor(x * nBins));
    bins[idx].n++; bins[idx].sumP += x; bins[idx].sumOutcome += (outcome ? 1 : 0);
  }
  return bins.map((b, i): ReliabilityBin => ({ bin: i, range: [(i / nBins), ((i + 1) / nBins)], n: b.n, meanPredicted: b.n ? +(b.sumP / b.n).toFixed(4) : null, observed: b.n ? +(b.sumOutcome / b.n).toFixed(4) : null }));
}
