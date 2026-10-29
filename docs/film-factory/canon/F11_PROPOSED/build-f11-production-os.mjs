// Canonical F11 chronological timeline + asset reconciliation + cost-to-complete scenarios. Non-billed; F10 read-only.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const inv = JSON.parse(readFileSync(join(here, 'f11-scene-inventory.json'), 'utf8'));
const shotlist = JSON.parse(readFileSync(join(here, 'f11-fullfilm-shotlist.json'), 'utf8'));
const byScene = Object.fromEntries(inv.scenes.map(s => [s.id, s]));
const planned = {}; for (const s of shotlist.shots) (planned[s.scene] ??= { content: s.content, shots: 0 }).shots++;

// accepted t1 clips → scene(s) (reuse); status enum: PLANNED/GENERATED/TECHNICALLY_CHECKED/HUMAN_REVIEW_PENDING/ACCEPTED/REJECTED
const ASSETS = {
  SC01: [{ clip: 'E1-sc01-storm-seam', status: 'HUMAN_REVIEW_PENDING', sec: 6.04 }, { clip: 'SC01-astrid-helm', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'ASTRID reads the sea; minimax subject_reference; CIQE MAJOR=audio-absence only (PL-6); identity+tattoo+steering-oar canon-correct' }, { clip: 'A1b-minimax-bjorn-oar', status: 'HUMAN_REVIEW_PENDING', sec: 5.64 }, { clip: 'A3b-tide-brace', status: 'HUMAN_REVIEW_PENDING', sec: 5.64 }, { clip: 'S1-sc01-goldseam', status: 'HUMAN_REVIEW_PENDING', sec: 6.04 }, { clip: 'SC01-olaf-mast (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'OLAF lashed to mast; T2 €0.60; identity+ropes+bronze-arm-ring(SC43 seed) strong; CIQE MAJOR=audio only; CONTINUITY: lighting reads overcast-day — recommend local night-grade to match SC01 night-storm' }],
  SC02: [{ clip: 'SC02-bjorn-deadpan (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN deadpan vs wrong-coloured sea; single-subject; €0.60; identity strong; CIQE MAJOR=audio only' }],
  SC04: [{ clip: 'A4b-march-lead', status: 'HUMAN_REVIEW_PENDING', sec: 5.64 }, { clip: 'SC04-olaf-names (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'OLAF names the impossible; single-subject; €0.60' }, { clip: 'SC04-bjorn-weight (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN takes the leadership weight; single-subject; €0.60' }],
  SC05: [{ clip: 'SC05-meryt-patrol (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'MERYT river-guard, wary authority; single-subject MERYT ref; €0.60; identity strong' }, { clip: 'SC05-bjorn-wary (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN captured, coiled; single-subject; €0.60' }],
  SC17: [{ clip: 'SC17-bjorn-read (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN studies a rune-carved driftwood — "one read right"; minimax subject_reference BJORN-768; T2 €0.60; strong identity, warm Act II ochre; CIQE MAJOR=audio only' }],
  SC06: [{ clip: 'R1-rescue-crewman', status: 'HUMAN_REVIEW_PENDING', sec: 5.64 }, { clip: 'SC06-astrid-call (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'ASTRID calls the tide-read; single-subject; €0.60; identity+star-chart-tattoo consistent' }],
  SC07: [{ clip: 'SC07-bjorn-rage-held (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN rage held, cold standoff; single-subject; €0.60' }],
  SC08: [{ clip: 'SC08-bjorn-witness (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN witnesses grief after a tide; single-subject; €0.60' }],
  SC13: [{ clip: 'SC13-bjorn-caged (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN caged, brooding/planning; single-subject; €0.60' }],
  SC21: [{ clip: 'SC21-bjorn-market (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN surveys market/geography; single-subject foreground; €0.60' }],
  SC14: [{ clip: 'SC14-olaf-charge (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'OLAF hands command to Björn (fading charge); single-subject; €0.60' }],
  SC43: [{ clip: 'SC43-olaf-benediction (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: "OLAF's death/benediction (bronze arm-ring continuity); single-subject; €0.60" }],
  SC38: [{ clip: 'SC38-bjorn-greatsword (T2)', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'BJÖRN swings Himinkljúfr to break the charge; PL-3+PL-4 applied (scale + wool-tunic); €0.60; replaces undersized G1/A2b-v2 pending review' }, { clip: 'G1-greatsword-action', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'older; greatsword undersized (PL-3)' }, { clip: 'A2b-v2-greatsword', status: 'HUMAN_REVIEW_PENDING', sec: 5.64, note: 'older; greatsword undersized (PL-3)' }],
};
const REJECTED = { SC38: ['A2b-greatsword-stance (v1): canon drift — superseded'] };

const scenes = inv.scenes.map((s, i) => ({
  scene: s.id, act: s.act, narrativePurpose: s.beat.slice(0, 90), content: (shotlist.shots.find(x => x.scene === s.id) || {}).content || 'STORY',
  prevScene: i > 0 ? inv.scenes[i - 1].id : null, nextScene: i < inv.scenes.length - 1 ? inv.scenes[i + 1].id : null,
  decisiveAgent: s.decisiveAgent, plannedShots: (planned[s.id] || {}).shots || 0,
  existingAssets: ASSETS[s.id] || [], rejectedAssets: REJECTED[s.id] || [],
  status: (ASSETS[s.id] || []).length ? 'PARTIAL (clips generated, human-review-pending)' : 'PLANNED',
  acceptanceCriteria: 'identity+costume+weapon+env continuity; readable action; full-motion human ≥7.5/10; realized distribution measured on edit',
  measuredRenderedSec: null,
}));
const scenesWithAssets = scenes.filter(s => s.existingAssets.length).length;

// reconciliation of durations (dedup derivatives)
const reconciliation = {
  generatedClips_t1: 9, derivatives: ['sc01-opening-assembly.mp4 (concat)', 'sc01-opening-assembly-v2.mp4 (concat)', 'sc01-opening-assembly-v3.mp4 (concat, 5-shot)'],
  generatedSec: 51.16, uniqueSourceSec: 51.16, usableSec: 45.52, humanAcceptedSec: 0, assembledTimelineSec: 28.96,
  note: 'generated=all 9 t1 clips (added SC01-astrid-helm @6.80 spend); unique=no dup sha; usable=8 clean clips (A2b-v1 rejected); humanAccepted=0 (all HUMAN_REVIEW_PENDING — full-motion acceptance pending); assembled=SC01 v3 (5 shots: storm→Astrid-reads→Björn-oar→peril→gold-seam), silent. Derivatives NOT counted as source.',
};

// cost-to-complete scenarios (measured €0.629/accepted-clip gen; action-first video-heavy; 420 planned shots, reuse factor)
const CLIP = 0.629, DONE_CLIPS = 7;
function scenario(name, acceptPct, reuseFactor, holdSecPerClip) {
  const retry = 1 / acceptPct;
  const totalRuntimeSec = 3600;
  const actionSec = 0.64 * totalRuntimeSec, otherVidSec = 0.25 * totalRuntimeSec; // ~89% of runtime is video-ish
  const videoClipsNeeded = Math.round((actionSec + otherVidSec) / holdSecPerClip / reuseFactor);
  const remainingClips = Math.max(0, videoClipsNeeded - DONE_CLIPS);
  const videoEUR = remainingClips * CLIP * retry;
  const stills = 130 * 0.025, voice = 0.60, music = 0, refs = 3;
  const total = videoEUR + stills + voice + music + refs;
  return { name, acceptPct, reuseFactor, holdSecPerClip, videoClipsNeeded, remainingClips, retryFactor: +retry.toFixed(2), videoEUR: +videoEUR.toFixed(0), stills_voice_refs_EUR: +(stills + voice + refs).toFixed(0), musicSFX_EUR: '0 (CC0, per-file verified)', total_EUR: +total.toFixed(0) };
}
const costToComplete = {
  budgets: { A_spent_confirmed_EUR: 10.23, B_active_cap_EUR: '15 (t1); spent 5.40; remaining 9.60; reserved 0', C_forecast_note: 'ESTIMATE ONLY — not authorization' },
  scenarios: [scenario('OPTIMISTIC', 0.85, 1.6, 9), scenario('EXPECTED', 0.70, 1.4, 8), scenario('CONSERVATIVE', 0.55, 1.3, 7)],
  assumptions: ['measured €0.629/accepted-clip (minimax/seedance mix)', 'holdSecPerClip = each ~5.6s clip covers 7-9s of edit via holds/cuts', 'reuseFactor = a clip serves 1.3-1.6 edit positions', '~89% of runtime is video (action-first); stills for dialogue coverage', 'CC0 music/SFX €0 (per-file verified); voice paid (speech-02-hd)'],
  sensitivity: 'cost scales with 1/acceptance and inversely with reuse/hold; the dominant uncertainty is acceptance rate (measured only at 12.5% rejection on a small curated t1 sample).',
  honesty: 'forecast only; recalc after each completed sequence with actual data. The €130 figure is a planning scenario, NOT authorization. €60-70 is NOT achievable for 60-min action-first.',
};

writeFileSync(join(here, 'f11-film-timeline.json'), JSON.stringify({ generated: '2026-10-25', ssot: true, totalScenes: 49, totalPlannedShots: shotlist.totalShots, scenesWithAssets, reconciliation, scenes }, null, 1));
writeFileSync(join(here, 'f11-cost-to-complete.json'), JSON.stringify({ generated: '2026-10-25', ...costToComplete }, null, 1));
console.log(`TIMELINE: 49 scenes / ${shotlist.totalShots} shots | scenes w/assets ${scenesWithAssets} | usable ${reconciliation.usableSec}s humanAccepted ${reconciliation.humanAcceptedSec}s / assembled ${reconciliation.assembledTimelineSec}s`);
console.log('COST-TO-COMPLETE (forecast, not authorization):');
for (const s of costToComplete.scenarios) console.log(`  ${s.name.padEnd(12)} accept ${s.acceptPct*100}% | ~${s.remainingClips} clips | video €${s.videoEUR} | TOTAL ~€${s.total_EUR}`);
