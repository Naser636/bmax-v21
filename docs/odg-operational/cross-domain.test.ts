// @ts-nocheck
// CROSS-DOMAIN CONTRACT TEST — composes A + B + C in one flow and asserts the contracts between them hold.
// A: dep-planner schedules the C pipeline steps + retry wraps a flaky step. B: eval-metrics grades C's verifier,
// otel-export traces the run. C: reconcileRows + verify produce the result. This is the integration proof that a
// change in one domain's shared contract would break here. Pure, deterministic, €0, Node>=18.
import assert from 'node:assert';
import { planLayers, schedule } from './shared-core/dep-planner.js';
import { withRetry } from './shared-core/retry.js';
import { confusionMatrix } from './shared-core/eval-metrics.js';
import { toOTLP, spansFromSteps } from './shared-core/otel-export.js';
import { reconcileRows } from './proof-reconciliation/reconcile.js';

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; failures.push(`${name}: ${e.message}`); } };
const asyncT = [];
const at = (name, fn) => asyncT.push(fn().then(() => pass++).catch(e => { fail++; failures.push(`${name}: ${e.message}`); }));

// A: the C pipeline as dependency-ordered work items.
const PIPELINE_ITEMS = [
  { id: 'ingest', domain: 'C' },
  { id: 'reconcile', domain: 'C', deps: ['ingest'] },
  { id: 'verify', domain: 'B', deps: ['reconcile'] },
  { id: 'trace', domain: 'A', deps: ['verify'] },
];

t('A↔C: planner sequences the C pipeline (ingest→reconcile→verify→trace)', () => {
  const layers = planLayers(PIPELINE_ITEMS);
  assert.deepEqual(layers, [['ingest'], ['reconcile'], ['verify'], ['trace']]);
  assert.equal(schedule(PIPELINE_ITEMS).layerCount, 4);
});

at('A: retry wraps a flaky ingest and eventually succeeds (deterministic)', async () => {
  let n = 0;
  const r = await withRetry(() => { if (++n < 2) throw new Error('flaky-read'); return 'ingested'; }, { maxAttempts: 3, sleep: () => Promise.resolve() });
  assert.equal(r.outcome, 'SUCCESS'); assert.equal(r.attempts, 2);
});

// C: reconcile a small in-memory ledger/bank with one planted amount mismatch.
const L = [{ ref: 'A', date: '2026-01-01', amount: 100, _src: { file: 'L', line: 2 } }, { ref: 'B', date: '2026-01-02', amount: 50, _src: { file: 'L', line: 3 } }];
const Bk = [{ ref: 'A', date: '2026-01-01', amount: 100, _src: { file: 'B', line: 2 } }, { ref: 'B', date: '2026-01-02', amount: 40, _src: { file: 'B', line: 3 } }];
const report = reconcileRows(L, Bk);

t('C: reconcile finds the planted AMOUNT_MISMATCH and matches the clean row', () => {
  assert.equal(report.matchedCount, 1);
  assert.ok(report.findings.find(f => f.type === 'AMOUNT_MISMATCH' && f.ref === 'B'));
});

t('C↔B: eval-metrics grades C findings vs ground-truth (contract: key=type:ref)', () => {
  const key = f => `${f.type}:${f.ref}`;
  const expected = [{ type: 'AMOUNT_MISMATCH', ref: 'B' }];
  const cm = confusionMatrix(report.findings, expected, key);
  assert.equal(cm.TP, 1); assert.equal(cm.FP, 0); assert.equal(cm.FN, 0);
  assert.equal(cm.precision, 1); assert.equal(cm.recall, 1);
});

t('B↔A: orchestration steps export to valid OTLP with service.name + correct status codes', () => {
  const steps = [{ id: 'ingest', status: 'DONE' }, { id: 'reconcile', status: 'DONE' }, { id: 'verify', status: 'DONE' }];
  const spans = spansFromSteps(steps, { traceId: 'recon-trace-1' });
  const otlp = toOTLP(spans, { serviceName: 'odg-reconciliation' });
  assert.ok(otlp.resourceSpans[0].resource.attributes.find(a => a.key === 'service.name'));
  assert.equal(otlp.resourceSpans[0].scopeSpans[0].spans.length, 3);
  assert.ok(otlp.resourceSpans[0].scopeSpans[0].spans.every(s => s.status.code === 1));
});

t('contract: a broken C finding shape is caught by B metrics (FN surfaces)', () => {
  const key = f => `${f.type}:${f.ref}`;
  // simulate C dropping the mismatch (regression): B must report a false negative, not a silent pass.
  const cm = confusionMatrix([], [{ type: 'AMOUNT_MISMATCH', ref: 'B' }], key);
  assert.equal(cm.FN, 1); assert.equal(cm.recall, 0);
});

await Promise.all(asyncT);
console.log(`CROSS-DOMAIN CONTRACT TESTS: pass=${pass} fail=${fail}`);
if (fail) { console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
