// Diagnostic continuation on the SAME €6 av-ledger (already €0.30 spent). Isolates the seedance E005 cause
// (reference_images vs prompt) and retries veo (transient 404). Budget-guarded; €0 on failure. No new ledger.
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
const ledger = new PersistentLedger(CAP, join(OUT, 'av-ledger.json'), { maxAttempts: 10 }); // SAME ledger (continues cap)
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
const dataUri = (f) => 'data:image/webp;base64,' + readFileSync(join(here, 'runs/pilot/refs', f)).toString('base64');

const VIS = applyStyle('EXT. NORTH SEA at night, big rolling waves. A wooden Viking sailing ship rides a tall dark wave; cold grey-blue sea, sea spray; the wave crest glows into a seam of warm GOLD LIGHT. Cinematic motivated lighting, steady readable framing. No city, no modern objects.');

const CALLS = [
  { id: 'D1-seedance2.5-720-TEXTONLY', model: 'bytedance/seedance-2.5', worstEur: 1.10, input: { prompt: VIS, duration: 6, resolution: '720p', generate_audio: false }, kind: 'video', test: 'isolate E005: TEXT-ONLY (no reference_images) — does seedance video gen work without our person refs?' },
  { id: 'D2-veo3fast-retry', model: 'google/veo-3-fast', worstEur: 1.30, input: { prompt: VIS, duration: 6, resolution: '1080p', generate_audio: true }, kind: 'video', test: 'retry veo-3-fast (prior 404 may be transient backend)' },
];
function probeDur(file) { const b = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); if (existsSync(b)) { try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file]).toString().trim()); } catch { } } return null; }

const records = []; let halted = null;
for (const c of CALLS) {
  const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n--- ${c.id} --- remaining €${remaining.toFixed(2)} | worst €${c.worstEur.toFixed(2)} | attempts ${snap.attempts}/10`);
  if (c.worstEur > remaining + 1e-9) { halted = `STOP: worst €${c.worstEur} > remaining €${remaining.toFixed(2)}`; break; }
  const res = await adapter.generate({ model: c.model, input: c.input, worstCaseCostEur: c.worstEur, kind: c.kind, timeoutMs: 180000, pollMs: 3000 });
  const rec = { id: c.id, model: c.model, test: c.test, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE on ${c.id}`; records.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing on ${c.id}`; records.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 130)} — continuing`); records.push(rec); continue; }
  const dest = join(OUT, `${c.id}.mp4`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/validation-av/${c.id}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); rec.measuredDurationSec = probeDur(dest); try { rec.ciqe = analyze(dest); } catch (e) { rec.ciqe = { error: String(e).slice(0, 100) }; } } catch (e) { rec.downloadError = String(e).slice(0, 140); }
  rec.humanAcceptance = 'PENDING (HUMAN_REQUIRED)';
  records.push(rec);
  console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | dur ${rec.measuredDurationSec ?? '?'}s | bytes ${rec.bytes}`);
}
const final = ledger.snapshot();
const prev = existsSync(join(OUT, 'av-validation-report.json')) ? JSON.parse(readFileSync(join(OUT, 'av-validation-report.json'), 'utf8')) : {};
writeFileSync(join(OUT, 'av-diagnostic-report.json'), JSON.stringify({ generated: '2026-10-24', continuesLedger: 'av-ledger.json', ledgerFinal: final, cumulativeSpentEur: final.spent, remainingEur: +(CAP - final.spent - final.committed).toFixed(4), capRespected: (final.spent + final.committed) <= CAP + 1e-9, halted, calls: records }, null, 1));
console.log(`\n=== DIAG DONE === cumulative €${final.spent}/€${CAP} | remaining €${(CAP - final.spent - final.committed).toFixed(2)} | attempts ${final.attempts}/10 | cap ok ${(final.spent + final.committed) <= CAP + 1e-9}`);
