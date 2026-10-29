// 49-SCENE CONDUCTOR for F10 — a readable+verifiable artifact built ONLY from existing F10 sources (shot-list,
// video/still prompts, voice bible, music cues, ref bible, continuity ledger, narrative functions). Invents no
// dialogue/scene/media. Separates FACTS (from F10/registers) from STAGING INTENTIONS and TO-PRODUCE. Dry-run, €0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRealization, antiSlideshowGate, dramaticFunctionGate } from './realization-plan-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

const SL = read('shot-list-f10.json');
const cont = read('continuity-ledger-f10.json');
const real = buildRealization();
const fn = dramaticFunctionGate();
const slideshow = antiSlideshowGate(real);
const parts = F10.split(/## Draft F7 status/)[0].split(/^### /m).slice(1);

// timing model (same constants as duration-proof / scene-timing) → per-scene staged lo/hi
const FLOORS = { '1.':150,'3.':90,'16.':120,'17.':90,'22.':90,'23.':90,'24.':120,'28.':90,'29.':180,'30.':90,'30A':75,'35.':60,'36.':150,'18B':135,'14A':120,'37.':45 };
const RL = { cue: [10, 18], word: [0.30, 0.52] };
// script-scene number per positional scene (leading token of head, e.g. "30A." -> "30A")
const scriptNum = head => (head.match(/^\d+[A-Z]?/) || [''])[0];

const rows = parts.map((p, i) => {
  const scId = 'SC' + String(i + 1).padStart(2, '0');
  const head = p.split('\n')[0].trim();
  const sNum = scriptNum(head);
  const matrixTag = (p.match(/\[(MATRIX-NEW|F8-ACTION|F10-STAGING|F7-STAGING)[^\]]*\]/) || [''])[0];
  const firstStage = (p.match(/^\*(?!\*)([\s\S]*?)\*\s*$/m) || [, ''])[1].replace(/\s+/g, ' ').trim();
  const sceneShots = SL.shots.filter(s => s.scene === scId);
  const realShots = real.shots.filter(s => s.scene === scId);
  const cues = (p.match(/^\*\*[A-ZÀ-Þ][A-ZÀ-Þ\- ]+?:\*\*/gm) || []).length;
  const aw = ((p.match(/^\*(?!\*)[\s\S]*?\*$/gm) || []).join(' ').replace(/[*_()]/g, ' ').split(/\s+/).filter(Boolean).length);
  let lo = cues * RL.cue[0] + aw * RL.word[0], hi = cues * RL.cue[1] + aw * RL.word[1];
  const fk = Object.keys(FLOORS).find(k => head.startsWith(k));
  if (fk) { lo = Math.max(lo, FLOORS[fk]); hi = Math.max(hi, FLOORS[fk] * 1.4); }
  const genSec = sceneShots.reduce((a, s) => a + (s.targetSec || 0), 0);
  const classes = {}; for (const s of realShots) classes[s.classification] = (classes[s.classification] || 0) + 1;
  // continuity raccords touching this scene (ledger states with this script scene number)
  const raccords = cont.threads.flatMap(t => t.states.filter(st => String(st.scene) === sNum).map(st => `${t.thread}: ${st.state}`));
  const characters = [...new Set(sceneShots.flatMap(s => (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref)))];
  const sceneFlags = slideshow.filter(f => f.scene === scId).map(f => ({ cause: f.cause, status: f.status }));
  const fnRow = fn.rows[i];
  return {
    order: i + 1, scene: scId, scriptScene: sNum, head,                                   // FACT
    dramaticFunctions: fnRow.functions,                                                   // FACT (F10-signal-derived)
    objectiveEvolutionConsequence: (matrixTag || firstStage.slice(0, 140)) || head,        // FACT (F10 tag/stage dir)
    bringsNew: fnRow.functions.length ? fnRow.functions.join('+') : 'NONE — flagged',      // FACT
    shotsInOrder: sceneShots.map(s => ({ id: s.id, media: s.mediaCategory, type: s.shotType, speaker: s.mediaCategory === 'AUDIO_LINE' ? (s.subjectAction.split(' — ')[0]) : null, class: (realShots.find(r => r.id === s.id) || {}).classification, targetSec: s.targetSec, fnJustification: s.mediaCategory === 'AUDIO_LINE' ? 'carries a dialogue line' : s.shotType.includes('WIDE') ? 'establish geography' : s.mediaCategory === 'PREMIUM_VIDEO' ? 'motion is the point' : s.mediaCategory === 'MUSIC_CUE' ? 'scored cue (overlay)' : 'reaction/insert coverage' })), // FACT
    movement: { human: classes.ESSENTIAL_HUMAN_MOVEMENT || 0, environment: classes.ENVIRONMENT_MOVEMENT || 0, cameraOnlyEstablishers: sceneShots.filter(s => s.shotType.includes('WIDE')).length }, // FACT (classified)
    dialogueLines: cues, musicCues: sceneShots.filter(s => s.mediaCategory === 'MUSIC_CUE').length,
    silent: cues === 0,
    soundIntention: cues === 0 ? 'intentional silence / score+ambience carry' : 'FR dialogue (voice bible) + ambience; silence where marked', // INTENTION
    transitions: i === 0 ? 'cold open' : 'cut/dissolve per edit-plan (INTENTION)',        // INTENTION
    continuityRaccords: raccords.length ? raccords : ['(no ledger-tracked state change in this scene)'], // FACT
    characters,                                                                           // FACT
    durations: { stagedLoSec: Math.round(lo), stagedHiSec: Math.round(hi), generatedOutputSec: genSec, note: 'staged = THEORETICAL screen band; generatedOutput = raw clips; FINAL only from a real export (none yet)' }, // FACT + distinction
    coverageAssumptions: genSec < (lo) ? `screen (${Math.round(lo)}-${Math.round(hi)}s) > generated (${genSec}s): relies on hold/reuse — UNPROVEN until real cut` : 'generated ≈ screen', // FACT (flagged)
    dependencies: sceneShots.length > 1 ? `coverage/insert shots depend on ${scId}-SH01 accepted` : 'none',
    risks: sceneFlags.length ? sceneFlags : [{ cause: 'none at current thresholds', status: 'OK' }], // FACT (risk indicators, not quality proof)
    toProduce: 'ALL media TO_CREATE (no real media exists)',                               // TO-PRODUCE
  };
});

const totalLo = rows.reduce((a, r) => a + r.durations.stagedLoSec, 0);
const totalHi = rows.reduce((a, r) => a + r.durations.stagedHiSec, 0);
const totalGen = rows.reduce((a, r) => a + r.durations.generatedOutputSec, 0);
const out = {
  generated: 'F10 49-scene conductor (PREP; readable+verifiable; NOT a produced cut)', reference: '37_SCREENPLAY_60MIN_F10.md',
  budgetAuthorizedThisMission: 0, scenes: rows.length,
  durationReconciliation: {
    theoreticalScenarioMin: { lo: Math.round(totalLo / 60 * 10) / 10, hi: Math.round(totalHi / 60 * 10) / 10 },
    plannedEditTargetMin: 60,
    realExportedMeasuredMin: null,
    note: '60:00 ∈ staged band but NOT validated — only a real exported+measured file can validate runtime (none exists).',
    generatedCoverageMin: Math.round(totalGen / 60 * 10) / 10,
  },
  dramaticFunctionGate: { allPass: fn.allPass, flags: fn.flags, sc47: fn.sc47Verdict },
  legend: 'FACT = from F10/registers · INTENTION = staging choice · TO-PRODUCE = not yet made. No media produced; no artistic validation.',
  rows,
};
writeFileSync(new URL('./scene-conductor-f10.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`scene-conductor-f10: ${rows.length} scenes | functionGate allPass=${fn.allPass} flags=${fn.flags.length} | theoretical ${out.durationReconciliation.theoreticalScenarioMin.lo}-${out.durationReconciliation.theoreticalScenarioMin.hi}min, editTarget 60, realExport NONE | generated ${out.durationReconciliation.generatedCoverageMin}min | €0`);
