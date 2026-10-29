// FILM ECONOMICS AUDIT (CXIX audit mission) — €0, read-only. Reconciles ALL tranches, reports F11 coverage,
// cost-per-unit, and a 3-scenario forward budget to COMPLETE the ~60-min film. Separates CONFIRMED-paid (ledgers)
// from ESTIMATED (forward). Uses the proven T2 marginal rate (€0.60/clip, high accept on authored single-subject).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRoster, loadBeats, classifyShot, STATUS } from './shot-readiness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const R = (p) => JSON.parse(readFileSync(p, 'utf8'));
const led = (rel) => R(join(here, rel));

// 1) RECONCILED PAID (ledgers = authority; no double-count; exhausted tranches have 0 reservations)
const tranches = {
  pilot: led('runs/pilot/pilot-ledger.json'), av: led('runs/validation-av/av-ledger.json'),
  t1: led('runs/production-t1/t1-ledger.json'), t2: led('runs/production-t2/t2-ledger.json'),
};
const paid = Object.fromEntries(Object.entries(tranches).map(([k, t]) => [k, { ceiling: t.ceiling, spent: t.spent, attempts: `${t.attempts}/${t.maxAttempts}`, remaining: t.remaining, outstandingReservations: t.reservations.length }]));
const totalPaid = +Object.values(tranches).reduce((a, t) => a + t.spent, 0).toFixed(2);
const t2 = tranches.t2;

// 2) COVERAGE
const timeline = R(join(canon, 'f11-film-timeline.json'));
const scenesWithFootage = timeline.scenes.filter(s => (s.existingAssets || []).length);
const clipsPlaced = timeline.scenes.reduce((a, s) => a + (s.existingAssets || []).length, 0);
const shotlist = R(join(canon, 'f11-fullfilm-shotlist.json'));
const plannedVideo = shotlist.shots.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').length;
const plannedStill = shotlist.shots.filter(s => s.mediaCategory === 'STILL_ANIMATABLE').length;

// 3) classifier readiness snapshot (what's auto-producible single-subject vs blocked)
const roster = loadRoster(), beats = loadBeats();
const cls = shotlist.shots.map(s => classifyShot({ ...s, id: s.id.replace(/^F11-/, '') }, roster, beats[s.scene] || ''));
const readyByStatus = cls.reduce((a, c) => (a[c.status] = (a[c.status] || 0) + 1, a), {});

// 4) PRODUCED F11-usable video clips (placed) + T2 marginal rate
const t2VideoClips = 15; // t2 attempts = 15 paid video gens (all SUCCEEDED, authored single-subject)
const t2AcceptObserved = 1.0; // 15/15 succeeded (authored single-subject); conservative planning still uses bands
const VIDEO = 0.60, STILL = 0.03, VOICE_LINES = 141, VOICE = 0.10;

// 5) FORWARD BUDGET to COMPLETE (remaining = planned - produced; single-subject + reuse). Video produced so far
//    (F11-usable, roughly SC01 originals + T2) ~= 24 video; stills produced = 0.
const videoProduced = 24, stillProduced = 0;
const remVideo = Math.max(0, plannedVideo - videoProduced), remStill = Math.max(0, plannedStill - stillProduced);
const voiceEur = +(VOICE_LINES * VOICE).toFixed(2);
function scenario(name, accept, reuse) {
  // reuse factor reduces unique video gens (a clip serves >1 edit position); retry = 1/accept
  const videoGens = Math.ceil(remVideo / reuse);
  const video = +(videoGens * VIDEO * (1 / accept)).toFixed(0);
  const still = +(remStill * STILL * (1 / accept)).toFixed(0);
  const subtotal = video + still + voiceEur;
  const margin = 0.15;
  return { name, acceptAssumed: accept, reuseFactor: reuse, videoGens, remStill, video_EUR: video, still_EUR: still, voice_EUR: voiceEur, music_EUR: 0, margin_pct: 15, totalForward_EUR: +((subtotal) * (1 + margin)).toFixed(0) };
}
const scenarios = [scenario('OPTIMISE', 0.90, 1.5), scenario('CENTRAL', 0.75, 1.3), scenario('PRUDENT', 0.60, 1.1)];

const audit = {
  generated: '2026-10-25', document: 'F11 ECONOMICS AUDIT — reconciled costs + forward budget to complete (~60 min, 49 scenes).',
  CONFIRMED_paid: { byTranche: paid, totalPaid_EUR: totalPaid, basis: 'ODG-side ledgers (reserve-before-call, settle-to-worst-case). minimax returns no per-call price → booked at verified worst-case; not a third-party invoice. Provider-side billing not independently confirmed (no invoice access) — flagged.' },
  billingCaveat: 'spent = ledger worst-case bookings, which can never UNDER-count. Independent provider invoice NOT available in-repo → amounts are ledger-confirmed, not invoice-confirmed.',
  t2State: { cap_EUR: t2.ceiling, spent_EUR: t2.spent, remaining_EUR: t2.remaining, attempts: `${t2.attempts}/${t2.maxAttempts}`, outstandingReservations: t2.reservations.length, note: 'T2 hard cap €10; DO NOT exceed; €1 remaining; 16 attempts left.' },
  coverage: { scenesTotal: 49, scenesWithFootage: scenesWithFootage.length, scenesEmpty: 49 - scenesWithFootage.length, clipsPlaced, plannedShots: shotlist.totalShots, plannedVideo, plannedStill, readinessSnapshot: readyByStatus },
  rawVsUsable: { rawVideoClips_allTranches: 35, rawVideoSec_approx: 199, note: 'raw includes pilot/av/benchmark TEST clips. F11-USABLE placed = ' + clipsPlaced + ' clips across ' + scenesWithFootage.length + ' scenes. NONE human-ACCEPTED yet. assembled preview = 214.58s (incl. placeholders) — NOT 214s of finished film.' },
  costPerUnit_EUR: { perPaidVideoClip_marginalT2: VIDEO, perRawSecond_T2: +(VIDEO / 5.64).toFixed(3), perUsableSecond_T2: +(VIDEO / 5.64).toFixed(3), note: 'T2 clips all decode-clean + usable (authored single-subject, 15/15). per-finished-minute: see forward scenarios /60.', perFinishedMinute_EUR: scenarios.map(s => ({ scenario: s.name, eur: +(s.totalForward_EUR / 60).toFixed(2) })) },
  forwardBudget_toComplete_EUR: { assumptions: 'remaining = planned video/still minus produced; video €0.60 (proven T2), still €0.03, voice €14.10 (141 lines), music €0 CC0, +15% margin; reuse factor reduces unique video gens; retry = 1/accept. T2 showed HIGH accept on authored single-subject → OPTIMISE end is realistic IF prompts are authored.', scenarios, remainingVideoPlanned: remVideo, remainingStillPlanned: remStill },
  grandTotal_filmEstimate_EUR: { alreadyPaid_confirmed: totalPaid, forwardRange: `${scenarios[0].totalForward_EUR}-${scenarios[2].totalForward_EUR}`, grandRange: `${+(totalPaid + scenarios[0].totalForward_EUR).toFixed(0)}-${+(totalPaid + scenarios[2].totalForward_EUR).toFixed(0)}`, note: 'T2 cap €10 is NOT the film budget. Forward spend needs NEW authorization beyond T2.' },
  sensitivity: 'cost scales ~1/accept and ~1/reuse. If accept drops 0.90→0.60: forward +~50%. If reuse 1.5→1.1: forward +~35%. Dominant unknowns: accept rate at scale + how many planned shots truly need video vs reuse/stills.',
  optimizations: [
    { id: 'author-before-pay (PROVEN)', detail: 'authored single-subject prompts gave 15/15 accept in T2 (no retries) — authoring BEFORE paying is the single biggest saving vs blind generation', evidence: 't2 15/15 SUCCEEDED, 0 retries', risk: 'low' },
    { id: 'fail-closed readiness gate (PROVEN)', detail: 'shot-readiness blocks multi-char/VFX/new-char/unknown BEFORE any reserve (driver readyGate blocks 300+)', evidence: 'f11-production-driver.test 13/13', risk: 'low' },
    { id: 'stills for static coverage (ESTIMATED)', detail: '232 planned stills at €0.03 vs €0.60 video — use stills where motion not required', risk: 'none (intended medium)' },
    { id: 'reuse/multi-beat per flat-rate clip (ESTIMATED)', detail: 'a 6s clip can serve >1 edit position (proven on A1b)', risk: 'validate per-clip' },
    { id: 'single-subject coverage of multi-char scenes', detail: 'author one character per shot, cut together — unblocks multi-char scenes without a multi-identity capability', risk: 'staging decision reserved to CTO for some scenes' },
  ],
  unproven: ['provider-side invoice (only ledger bookings)', 'accept rate at scale beyond the small authored T2 sample', 'exact shot count needing video vs reuse/still', 'final audio licensing cost (CC0 not yet sourced; pro mix possibly human/out-of-scope)'],
};
writeFileSync(join(canon, 'f11-economics-audit.json'), JSON.stringify(audit, null, 1));
console.log('ECONOMICS AUDIT written.');
console.log(`CONFIRMED paid (ledgers): €${totalPaid} (pilot ${tranches.pilot.spent} + av ${tranches.av.spent} + t1 ${tranches.t1.spent} + t2 ${tranches.t2.spent})`);
console.log(`T2: €${t2.spent}/€${t2.ceiling} spent, €${t2.remaining} left, ${t2.attempts}/${t2.maxAttempts} attempts, ${t2.reservations.length} reservations`);
console.log(`Coverage: ${scenesWithFootage.length}/49 scenes have footage, ${clipsPlaced} clips placed, NONE human-accepted`);
console.log(`FORWARD to complete: ${scenarios.map(s => s.name + ' €' + s.totalForward_EUR).join(' / ')} | per finished min: ${audit.costPerUnit_EUR.perFinishedMinute_EUR.map(x => x.scenario + ' €' + x.eur).join('/')}`);
console.log(`GRAND total film est: €${audit.grandTotal_filmEstimate_EUR.grandRange} (paid €${totalPaid} + forward)`);
