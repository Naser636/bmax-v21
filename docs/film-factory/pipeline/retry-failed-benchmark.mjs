// Targeted RETRY of only the benchmark shots that failed on a provider-side transient (minimax Error 1033).
// Reuses the PROVEN ReplicateAdapter + the SAME persistent €4 ledger (financial guard UNCHANGED): reserve
// worst-case BEFORE each call, settle worst-case on success, RELEASE (=€0) on failure, hard STOP at €4.
// It does NOT re-run the already-succeeded shots (no credit waste — CTO: "pas pour multiplier artificiellement
// les appels"). maxAttempts is raised to honour the CTO's authorised ≤8 attempts PER SHOT (these are attempt #2
// for 2 shots); the €4 ledger ceiling remains the binding financial stop. Paid only with --real --cto-bounded.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { ffmpegAvailable, measureDurationSec, probeIntegrity } from './ffmpeg-local.mjs';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha256File = (buf) => createHash('sha256').update(buf).digest('hex');
const fp = (id) => getFaithfulPrompt(id)?.fullPrompt || '';
const STOP_EUR = 4.00, ABS_CEIL_EUR = 5.00;

// Only the shots that FAILED (provider transient) in real-paid-report.json — nothing already succeeded.
const RETRY_PLAN = [
  { shot: 'SC40', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC40-SH06') } },
  { shot: 'SC01-video', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC01-SH01') } },
];

async function download(url, dest) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer()); writeFileSync(dest, buf); return buf;
}

export async function retry(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const outDir = join(here, 'runs', 'benchmark');
  const ledgerPath = join(outDir, 'ledger-state-paid.json');
  if (!existsSync(ledgerPath)) throw new Error('paid ledger not found — run the benchmark first');
  // Raise the TOTAL attempt cap to honour ≤8/shot for these retries; €4 ceiling stays the hard financial stop.
  const st = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  st.maxAttempts = Math.max(st.maxAttempts || 8, (st.attempts || 0) + RETRY_PLAN.length);
  writeFileSync(ledgerPath, JSON.stringify(st, null, 1));

  const ledger = new PersistentLedger(STOP_EUR, ledgerPath, { maxAttempts: st.maxAttempts });
  const adapter = new ReplicateAdapter({
    auth: { allowPaidGeneration: !!opts.allowPaidGeneration, ctoBoundedPaidRunAuthorized: !!opts.ctoBoundedPaidRunAuthorized },
    ledger,
  });
  const EXT = { image: 'webp', video: 'mp4', voice: 'mp3' };
  const records = []; let stopped = null;
  for (const spec of RETRY_PLAN) {
    if (stopped) { records.push({ shot: spec.shot, status: 'SKIPPED', reason: stopped }); continue; }
    const snap = ledger.snapshot();
    if (!dryRun && (snap.spent + snap.committed + spec.worstCaseCostEur > STOP_EUR + 1e-9)) {
      records.push({ shot: spec.shot, status: 'SKIPPED', reason: `would exceed €${STOP_EUR} stop` }); continue;
    }
    if (!ledger.canAttempt()) { records.push({ shot: spec.shot, status: 'SKIPPED', reason: 'attempt cap reached' }); continue; }
    const r = await adapter.generate({ model: spec.model, input: spec.input, kind: spec.kind,
      worstCaseCostEur: spec.worstCaseCostEur, dryRun, timeoutMs: 360000, pollMs: 3000 });
    const rec = { shot: spec.shot, model: spec.model, status: r.status, paid: r.paid ?? false,
      booked_eur: r.costEur ?? 0, predictionId: r.predictionId || null, file: null, sha256: null,
      durationSec: null, mechanicalUsable: null, reason: r.reason || null, ledger: ledger.snapshot() };
    if (r.status === 'SUCCEEDED' && r.outputUrls?.length && !dryRun) {
      try {
        const dest = join(outDir, `${spec.shot}.${EXT[spec.kind]}`);
        const buf = await download(r.outputUrls[0], dest);
        rec.file = dest; rec.sha256 = sha256File(buf);
        if (ffmpegAvailable()) { rec.durationSec = measureDurationSec(dest); rec.mechanicalUsable = !!probeIntegrity(dest).ok; }
        else rec.mechanicalUsable = buf.length > 0;
      } catch (e) { rec.downloadError = String(e.message).slice(0, 140); rec.mechanicalUsable = false; }
    }
    records.push(rec);
    const s = ledger.snapshot();
    if (s.spent >= STOP_EUR - 1e-9) stopped = `STOPPED: €${s.spent} reached €${STOP_EUR} hard stop`;
    if (s.spent > ABS_CEIL_EUR) stopped = `STOPPED: absolute ceiling €${ABS_CEIL_EUR}`;
  }
  const report = { mode: dryRun ? 'DRY-RUN' : 'REAL-PAID-RETRY(€4-cap)', generatedBy: 'retry-failed-benchmark',
    stopThresholdEur: STOP_EUR, authorized: adapter.available().authorized, stopped, ledgerFinal: ledger.snapshot(), records };
  writeFileSync(join(outDir, dryRun ? 'retry-dry-report.json' : 'retry-real-report.json'), JSON.stringify(report, null, 1));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const real = process.argv.includes('--real');
  retry({ dryRun: !real, allowPaidGeneration: real, ctoBoundedPaidRunAuthorized: process.argv.includes('--cto-bounded-authorized') })
    .then((r) => { console.log(`RETRY ${r.mode} — authorized=${r.authorized} stopped=${r.stopped || 'no'}`);
      console.log('ledger:', JSON.stringify(r.ledgerFinal));
      for (const x of r.records) console.log(`  [${x.status}] ${x.shot} booked€${x.booked_eur} pred=${x.predictionId||'-'} sha=${x.sha256?x.sha256.slice(0,12)+'…':'—'} dur=${x.durationSec??'—'} usable=${x.mechanicalUsable}${x.reason?' :: '+x.reason:''}`);
    }).catch((e) => { console.log('RETRY ERROR', e); process.exit(2); });
}
