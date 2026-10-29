// F11 production-driver test — DRY-RUN only, €0, no network. Proves: the whole F11 film sequences
// chronologically SC01->SC49, classifies video/still per the authoritative shotlist, spends nothing, and
// honours reuse (a present asset is skipped). Confirms auto-resume readiness without any paid call.
import { runF11, loadF11Shots } from './f11-production-driver.mjs';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

function fresh(tag) { const d = join(tmpdir(), `odg-f11-${process.pid}-${tag}`); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); return d; }

async function run() {
  // 1) full dry-run: all 420 shots, €0, correct classification
  {
    const dir = fresh('full');
    const ledger = new PersistentLedger(300, join(dir, 'l.json'), { maxAttempts: 2000 });
    const adapter = new ReplicateAdapter({ auth: {}, ledger });
    const { report, counts } = await runF11({ adapter, ledger, outDir: dir, dryRun: true, statePath: join(dir, 's.json') });
    ok('dry: processed all 420 shots', report.processed === 420);
    ok('dry: classification 188 video / 232 still', counts.PREMIUM_VIDEO === 188 && counts.STILL_ANIMATABLE === 232);
    ok('dry: spent €0 (no paid call)', ledger.snapshot().spent === 0);
    ok('dry: not halted', !report.halted);
    // chronological: DRY_RUN records' scene numbers are non-decreasing SC01..SC49
    const scenes = report.records.filter(r => r.status === 'DRY_RUN').map(r => parseInt(r.id.slice(2, 4)));
    let mono = true; for (let i = 1; i < scenes.length; i++) if (scenes[i] < scenes[i - 1]) mono = false;
    ok('dry: chronological SC01->SC49 (non-decreasing)', mono && scenes[0] === 1 && scenes[scenes.length - 1] === 49);
  }

  // 2) reuse/idempotent: a present asset is SKIPPED (no re-generation)
  {
    const dir = fresh('reuse');
    const ledger = new PersistentLedger(300, join(dir, 'l.json'), { maxAttempts: 2000 });
    const adapter = new ReplicateAdapter({ auth: {}, ledger });
    // pre-place a media file for the first still shot id (normalized) -> must be skipped
    const shots = loadF11Shots();
    const aStill = shots.find(s => s.mediaCategory === 'STILL_ANIMATABLE');
    writeFileSync(join(dir, `${aStill.id}.webp`), 'present');
    const { report } = await runF11({ adapter, ledger, outDir: dir, dryRun: true, statePath: join(dir, 's.json') });
    ok('reuse: present asset is SKIPPED (not regenerated)', report.records.some(r => r.id === aStill.id && r.status === 'SKIPPED'));
    ok('reuse: total terminal shots still 420 (419 dry + 1 skip)', report.processed + report.skipped >= 420);
  }

  // 3) prompt provider uses F11 promptSeed (not empty)
  {
    const shots = loadF11Shots();
    ok('shots carry promptSeed from the authoritative F11 shotlist', shots.every(s => typeof s.promptSeed === 'string') && shots[0].promptSeed.length > 0);
    ok('ids normalized to {scene}-SHxx (engine convention)', shots[0].id === 'SC01-SH01' && shots[0].origId === 'F11-SC01-SH01');
  }

  // 4) readyGate (fail-closed): non-READY shots are filtered BEFORE the adapter; a spy adapter is never called for them
  {
    const dir = fresh('readygate');
    const ledger = new PersistentLedger(300, join(dir, 'l.json'), { maxAttempts: 2000 });
    let seen = new Set();
    const spy = { generate: async (o) => { seen.add(o.idempotencyKey); return { status: 'DRY_RUN', ok: true, paid: false, costEur: 0 }; } };
    const { report, blockedByReadiness } = await runF11({ adapter: spy, ledger, outDir: dir, dryRun: true, statePath: join(dir, 's.json'), readyGate: true });
    ok('readyGate: blocks the multi/VFX majority (hundreds)', blockedByReadiness.length >= 300);
    ok('readyGate: only READY shots processed (~54)', report.processed > 0 && report.processed <= 80);
    ok('readyGate: a known VFX shot (SC03-SH01) never reached the adapter', ![...seen].includes('SC03-SH01') && blockedByReadiness.some(b => b.id === 'SC03-SH01'));
    ok('readyGate: a known multi shot (SC13-SH01) was blocked', blockedByReadiness.some(b => b.id === 'SC13-SH01'));
  }

  console.log(`\nF11-PRODUCTION-DRIVER TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
