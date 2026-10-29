// TRANCHE 1 — Björn action via minimax/video-01 subject_reference (seedance E005-rejects his face). Same €15 ledger.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { applyStyle } from './style-lock-f10.mjs';
import { analyze } from './ciqe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t1'), CAP = 15.00;
const ledger = new PersistentLedger(CAP, join(OUT, 't1-ledger.json'), { maxAttempts: 20 });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
const FF = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg'), PR = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
const ref = 'data:image/webp;base64,' + readFileSync(join(OUT, 'refs/BJORN-noweapon-768.webp')).toString('base64');
const P = s => applyStyle(s + ' No modern objects, no ship wheel. Cinematic photoreal, readable action, motivated lighting.');

const SHOTS = [
  { id: 'A2b-greatsword-stance', prompt: P('A large bearded Viking warrior (BJÖRN) stands braced with a huge two-handed greatsword planted point-down in the sand, both hands on the hilt; sea water surges around his boots; two-sun daylight, ochre dust; powerful heroic stance.') },
  { id: 'A3b-tide-brace', prompt: P('A large bearded Viking warrior (BJÖRN) braces low against a rushing wave on a grey shore, one arm shielding a fallen crewman behind him; cold daylight, spray; strain and resolve.') },
  { id: 'A4b-march-lead', prompt: P('A large bearded Viking warrior (BJÖRN) strides at the head of a weary band across wet ochre sand under two suns, a greatsword on his back, looking ahead with quiet command; cold light.') },
];
const WORST = 0.60;
const recs = []; let halted = null;
for (const s of SHOTS) {
  const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n-- ${s.id} -- remaining €${remaining.toFixed(2)} | worst €${WORST} | attempts ${snap.attempts}/20`);
  if (WORST > remaining + 1e-9) { halted = 'STOP: remaining < worst'; break; }
  const res = await adapter.generate({ model: 'minimax/video-01', input: { prompt: s.prompt, subject_reference: ref }, worstCaseCostEur: WORST, kind: 'video', timeoutMs: 240000, pollMs: 4000 });
  const rec = { id: s.id, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE ${s.id}`; recs.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing ${s.id}`; recs.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 120)}`); recs.push(rec); continue; }
  const dest = join(OUT, `${s.id}.mp4`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/production-t1/${s.id}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); try { rec.durationSec = parseFloat(execFileSync(PR, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', dest]).toString().trim()); } catch {} rec.ciqe = analyze(dest).worstSeverity; execFileSync(FF, ['-y', '-v', 'error', '-ss', '2.8', '-i', dest, '-frames:v', '1', join(OUT, `${s.id}-mid.png`)]); } catch (e) { rec.downloadError = String(e).slice(0, 120); }
  recs.push(rec); console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | dur ${rec.durationSec}s | ciqe ${rec.ciqe}`);
}
const f = ledger.snapshot();
writeFileSync(join(OUT, 'minimax-action-report.json'), JSON.stringify({ generated: '2026-10-25', step: 'minimax-bjorn-action', cap: CAP, ledger: f, spent: f.spent, remaining: +(CAP - f.spent - f.committed).toFixed(4), attempts: f.attempts, halted, shots: recs }, null, 1));
console.log(`\n=== DONE === spent €${f.spent}/€${CAP} | remaining €${(CAP - f.spent - f.committed).toFixed(2)} | attempts ${f.attempts}/20`);
