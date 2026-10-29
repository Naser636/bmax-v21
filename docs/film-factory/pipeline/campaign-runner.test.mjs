// W-CAMPAIGN-RUNNER simulation tests (LOCAL, €0, NO network). A MockAdapter exercises the real PersistentLedger
// (reserve/settle/release) through the runner to validate: happy path, HTTP 402 halt, timeout, invalid output,
// idempotent/resume (media present), reserved cost, budget overflow, CIQE reject, and resume-after-restart.
import { runCampaign } from './campaign-runner.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };
let _n = 0;
function fresh(cap = 134, maxAttempts = 2000) {
  const dir = join(tmpdir(), `odg-camp-${process.pid}-${_n++}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ledger = new PersistentLedger(cap, join(dir, 'ledger.json'), { maxAttempts });
  return { dir, ledger, statePath: join(dir, 'state.json') };
}
const SHOTS = [
  { id: 'SC01-SH01', scene: 'SC01', mediaCategory: 'PREMIUM_VIDEO', sceneHead: '1. X' },
  { id: 'SC01-SH02', scene: 'SC01', mediaCategory: 'STILL_ANIMATABLE', sceneHead: '1. X' },
  { id: 'SC02-SH01', scene: 'SC02', mediaCategory: 'PREMIUM_VIDEO', sceneHead: '2. Y' },
  { id: 'SC02-SH02', scene: 'SC02', mediaCategory: 'STILL_ANIMATABLE', sceneHead: '2. Y' },
];
class MockAdapter {
  constructor(ledger, script = {}) { this.ledger = ledger; this.script = script; }
  async generate({ kind, worstCaseCostEur, idempotencyKey, dryRun }) {
    if (dryRun) return { status: 'DRY_RUN', ok: true, paid: false, costEur: 0 };
    const spec = this.script[idempotencyKey] || this.script['*'] || { outcome: 'success' };
    let resId; try { resId = this.ledger.reserve(worstCaseCostEur, `${kind}`); } catch (e) { return { status: 'BLOCKED', ok: false, costEur: 0, reason: 'LEDGER_REFUSED: ' + e.message }; }
    if (spec.outcome === '402') { this.ledger.release(resId); return { status: 'ERROR', ok: false, costEur: 0, reason: 'PAYMENT_REQUIRED: insufficient credit' }; }
    if (spec.outcome === 'timeout') { this.ledger.release(resId); return { status: 'ERROR', ok: false, costEur: 0, reason: 'TIMEOUT: deadline' }; }
    if (spec.outcome === 'invalid') { this.ledger.release(resId); return { status: 'INVALID_OUTPUT', ok: false, costEur: 0, reason: 'succeeded but output missing' }; }
    if (spec.outcome === 'indeterminate') { /* KEEP reservation (billing unknown) */ return { status: 'INDETERMINATE_BILLING', ok: false, costEur: 0, indeterminateBilling: true, predictionCreated: true, reason: 'TIMEOUT: billing unknown' }; }
    this.ledger.settle(resId, worstCaseCostEur);
    return { status: 'SUCCEEDED', ok: true, paid: true, costEur: worstCaseCostEur, outputUrls: [`https://x/${idempotencyKey}`] };
  }
}
const dl = (dir) => async (url, dest) => { writeFileSync(dest, 'media'); return { sha256: 'deadbeef' }; };
const ciqeOK = () => ({ worstSeverity: 'OK' });

async function run() {
  // 1) happy path: all accepted, ledger spent correct, state persisted
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger);
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('happy: all 4 accepted', r.accepted === 4 && r.failed === 0 && !r.halted);
    ok('happy: ledger spent = 0.5+0.03+0.5+0.03', Math.abs(ledger.snapshot().spent - 1.06) < 1e-9);
  }
  // 2) 402 -> HALT_CREDIT, remaining skipped
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger, { 'SC01-SH02': { outcome: '402' } });
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('402: halted on credit', r.halted && /HALT_CREDIT/.test(r.halted));
    ok('402: no spend for the 402 shot', ledger.snapshot().spent === 0.5); // only SC01-SH01 settled
    ok('402: later shots skipped', r.records.some(x => x.status === 'SKIPPED'));
  }
  // 3) timeout -> FAILED, continues
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger, { 'SC01-SH01': { outcome: 'timeout' } });
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('timeout: recorded FAILED', r.records.some(x => x.id === 'SC01-SH01' && x.status === 'FAILED'));
    ok('timeout: no spend on failed call', ledger.snapshot().spent < 1.06); // SH01 released
  }
  // 4) invalid output -> FAILED
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger, { 'SC02-SH01': { outcome: 'invalid' } });
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('invalid: recorded FAILED', r.records.some(x => x.id === 'SC02-SH01' && x.status === 'FAILED'));
  }
  // 5) idempotent/resume: second run skips all (state ACCEPTED)
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger);
    await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    const ledger2 = new PersistentLedger(134, join(dir, 'ledger.json'), { maxAttempts: 2000 });
    const a2 = new MockAdapter(ledger2);
    const r2 = await runCampaign({ adapter: a2, ledger: ledger2, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('resume: second run skips all', r2.skipped === 4 && r2.accepted === 0 && r2.processed === 0);
    ok('resume: no extra spend', Math.abs(ledger2.snapshot().spent - 1.06) < 1e-9); // reloaded cumulative; unchanged (nothing re-charged)
  }
  // 6) budget overflow: tiny cap -> HALT_BUDGET on first video
  {
    const { dir, ledger, statePath } = fresh(0.10);
    const a = new MockAdapter(ledger);
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('budget: halted on cap', r.halted && /HALT_BUDGET/.test(r.halted));
    ok('budget: never exceeded cap', ledger.snapshot().spent <= 0.10 + 1e-9);
  }
  // 7) reserved cost: accepted spend equals sum of worst-case
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger);
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS.slice(0, 2), outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('reserved cost booked exactly', Math.abs(ledger.snapshot().spent - 0.53) < 1e-9 && ledger.snapshot().committed === 0);
  }
  // 8) CIQE reject: MAJOR -> REJECTED, not accepted, no re-spend beyond the call
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger);
    const ciqeBad = (f) => ({ worstSeverity: f.includes('SC01-SH01') ? 'MAJOR' : 'OK' });
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeBad });
    ok('ciqe: MAJOR -> REJECTED', r.records.some(x => x.id === 'SC01-SH01' && x.status === 'REJECTED_CIQE') && r.rejected >= 1);
  }
  // 9) resume after restart: partial run then continue
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger);
    const r1 = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK, maxShots: 2 });
    ok('restart: first pass processed 2', r1.processed === 2);
    const ledger2 = new PersistentLedger(134, join(dir, 'ledger.json'), { maxAttempts: 2000 });
    const r2 = await runCampaign({ adapter: new MockAdapter(ledger2), ledger: ledger2, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('restart: second pass finishes the rest, no dupes', r2.accepted === 2 && r2.skipped === 2);
  }

  // 10) indeterminate billing (timeout, unknown charge) -> HALT, reservation KEPT, no continue, no auto-retry
  {
    const { dir, ledger, statePath } = fresh();
    const a = new MockAdapter(ledger, { 'SC01-SH02': { outcome: 'indeterminate' } });
    const r = await runCampaign({ adapter: a, ledger, shots: SHOTS, outDir: dir, dryRun: false, statePath, download: dl(dir), ciqe: ciqeOK });
    ok('indeterminate -> HALT_INDETERMINATE_BILLING', r.halted && /HALT_INDETERMINATE_BILLING/.test(r.halted));
    ok('indeterminate: reservation KEPT (committed > 0, cap preserved)', ledger.snapshot().committed > 0);
    ok('indeterminate: later shots skipped (no continue)', r.records.some(x => x.status === 'SKIPPED'));
  }

  console.log(`\nCAMPAIGN-RUNNER TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
