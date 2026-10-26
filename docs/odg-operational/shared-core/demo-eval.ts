// @ts-nocheck
// DOMAIN-B DEMONSTRATOR — independent evaluation + no-false-success gate, reusing the shared-core eval-metrics.
// A "system under test" (SUT) produces predictions; we grade them against a VERSIONED golden set (ground truth)
// with an INDEPENDENT confusion matrix + calibration (Brier), then GATE: a success claim is BLOCKED unless
// precision/recall meet the agreed threshold. Shows an adversarial SUT that claims success but is caught.
// Synthetic, €0, no I/O. Mirrors runtime/core autonomy-eval-harness pattern at demonstrator scale.
import { confusionMatrix, brierScore } from './eval-metrics.js';

// Versioned golden set: labelled transactions; the positive class = "is an anomaly".
export const GOLDEN_V1 = {
  version: 'golden-anomaly-v1',
  cases: [
    { id: 'T1', anomaly: true }, { id: 'T2', anomaly: false }, { id: 'T3', anomaly: true },
    { id: 'T4', anomaly: false }, { id: 'T5', anomaly: true }, { id: 'T6', anomaly: false },
    { id: 'T7', anomaly: true }, { id: 'T8', anomaly: false },
  ],
};

// Evaluate a SUT: predict(caseObj) -> { flagged: bool, confidence: number }. Gate on thresholds.
export function evaluate(sut, golden = GOLDEN_V1, { minPrecision = 0.9, minRecall = 0.9 } = {}) {
  const expected = golden.cases.filter(c => c.anomaly).map(c => ({ k: c.id }));
  const samples = []; const predicted = [];
  for (const c of golden.cases) {
    const p = sut.predict(c);
    samples.push({ p: p.confidence ?? (p.flagged ? 1 : 0), outcome: c.anomaly ? 1 : 0 });
    if (p.flagged) predicted.push({ k: c.id });
  }
  const cm = confusionMatrix(predicted, expected, x => x.k);
  const brier = brierScore(samples);
  const meets = cm.precision != null && cm.recall != null && cm.precision >= minPrecision && cm.recall >= minRecall;
  return {
    goldenVersion: golden.version,
    confusion: cm, brier,
    thresholds: { minPrecision, minRecall },
    // NO-FALSE-SUCCESS: the SUT's own claim is irrelevant; the verdict is a fact about measured precision/recall.
    verdict: meets ? 'PASS' : 'FAIL',
    successClaim: meets ? 'ASSERTED (meets threshold)' : 'BLOCKED (below precision/recall threshold)',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Good SUT: flags exactly the true anomalies, well-calibrated.
  const good = { predict: (c) => ({ flagged: c.anomaly, confidence: c.anomaly ? 0.95 : 0.05 }) };
  // Adversarial SUT: flags everything ("found all anomalies!") — high recall but terrible precision; must be CAUGHT.
  const overclaim = { predict: () => ({ flagged: true, confidence: 0.9 }) };
  // Adversarial SUT: flags nothing but is confidently wrong — recall 0; must be CAUGHT.
  const lazy = { predict: () => ({ flagged: false, confidence: 0.1 }) };

  const g = evaluate(good), o = evaluate(overclaim), l = evaluate(lazy);
  console.log('good     :', g.verdict, '| P', g.confusion.precision, 'R', g.confusion.recall, 'F1', g.confusion.f1, '| Brier', g.brier);
  console.log('overclaim:', o.verdict, '| P', o.confusion.precision, 'R', o.confusion.recall, '|', o.successClaim);
  console.log('lazy     :', l.verdict, '| P', l.confusion.precision, 'R', l.confusion.recall, '|', l.successClaim);
  const ok = g.verdict === 'PASS' && o.verdict === 'FAIL' && l.verdict === 'FAIL';
  console.log(ok ? 'DEMO-B: PASS (good passes; both adversarial SUTs blocked)' : 'DEMO-B: FAIL');
  process.exit(ok ? 0 : 1);
}
