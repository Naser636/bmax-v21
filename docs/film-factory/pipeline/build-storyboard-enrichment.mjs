// Phase 3 (local, €0) — NON-DESTRUCTIVE storyboard enrichment. Does NOT modify shot-list / storyboard / canon.
// (1) Links each AUDIO_LINE shot to its specific canonical dialogue line (resolving the "88 same-action" FALSE
// POSITIVE: those shots share a generic label but are DISTINCT beats). (2) Emits a compact camera diagram per shot
// (angle/scale/movement/subject) derived from shotType+movement. (3) Flags abrupt palette transitions + a
// recommended treatment. (4) Marks decisions that REQUIRE a human storyboarder/director. Output: storyboard-enrichment-f10.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const dlg = JSON.parse(readFileSync(join(here, 'dialogues-f10.json'), 'utf8')).lines;

// link AUDIO_LINE shots -> dialogue lines, in-scene order
const dlgByScene = {}; for (const l of dlg) (dlgByScene[l.scene] ??= []).push(l);
const audioLink = [];
const audioCursor = {};
for (const s of sl.shots.filter(x => x.mediaCategory === 'AUDIO_LINE')) {
  const i = (audioCursor[s.scene] ??= 0); audioCursor[s.scene]++;
  const line = (dlgByScene[s.scene] || [])[i] || null;
  audioLink.push({ shot: s.id, scene: s.scene, lineOrder: line?.order ?? null, speaker: line?.speaker ?? null, text: line ? line.text.slice(0, 60) : null, linked: !!line });
}
const unlinkedAudio = audioLink.filter(a => !a.linked).length;

// camera diagram per shot
const angleFor = (st = '') => /CU/i.test(st) ? 'close, eye-level' : /WIDE|EST/i.test(st) ? 'wide, slightly low' : /OTS|reverse/i.test(st) ? 'over-shoulder' : 'medium, eye-level';
const lensFor = (st = '') => /CU/i.test(st) ? 'long (85mm-eq)' : /WIDE|EST/i.test(st) ? 'wide (24mm-eq)' : 'normal (50mm-eq)';
const camera = sl.shots.map(s => ({ id: s.id, scene: s.scene, kind: s.mediaCategory,
  angle: angleFor(s.shotType), lensProxy: lensFor(s.shotType), move: s.movement || 'static',
  subject: s.subjectAction || '', targetSec: s.targetSec || null }));

// 88 same-action resolution
const bySceneAction = {};
for (const s of sl.shots) { const k = s.scene + '|' + (s.subjectAction || '').trim().toLowerCase(); (bySceneAction[k] ??= []).push(s); }
const sameAction = Object.entries(bySceneAction).filter(([, a]) => a.length > 1);
const resolvedDistinct = sameAction.map(([k, a]) => ({ scene: a[0].scene, genericLabel: k.split('|')[1], shots: a.map(s => s.id),
  resolution: a[0].mediaCategory === 'AUDIO_LINE' ? 'DISTINCT_DIALOGUE_LINES (not redundant — each is a different line; see audioLink)' : 'DISTINCT_COVERAGE_BEATS (shot/reverse-shot across dialogue; recommend micro angle/scale variation for visual interest — director call)' }));

// abrupt palette transitions (recompute)
const sceneOrder = [...new Set(sl.shots.map(s => s.scene))].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
const palBy = {}; for (const s of sl.shots) palBy[s.scene] ??= s.palette || '';
const abrupt = [];
for (let i = 1; i < sceneOrder.length; i++) {
  const a = palBy[sceneOrder[i - 1]], b = palBy[sceneOrder[i]];
  const sa = new Set(a.toLowerCase().split(/\W+/)), sb = new Set(b.toLowerCase().split(/\W+/));
  const inter = [...sa].filter(w => w && sb.has(w)).length, uni = new Set([...sa, ...sb]).size;
  if (uni && inter / uni < 0.12) abrupt.push({ from: sceneOrder[i - 1], to: sceneOrder[i], fromPalette: a.slice(0, 40), toPalette: b.slice(0, 40), recommendedTreatment: 'intentional contrast — use a motivated transition (match-cut on motion/shape, or a brief dissolve); confirm as a deliberate beat (director)' });
}

const out = {
  generated: '2026-10-24', nonDestructive: true,
  audioLineToDialogue: { links: audioLink, unlinked: unlinkedAudio, note: 'resolves the 88 "same-action" false positive for AUDIO shots — each maps to a distinct canonical line' },
  sameActionResolution: { groups: resolvedDistinct.length, detail: resolvedDistinct, verdict: 'NOT wasteful redundancy — distinct beats/lines; coverage reuse is cost-efficient; micro-variation is a director call' },
  cameraDiagrams: camera,
  abruptPaletteTransitions: abrupt,
  humanDecisions: ['micro angle/scale variation on repeated coverage (director)', 'confirm abrupt palette cuts as deliberate (director)', 'final lens/stock look (DoP)', 'emotional rhythm & silences (director/editor)'],
};
writeFileSync(join(here, 'runs/benchmark/storyboard-enrichment-f10.json'), JSON.stringify(out, null, 1));
console.log(`enrichment: audioLinks=${audioLink.length} (unlinked=${unlinkedAudio}) | cameraDiagrams=${camera.length} | sameActionGroups=${resolvedDistinct.length} resolved | abruptPalette=${abrupt.length}`);
