// CHARACTER IDENTITY LOCK — first minimal batch (CTO-authorized, SAME €6.08 cap incl. €1.44 spent; ≤8 attempts).
// Generates photoreal character reference images for the highest-continuity characters present in the produced
// pilot shots, from CANON descriptors (extracted from authored prompts) + the photoreal style anchor, routed to
// flux-dev (STILL). Reserve-before-call; halts on 402/cap/indeterminate. A reference is a control BASE, not proof
// the provider will keep the face in future generations. Writes runs/pilot/refs/.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { analyze } from './ciqe.mjs';
import { applyStyle, routeModel } from './style-lock-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs', 'pilot', 'refs');
mkdirSync(OUT, { recursive: true });

// canon descriptors (VERIFIED from authored IN FRAME prompts). First batch = 3 highest-continuity, in produced shots.
const CHARS = [
  { ref: 'ASTRID', desc: 'woman ~19, Norse navigator; salt-stained Norse wool-and-leather seafarer garb; a star-chart tattoo on her forearm; long hair, often soaked; determined, watchful' },
  { ref: 'MERYT', desc: 'Egyptian woman, river-guard captain; linen kilt and leather river-guard harness; a bound right-forearm wound (khopesh cut) wrapped in a strip of Norse cloth; composed, grieving' },
  { ref: 'OLAF', desc: 'man ~60s, grey and failing Norse captain; heavy Norse wool cloak; a bronze arm-ring; a captain\'s bearing even when weak' },
];
const PROMPT = (c) => applyStyle(`Character reference portrait, single person, three-quarter body, plain neutral grey studio background, even soft key light, sharp focus for identity. ${c.ref}: ${c.desc}. World: original fantasy, Norse ∩ pharaonic (dramatized); historically-plausible materials; NO modern objects/symbols/text.`);

export async function run() {
  const ledger = new PersistentLedger(6.08, join(here, 'runs', 'pilot', 'pilot-ledger.json'), { maxAttempts: 8 });
  const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
  if (!adapter.available().authorized) throw new Error('refs: adapter not authorized');
  const route = routeModel('STILL_ANIMATABLE'); // flux-dev @ €0.03
  const report = { cap: 6.08, ledgerStart: ledger.snapshot(), halted: null, records: [] };
  for (const c of CHARS) {
    if (report.halted) { report.records.push({ ref: c.ref, status: 'SKIPPED', reason: report.halted }); continue; }
    const dest = join(OUT, `${c.ref}.webp`);
    if (existsSync(dest)) { report.records.push({ ref: c.ref, status: 'SKIPPED', reason: 'already present' }); continue; }
    if (!ledger.canAttempt()) { report.halted = 'HALT_ATTEMPT_CAP (8)'; report.records.push({ ref: c.ref, status: 'HALT_ATTEMPT_CAP' }); break; }
    const g = await adapter.generate({ model: route.correctModel, input: { prompt: PROMPT(c), aspect_ratio: '3:4' }, kind: 'STILL_ANIMATABLE', worstCaseCostEur: route.worstEur, idempotencyKey: 'ref-' + c.ref, dryRun: false, timeoutMs: 120000, pollMs: 3000 });
    const rec = { ref: c.ref, model: route.correctModel, reservedEur: route.worstEur, booked_eur: g.costEur ?? 0, status: g.status, predictionId: g.predictionId || null, ledger: ledger.snapshot() };
    if (/PAYMENT_REQUIRED|402|insufficient credit/i.test(g.reason || '')) { report.halted = 'HALT_CREDIT'; rec.status = 'HALT_CREDIT'; report.records.push(rec); break; }
    if (g.indeterminateBilling) { report.halted = 'HALT_INDETERMINATE_BILLING'; rec.status = 'HALT_INDETERMINATE_BILLING'; report.records.push(rec); break; }
    if (/LEDGER_REFUSED|BUDGET|ATTEMPT CAP/i.test(g.reason || '') || g.status === 'BLOCKED') { report.halted = 'HALT_BUDGET'; rec.status = 'HALT_BUDGET'; report.records.push(rec); break; }
    if (g.status === 'SUCCEEDED' && g.outputUrls?.length) {
      const buf = Buffer.from(await (await fetch(g.outputUrls[0], { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      writeFileSync(dest, buf);
      rec.file = dest; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex');
      rec.ciqeVisual = analyze(dest).findings.filter(f => f.dimension !== 'AUDIO').some(f => ['BLOCKER', 'MAJOR'].includes(f.severity)) ? 'VISUAL_DEFECT' : 'OK';
    }
    report.records.push(rec);
  }
  report.ledgerFinal = ledger.snapshot();
  writeFileSync(join(OUT, 'reference-sheets-report.json'), JSON.stringify(report, null, 1));
  return report;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await run();
  console.log(`REFERENCE SHEETS — halted=${r.halted || 'no'} | ledger`, JSON.stringify(r.ledgerFinal));
  for (const rec of r.records) console.log(`  [${rec.status}] ${rec.ref} booked€${rec.booked_eur} sha=${rec.sha256 ? rec.sha256.slice(0, 12) + '…' : '—'} ciqe=${rec.ciqeVisual ?? '—'}`);
}
