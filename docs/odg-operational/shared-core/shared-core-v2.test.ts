// @ts-nocheck
// SHARED-CORE v2 tests — retry/backoff (A), regression comparator (B), lesson->test (B), OTLP export (A/B).
// Positive + adversarial. Deterministic (injected sleep, no wall-clock). €0. Node >=18.
import assert from 'node:assert';
import { withRetry, backoffSchedule } from './retry.js';
import { compareRuns } from './regression-compare.js';
import { generateTestCase, runGeneratedTests } from './lesson-to-test.js';
import { toOTLP, span, genAiAttributes, attr, spansFromSteps } from './otel-export.js';

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; failures.push(`${name}: ${e.message}`); } };
const ta = (name, fn) => fn().then(() => pass++).catch(e => { fail++; failures.push(`${name}: ${e.message}`); });
const noSleep = () => Promise.resolve();

const asyncTests = [];

// --- retry/backoff ---
t('backoff: schedule is exponential, capped', () => {
  assert.deepEqual(backoffSchedule({ maxAttempts: 5, baseDelayMs: 100, factor: 2, maxDelayMs: 500 }), [100, 200, 400, 500]);
});
asyncTests.push(ta('retry: succeeds first try => 1 attempt, no delays', async () => {
  const r = await withRetry(() => 'ok', { sleep: noSleep });
  assert.equal(r.outcome, 'SUCCESS'); assert.equal(r.attempts, 1); assert.deepEqual(r.delaysMs, []);
}));
asyncTests.push(ta('retry: transient failure then success', async () => {
  let n = 0; const r = await withRetry(() => { if (++n < 3) throw new Error('flaky'); return 42; }, { maxAttempts: 5, sleep: noSleep });
  assert.equal(r.outcome, 'SUCCESS'); assert.equal(r.value, 42); assert.equal(r.attempts, 3);
}));
asyncTests.push(ta('retry: exhausts after maxAttempts', async () => {
  const r = await withRetry(() => { throw new Error('always'); }, { maxAttempts: 3, sleep: noSleep });
  assert.equal(r.outcome, 'EXHAUSTED'); assert.equal(r.attempts, 3); assert.equal(r.delaysMs.length, 2);
}));
asyncTests.push(ta('retry: non-retryable aborts immediately', async () => {
  const r = await withRetry(() => { throw new Error('fatal'); }, { maxAttempts: 5, isRetryable: () => false, sleep: noSleep });
  assert.equal(r.outcome, 'NON_RETRYABLE'); assert.equal(r.attempts, 1);
}));
asyncTests.push(ta('retry: circuit opens on repeated identical error (loop prevention)', async () => {
  const r = await withRetry(() => { throw new Error('samesame'); }, { maxAttempts: 10, circuitThreshold: 2, sleep: noSleep });
  assert.equal(r.outcome, 'CIRCUIT_OPEN'); assert.ok(r.attempts <= 2);
}));
asyncTests.push(ta('retry: idempotency key => DUPLICATE, not re-run', async () => {
  const seen = new Map(); let runs = 0;
  await withRetry(() => { runs++; return 'v1'; }, { idempotencyKey: 'k', seen, sleep: noSleep });
  const r2 = await withRetry(() => { runs++; return 'v2'; }, { idempotencyKey: 'k', seen, sleep: noSleep });
  assert.equal(r2.outcome, 'DUPLICATE'); assert.equal(r2.value, 'v1'); assert.equal(runs, 1);
}));

// --- regression comparator ---
t('regress: PASS->FAIL is a regression', () => {
  const r = compareRuns([{ id: 'a', status: 'PASS' }], [{ id: 'a', status: 'FAIL' }]);
  assert.equal(r.hasRegression, true); assert.equal(r.verdict, 'REGRESSED'); assert.equal(r.regressions[0].id, 'a');
});
t('regress: FAIL->PASS is a fix (no regression)', () => {
  const r = compareRuns([{ id: 'a', status: 'FAIL' }], [{ id: 'a', status: 'PASS' }]);
  assert.equal(r.hasRegression, false); assert.equal(r.verdict, 'IMPROVED');
});
t('regress: value worsening beyond tolerance (higher-better)', () => {
  const r = compareRuns([{ id: 'acc', status: 'PASS', value: 0.95 }], [{ id: 'acc', status: 'PASS', value: 0.80 }], { metrics: [{ id: 'acc', direction: 'higher-better', tolerance: 0.05 }] });
  assert.equal(r.hasRegression, true); assert.equal(r.valueRegressions[0].id, 'acc');
});
t('regress: added/removed tracked, stable verdict', () => {
  const r = compareRuns([{ id: 'a', status: 'PASS' }, { id: 'old', status: 'PASS' }], [{ id: 'a', status: 'PASS' }, { id: 'new', status: 'PASS' }]);
  assert.deepEqual(r.added, ['new']); assert.deepEqual(r.removed, ['old']); assert.equal(r.verdict, 'STABLE');
});

// --- lesson -> test (INDEPENDENCE: must be able to genuinely FAIL) ---
t('lesson->test: FAILS on buggy subject, PASSES on fixed subject', () => {
  const lesson = { id: 'neg-amount', description: 'abs() must handle negatives', input: -5, expected: 5 };
  const tc = generateTestCase(lesson);
  const buggy = (x) => x;           // bug: returns input unchanged
  const fixed = (x) => Math.abs(x); // fix
  assert.equal(tc.run(buggy).status, 'FAIL');  // the generated test genuinely catches the bug
  assert.equal(tc.run(fixed).status, 'PASS');  // and passes once fixed
});
t('lesson->test: oracle is the recorded expected, not recomputed by subject', () => {
  const tc = generateTestCase({ id: 'x', input: 2, expected: 4 });
  const res = tc.run((n) => n * 2);
  assert.equal(res.independentOracle, true); assert.equal(res.status, 'PASS');
});
t('lesson->test: subject that throws => FAIL (not swallowed)', () => {
  const res = generateTestCase({ id: 'boom', input: 1, expected: 1 }).run(() => { throw new Error('kaboom'); });
  assert.equal(res.status, 'FAIL'); assert.match(res.actual, /THREW: kaboom/);
});
t('lesson->test: invalid lesson (no expected) throws', () => {
  assert.throws(() => generateTestCase({ id: 'x', input: 1 }), /no recorded "expected"/);
});
t('lesson->test: battery runner aggregates', () => {
  const lessons = [{ id: 'a', input: 1, expected: 2 }, { id: 'b', input: 3, expected: 6 }];
  const r = runGeneratedTests(lessons, () => (n) => n * 2);
  assert.equal(r.allPass, true); assert.equal(r.total, 2);
});

// --- OTLP export ---
t('otel: attr encodes types', () => {
  assert.deepEqual(attr('n', 3).value, { intValue: 3 });
  assert.deepEqual(attr('f', 1.5).value, { doubleValue: 1.5 });
  assert.deepEqual(attr('b', true).value, { boolValue: true });
  assert.deepEqual(attr('s', 'x').value, { stringValue: 'x' });
});
t('otel: span requires ids+name', () => { assert.throws(() => span({ name: 'x' }), /INVALID_SPAN/); });
t('otel: toOTLP has resourceSpans->scopeSpans->spans with service.name', () => {
  const s = span({ traceId: 't1', spanId: 's1', name: 'op', startNano: 0, endNano: 10, status: 'OK' });
  const payload = toOTLP([s], { serviceName: 'odg-test' });
  assert.ok(payload.resourceSpans[0].resource.attributes.find(a => a.key === 'service.name' && a.value.stringValue === 'odg-test'));
  assert.equal(payload.resourceSpans[0].scopeSpans[0].spans[0].status.code, 1);
});
t('otel: genAiAttributes drop undefined, keep gen_ai.* keys', () => {
  const a = genAiAttributes({ system: 'anthropic', requestModel: 'claude', inputTokens: 100 });
  const keys = a.map(x => x.key);
  assert.ok(keys.includes('gen_ai.system') && keys.includes('gen_ai.request.model') && keys.includes('gen_ai.usage.input_tokens'));
  assert.ok(!keys.includes('gen_ai.response.model'));
});
t('otel: spansFromSteps maps FAILED->ERROR, DONE->OK', () => {
  const spans = spansFromSteps([{ id: 'a', status: 'DONE' }, { id: 'b', status: 'FAILED', reason: 'x' }], { traceId: 'tr' });
  assert.equal(spans[0].status.code, 1); assert.equal(spans[1].status.code, 2);
});

await Promise.all(asyncTests);
console.log(`SHARED-CORE v2 TESTS: pass=${pass} fail=${fail}`);
if (fail) { console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
