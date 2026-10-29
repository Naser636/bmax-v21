// Bounded pilot RETEST (CTO-authorized, SAME hard cap €6.08 incl. the €0.95 already spent). Re-generates SC15-SH01
// with the FIXED routing (STILL_ANIMATABLE -> flux-dev photoreal still) + style anchor, and generates SC39-SH04
// (genuine video) with the style anchor — to test style-consistency + identity/anachronism. Reuses the persistent
// pilot ledger, reserve-before-call, halt on 402/cap/indeterminate. Writes *-v2 files, preserving v1 for comparison.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
import { analyze } from './ciqe.mjs';
import { applyStyle, routeModel, styleViolations } from './style-lock-f10.mjs';
import { ffmpegAvailable, measureDurationSec } from './ffmpeg-local.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs', 'pilot');
mkdirSync(OUT, { recursive: true });
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

// retest selection: the shot that FAILED stylistically (SC15, now correctly routed) + one identity/anachronism-risk video (SC39)
const RETEST = ['SC15-SH01', 'SC39-SH04'].map(id => {
  const s = sl.shots.find(x => x.id === id);
  const route = routeModel(s.mediaCategory);
  return { id, mediaCategory: s.mediaCategory, model: route.correctModel, worst: route.worstEur, timeoutMs: s.mediaCategory === 'PREMIUM_VIDEO' ? 240000 : 120000, ext: s.mediaCategory === 'PREMIUM_VIDEO' ? 'mp4' : 'webp' };
});

export async function runRetest() {
  const ledger = new PersistentLedger(6.08, join(OUT, 'pilot-ledger.json'), { maxAttempts: 8 });
  const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
  if (!adapter.available().authorized) throw new Error('retest: adapter not authorized');
  const report = { cap: 6.08, ledgerStart: ledger.snapshot(), halted: null, records: [] };
  for (const r of RETEST) {
    if (report.halted) { report.records.push({ id: r.id, status: 'SKIPPED', reason: report.halted }); continue; }
    const dest = join(OUT, `${r.id}-v2.${r.ext}`);
    if (existsSync(dest)) { report.records.push({ id: r.id, status: 'SKIPPED', reason: 'v2 already present' }); continue; }
    const basePrompt = getFaithfulPrompt(r.id)?.fullPrompt || '';
    const prompt = applyStyle(basePrompt);
    const preViolations = styleViolations(prompt); // should be empty after applyStyle
    const input = r.mediaCategory === 'STILL_ANIMATABLE' ? { prompt, aspect_ratio: '16:9' } : { prompt };
    const g = await adapter.generate({ model: r.model, input, kind: r.mediaCategory, worstCaseCostEur: r.worst, idempotencyKey: r.id + '-v2', dryRun: false, timeoutMs: r.timeoutMs, pollMs: 3000 });
    const rec = { id: r.id, model: r.model, mediaCategory: r.mediaCategory, reservedEur: r.worst, booked_eur: g.costEur ?? 0, status: g.status, predictionId: g.predictionId || null, stylePreCheck: preViolations, ledger: ledger.snapshot() };
    if (/PAYMENT_REQUIRED|402|insufficient credit/i.test(g.reason || '')) { report.halted = 'HALT_CREDIT'; rec.status = 'HALT_CREDIT'; report.records.push(rec); break; }
    if (g.indeterminateBilling) { report.halted = 'HALT_INDETERMINATE_BILLING'; rec.status = 'HALT_INDETERMINATE_BILLING'; report.records.push(rec); break; }
    if (/LEDGER_REFUSED|BUDGET|ATTEMPT CAP/i.test(g.reason || '') || g.status === 'BLOCKED') { report.halted = 'HALT_BUDGET'; rec.status = 'HALT_BUDGET'; report.records.push(rec); break; }
    if (g.status === 'SUCCEEDED' && g.outputUrls?.length) {
      const buf = Buffer.from(await (await fetch(g.outputUrls[0], { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      writeFileSync(dest, buf);
      rec.file = dest; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex');
      if (r.mediaCategory === 'PREMIUM_VIDEO' && ffmpegAvailable()) rec.durationSec = measureDurationSec(dest);
      const a = analyze(dest); rec.ciqeVisual = a.findings.filter(f => f.dimension !== 'AUDIO').some(f => ['BLOCKER', 'MAJOR'].includes(f.severity)) ? 'VISUAL_DEFECT' : 'OK';
    }
    report.records.push(rec);
  }
  report.ledgerFinal = ledger.snapshot();
  writeFileSync(join(OUT, 'retest-report.json'), JSON.stringify(report, null, 1));
  return report;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runRetest();
  console.log(`RETEST — halted=${r.halted || 'no'} | ledger`, JSON.stringify(r.ledgerFinal));
  for (const rec of r.records) console.log(`  [${rec.status}] ${rec.id} (${rec.model}) booked€${rec.booked_eur} sha=${rec.sha256 ? rec.sha256.slice(0, 12) + '…' : '—'} dur=${rec.durationSec ?? '—'} ciqeVisual=${rec.ciqeVisual ?? '—'} stylePreCheck=${JSON.stringify(rec.stylePreCheck)}`);
}
