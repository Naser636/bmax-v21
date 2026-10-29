// FAIR identity head-to-head: SAME shot, SAME 768px ASTRID ref, SAME canon-constrained prompt, comparable params.
// Seedance-2.5 (reference_images) vs MiniMax/video-01 (subject_reference). Same €6 av-ledger (continues the cap).
// NON-evasion: the 768px ref is the DOCUMENTED E005 fix. Reserve-worst-before-call; HALT on billing events.
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
const OUT = join(here, 'runs/validation-av');
const CAP = 6.00;
const ledger = new PersistentLedger(CAP, join(OUT, 'av-ledger.json'), { maxAttempts: 10 });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
const REF = 'data:image/webp;base64,' + readFileSync(join(OUT, 'refs/ASTRID-768.webp')).toString('base64');

// identical canon-constrained prompt for BOTH
const PROMPT = applyStyle('EXT. grey open sea, overcast daylight. A young Norse seafarer woman (ASTRID) in salt-stained wool-and-leather garb with a fur-trimmed collar and a star-chart tattoo on her forearm stands at the STERN STEERING-OAR of a wooden Viking longship, one hand on the long steering-oar, turning her head to look out to sea; cold grey-blue light, cinematic photoreal, steady readable framing. Historical Viking longship steered by a side-mounted steering-oar — NO ship wheel, no modern objects.');

const CALLS = [
  { id: 'C1-seedance2.5-ref768', model: 'bytedance/seedance-2.5', worstEur: 0.70, input: { prompt: PROMPT, duration: 6, resolution: '720p', reference_images: [REF], generate_audio: false }, kind: 'video' },
  { id: 'C2-minimax-subjectref768', model: 'minimax/video-01', worstEur: 0.60, input: { prompt: PROMPT, subject_reference: REF }, kind: 'video' },
];
function probeDur(f) { const b = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); if (existsSync(b)) { try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()); } catch { } } return null; }

console.log('=== FAIR COMPARE — same prompt/ref/params — hard cap €6 ===');
let reserved = 0; for (const c of CALLS) { reserved += c.worstEur; }
const snap0 = ledger.snapshot(); const rem0 = CAP - snap0.spent - snap0.committed;
console.log(`  prudent remaining €${rem0.toFixed(2)} | planned worst €${reserved.toFixed(2)} | attempts ${snap0.attempts}/10`);
if (reserved > rem0 + 1e-9) { console.error('ABORT: planned worst exceeds remaining'); process.exit(1); }

const records = []; let halted = null;
for (const c of CALLS) {
  const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n--- ${c.id} --- remaining €${remaining.toFixed(2)} | worst €${c.worstEur.toFixed(2)} | attempts ${snap.attempts}/10`);
  if (c.worstEur > remaining + 1e-9) { halted = `STOP: worst €${c.worstEur} > remaining €${remaining.toFixed(2)}`; break; }
  const res = await adapter.generate({ model: c.model, input: c.input, worstCaseCostEur: c.worstEur, kind: c.kind, timeoutMs: 180000, pollMs: 3000 });
  const rec = { id: c.id, model: c.model, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE on ${c.id}`; records.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing on ${c.id}`; records.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 140)} — continuing`); records.push(rec); continue; }
  const dest = join(OUT, `${c.id}.mp4`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/validation-av/${c.id}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); rec.durationSec = probeDur(dest); rec.ciqe = analyze(dest).worstSeverity; } catch (e) { rec.downloadError = String(e).slice(0, 140); }
  records.push(rec);
  console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | dur ${rec.durationSec}s | ciqe ${rec.ciqe}`);
}
const final = ledger.snapshot();
writeFileSync(join(OUT, 'av-fair-compare-report.json'), JSON.stringify({ generated: '2026-10-24', test: 'same shot/ref(768px)/prompt — seedance-2.5 vs minimax', ledgerFinal: final, spentEur: final.spent, remainingEur: +(CAP - final.spent - final.committed).toFixed(4), capRespected: (final.spent + final.committed) <= CAP + 1e-9, halted, prompt: PROMPT, calls: records }, null, 1));
console.log(`\n=== DONE === spent €${final.spent}/€${CAP} | remaining €${(CAP - final.spent - final.committed).toFixed(2)} | attempts ${final.attempts}/10 | cap ok ${(final.spent + final.committed) <= CAP + 1e-9} | halted ${halted || 'no'}`);
