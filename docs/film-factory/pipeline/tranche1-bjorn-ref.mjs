// TRANCHE 1 — step 1: generate BJÖRN reference candidates (flux-dev). NEW €15 ledger (separate from pilot/av).
// Reserve worst-case before each call; stop if remaining can't cover a safe call. No F10 change.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { applyStyle } from './style-lock-f10.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t1'); if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const CAP = 15.00;
const ledger = new PersistentLedger(CAP, join(OUT, 't1-ledger.json'), { maxAttempts: 20 });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });

const prompt = applyStyle('Character reference portrait, single person, three-quarter body, plain neutral grey studio background, even soft key light, sharp focus for identity. BJÖRN: a massive, powerfully built Viking warrior, late 30s; weathered face, full beard, long hair tied back; a very large two-handed greatsword strapped across his back; salt-worn wool tunic and leather bracers; calm, steady, imposing. Norse historical-fantasy world; historically-plausible materials; NO modern objects, NO text.');

const N = 3, WORST = 0.10; // flux-dev ~$0.025/img; reserve €0.10 worst-case
console.log(`=== TRANCHE 1 / Björn ref — CAP €${CAP} — ${N} candidates @ worst €${WORST} ===`);
const recs = []; let halted = null;
for (let i = 1; i <= N; i++) {
  const snap = ledger.snapshot(); const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n-- candidate ${i} -- remaining €${remaining.toFixed(2)} | worst €${WORST} | attempts ${snap.attempts}/20`);
  if (WORST > remaining + 1e-9) { halted = 'STOP: remaining < worst'; break; }
  const res = await adapter.generate({ model: 'black-forest-labs/flux-dev', input: { prompt }, worstCaseCostEur: WORST, kind: 'image', timeoutMs: 120000, pollMs: 2500 });
  const rec = { id: `bjorn-ref-${i}`, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null };
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE on candidate ${i}`; recs.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT billing on ${i}`; recs.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; console.log(`  ${res.status} (€0): ${String(res.reason).slice(0, 120)}`); recs.push(rec); continue; }
  const dest = join(OUT, `bjorn-ref-${i}.webp`);
  try { const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer()); writeFileSync(dest, buf); rec.file = `runs/production-t1/bjorn-ref-${i}.webp`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex'); } catch (e) { rec.downloadError = String(e).slice(0, 120); }
  recs.push(rec); console.log(`  SUCCEEDED | booked €${rec.costEur} | ${rec.file} | ${rec.bytes}B`);
}
const f = ledger.snapshot();
writeFileSync(join(OUT, 'bjorn-ref-report.json'), JSON.stringify({ generated: '2026-10-25', step: 'bjorn-reference', cap: CAP, ledger: f, spent: f.spent, remaining: +(CAP - f.spent - f.committed).toFixed(4), halted, candidates: recs }, null, 1));
console.log(`\n=== DONE === spent €${f.spent}/€${CAP} | remaining €${(CAP - f.spent - f.committed).toFixed(2)} | attempts ${f.attempts}/20`);
