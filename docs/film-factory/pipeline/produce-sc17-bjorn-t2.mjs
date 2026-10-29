// T2 REAL production — SC17 "BJÖRN gets ONE read right" (next chronological READY single-subject shot per the
// fail-closed classifier). Authored quality single-subject prompt (identity-focused close framing = low risk).
// CTO-authorized bounded run (€10 cap, 31 attempts). Preflight + reserve-before-call; internal timeout 300s < shell;
// prediction-id persisted; settle/release; token in-process only. Output HUMAN_REVIEW_PENDING.
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
import { loadRoster, loadBeats, classifyShot, STATUS } from './shot-readiness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t2');
const CAP = 10.0, MAXATT = 31, WORST = 0.60, SHOT = 'SC17-bjorn-read';
// BJÖRN reference (diacritic-safe path)
const refPath = join(here, 'runs/production-t1/refs/BJORN-768.webp');
const REF = 'data:image/webp;base64,' + readFileSync(refPath).toString('base64');
const PROMPT = applyStyle('CLOSE ON BJÖRN — a massive, muscular Viking warrior with a thick reddish beard and weathered face, wool tunic; he studies a carved mark on a piece of driftwood held in his huge hands, brow furrowed in concentration, then eases into the small, hard-won satisfaction of getting ONE read right — a flicker of quiet triumph crossing his face. Warm low ochre light, soft shadows; cinematic photoreal, intimate close framing, shallow depth of field. No modern objects.');

if (existsSync(join(OUT, SHOT + '.mp4'))) { console.log('ALREADY PRODUCED — skip'); process.exit(0); }

// FAIL-CLOSED readiness re-check on the real shot before spending
const roster = loadRoster(); const beats = loadBeats();
const sl = JSON.parse(readFileSync(join(here, '..', 'canon', 'F11_PROPOSED', 'f11-fullfilm-shotlist.json'), 'utf8'));
const slShot = sl.shots.find(s => s.id === 'F11-SC17-SH01');
const cls = classifyShot({ ...slShot, id: 'SC17-SH01' }, roster, beats['SC17'] || '');
console.log(`readiness: ${cls.status} (subject ${cls.subject})`);
if (cls.status !== STATUS.READY) { console.error('NOT READY per classifier — abort:', JSON.stringify(cls.reasons)); process.exit(4); }

const tok = loadProviderTokenIntoEnv();
console.log(`credential loaded=${tok.loaded} source=${tok.source}`);
if (!providerAvailable(process.env)) { console.error('PROVIDER_AUTH_BLOCKED'); process.exit(3); }

const ledger = new PersistentLedger(CAP, join(OUT, 't2-ledger.json'), { maxAttempts: MAXATT });
const snap = ledger.snapshot();
console.log(`t2 ledger: spent €${snap.spent} remaining €${snap.remaining} attempts ${snap.attempts}/${snap.maxAttempts}`);

const op = { model: 'minimax/video-01', subject: 'BJORN', usesFaceRef: true, prompt: PROMPT, scene: 'SC17',
  timelinePosition: 'SC17:bjorn-one-read-right', worstCaseEur: WORST, spentEur: snap.spent, capEur: CAP,
  attemptsLeft: snap.maxAttempts - snap.attempts, providerAvailable: providerAvailable(process.env) };
const pf = preflightForGeneration(op);
console.log(`preflight allow=${pf.allow} violations=${JSON.stringify(pf.violations.map(v => v.kind))} warns=${JSON.stringify(pf.warns.map(w => w.id))}`);
if (!pf.allow) { console.error('PREFLIGHT BLOCKED:', JSON.stringify(pf.violations)); process.exit(5); }
if (WORST > snap.remaining + 1e-9) { console.error('STOP: worst > remaining'); process.exit(6); }

const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });
console.log(`\n=== GENERATING ${SHOT} (minimax subject_reference BJÖRN, worst €${WORST}) ===`);
const res = await adapter.generate({ model: 'minimax/video-01', input: { prompt: PROMPT, subject_reference: REF }, worstCaseCostEur: WORST, kind: 'video', timeoutMs: 300000, pollMs: 4000 });

if (res.predictionId) writeFileSync(join(OUT, SHOT + '.prediction-id.json'), JSON.stringify({ shot: SHOT, predictionId: res.predictionId, status: res.status }, null, 1));
const probe = (f) => { const b = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()); } catch { return null; } };
const rec = { shot: SHOT, scene: 'SC17', status: res.status, costEur: res.costEur ?? 0, predictionId: res.predictionId || null, acceptance: 'HUMAN_REVIEW_PENDING' };

if (res.status === 'INDETERMINATE_BILLING') { rec.note = 'TIMEOUT — reservation KEPT; reconcile GET /predictions/' + (res.predictionId || '?'); console.error('HALT_INDETERMINATE_BILLING'); }
else if (/PAYMENT_REQUIRED|402/.test(res.reason || '') || res.unexpectedCharge) { rec.reason = res.reason; console.error('HALT billing:', String(res.reason).slice(0, 160)); }
else if (!res.ok) { rec.reason = res.reason; console.error(`${res.status} (€0 released): ${String(res.reason).slice(0, 200)}`); }
else {
  const dest = join(OUT, SHOT + '.mp4');
  const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer());
  writeFileSync(dest, buf);
  rec.file = `runs/production-t2/${SHOT}.mp4`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex');
  rec.durationSec = probe(dest); rec.ciqe = analyze(dest).worstSeverity;
  console.log(`SUCCEEDED | booked €${rec.costEur} | ${rec.file} | ${rec.bytes}B | ${rec.durationSec}s | ciqe ${rec.ciqe} | sha ${rec.sha256.slice(0, 12)}`);
}
const fin = ledger.snapshot();
rec.ledgerFinal = { spent: fin.spent, remaining: +(CAP - fin.spent - fin.committed).toFixed(2), attempts: `${fin.attempts}/${fin.maxAttempts}`, capRespected: (fin.spent + fin.committed) <= CAP + 1e-9 };
writeFileSync(join(OUT, SHOT + '-report.json'), JSON.stringify(rec, null, 1));
console.log(`\n=== DONE === t2 spent €${fin.spent}/€${CAP} | remaining €${rec.ledgerFinal.remaining} | attempts ${fin.attempts}/${fin.maxAttempts} | cap ok ${rec.ledgerFinal.capRespected}`);
