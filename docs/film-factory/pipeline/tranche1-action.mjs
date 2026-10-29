// TRANCHE 1 — step 2: representative ACTION shots with Björn+Astrid identity (seedance-2.5, 768px refs).
// Continues the SAME €15 t1-ledger. Reserve worst-case before each call; stop when remaining can't cover a safe call.
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
const OUT = join(here, 'runs/production-t1');
const CAP = 15.00;
const ledger = new PersistentLedger(CAP, join(OUT, 't1-ledger.json'), { maxAttempts: 20 });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
const uri = p => 'data:image/webp;base64,' + readFileSync(p).toString('base64');
const BJORN = uri(join(OUT, 'refs/BJORN-768.webp')), ASTRID = uri(join(here, 'runs/validation-av/refs/ASTRID-768.webp'));
const P = s => applyStyle(s + ' Steering-oar, no ship wheel; no modern objects. Cinematic photoreal, readable action, motivated lighting.');

const SHOTS = [
  { id: 'A1-SC01-storm-oar', prompt: P('A massive bearded Viking warrior (BJÖRN) grips the long stern steering-oar of a wooden longship in a stormy night sea; a young woman (ASTRID) beside him points and calls out; towering dark waves and sea spray, cold light.'), refs: [BJORN, ASTRID] },
  { id: 'A2-SC38-takes-field', prompt: P('A massive bearded Viking warrior (BJÖRN) plants his huge two-handed greatsword into shifting ground and braces as the sand bursts upward into sea around him; a young woman (ASTRID) on a rock points, calling the moment; two-sun daylight, ochre dust and water, powerful stance.'), refs: [BJORN, ASTRID] },
  { id: 'A3-SC06-tide-rescue', prompt: P('A massive bearded Viking warrior (BJÖRN) runs and lifts a child clear of a surging tide on a grey shore; a young woman (ASTRID) points to the safe line; cold daylight, water rushing in behind them, clear motion.'), refs: [BJORN, ASTRID] },
  { id: 'A4-SC32-causeway', prompt: P('A massive bearded Viking warrior (BJÖRN) braces against a flooding causeway, his greatsword planted as an anchor, hauling a rope line; a young woman (ASTRID) guides from ahead; surging grey water, strain and effort.'), refs: [BJORN, ASTRID] },
];
const WORST = 0.80; // seedance-2.5 6s@720 ~$0.62/€0.57; reserve €0.80
function probeDur(f) { const b = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); if (existsSync(b)) { try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()); } catch { } } return null; }

console.log(`=== TRANCHE 1 / action — CAP €${CAP} — ${SHOTS.length} shots @ worst €${WORST} ===`);
const recs = []; let halted = null;
for (const s of SHOTS) {
  const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n-- ${s.id} -- remaining €${remaining.toFixed(2)} | worst €${WORST} | attempts ${snap.attempts}/20`);
  if (WORST > remaining + 1e-9) { halted = 'STOP: remaining < worst'; break; }
  const res = await adapter.generate({ model: 'bytedance/seedance-2.5', input: { prompt: s.prompt, duration: 6, resolution: '720p', reference_images: s.refs, generate_audio: false }, worstCaseCostEur: WORST, kind: 'video', timeoutMs: 240000, pollMs: 4000 });
  const rec = { id: s.id, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE on ${s.id}`; recs.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing on ${s.id}`; recs.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 130)}`); recs.push(rec); continue; }
  const dest = join(OUT, `${s.id}.mp4`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/production-t1/${s.id}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); rec.durationSec = probeDur(dest); rec.ciqe = analyze(dest).worstSeverity; } catch (e) { rec.downloadError = String(e).slice(0, 130); }
  recs.push(rec); console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | dur ${rec.durationSec}s | ciqe ${rec.ciqe}`);
}
const f = ledger.snapshot();
writeFileSync(join(OUT, 'action-report.json'), JSON.stringify({ generated: '2026-10-25', step: 'action-shots', cap: CAP, ledger: f, spent: f.spent, remaining: +(CAP - f.spent - f.committed).toFixed(4), attempts: f.attempts, halted, shots: recs }, null, 1));
console.log(`\n=== DONE === spent €${f.spent}/€${CAP} | remaining €${(CAP - f.spent - f.committed).toFixed(2)} | attempts ${f.attempts}/20 | halted ${halted || 'no'}`);
