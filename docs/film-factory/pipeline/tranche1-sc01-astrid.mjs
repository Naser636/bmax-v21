// SINGLE authorized paid generation — SC01 "ASTRID at the steering-oar, reading the sea" (minimax
// subject_reference, ref ASTRID-768.webp). ACTIVE t1 ledger (cap €15), worst-case €0.60, ONE attempt.
// Safety: operating-contract preflight gate; reserve-before-call (adapter+t1 ledger); internal timeoutMs 300s
// < shell cap so the script always returns cleanly; prediction ID persisted immediately for PL-5 reconciliation;
// token loaded in-process only (never printed/written). Output marked HUMAN_REVIEW_PENDING (never auto-accepted).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { applyStyle } from './style-lock-f10.mjs';
import { analyze } from './ciqe.mjs';
import { loadProviderTokenIntoEnv, providerAvailable, preflightForGeneration } from './operating-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t1');
const CAP = 15.0, WORST = 0.60;
const SHOT = 'SC01-astrid-helm';
const idFile = join(OUT, `${SHOT}.prediction-id.json`);

// 1) credential into THIS process only (presence-checked; value never surfaced)
const tok = loadProviderTokenIntoEnv();
console.log(`credential: loaded=${tok.loaded} source=${tok.source} (value never printed)`);
if (!providerAvailable(process.env)) { console.error('PROVIDER_AUTH_BLOCKED: no credential available'); process.exit(3); }

// 2) canon-correct SC01-continuity prompt (storm/night; steering-oar NOT wheel; star-chart tattoo; wool-and-leather)
const REF = 'data:image/webp;base64,' + readFileSync(join(here, 'runs/validation-av/refs/ASTRID-768.webp')).toString('base64');
const PROMPT = applyStyle('EXT. NORTH SEA — STORM — NIGHT. A young Norse seafarer woman (ASTRID, ~19) in salt-stained wool-and-leather garb with a fur-trimmed collar and a star-chart tattoo on her forearm stands at the STERN STEERING-OAR of the wooden Viking longship SŌLFARI, one hand gripping the long steering-oar, READING THE SEA — her eyes scan the black swell ahead, reading the water the way others read faces. Rain and sea-spray, cold moonless dark, the ship pitching on hill-high black waves; cinematic photoreal, cold steel-grey palette, steady readable framing. Historical Viking longship steered by a side-mounted steering-oar — NO ship wheel, no modern objects.');

// 3) ACTIVE t1 ledger + preflight gate
const ledger = new PersistentLedger(CAP, join(OUT, 't1-ledger.json'), { maxAttempts: 20 });
const snap0 = ledger.snapshot();
const remaining0 = +(CAP - snap0.spent - snap0.committed).toFixed(2);
const attemptsLeft0 = snap0.maxAttempts - snap0.attempts;
console.log(`t1 ledger: spent €${snap0.spent} | committed €${snap0.committed} | remaining €${remaining0} | attempts ${snap0.attempts}/${snap0.maxAttempts} (left ${attemptsLeft0})`);

const op = { model: 'minimax/video-01', subject: 'ASTRID', usesFaceRef: true, prompt: PROMPT, scene: 'SC01',
  timelinePosition: 'SC01:astrid-read', worstCaseEur: WORST, spentEur: snap0.spent, capEur: CAP,
  attemptsLeft: attemptsLeft0, providerAvailable: providerAvailable(process.env) };
const pf = preflightForGeneration(op);
console.log(`preflight: allow=${pf.allow} violations=${JSON.stringify(pf.violations.map(v => v.kind))} warns=${JSON.stringify(pf.warns.map(w => w.id))}`);
if (!pf.allow) { console.error('PREFLIGHT BLOCKED — not launching:', JSON.stringify(pf.violations)); process.exit(4); }
if (WORST > remaining0 + 1e-9) { console.error(`STOP: worst €${WORST} > remaining €${remaining0}`); process.exit(5); }

// 4) the ONE paid call. Internal timeout 300s < shell cap. Adapter reserves worst-case before the HTTP call.
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
console.log(`\n=== GENERATING ${SHOT} (minimax subject_reference) — worst €${WORST}, ONE attempt ===`);
const res = await adapter.generate({ model: 'minimax/video-01', input: { prompt: PROMPT, subject_reference: REF }, worstCaseCostEur: WORST, kind: 'video', timeoutMs: 300000, pollMs: 4000 });

// 5) persist the prediction ID IMMEDIATELY (PL-5 reconciliation), then branch on outcome
if (res.predictionId) writeFileSync(idFile, JSON.stringify({ shot: SHOT, predictionId: res.predictionId, status: res.status, at: '2026-10-25' }, null, 1));
const probe = (f) => { const b = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); if (existsSync(b)) { try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()); } catch { } } return null; };
const rec = { shot: SHOT, status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null, acceptance: 'HUMAN_REVIEW_PENDING' };

if (res.status === 'INDETERMINATE_BILLING') {
  rec.note = 'TIMEOUT/interrupt — reservation KEPT. Reconcile read-only (GET /predictions/' + (res.predictionId || '?') + ') before any retry. DO NOT re-call.';
  console.error('HALT_INDETERMINATE_BILLING — predictionId persisted; reconcile before resume.');
} else if (/PAYMENT_REQUIRED|402/.test(res.reason || '') || res.unexpectedCharge) {
  rec.reason = res.reason; rec.note = 'HALT billing event.';
  console.error('HALT billing:', String(res.reason).slice(0, 160));
} else if (!res.ok) {
  rec.reason = res.reason; console.error(`${res.status} (€0 released): ${String(res.reason).slice(0, 200)}`);
} else {
  const dest = join(OUT, `${SHOT}.mp4`);
  const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer());
  writeFileSync(dest, buf);
  rec.file = `runs/production-t1/${SHOT}.mp4`; rec.bytes = buf.length;
  rec.sha256 = createHash('sha256').update(buf).digest('hex'); rec.durationSec = probe(dest);
  rec.ciqe = analyze(dest).worstSeverity;
  console.log(`SUCCEEDED | booked €${rec.costEur} | ${rec.file} | ${rec.bytes}B | dur ${rec.durationSec}s | ciqe ${rec.ciqe} | sha ${rec.sha256.slice(0, 12)}`);
}

const fin = ledger.snapshot();
rec.ledgerFinal = { spent: fin.spent, committed: fin.committed, remaining: +(CAP - fin.spent - fin.committed).toFixed(2), attempts: `${fin.attempts}/${fin.maxAttempts}`, capRespected: (fin.spent + fin.committed) <= CAP + 1e-9 };
writeFileSync(join(OUT, `${SHOT}-report.json`), JSON.stringify(rec, null, 1));
console.log(`\n=== DONE === t1 spent €${fin.spent}/€${CAP} | remaining €${rec.ledgerFinal.remaining} | attempts ${fin.attempts}/${fin.maxAttempts} | cap ok ${rec.ledgerFinal.capRespected}`);
console.log('ACCEPTANCE: HUMAN_REVIEW_PENDING (full-motion identity/continuity review required; NOT auto-accepted).');
