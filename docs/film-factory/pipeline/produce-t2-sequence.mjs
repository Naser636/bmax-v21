// CXIX — continuous T2 production over an AUTHORED single-subject sequence. CTO-authorized bounded run
// (€10 hard cap, 31 attempts). Per shot: readiness gate (authored prompt) -> operating-contract preflight ->
// reserve-before-call (adapter+ledger) -> generate (minimax subject_reference, internal timeout 300s) ->
// download + decode/CIQE/duration/sha -> settle -> record. Idempotent (skip produced). Halts on cap/attempts,
// billing anomaly or indeterminate billing. Never auto-retries (PL-5). Outputs HUMAN_REVIEW_PENDING. No test spend.
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
import { readinessGate } from './shot-readiness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'runs/production-t2');
const CAP = 10.0, MAXATT = 31;
const FP = join(here, 'vendor/node_modules/ffprobe-static/bin/linux/x64/ffprobe');
const FF = join(here, 'vendor/node_modules/ffmpeg-static/ffmpeg');
const seq = JSON.parse(readFileSync(join(here, 't2-authored-sequence.json'), 'utf8'));
const refDataUri = (rel) => 'data:image/webp;base64,' + readFileSync(join(here, rel)).toString('base64');
const probe = (f) => { try { return parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()); } catch { return null; } };
const decodeClean = (f) => { try { execFileSync(FF, ['-v', 'error', '-i', f, '-f', 'null', '-']); return true; } catch { return false; } };

const tok = loadProviderTokenIntoEnv();
if (!providerAvailable(process.env)) { console.error('PROVIDER_AUTH_BLOCKED'); process.exit(3); }
const ledger = new PersistentLedger(CAP, join(OUT, 't2-ledger.json'), { maxAttempts: MAXATT });
const adapter = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger });

const results = []; let halted = null;
for (const sh of seq.shots) {
  const dest = join(OUT, sh.id + '.mp4');
  if (existsSync(dest)) { results.push({ id: sh.id, status: 'SKIPPED_PRESENT' }); console.log(`SKIP ${sh.id} (present)`); continue; }
  const snap = ledger.snapshot();
  const remaining = +(CAP - snap.spent - snap.committed).toFixed(2);
  const attemptsLeft = snap.maxAttempts - snap.attempts;
  // reserve enough for this shot + keep going only if budget/attempts allow
  if (sh.worstEur > remaining + 1e-9) { halted = `HALT_BUDGET: worst €${sh.worstEur} > remaining €${remaining}`; break; }
  if (attemptsLeft <= 0) { halted = 'HALT_ATTEMPTS: 0 left'; break; }

  const PROMPT = applyStyle(sh.prompt);
  const rg = readinessGate({ id: sh.id, scene: sh.scene, decisiveAgent: sh.subject, promptSeed: sh.prompt, mediaCategory: 'PREMIUM_VIDEO' });
  if (!rg.ready) { results.push({ id: sh.id, status: 'BLOCKED_READINESS', reasons: rg.reasons }); console.log(`BLOCK ${sh.id}: ${rg.status}`); continue; }
  const op = { model: 'minimax/video-01', subject: sh.subject, usesFaceRef: true, prompt: PROMPT, scene: sh.scene, timelinePosition: sh.scene + ':' + sh.id, worstCaseEur: sh.worstEur, spentEur: snap.spent, capEur: CAP, attemptsLeft, providerAvailable: true };
  const pf = preflightForGeneration(op);
  if (!pf.allow) { results.push({ id: sh.id, status: 'PREFLIGHT_BLOCKED', violations: pf.violations.map(v => v.kind) }); console.log(`PREFLIGHT BLOCK ${sh.id}`); continue; }

  const REF = refDataUri(seq.refs[sh.subject]);
  console.log(`\n=== ${sh.id} (${sh.subject}) | remaining €${remaining} att ${attemptsLeft} ===`);
  const res = await adapter.generate({ model: 'minimax/video-01', input: { prompt: PROMPT, subject_reference: REF }, worstCaseCostEur: sh.worstEur, kind: 'video', timeoutMs: 300000, pollMs: 4000 });
  if (res.predictionId) writeFileSync(join(OUT, sh.id + '.prediction-id.json'), JSON.stringify({ id: sh.id, predictionId: res.predictionId, status: res.status }, null, 1));

  if (res.status === 'INDETERMINATE_BILLING') { halted = `HALT_INDETERMINATE on ${sh.id} (predictionId ${res.predictionId}) — reconcile before resume`; results.push({ id: sh.id, status: res.status, predictionId: res.predictionId }); break; }
  if (/PAYMENT_REQUIRED|402/.test(res.reason || '') || res.unexpectedCharge) { halted = `HALT_BILLING on ${sh.id}: ${res.reason}`; results.push({ id: sh.id, status: 'HALT_BILLING', reason: res.reason }); break; }
  if (!res.ok) { results.push({ id: sh.id, status: res.status, reason: String(res.reason).slice(0, 160), costEur: 0 }); console.log(`  ${res.status} (€0 released): ${String(res.reason).slice(0, 120)}`); continue; }

  const buf = Buffer.from(await (await fetch(res.outputUrls[0])).arrayBuffer());
  writeFileSync(dest, buf);
  const rec = { id: sh.id, scene: sh.scene, subject: sh.subject, status: 'SUCCEEDED', costEur: res.costEur, file: `runs/production-t2/${sh.id}.mp4`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), durationSec: probe(dest), decodeClean: decodeClean(dest), ciqe: analyze(dest).worstSeverity, acceptance: 'HUMAN_REVIEW_PENDING' };
  results.push(rec);
  console.log(`  SUCCEEDED €${rec.costEur} | ${rec.durationSec}s | decode ${rec.decodeClean ? 'clean' : 'FAIL'} | ciqe ${rec.ciqe} | sha ${rec.sha256.slice(0, 10)}`);
}

const fin = ledger.snapshot();
const report = { generated: '2026-10-25', sequence: 't2-authored-sequence', halted, results,
  ledgerFinal: { spent: fin.spent, remaining: +(CAP - fin.spent - fin.committed).toFixed(2), attempts: `${fin.attempts}/${fin.maxAttempts}`, capRespected: (fin.spent + fin.committed) <= CAP + 1e-9 },
  produced: results.filter(r => r.status === 'SUCCEEDED').length };
writeFileSync(join(OUT, 't2-sequence-report.json'), JSON.stringify(report, null, 1));
console.log(`\n=== SEQUENCE DONE === produced ${report.produced} | t2 spent €${fin.spent}/€${CAP} remaining €${report.ledgerFinal.remaining} attempts ${fin.attempts}/${fin.maxAttempts} | halted ${halted || 'no'}`);
