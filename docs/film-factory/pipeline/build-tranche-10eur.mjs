// Objective D (CXVII) — prepare a <=€10 strictly-chronological production batch (NOT executed; no paid call).
// Consumes the FAIL-CLOSED canonical classifier (shot-readiness.mjs): only READY shots (single-subject, ref on
// disk, non-VFX, no co-present roster character) enter the batch; everything else is DEFERRED with its exact
// status (BLOCKED_MULTI_CHARACTER / BLOCKED_NEW_CHARACTER / BLOCKED_VFX_ENVIRONMENT / BLOCKED_UNKNOWN). Skips shots
// already covered by existing assets. Cap €10 / 31 attempts with an 18% retry reserve + ledger TEMPLATE. €0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRoster, classifyShot, STATUS, loadBeats } from './shot-readiness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const shotlist = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(canon, 'f11-film-timeline.json'), 'utf8'));

const CEIL = 10.0, RESERVE = 0.18, PRODUCTIVE = +(CEIL * (1 - RESERVE)).toFixed(2);
const PRICE = { PREMIUM_VIDEO: 0.60, STILL_ANIMATABLE: 0.03 };
const coveredByScene = Object.fromEntries(timeline.scenes.map(s => [s.scene, (s.existingAssets || []).length]));
const roster = loadRoster();
const beats = loadBeats();

const ordered = [...shotlist.shots].sort((a, b) => parseInt(a.scene.slice(2)) - parseInt(b.scene.slice(2)) || a.id.localeCompare(b.id));
const skipLeft = { ...coveredByScene };
const batch = []; const deferredByStatus = {}; let spend = 0; let capHit = false;

for (const sh of ordered) {
  const id = sh.id.replace(/^F11-/, '');
  if (skipLeft[sh.scene] > 0) { skipLeft[sh.scene]--; continue; }     // already covered by an existing asset
  const cls = classifyShot({ ...sh, id }, roster, beats[sh.scene] || '');
  if (cls.status !== STATUS.READY) { (deferredByStatus[cls.status] ??= []).push({ shot: id, subject: cls.subject, reason: cls.reasons[0] }); continue; }
  const price = PRICE[sh.mediaCategory];
  if (spend + price > PRODUCTIVE + 1e-9) { capHit = true; continue; }  // keep walking: cheaper stills may still fit? stop at first overflow to preserve chronology
  batch.push({ order: batch.length + 1, scene: sh.scene, shot: id, content: sh.content, mediaCategory: sh.mediaCategory, subject: cls.subject,
    maxEur: price, ref: `${cls.subject} (ref on disk)`, method: sh.mediaCategory === 'PREMIUM_VIDEO' ? 'minimax subject_reference (single-subject)' : 'flux-dev still + local Ken-Burns', readyEvidence: cls.readyEvidence,
    note: (sh.mediaCategory === 'STILL_ANIMATABLE' && sh.content === 'ACTION') ? 'ACTION-still: review (upgrade to video if real motion needed)' : undefined });
  spend = +(spend + price).toFixed(2);
  if (spend >= PRODUCTIVE - 1e-9) break;
}

const videoN = batch.filter(b => b.mediaCategory === 'PREMIUM_VIDEO').length;
const stillN = batch.filter(b => b.mediaCategory === 'STILL_ANIMATABLE').length;
const maxAttempts = Math.min(31, Math.ceil(videoN * 1.4) + Math.ceil(stillN * 1.2));
const scenesInBatch = [...new Set(batch.map(b => b.scene))];
const deferredCounts = Object.fromEntries(Object.entries(deferredByStatus).map(([k, v]) => [k, v.length]));

const plan = {
  generated: '2026-10-25', document: 'F11 TRANCHE — €10 CHRONOLOGICAL BATCH v3 (fail-closed classifier). PREPARED, NOT EXECUTED.',
  status: 'NOT an authorization. Paid execution uses the CTO-recorded runs/production-t2/t2-ledger.json (€10/31).',
  classifier: 'shot-readiness.mjs (canonical roster + diacritic-normalised refs + VFX/multi/new-char; FAIL-CLOSED). Only READY shots are included.',
  rosterRefsOnDisk: roster.filter(r => r.hasRef).map(r => r.name),
  cap_EUR: CEIL, productiveBudget_EUR: PRODUCTIVE, retryReservePct: RESERVE * 100,
  batchSize: batch.length, videoShots: videoN, stillShots: stillN, productiveSpendPlanned_EUR: spend, capHitDuringFill: capHit,
  scenesInBatch, batch,
  deferred: { byStatus: deferredCounts, note: 'held in chronological place; production continues with the next READY shot. New characters need a single-subject establishing shot + derived ref; VFX/env need dedicated plates; multi-char needs single-subject reframing or a staging decision (reserved creative).', samples: Object.fromEntries(Object.entries(deferredByStatus).map(([k, v]) => [k, v.slice(0, 6)])) },
  ledgerTemplate: { path: 'runs/production-t2/t2-ledger.json (CTO-recorded)', ceiling_EUR: CEIL, maxAttempts, enforcement: 'reserve-before-call; halt-before-cap' },
  controlsBeforeEachCall: ['shot-readiness classify === READY', 'operating-contract preflight (timeline + lessons + authz + provider)', 'reserve worst-case', 'confirm provider'],
  reconcileAfterEachResult: ['verify integrity/duration/identity/motion/continuity', 'settle or release', 'on timeout GET prediction read-only (PL-5)', 'update timeline + compass'],
  qualityLocked: true, noDoubleCount: 'existing assets excluded via coveredByScene; already-paid separate',
};
writeFileSync(join(canon, 'f11-tranche-10eur-batch.json'), JSON.stringify(plan, null, 1));
console.log(`€10 BATCH v3 (fail-closed classifier; NOT executed): ${batch.length} READY shots | ${videoN} video + ${stillN} still | €${spend}/€${PRODUCTIVE} (cap €${CEIL})`);
console.log(`  scenes: ${scenesInBatch.join(', ')} | first: ${batch[0] ? batch[0].scene + ' ' + batch[0].shot + ' (' + batch[0].subject + ')' : 'none'} | ledger TEMPLATE €${CEIL}/${maxAttempts}att`);
console.log(`  deferred by status: ${JSON.stringify(deferredCounts)}`);
