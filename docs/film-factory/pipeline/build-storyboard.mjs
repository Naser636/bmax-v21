// Phase 1 (local, €0) — builds a structured per-scene/per-shot storyboard from the F10 shot-list + faithful
// prompts, with entering/exiting raccord links, measurable acceptance criteria, and a flagged list of checks that
// REQUIRE human inspection. It also surfaces redundant shots, scenes missing an establisher, insufficient coverage,
// and abrupt palette transitions between adjacent scenes. It NEVER invents events or alters the F10 ending.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

const ordered = [...sl.shots].sort((a, b) => { const na = parseInt(a.scene.slice(2)), nb = parseInt(b.scene.slice(2)); return na !== nb ? na - nb : a.id.localeCompare(b.id); });

const board = ordered.map((s, i) => {
  const prev = ordered[i - 1], next = ordered[i + 1];
  const p = getFaithfulPrompt(s.id);
  return {
    id: s.id, scene: s.scene, act: s.act, sceneHead: s.sceneHead,
    narrativeIntention: s.dramaticFunction || s.sceneHead,
    visibleAction: s.subjectAction || '',
    framing: s.shotType || 'MED', cameraMovement: s.movement || 'static',
    targetSec: s.targetSec || null, kind: s.mediaCategory,
    palette: s.palette, light: s.palette, // light cue folded into palette in F10 data
    characters: (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref),
    props: [], // F10 shot-list carries no per-shot prop list; prop continuity handled in the continuity matrix
    raccordIn: prev ? { from: prev.id, sameScene: prev.scene === s.scene } : null,
    raccordOut: next ? { to: next.id, sameScene: next.scene === s.scene } : null,
    emotionalIntention: s.dramaticFunction || '',
    promptStatus: p?.derived ? 'DRAFT' : 'AUTHORED', promptLinked: !!(p && p.fullPrompt),
    acceptanceCriteria: s.acceptanceCriteria || 'identity match; no drift; readable action; palette consistent; no artifacts',
  };
});

// quality scans (plan-level, deterministic)
const bySceneShots = {}; for (const s of ordered) (bySceneShots[s.scene] ||= []).push(s);
const redundant = [];
for (const [sc, arr] of Object.entries(bySceneShots)) {
  const seen = new Map();
  for (const s of arr) { const key = (s.subjectAction || '').trim().toLowerCase(); if (key && seen.has(key)) redundant.push({ scene: sc, shots: [seen.get(key), s.id], action: s.subjectAction }); else seen.set(key, s.id); }
}
const missingEstablisher = Object.entries(bySceneShots).filter(([sc, arr]) => !arr.some(s => s.id === sc + '-SH01')).map(([sc]) => sc);
const thinCoverage = Object.entries(bySceneShots).filter(([, arr]) => arr.filter(s => s.mediaCategory === 'PREMIUM_VIDEO' || s.mediaCategory === 'STILL_ANIMATABLE').length < 1).map(([sc]) => sc);
// abrupt palette transitions between adjacent scenes (string divergence proxy)
const sceneOrder = [...new Set(ordered.map(s => s.scene))];
const abruptPalette = [];
for (let i = 1; i < sceneOrder.length; i++) {
  const a = bySceneShots[sceneOrder[i - 1]][0].palette || '', b = bySceneShots[sceneOrder[i]][0].palette || '';
  const sa = new Set(a.toLowerCase().split(/\W+/)), sb = new Set(b.toLowerCase().split(/\W+/));
  const inter = [...sa].filter(w => w && sb.has(w)).length; const uni = new Set([...sa, ...sb]).size;
  const jac = uni ? inter / uni : 1;
  if (jac < 0.12) abruptPalette.push({ from: sceneOrder[i - 1], to: sceneOrder[i], paletteSimilarity: Math.round(jac * 100) / 100 });
}

const humanChecks = ['character identity vs reference sheets', 'period/architecture authenticity (Norse∩pharaonic)',
  'emotional performance & gaze', 'action legibility at edit speed', 'wound/costume/prop continuity across scenes',
  'geography & eyeline consistency', 'palette & light mood per sequence', 'overall dramatic rhythm'];

const out = {
  generated: '2026-10-24', totalShots: board.length, totalScenes: sceneOrder.length,
  acceptanceCriteriaNote: 'Per-shot criteria are measurable gates; artistic criteria below REQUIRE human inspection. A present prompt alone never accepts a shot.',
  humanInspectionRequired: humanChecks,
  qualityScan: { redundantShots: redundant, scenesMissingEstablisher: missingEstablisher, scenesThinVisualCoverage: thinCoverage, abruptPaletteTransitions: abruptPalette },
  storyboard: board,
};
writeFileSync(join(here, 'runs/benchmark/storyboard-f10.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ shots: board.length, scenes: sceneOrder.length, redundant: redundant.length, missingEstablisher: missingEstablisher.length, thinCoverage: thinCoverage.length, abruptPalette: abruptPalette.length }, null, 0));
