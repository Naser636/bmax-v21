// 5-prototype benchmark ORCHESTRATOR. Drives the real ReplicateAdapter through the PersistentLedger.
// Modes: default DRY-RUN (€0); --free (try-for-free path, canary-halt); --paid (CTO-authorized HARD-capped run).
// --paid enforces a €4.00 ledger ceiling (hard STOP), reserve-worst-case-before-each-call, ≤8 attempts total, and
// carries forward prior spend (€0.03 / 1 attempt from the canary). It NEVER sets confirmedBillingArrears and NEVER
// bypasses the ledger; it uses the explicit ctoBoundedPaidRunAuthorized gate. For every real output it records
// path + sha256 + measured duration + booked cost + a MECHANICAL usability check; it NEVER self-scores artistry.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { ffmpegAvailable, measureDurationSec, probeIntegrity } from './ffmpeg-local.mjs';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
const fp = (id) => getFaithfulPrompt(id)?.fullPrompt || '';

const here = dirname(fileURLToPath(import.meta.url));
const sha256File = (buf) => createHash('sha256').update(buf).digest('hex');
const EXT = { image: 'webp', video: 'mp4', voice: 'mp3' };

// FREE path (try-for-free; canary first). SC01-still already produced => not repeated here.
const FREE_PLAN = [
  { shot: 'SC01-still', model: 'black-forest-labs/flux-dev', kind: 'image', worstCaseCostEur: 0.03, input: { prompt: 'SC01 establisher still — twin-sun coastal city at dawn', aspect_ratio: '16:9' } },
];

// PAID path — CTO-authorized, €4 hard cap. worstCaseCostEur reserved BEFORE each call; FX-safe (USD×1.0):
// minimax/video-01 flat $0.50 => reserve €0.50; flux-dev $0.025 => €0.03; speech-02-hd <$0.10 (short text) => €0.10.
// Ordered by CTO priority. SC01-still already produced (canary) — SC01 compare = that still + SC01-video here.
// CANON-FAITHFUL prompts sourced from the authored F10 registers (via faithful-prompts-f10.mjs). This replaces the
// earlier GENERIC prototype prompts that produced off-canon media (e.g. SC01 as a golden city instead of F10's
// "NORTH SEA — STORM — NIGHT"). Models/costs unchanged. NOTE: the SC43 FR line is a placeholder pending the exact
// canonical dialogue from the F10 screenplay (voice bible holds character voices, not per-scene lines).
const PAID_PLAN = [
  { shot: 'SC40', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC40-SH06') } },
  { shot: 'SC22', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC22-SH06') } },
  { shot: 'SC43', model: 'minimax/speech-02-hd', kind: 'voice', worstCaseCostEur: 0.10,
    input: { text: 'Le sable devient mer. La ligne tient — pour l’instant.', voice_id: 'French_MaleNarrator', emotion: 'sad', language_boost: 'French', speed: 0.95 } },
  { shot: 'SC01-video', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC01-SH01') } },
  { shot: 'SC39', model: 'minimax/video-01', kind: 'video', worstCaseCostEur: 0.50, input: { prompt: fp('SC39-SH04') } },
  { shot: 'SC48', model: 'black-forest-labs/flux-dev', kind: 'image', worstCaseCostEur: 0.03, input: { prompt: fp('SC48-SH02'), aspect_ratio: '16:9' } },
];

const STOP_EUR = 4.00; // CTO hard stop
const ABS_CEIL_EUR = 5.00;

async function download(url, dest) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

export async function runBenchmark(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const paid = opts.paid === true;
  const freeTier = opts.freeTier === true;
  const plan = paid ? PAID_PLAN : FREE_PLAN;
  const outDir = join(here, 'runs', 'benchmark');
  mkdirSync(outDir, { recursive: true });

  // PAID ledger: €4 ceiling, carry forward prior canary spend (€0.03 / 1 attempt) if not already seeded.
  const ledgerPath = join(outDir, paid ? 'ledger-state-paid.json' : 'ledger-state.json');
  if (paid && !existsSync(ledgerPath)) {
    writeFileSync(ledgerPath, JSON.stringify({ ceiling: STOP_EUR, spent: 0.03, committed: 0, remaining: STOP_EUR - 0.03,
      attempts: 1, maxAttempts: 8, seq: 1, reservations: [], stampNote: 'carried forward: SC01-still canary €0.03 / 1 attempt' }, null, 1));
  }
  const ledger = new PersistentLedger(paid ? STOP_EUR : 250, ledgerPath, { maxAttempts: 8 });
  const adapter = new ReplicateAdapter({
    auth: { allowPaidGeneration: !!opts.allowPaidGeneration, confirmedBillingArrears: !!opts.confirmedBillingArrears,
      ctoBoundedPaidRunAuthorized: !!opts.ctoBoundedPaidRunAuthorized, allowFreeTier: !!opts.allowFreeTier },
    ledger,
  });

  const records = [];
  let stopped = null;
  for (const spec of plan) {
    if (stopped) { records.push({ shot: spec.shot, status: 'SKIPPED', reason: stopped }); continue; }
    // CTO: never launch a call whose worst-case could cross the stop threshold.
    const snap = ledger.snapshot();
    if (paid && (snap.spent + snap.committed + spec.worstCaseCostEur > STOP_EUR + 1e-9)) {
      records.push({ shot: spec.shot, status: 'SKIPPED', reason: `would exceed €${STOP_EUR} stop (spent €${snap.spent} + reserve €${spec.worstCaseCostEur})` }); continue;
    }
    if (!ledger.canAttempt()) { records.push({ shot: spec.shot, status: 'SKIPPED', reason: 'attempt cap (8) reached' }); continue; }

    const timeoutMs = spec.kind === 'image' ? 120000 : spec.kind === 'voice' ? 120000 : 360000;
    const r = await adapter.generate({ model: spec.model, input: spec.input, kind: spec.kind,
      worstCaseCostEur: spec.worstCaseCostEur, freeTier, dryRun, timeoutMs, pollMs: 3000 });

    const rec = { shot: spec.shot, model: spec.model, kind: spec.kind, status: r.status, freeTrial: r.freeTrial ?? null,
      paid: r.paid ?? false, booked_eur: r.costEur ?? 0, predictionId: r.predictionId || null, file: null, sha256: null,
      durationSec: null, bytes: null, mechanicalUsable: null, humanArtistic: 'NOT_ASSESSED (human-only)',
      ledger: ledger.snapshot(), reason: r.reason || null };
    if (r.status === 'SUCCEEDED' && r.outputUrls?.length && !dryRun) {
      try {
        const dest = join(outDir, `${spec.shot}.${EXT[spec.kind]}`);
        const buf = await download(r.outputUrls[0], dest);
        rec.file = dest; rec.sha256 = sha256File(buf); rec.bytes = buf.length;
        if (spec.kind !== 'image' && ffmpegAvailable()) { rec.durationSec = measureDurationSec(dest); rec.mechanicalUsable = !!probeIntegrity(dest).ok; }
        else rec.mechanicalUsable = buf.length > 0;
      } catch (e) { rec.downloadError = String(e.message).slice(0, 140); rec.mechanicalUsable = false; }
    }
    records.push(rec);

    if (r.unexpectedCharge === true) stopped = 'STOPPED: free-tier run was NOT free-tagged (real charge) — halting';
    const s = ledger.snapshot();
    if (s.spent >= STOP_EUR - 1e-9) stopped = `STOPPED: cumulative spend €${s.spent} reached the €${STOP_EUR} hard stop`;
    if (s.spent > ABS_CEIL_EUR) stopped = `STOPPED: absolute ceiling €${ABS_CEIL_EUR} breached`;
  }

  const report = {
    mode: dryRun ? 'DRY-RUN' : (paid ? 'REAL-PAID(€4-cap)' : 'REAL-FREE-TIER'),
    generatedBy: 'benchmark-orchestrator-f10', stopThresholdEur: STOP_EUR, absoluteCeilingEur: ABS_CEIL_EUR,
    adapterAuthorized: adapter.available().authorized, stopped, ledgerFinal: ledger.snapshot(), records,
    priorCanary: 'SC01-still.webp produced earlier (flux-dev, €0.03, is_free_trial_prediction=false)',
    filmProduced: false, artisticValidation: false, humanReview: 'NOT_PERFORMED',
    runtime60min: 'UNPROVEN (no assembled export; single prototype shots only)',
    note: dryRun ? 'DRY-RUN €0.' : 'REAL paid run under €4 hard cap; booked at FX-safe worst-case (provider returns no per-call price).',
  };
  writeFileSync(join(outDir, dryRun ? 'dry-run-report.json' : (paid ? 'real-paid-report.json' : 'real-run-report.json')), JSON.stringify(report, null, 1));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const real = process.argv.includes('--real');
  const free = process.argv.includes('--free');
  const paid = process.argv.includes('--paid');
  runBenchmark({ dryRun: !real, freeTier: free, allowFreeTier: free, paid,
    allowPaidGeneration: paid || process.argv.includes('--allow-paid'),
    ctoBoundedPaidRunAuthorized: process.argv.includes('--cto-bounded-authorized'),
    confirmedBillingArrears: process.argv.includes('--billing-arrears-confirmed'),
  }).then((r) => {
    console.log(`BENCHMARK ${r.mode} — authorized=${r.adapterAuthorized} stopped=${r.stopped || 'no'}`);
    console.log('ledger:', JSON.stringify(r.ledgerFinal));
    for (const rec of r.records) console.log(`  [${rec.status}] ${rec.shot} (${rec.model}) free=${rec.freeTrial} paid=${rec.paid} booked€${rec.booked_eur} sha=${rec.sha256 ? rec.sha256.slice(0,12)+'…' : '—'} dur=${rec.durationSec ?? '—'} usable=${rec.mechanicalUsable}${rec.reason ? ' :: ' + rec.reason : ''}`);
    console.log(`filmProduced=${r.filmProduced} humanReview=${r.humanReview} runtime60min=${r.runtime60min}`);
  }).catch((e) => { console.log('ORCHESTRATOR ERROR', e); process.exit(2); });
}
