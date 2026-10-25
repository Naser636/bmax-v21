// SHARED-CORE tests — eval-metrics (confusion matrix + calibration) and dep-planner (topological scheduling).
// Positive + adversarial (cycles, missing deps, zero-denominator). Pure, deterministic, €0. Node >=18.
import assert from 'node:assert';
import { confusionMatrix, brierScore, reliabilityBins } from './eval-metrics.mjs';
import { planLayers, sequentialOrder, schedule } from './dep-planner.mjs';

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; failures.push(`${name}: ${e.message}`); } };

// --- eval-metrics ---
t('confusion: perfect match => precision=recall=f1=1', () => {
  const m = confusionMatrix([{ k: 'a' }, { k: 'b' }], [{ k: 'a' }, { k: 'b' }], x => x.k);
  assert.deepEqual([m.TP, m.FP, m.FN], [2, 0, 0]); assert.equal(m.precision, 1); assert.equal(m.recall, 1); assert.equal(m.f1, 1);
});
t('confusion: false positive lowers precision', () => {
  const m = confusionMatrix([{ k: 'a' }, { k: 'x' }], [{ k: 'a' }], x => x.k);
  assert.equal(m.TP, 1); assert.equal(m.FP, 1); assert.equal(m.precision, 0.5); assert.equal(m.recall, 1);
  assert.deepEqual(m.falsePositives, ['x']);
});
t('confusion: false negative lowers recall', () => {
  const m = confusionMatrix([{ k: 'a' }], [{ k: 'a' }, { k: 'missed' }], x => x.k);
  assert.equal(m.FN, 1); assert.equal(m.recall, 0.5); assert.deepEqual(m.falseNegatives, ['missed']);
});
t('confusion: zero denominator => null, NOT a fake 1.0', () => {
  const m = confusionMatrix([], [], x => x.k);
  assert.equal(m.precision, null); assert.equal(m.recall, null); assert.equal(m.f1, null);
});
t('brier: perfect confident predictions => 0', () => {
  assert.equal(brierScore([{ p: 1, outcome: 1 }, { p: 0, outcome: 0 }]), 0);
});
t('brier: confidently wrong => 1; empty => null', () => {
  assert.equal(brierScore([{ p: 1, outcome: 0 }]), 1); assert.equal(brierScore([]), null);
});
t('reliability: bins mean predicted vs observed', () => {
  const bins = reliabilityBins([{ p: 0.95, outcome: 1 }, { p: 0.95, outcome: 0 }], 10);
  const top = bins[9]; assert.equal(top.n, 2); assert.equal(top.meanPredicted, 0.95); assert.equal(top.observed, 0.5);
});

// --- dep-planner ---
t('planner: layers respect dependencies', () => {
  const layers = planLayers([{ id: 'c', deps: ['a', 'b'] }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual(layers, [['a', 'b'], ['c']]); // a,b independent (parallel), c after
});
t('planner: independent items share a layer (parallelisable)', () => {
  const s = schedule([{ id: 'x', domain: 'A' }, { id: 'y', domain: 'B' }, { id: 'z', domain: 'C' }]);
  assert.equal(s.layerCount, 1); assert.equal(s.maxParallelism, 3); assert.equal(s.layers[0].parallelisable, true);
  assert.deepEqual(s.layers[0].domains, { A: 1, B: 1, C: 1 });
});
t('planner: cycle is reported, never silently dropped', () => {
  assert.throws(() => planLayers([{ id: 'a', deps: ['b'] }, { id: 'b', deps: ['a'] }]), /DEPENDENCY_CYCLE/);
});
t('planner: unknown dependency fails closed', () => {
  assert.throws(() => planLayers([{ id: 'a', deps: ['ghost'] }]), /UNKNOWN_DEPENDENCY/);
});
t('planner: duplicate id fails closed', () => {
  assert.throws(() => planLayers([{ id: 'a' }, { id: 'a' }]), /DUPLICATE_WORK_ITEM_ID/);
});
t('planner: sequentialOrder is dependency-respecting', () => {
  const order = sequentialOrder([{ id: 'deploy', deps: ['build'] }, { id: 'build', deps: ['lint'] }, { id: 'lint' }]);
  assert.deepEqual(order, ['lint', 'build', 'deploy']);
});
t('planner: deterministic across runs', () => {
  const items = [{ id: 'c', deps: ['a'] }, { id: 'a' }, { id: 'b', deps: ['a'] }];
  assert.deepEqual(planLayers(items), planLayers(items));
});

console.log(`SHARED-CORE TESTS: pass=${pass} fail=${fail}`);
if (fail) { console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
