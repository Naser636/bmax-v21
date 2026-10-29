// CONTROLLED AUDIOVISUAL QUALITY VALIDATION — REAL paid run under an EXPLICIT €6.00 hard cap.
// CTO-authorized (ctoBoundedPaidRunAuthorized). Separate immutable ledger (runs/validation-av/). The prior
// €1.53/8-attempt pilot ledger is NOT touched. Reserve-worst-case-before-call; stop on 402/indeterminate/mismatch.
// Charges are per-output-second and bounded by `duration`; reservations use a GENEROUS max-duration worst-case.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const REFDIR = join(here, 'runs/pilot/refs');
const dataUri = (f) => 'data:image/webp;base64,' + readFileSync(join(REFDIR, f)).toString('base64');
const ASTRID = dataUri('ASTRID.webp'), OLAF = dataUri('OLAF.webp');

const CAP = 6.00;
const ledger = new PersistentLedger(CAP, join(OUT, 'av-ledger.json'), { maxAttempts: 10 });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });

// canonical F10 beat using APPROVED refs (ASTRID+OLAF). Model/quality test — not an F11 commitment.
const VIS = applyStyle('EXT. NORTH SEA at night, big rolling waves. A wooden Viking sailing ship rides a tall dark wave; a young woman (ASTRID) steers at the tiller while an older man (OLAF) holds the mast; cold grey-blue sea, sea spray; the wave crest glows into a seam of warm GOLD LIGHT. Cinematic motivated lighting, steady readable framing. No city, no modern objects.');
const LINE = 'She is pulling beam-on. If I hold, she rolls.';
const AV = applyStyle(`EXT. NORTH SEA at night. A young woman (ASTRID) at a ship tiller speaks clearly to an older man over the wind: "${LINE}" Mouth movements match the words; ambient wind and sea. Cinematic, photoreal.`);

// each call: generous worst-case reservation (covers a longer-than-requested output)
const CALLS = [
  { id: 'V1-seedance2.5-720-identity', model: 'bytedance/seedance-2.5', worstEur: 1.10, input: { prompt: VIS, duration: 6, resolution: '720p', reference_images: [ASTRID, OLAF], generate_audio: false }, kind: 'video', test: 'PREFERRED engine: multi-identity + action + lighting (Path B source, 720→upscale later)' },
  { id: 'V2-seedance2.0-1080-identity', model: 'bytedance/seedance-2.0', worstEur: 1.05, input: { prompt: VIS, duration: 6, resolution: '1080p', reference_images: [ASTRID, OLAF], generate_audio: false }, kind: 'video', test: 'Path A: native-1080 multi-identity (quality UNVERIFIED model)' },
  { id: 'V3-veo3fast-1080-audiovisual', model: 'google/veo-3-fast', worstEur: 1.30, input: { prompt: AV, duration: 6, resolution: '1080p', image: ASTRID, generate_audio: true }, kind: 'video', test: 'AUDIOVISUAL: video + native audio + dialogue/lip-sync' },
  { id: 'V4-speech02hd-dialogue', model: 'minimax/speech-02-hd', worstEur: 0.30, input: { text: LINE, voice_id: 'English_Wiselady' }, kind: 'voice', test: 'dedicated dialogue/voice quality (TTS)' },
];

function ffprobe(file) { try { const { default: p } = { default: null }; const bin = join(here, 'docs/film-factory/pipeline/vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe'); } catch { } return null; }
function probeDur(file) {
  const bins = [join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe')];
  for (const b of bins) if (existsSync(b)) { try { return parseFloat(execFileSync(b, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file]).toString().trim()); } catch { } }
  return null;
}

console.log(`=== AV VALIDATION — HARD CAP €${CAP.toFixed(2)} — pre-flight exposure ===`);
let reservedSum = 0;
for (const c of CALLS) { reservedSum += c.worstEur; console.log(`  ${c.id.padEnd(34)} model=${c.model.padEnd(26)} worst €${c.worstEur.toFixed(2)} | cumulative reserved €${reservedSum.toFixed(2)} / €${CAP.toFixed(2)}`); }
console.log(`  TOTAL worst-case reservations = €${reservedSum.toFixed(2)} (≤ €${CAP}) ${reservedSum <= CAP ? 'OK' : 'EXCEEDS — ABORT'}`);
if (reservedSum > CAP) { console.error('ABORT: planned reservations exceed the cap'); process.exit(1); }

const records = []; let halted = null;
for (const c of CALLS) {
  const snap = ledger.snapshot();
  const remaining = CAP - snap.spent - snap.committed;
  console.log(`\n--- ${c.id} --- remaining budget €${remaining.toFixed(2)} | this worst-case €${c.worstEur.toFixed(2)}`);
  if (c.worstEur > remaining + 1e-9) { halted = `STOP: worst-case €${c.worstEur} exceeds remaining €${remaining.toFixed(2)}`; console.log('  ' + halted); break; }
  const res = await adapter.generate({ model: c.model, input: c.input, worstCaseCostEur: c.worstEur, kind: c.kind, timeoutMs: 180000, pollMs: 3000, dryRun: process.env.AV_DRYRUN === '1' });
  if (process.env.AV_DRYRUN === '1') { console.log(`  DRY_RUN ok=${res.ok} plannedReservation €${res.plannedReservationEur} | input keys: ${Object.keys(c.input).join(',')} | refBytes ${c.input.reference_images ? c.input.reference_images.map(u => u.length).join('/') : 'n/a'}`); records.push({ id: c.id, dryRun: true, plannedReservationEur: res.plannedReservationEur }); continue; }
  const rec = { id: c.id, model: c.model, test: c.test, status: res.status, paid: res.paid, costEur: res.costEur ?? 0, predictionId: res.predictionId || null, settings: { duration: c.input.duration, resolution: c.input.resolution, generate_audio: c.input.generate_audio ?? null } };
  // HALT only on billing-threatening events; a €0 FAILED/INVALID/ERROR (released, no charge) is recorded and we CONTINUE.
  if (res.status === 'INDETERMINATE_BILLING') { rec.indeterminate = true; halted = `HALT_INDETERMINATE_BILLING on ${c.id} — reservation KEPT, manual reconcile`; records.push(rec); break; }
  if (res.unexpectedCharge || /PAYMENT_REQUIRED|402/.test(res.reason || '')) { rec.reason = res.reason; halted = `HALT on ${c.id}: billing event — ${res.reason}`; records.push(rec); break; }
  if (!res.ok) { rec.reason = res.reason; rec.note = 'benign €0 failure (released) — recorded, continuing to next call'; console.log(`  ${res.status} (€0, released): ${res.reason} — continuing`); records.push(rec); continue; }
  // download + hash + probe + CIQE
  const url = res.outputUrls[0];
  const ext = c.kind === 'voice' ? 'mp3' : 'mp4';
  const dest = join(OUT, `${c.id}.${ext}`);
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(dest, buf);
    rec.file = `runs/validation-av/${c.id}.${ext}`; rec.bytes = buf.length; rec.sha256 = createHash('sha256').update(buf).digest('hex');
    rec.measuredDurationSec = probeDur(dest);
    if (c.kind === 'video') { try { rec.ciqe = analyze(dest); } catch (e) { rec.ciqe = { error: String(e).slice(0, 120) }; } }
  } catch (e) { rec.downloadError = String(e).slice(0, 160); }
  rec.humanAcceptance = 'PENDING (cinematic/identity/audio quality = HUMAN_REQUIRED — not auto-judged)';
  records.push(rec);
  console.log(`  ${res.status} | booked €${rec.costEur} | file ${rec.file || '(none)'} | dur ${rec.measuredDurationSec ?? '?'}s | ledger spent €${res.ledger?.spent}`);
}

const final = ledger.snapshot();
const report = {
  generated: '2026-10-24', mission: 'Controlled audiovisual quality validation (REAL paid, €6 cap)',
  cap: CAP, authorization: 'CTO explicit €6.00 bounded run (ctoBoundedPaidRunAuthorized)',
  ledgerFinal: final, cumulativeSpentEur: final.spent, remainingEur: +(CAP - final.spent - final.committed).toFixed(4),
  capRespected: (final.spent + final.committed) <= CAP + 1e-9,
  halted, calls: records,
  musicSfx: 'NOT CALLED — no verified-priced music/SFX provider; cost UNKNOWN (never treated as €0). Remains UNVALIDATED.',
  acceptanceNote: 'CIQE = automatable technical only. Cinematic quality, identity fidelity, audio intelligibility/sync = HUMAN_REQUIRED and PENDING human review of the downloaded files.',
  priorPilotLedgerUntouched: true,
};
writeFileSync(join(OUT, 'av-validation-report.json'), JSON.stringify(report, null, 1));
console.log(`\n=== DONE === cumulative spent €${final.spent} / €${CAP} | remaining €${report.remainingEur} | cap respected: ${report.capRespected} | halted: ${halted || 'no'}`);
