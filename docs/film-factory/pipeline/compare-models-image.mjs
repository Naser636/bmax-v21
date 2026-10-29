// MODEL-SELECTION image benchmark: flux-schnell vs flux-dev on 2 identical briefs. Reuses the PROVEN
// ReplicateAdapter via a FRESH dedicated ledger (ceiling €0.50, maxAttempts 8) — the 9/9 benchmark ledger is
// NOT touched. Pre-call worst-case reservation, €0-on-failure, fail-closed. Records technical success / usability
// / latency / cost / reproducibility (seed). Artistic quality is NOT auto-scored — paired outputs are kept for
// human judgment. Paid only with --real --cto-bounded-authorized. See MODEL_SELECTION_BENCHMARK_PROTOCOL.md.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const STOP_EUR = 0.50, SEED = 7;

const MODELS = [
  { id: 'flux-schnell', model: 'black-forest-labs/flux-schnell', usd: 0.003, eur: 0.003, license: 'Apache-2.0 (commercial OK)' },
  { id: 'flux-dev',     model: 'black-forest-labs/flux-dev',     usd: 0.025, eur: 0.025, license: 'FLUX.1-dev NON-COMMERCIAL' },
];
const BRIEFS = [
  { id: 'A', prompt: 'establisher still — North Sea storm coast at night, cold tonal palette, cinematic wide shot, volumetric spray' },
  { id: 'B', prompt: 'character still — weathered fisherman at a lantern-lit dock in the rain, shallow depth of field, moody' },
];

function imgOk(buf) {
  if (!buf || buf.length < 64) return false;
  const h = buf.subarray(0, 12);
  const isWebp = h.subarray(0,4).toString('ascii') === 'RIFF' && h.subarray(8,12).toString('ascii') === 'WEBP';
  const isPng = h[0]===0x89 && h[1]===0x50; const isJpg = h[0]===0xff && h[1]===0xd8;
  return isWebp || isPng || isJpg;
}
async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function run(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const outDir = join(here, 'runs', 'model-compare');
  mkdirSync(outDir, { recursive: true });
  const ledgerPath = join(outDir, 'ledger-model-compare.json');
  if (!existsSync(ledgerPath)) writeFileSync(ledgerPath, JSON.stringify({ ceiling: STOP_EUR, spent: 0, committed: 0, remaining: STOP_EUR, attempts: 0, maxAttempts: 8, seq: 0, reservations: [] }, null, 1));
  const ledger = new PersistentLedger(STOP_EUR, ledgerPath, { maxAttempts: 8 });
  const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: !!opts.allowPaidGeneration, ctoBoundedPaidRunAuthorized: !!opts.ctoBoundedPaidRunAuthorized }, ledger });

  const records = []; let stopped = null;
  for (const brief of BRIEFS) {
    for (const m of MODELS) {
      const tag = `${brief.id}:${m.id}`;
      if (stopped) { records.push({ tag, status: 'SKIPPED', reason: stopped }); continue; }
      const snap = ledger.snapshot();
      if (!dryRun && (snap.spent + snap.committed + m.eur > STOP_EUR + 1e-9)) { records.push({ tag, status: 'SKIPPED', reason: `would exceed €${STOP_EUR}` }); continue; }
      if (!ledger.canAttempt()) { records.push({ tag, status: 'SKIPPED', reason: 'attempt cap' }); continue; }
      const t0 = Date.now();
      const r = await adapter.generate({ model: m.model, kind: 'image', worstCaseCostEur: m.eur, dryRun, timeoutMs: 120000, pollMs: 2000,
        input: { prompt: brief.prompt, aspect_ratio: '16:9', seed: SEED, output_format: 'webp', num_outputs: 1 } });
      const latencyS = +((Date.now() - t0) / 1000).toFixed(2);
      const rec = { tag, brief: brief.id, model: m.id, license: m.license, status: r.status, booked_eur: r.costEur ?? 0,
        predictionId: r.predictionId || null, latencyS, seed: SEED, sha256: null, bytes: null, usable: null, reason: r.reason || null };
      if (r.status === 'SUCCEEDED' && r.outputUrls?.length && !dryRun) {
        try { const buf = await download(r.outputUrls[0]); const dest = join(outDir, `${brief.id}_${m.id}.webp`);
          writeFileSync(dest, buf); rec.sha256 = sha256(buf); rec.bytes = buf.length; rec.usable = imgOk(buf); rec.file = dest;
        } catch (e) { rec.downloadError = String(e.message).slice(0,120); rec.usable = false; }
      }
      records.push(rec);
      const s = ledger.snapshot(); if (s.spent >= STOP_EUR - 1e-9) stopped = `STOPPED: €${s.spent} reached €${STOP_EUR}`;
    }
  }
  // auto-criteria comparison (NO artistic score). Per-model aggregates over APPLICABLE (succeeded) gens.
  const byModel = {};
  for (const m of MODELS) {
    const rs = records.filter(x => x.model === m.id);
    const ok = rs.filter(x => x.status === 'SUCCEEDED');
    byModel[m.id] = { license: m.license, unitEur: m.eur, attempts: rs.length, succeeded: ok.length,
      usable: ok.filter(x => x.usable).length, avgLatencyS: ok.length ? +(ok.reduce((a,x)=>a+x.latencyS,0)/ok.length).toFixed(2) : null,
      spentEur: +rs.reduce((a,x)=>a+(x.booked_eur||0),0).toFixed(3) };
  }
  const report = { mode: dryRun ? 'DRY-RUN' : 'REAL-PAID-COMPARE(€0.50-cap)', protocol: 'MODEL_SELECTION_BENCHMARK_PROTOCOL.md',
    authorized: adapter.available().authorized, stopped, ledgerFinal: ledger.snapshot(), byModel, records,
    artisticQuality: 'NOT_AUTO_SCORED — paired outputs A_*/B_* kept for human/independent judgment',
    seedNote: 'fixed seed 7; re-run determinism not separately measured (budget).' };
  writeFileSync(join(outDir, dryRun ? 'compare-dry-report.json' : 'compare-real-report.json'), JSON.stringify(report, null, 1));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const real = process.argv.includes('--real');
  run({ dryRun: !real, allowPaidGeneration: real, ctoBoundedPaidRunAuthorized: process.argv.includes('--cto-bounded-authorized') })
    .then(r => { console.log(`MODEL-COMPARE ${r.mode} — authorized=${r.authorized} stopped=${r.stopped||'no'}`);
      console.log('ledger:', JSON.stringify(r.ledgerFinal));
      for (const x of r.records) console.log(`  [${x.status}] ${x.tag} (${x.license}) €${x.booked_eur} ${x.latencyS}s usable=${x.usable} sha=${x.sha256?x.sha256.slice(0,10)+'…':'—'}${x.reason?' :: '+x.reason:''}`);
      console.log('byModel:', JSON.stringify(r.byModel));
    }).catch(e => { console.log('COMPARE ERROR', e); process.exit(2); });
}
