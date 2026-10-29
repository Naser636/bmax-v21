// CONTROLLED 7-shot pilot runner (CTO-authorized, HARD CAP €6.08). Runs ONLY the pilot shots, cheapest-first
// (the €0.03 flux-dev shot doubles as the non-charging credit probe: a 402 => no credit => HALT €0). SC43 FR voice
// is EXCLUDED (FR translation not validated). Resumable + idempotent (skips media-present/ACCEPTED). Reserve-before-
// call via a persistent €6.08 ledger; halts on 402 / cap / INDETERMINATE_BILLING / unexpected charge; NO auto-retry.
// Adapter per-call timeout is set BELOW the harness window so a slow video self-cancels to INDETERMINATE in-process
// (never a harness kill mid-charge). Records model/params/reserved/booked/predictionId/sha256/duration — no secrets.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
import { analyze } from './ciqe.mjs';
import { ffmpegAvailable, measureDurationSec, probeIntegrity } from './ffmpeg-local.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const CAP = 6.08;
const OUT = join(here, 'runs', 'pilot');
mkdirSync(OUT, { recursive: true });
const EXT = { PREMIUM_VIDEO: 'mp4', STILL_ANIMATABLE: 'webp' };
// cheapest-first; SC43 (AUDIO_LINE / FR voice) intentionally excluded (translation not validated)
const PILOT = [
  { id: 'SC48-SH02', model: 'black-forest-labs/flux-dev', kind: 'STILL_ANIMATABLE', worst: 0.03, timeoutMs: 120000, input: { aspect_ratio: '16:9' } },
  { id: 'SC15-SH01', model: 'minimax/video-01', kind: 'PREMIUM_VIDEO', worst: 0.46, timeoutMs: 240000, input: {} },
  { id: 'SC22-SH06', model: 'minimax/video-01', kind: 'PREMIUM_VIDEO', worst: 0.46, timeoutMs: 240000, input: {} },
  { id: 'SC39-SH04', model: 'minimax/video-01', kind: 'PREMIUM_VIDEO', worst: 0.46, timeoutMs: 240000, input: {} },
  { id: 'SC01-SH01', model: 'minimax/video-01', kind: 'PREMIUM_VIDEO', worst: 0.46, timeoutMs: 240000, input: {} },
  { id: 'SC40-SH06', model: 'minimax/video-01', kind: 'PREMIUM_VIDEO', worst: 0.46, timeoutMs: 240000, input: {} },
];
const statePath = join(OUT, 'pilot-state.json');
const loadState = () => existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { shots: {} };
const saveState = (st) => { const t = statePath + '.tmp'; writeFileSync(t, JSON.stringify(st, null, 1)); renameSync(t, statePath); };

export async function runPilot({ maxShots = Infinity } = {}) {
  const ledger = new PersistentLedger(CAP, join(OUT, 'pilot-ledger.json'), { maxAttempts: 8 });
  const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
  if (!adapter.available().authorized) throw new Error('pilot: adapter not authorized — abort before any call');
  const state = loadState();
  const report = { cap: CAP, mode: 'REAL-PILOT', halted: null, records: [], ledgerStart: ledger.snapshot() };
  let done = 0;
  for (const s of PILOT) {
    if (done >= maxShots) break;
    if (report.halted) { report.records.push({ id: s.id, status: 'SKIPPED', reason: report.halted }); continue; }
    const dest = join(OUT, `${s.id}.${EXT[s.kind]}`);
    if (state.shots[s.id]?.status === 'ACCEPTED' || existsSync(dest)) { report.records.push({ id: s.id, status: 'SKIPPED', reason: 'already present (resume)' }); continue; }
    const prompt = getFaithfulPrompt(s.id)?.fullPrompt || '';
    if (!prompt) { report.records.push({ id: s.id, status: 'BLOCKED', reason: 'no faithful prompt' }); continue; }
    done++;
    const r = await adapter.generate({ model: s.model, input: { ...s.input, prompt }, kind: s.kind, worstCaseCostEur: s.worst, idempotencyKey: s.id, dryRun: false, timeoutMs: s.timeoutMs, pollMs: 3000 });
    const rec = { id: s.id, model: s.model, kind: s.kind, reservedEur: s.worst, status: r.status, booked_eur: r.costEur ?? 0, predictionId: r.predictionId || null, reason: r.reason || null, ledger: ledger.snapshot() };
    // halts (fail-closed)
    if (/PAYMENT_REQUIRED|402|insufficient credit/i.test(r.reason || '')) { report.halted = 'HALT_CREDIT (402 — no usable credit)'; rec.status = 'HALT_CREDIT'; report.records.push(rec); break; }
    if (r.indeterminateBilling) { report.halted = 'HALT_INDETERMINATE_BILLING'; rec.status = 'HALT_INDETERMINATE_BILLING'; state.shots[s.id] = { status: 'INDETERMINATE_BILLING' }; saveState(state); report.records.push(rec); break; }
    if (/LEDGER_REFUSED|BUDGET|ATTEMPT CAP/i.test(r.reason || '') || r.status === 'BLOCKED') { report.halted = 'HALT_BUDGET'; rec.status = 'HALT_BUDGET'; report.records.push(rec); break; }
    if (r.status === 'SUCCEEDED' && r.outputUrls?.length) {
      try {
        const resp = await fetch(r.outputUrls[0], { signal: AbortSignal.timeout(120000) });
        const buf = Buffer.from(await resp.arrayBuffer());
        writeFileSync(dest, buf);
        rec.file = dest; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex');
        if (s.kind === 'PREMIUM_VIDEO' && ffmpegAvailable()) { rec.durationSec = measureDurationSec(dest); rec.integrity = probeIntegrity(dest).ok; }
        const a = analyze(dest); rec.ciqe = a.worstSeverity;
        // Generated video/image shots are SILENT by design (audio is added in post) — the final-film audio gate
        // must NOT reject a generation shot. Block only on VISUAL/TECHNICAL (non-AUDIO) BLOCKER/MAJOR.
        const visual = a.findings.filter(f => f.dimension !== 'AUDIO');
        rec.ciqeVisualWorst = visual.some(f => f.severity === 'BLOCKER') ? 'BLOCKER' : visual.some(f => f.severity === 'MAJOR') ? 'MAJOR' : visual.some(f => f.severity === 'MINOR') ? 'MINOR' : 'OK';
        rec.audioNote = 'silent (expected for generation; audio added in post)';
        rec.ciqeBlocking = ['BLOCKER', 'MAJOR'].includes(rec.ciqeVisualWorst);
        state.shots[s.id] = { status: rec.ciqeBlocking ? 'REJECTED_CIQE' : 'ACCEPTED_TECH', sha256: rec.sha256, ciqe: rec.ciqe };
        rec.status = rec.ciqeBlocking ? 'REJECTED_CIQE' : 'PRODUCED (tech ok; human artistic review required)';
      } catch (e) { rec.status = 'DOWNLOAD_ERROR'; rec.reason = String(e.message).slice(0, 120); }
      saveState(state);
    } else { state.shots[s.id] = { status: 'FAILED', reason: r.reason }; saveState(state); rec.status = rec.status === 'SUCCEEDED' ? 'INVALID_OUTPUT' : rec.status; }
    report.records.push(rec);
  }
  report.ledgerFinal = ledger.snapshot();
  writeFileSync(join(OUT, 'pilot-report.json'), JSON.stringify(report, null, 1));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mx = process.argv.find(a => a.startsWith('--max='));
  const r = await runPilot({ maxShots: mx ? parseInt(mx.slice(6)) : Infinity });
  console.log(`PILOT ${r.mode} — halted=${r.halted || 'no'} | ledger`, JSON.stringify(r.ledgerFinal));
  for (const rec of r.records) console.log(`  [${rec.status}] ${rec.id} (${rec.model}) reserved€${rec.reservedEur} booked€${rec.booked_eur} sha=${rec.sha256 ? rec.sha256.slice(0, 12) + '…' : '—'} dur=${rec.durationSec ?? '—'} ciqe=${rec.ciqe ?? '—'}${rec.reason ? ' :: ' + rec.reason : ''}`);
}
