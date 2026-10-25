// SHARED-CORE eval-metrics — domain-agnostic confusion matrix + precision/recall/F1 (+ a simple calibration/Brier
// helper). This closes a gap the Domain-B inventory flagged as genuinely MISSING in runtime/core: an explicit
// precision/recall/FP/FN confusion-matrix metric (the eval harness today reports success-rates, not a confusion
// matrix). Pure, deterministic, €0, no I/O. Reusable by A (action outcomes), B (eval harness), C (reconciliation).
//
// SCOPE NOTE: this lives in the operational workspace as a shared-core DEMONSTRATOR component. Promoting it into the
// governed runtime/core (TypeScript) is a SEPARATE authorized lot — not done here (no governed-path write).

// Compare a set of PREDICTED items against a set of EXPECTED (ground-truth) items, keyed by `keyOf`.
// Returns the confusion matrix (tp/fp/fn) and derived precision/recall/F1 with explicit denominators.
export function confusionMatrix(predicted, expected, keyOf = (x) => x) {
  const pk = new Map(), ek = new Map();
  for (const p of predicted) pk.set(keyOf(p), p);
  for (const e of expected) ek.set(keyOf(e), e);
  const tp = [], fp = [], fn = [];
  for (const [k, p] of pk) (ek.has(k) ? tp : fp).push(p);
  for (const [k, e] of ek) if (!pk.has(k)) fn.push(e);
  const TP = tp.length, FP = fp.length, FN = fn.length;
  // precision/recall are UNDEFINED (null) when their denominator is 0 — never silently report 1.0 from nothing.
  const precision = (TP + FP) === 0 ? null : +(TP / (TP + FP)).toFixed(4);
  const recall = (TP + FN) === 0 ? null : +(TP / (TP + FN)).toFixed(4);
  const f1 = (precision == null || recall == null || (precision + recall) === 0) ? null : +(2 * precision * recall / (precision + recall)).toFixed(4);
  return { TP, FP, FN, precision, recall, f1, falsePositives: fp.map(keyOf), falseNegatives: fn.map(keyOf), truePositives: tp.map(keyOf) };
}

// Brier score for probabilistic confidence calibration: mean squared error between predicted prob and outcome(0/1).
// Lower is better (0 = perfect). Returns null if no samples. samples: [{p: number in [0,1], outcome: 0|1}]
export function brierScore(samples) {
  if (!samples || samples.length === 0) return null;
  let s = 0;
  for (const { p, outcome } of samples) { const x = Math.max(0, Math.min(1, Number(p))); s += (x - (outcome ? 1 : 0)) ** 2; }
  return +(s / samples.length).toFixed(4);
}

// Reliability bins: group predictions by confidence bucket and report mean predicted vs observed frequency.
// Surfaces over/under-confidence. bins default to deciles.
export function reliabilityBins(samples, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ n: 0, sumP: 0, sumOutcome: 0 }));
  for (const { p, outcome } of (samples || [])) {
    const x = Math.max(0, Math.min(1, Number(p)));
    const idx = Math.min(nBins - 1, Math.floor(x * nBins));
    bins[idx].n++; bins[idx].sumP += x; bins[idx].sumOutcome += (outcome ? 1 : 0);
  }
  return bins.map((b, i) => ({ bin: i, range: [(i / nBins), ((i + 1) / nBins)], n: b.n, meanPredicted: b.n ? +(b.sumP / b.n).toFixed(4) : null, observed: b.n ? +(b.sumOutcome / b.n).toFixed(4) : null }));
}
