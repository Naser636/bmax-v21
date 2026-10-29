// Measure the COMPLETE F11 plan (49 scenes) against the 6 LOCKED targets and compute the MINIMUM planning
// adjustments to close gaps — WITHOUT inventing/adding scenes, revising targets, or rewriting canon.
// Governing measure = estimated SCREEN-TIME (of a ~60-min = 3600s edit). Shot-weighted shown too. LABELLED estimates.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
// F11 keeps F10's scene structure/events; reuse F10 shot counts as the baseline screen-time proxy.
const sl = JSON.parse(readFileSync(join(here, '../F10_FROZEN_2026-10-24/shot-list-f10.json'), 'utf8'));
const shotsByScene = {}; for (const s of sl.shots) shotsByScene[s.scene] = (shotsByScene[s.scene] || 0) + 1;

const TARGET = { ACTION: 64, STORY: 13, TENSION: 10, DRAMA: 5, COMEDY: 5, WORLD: 3 }; // LOCKED — never revised
const RUNTIME_SEC = 3600; // ~60 min edit

// F11 content classification (primary function; F11 action-first but scene EVENTS = F10 structure)
const CAT = {
  SC01: 'ACTION', SC03: 'ACTION', SC06: 'ACTION', SC18: 'ACTION', SC21: 'ACTION', SC22: 'ACTION', SC24: 'ACTION', SC25: 'ACTION', SC30: 'ACTION', SC31: 'ACTION', SC32: 'ACTION', SC37: 'ACTION', SC38: 'ACTION', SC39: 'ACTION', SC40: 'ACTION', SC45: 'ACTION', SC46: 'ACTION',
  SC02: 'STORY', SC09: 'STORY', SC12: 'STORY', SC15: 'STORY', SC16: 'STORY', SC17: 'STORY', SC19: 'STORY', SC36: 'STORY', SC41: 'STORY',
  SC05: 'TENSION', SC07: 'TENSION', SC10: 'TENSION', SC11: 'TENSION', SC23: 'TENSION', SC26: 'TENSION', SC34: 'TENSION',
  SC08: 'DRAMA', SC14: 'DRAMA', SC20: 'DRAMA', SC27: 'DRAMA', SC28: 'DRAMA', SC29: 'DRAMA', SC33: 'DRAMA', SC35: 'DRAMA', SC42: 'DRAMA', SC43: 'DRAMA', SC44: 'DRAMA', SC48: 'DRAMA',
  SC13: 'COMEDY',
  SC04: 'WORLD', SC47: 'WORLD', SC49: 'WORLD',
};
const cats = Object.keys(TARGET);
const scenesBy = {}; const shotsBy = {};
for (const [sc, c] of Object.entries(CAT)) { (scenesBy[c] ??= []).push(sc); shotsBy[c] = (shotsBy[c] || 0) + (shotsByScene[sc] || 0); }
const totalShots = sl.shots.length;

// CURRENT estimate (shot-weighted — F11 baseline = F10 structure)
const current = cats.map(c => ({ category: c, scenes: scenesBy[c].length, shots: shotsBy[c] || 0, currentShotPct: +((shotsBy[c] || 0) / totalShots * 100).toFixed(1) }));

// TARGET screen-time allocation + feasibility of the per-scene duration it implies
const plan = cats.map(c => {
  const tgtSec = Math.round(TARGET[c] / 100 * RUNTIME_SEC);
  const n = scenesBy[c].length;
  const perSceneSec = n ? +(tgtSec / n).toFixed(0) : 0;
  // plausibility bands per type (seconds per scene): action set-pieces long; dialogue/drama need ≥ ~45s to land
  const minPlausible = { ACTION: 40, STORY: 40, TENSION: 40, DRAMA: 45, COMEDY: 30, WORLD: 20 }[c];
  const maxPlausible = { ACTION: 240, STORY: 150, TENSION: 150, DRAMA: 180, COMEDY: 120, WORLD: 90 }[c];
  const feasible = n > 0 && perSceneSec >= minPlausible && perSceneSec <= maxPlausible;
  return { category: c, targetPct: TARGET[c], targetSec: tgtSec, targetMin: +(tgtSec / 60).toFixed(1), scenes: n, perSceneSecRequired: perSceneSec, plausibleBand: `${minPlausible}-${maxPlausible}s/scene`, feasible, flag: feasible ? 'OK' : (n === 0 ? 'NO SCENES in this category' : perSceneSec < minPlausible ? `IMPLAUSIBLE: ${perSceneSec}s/scene < ${minPlausible}s — too little time for ${n} scenes` : `IMPLAUSIBLE: ${perSceneSec}s/scene > ${maxPlausible}s`) };
});

const gaps = current.map(c => ({ category: c.category, currentShotPct: c.currentShotPct, targetPct: TARGET[c.category], gapPts: +(TARGET[c.category] - c.currentShotPct).toFixed(1) }));
const blockers = plan.filter(p => !p.feasible);

const out = {
  generated: '2026-10-24',
  mission: 'Complete F11 plan measured vs 6 LOCKED targets + minimum adjustments. Targets fixed; no scene invented; no canon change; €0.',
  lockedTarget: TARGET, runtimeSecAssumed: RUNTIME_SEC,
  governingMeasure: 'estimated SCREEN-TIME (target allocation of ~60-min runtime). Shot-weighted shown as a cross-check. ALL ESTIMATES until a RENDERED edit is measured.',
  contentClassification: Object.fromEntries(Object.entries(CAT).sort((a, b) => parseInt(a[0].slice(2)) - parseInt(b[0].slice(2)))),
  sceneCountsByCategory: Object.fromEntries(cats.map(c => [c, scenesBy[c].length])),
  currentEstimate_shotWeighted: current,
  gapsToTarget_shotWeighted: gaps,
  targetScreenTimePlan: plan,
  minimumAdjustments: [
   'ACTION (+25.7pts): extend the 17 action scenes to carry 38.4 min (~2.3 min/scene set-pieces) — feasible for an action film; apply movement contracts + intensify-staging (0 plot change).',
   'DRAMA (−19.3pts): tighten the 12 drama scenes toward a 5% = 3-min budget.',
   'TENSION (−6.4pts): trim toward 10% = 6 min across 7 scenes.',
   'COMEDY (+2.6pts): give SC13 (+ light crew beats in action scenes) the 5% = 3-min budget.',
  ],
  comedyNote: 'The COMEDY "180s/1-scene" flag is an ARTIFACT of primary-function classification. F11 delivers comedy as DISTRIBUTED BEATS across 13 scenes (SC02,10,13,16,18,19,20,21,30,33,40,44,49 — per the inventory `comedy` fields), which can plausibly carry the 5% (~3 min) budget. An accurate comedy % needs BEAT/shot-level tagging, not whole-scene classification. So comedy is NOT a structural blocker — it is already spread across the film.',
  structuralBlocker: {
   severity: 'MUST-RESOLVE (human editorial) — DRAMA only',
   finding: 'DRAMA: 12 whole drama scenes vs a 5% (3-min) budget → ~15s/scene, IMPLAUSIBLE for emotional beats.',
   explanation: 'The F11 scene SET inherits F10 drama-heavy structure (12 DRAMA scenes). Unlike comedy (beats-within-scenes), drama needs WHOLE scenes to land. A 3-min drama budget across 12 scenes is not plausible → closing to the locked 5% requires a HUMAN editorial decision to MERGE/compress/relegate drama scenes (reduce their footprint) — NOT adding/removing canon events, NOT revising the locked target.',
   notABlocker: ['comedy (distributed beats, resolves at beat-level)', 'action/story/tension/world (per-scene durations plausible)'],
  },
  honesty: '64% action is NOT claimed achieved. This is a PLAN measured by estimate; only a RENDERED edit measured on real footage confirms the realized distribution. Full-prose dialogue SC08–49 remains to be authored (opening SC01–07 done).',
};
writeFileSync(join(here, 'f11-fullfilm-distribution-plan.json'), JSON.stringify(out, null, 1));
console.log('F11 WHOLE-FILM vs LOCKED targets (shot-weighted current):');
for (const g of gaps) console.log(`  ${g.category.padEnd(8)} current ${String(g.currentShotPct).padStart(4)}% → target ${String(g.targetPct).padStart(2)}% | gap ${g.gapPts > 0 ? '+' : ''}${g.gapPts}`);
console.log('\nscreen-time plan feasibility:');
for (const p of plan) console.log(`  ${p.category.padEnd(8)} ${p.targetMin}min / ${p.scenes} sc = ${p.perSceneSecRequired}s/scene [${p.flag}]`);
