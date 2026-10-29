// TRANCHE 1 — SC01 assembly shots. Same €15 ledger. Reserve-before-call; stop if remaining < worst.
// SHOTSET via env SET: "estgs" = establisher + greatsword; "rescue" = rescue. Split to avoid long-run timeouts.
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
const bjornRef = 'data:image/webp;base64,' + readFileSync(join(OUT, 'refs/BJORN-noweapon-768.webp')).toString('base64');
const P = s => applyStyle(s + ' No modern objects, no ship wheel. Cinematic photoreal, readable action, motivated lighting.');

const ALL = {
  'E1-sc01-storm-seam': { model: 'bytedance/seedance-2.5', worst: 0.80, input: { prompt: P('EXT. North Sea at night, violent storm. A wooden Viking longship rides a towering black wave; rain and sea-spray; at the breaking crest the water unravels into a seam of glowing GOLD LIGHT. Cold steel-grey sea, dramatic. Wide shot, no close-up people.'), duration: 6, resolution: '720p', generate_audio: false } },
  'G1-greatsword-action': { model: 'minimax/video-01', worst: 0.60, input: { prompt: P('A large bearded Viking warrior (BJÖRN) in a wool tunic and fur mantle raises a huge two-handed greatsword overhead and drives it down to plant it into cracking ground, bracing with both hands; two suns in the sky; ochre dust; powerful motion.'), subject_reference: bjornRef } },
  'R1-rescue-crewman': { model: 'minimax/video-01', worst: 0.60, input: { prompt: P('A large bearded Viking warrior (BJÖRN) reaches down and hauls a grown crewman up out of rushing shallow water by the forearm, pulling him onto dry rock; cold daylight, spray; clear rescue motion, strain.'), subject_reference: bjornRef } },
};
const SETS = { estgs: ['E1-sc01-storm-seam', 'G1-greatsword-action'], rescue: ['R1-rescue-crewman'] };
const ids = SETS[process.env.SET] || [];

const recs = []; let halted = null;
for (const id of ids) {
  const c = ALL[id]; const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n-- ${id} (${c.model}) -- remaining €${remaining.toFixed(2)} | worst €${c.worst} | attempts ${snap.attempts}/20`);
  if (c.worst > remaining + 1e-9) { halted = 'STOP: remaining < worst'; break; }
  const res = await adapter.generate({ model: c.model, input: c.input, worstCaseCostEur: c.worst, kind: 'video', timeoutMs: 260000, pollMs: 4000 });
  const rec = { id, model: c.model, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE ${id} (predId ${res.predictionId})`; recs.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing ${id}`; recs.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 120)}`); recs.push(rec); continue; }
  const dest = join(OUT, `${id}.mp4`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/production-t1/${id}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); try { rec.durationSec = parseFloat(execFileSync(PR, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', dest]).toString().trim()); } catch {} rec.ciqe = analyze(dest).worstSeverity; execFileSync(FF, ['-y', '-v', 'error', '-ss', '3', '-i', dest, '-frames:v', '1', join(OUT, `frames/${id}-mid.png`)]); } catch (e) { rec.downloadError = String(e).slice(0, 120); }
  recs.push(rec); console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | dur ${rec.durationSec}s | ciqe ${rec.ciqe}`);
}
const f = ledger.snapshot();
const prev = existsSync(join(OUT, 'sc01-shots-report.json')) ? JSON.parse(readFileSync(join(OUT, 'sc01-shots-report.json'), 'utf8')).shots || [] : [];
writeFileSync(join(OUT, 'sc01-shots-report.json'), JSON.stringify({ generated: '2026-10-25', ledger: f, spent: f.spent, remaining: +(CAP - f.spent - f.committed).toFixed(4), attempts: f.attempts, halted, shots: [...prev, ...recs] }, null, 1));
console.log(`\n=== SET ${process.env.SET} DONE === spent €${f.spent}/€${CAP} | remaining €${(CAP - f.spent - f.committed).toFixed(2)} | attempts ${f.attempts}/20 | halted ${halted || 'no'}`);
