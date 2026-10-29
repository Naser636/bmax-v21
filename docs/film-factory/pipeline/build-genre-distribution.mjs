// Measure the current film's genre/content distribution against the CTO's locked 6-category target.
// Mechanism: each of the 49 canonical scenes is assigned ONE PRIMARY content function (transparent map below,
// derived from the canonical scene heads + action-audit-49). Current share is SHOT-WEIGHTED (a better screen-time
// proxy than scene-count). This is an APPROXIMATION by primary-function — NOT a per-minute runtime measurement,
// and NOT a canon change. No paid call. No screenplay edit.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const shotsByScene = {}; for (const s of sl.shots) shotsByScene[s.scene] = (shotsByScene[s.scene] || 0) + 1;

// CTO-locked targets (%)
const TARGET = { ACTION: 64, STORY: 13, TENSION: 10, DRAMA: 5, COMEDY: 5, WORLD: 3 };
const LABEL = { ACTION: 'Action & combats', STORY: 'Histoire/récit/dialogues', TENSION: 'Tension & suspense', DRAMA: 'Drame & émotion', COMEDY: 'Comédie', WORLD: 'Monde/paysages/atmosphère' };

// primary-function map (ACTION = the 17 action-capable scenes from action-audit-49; others by canonical head/content)
const MAP = {
  SC01: 'ACTION', SC03: 'ACTION', SC06: 'ACTION', SC18: 'ACTION', SC21: 'ACTION', SC22: 'ACTION', SC24: 'ACTION', SC25: 'ACTION', SC30: 'ACTION', SC31: 'ACTION', SC32: 'ACTION', SC37: 'ACTION', SC38: 'ACTION', SC39: 'ACTION', SC40: 'ACTION', SC45: 'ACTION', SC46: 'ACTION',
  SC02: 'STORY', SC09: 'STORY', SC12: 'STORY', SC15: 'STORY', SC16: 'STORY', SC17: 'STORY', SC19: 'STORY',
  SC05: 'TENSION', SC07: 'TENSION', SC10: 'TENSION', SC11: 'TENSION', SC23: 'TENSION', SC26: 'TENSION', SC34: 'TENSION', SC36: 'TENSION', SC41: 'TENSION',
  SC08: 'DRAMA', SC14: 'DRAMA', SC20: 'DRAMA', SC27: 'DRAMA', SC28: 'DRAMA', SC29: 'DRAMA', SC33: 'DRAMA', SC35: 'DRAMA', SC42: 'DRAMA', SC43: 'DRAMA', SC44: 'DRAMA', SC48: 'DRAMA',
  SC13: 'COMEDY',
  SC04: 'WORLD', SC47: 'WORLD', SC49: 'WORLD',
};
const totalShots = sl.shots.length, totalScenes = 49;
const byCatShots = {}, byCatScenes = {};
for (const [scene, cat] of Object.entries(MAP)) { byCatShots[cat] = (byCatShots[cat] || 0) + (shotsByScene[scene] || 0); byCatScenes[cat] = (byCatScenes[cat] || 0) + 1; }

const rows = Object.keys(TARGET).map(cat => {
  const shotPct = +((byCatShots[cat] || 0) / totalShots * 100).toFixed(1);
  const scenePct = +((byCatScenes[cat] || 0) / totalScenes * 100).toFixed(1);
  const gap = +(TARGET[cat] - shotPct).toFixed(1);
  return { category: cat, label: LABEL[cat], targetPct: TARGET[cat], currentShotPct: shotPct, currentScenePct: scenePct, scenes: byCatScenes[cat] || 0, shots: byCatShots[cat] || 0, gapPts: gap, direction: gap > 0 ? 'UNDER (needs more)' : gap < 0 ? 'OVER (needs less)' : 'on target' };
});
const sumTarget = Object.values(TARGET).reduce((a, b) => a + b, 0);

const out = {
  generated: '2026-10-24',
  mission: 'Genre/content distribution — locked 6-category target vs measured current film.',
  target: TARGET, targetSum: sumTarget,
  measurementMechanism: 'Each of 49 canonical scenes assigned ONE primary content function (transparent MAP). Current share = SHOT-WEIGHTED (shots per category / 420). APPROXIMATION by primary-function; NOT per-minute runtime; action cross-checks to the 23.7-min study (≈39.5% runtime).',
  limitations: ['scenes serve multiple functions — primary-function is a simplification', 'shot-weight ≈ screen-time but is not measured minutes', 'classification of borderline scenes (e.g. SC16 lesson, SC34 confession) is a documented judgement, not canon'],
  distribution: rows,
  biggestGaps: rows.slice().sort((a, b) => Math.abs(b.gapPts) - Math.abs(a.gapPts)).slice(0, 3).map(r => `${r.category} ${r.gapPts > 0 ? '+' : ''}${r.gapPts}pts (${r.direction})`),
  canonSafeNote: 'Reaching the targets must NOT add/remove canonical events. Levers: edit emphasis, scene-duration dialing within the timing band, intensify-staging (0 plot change), and selective shot generation — NOT scenario rewrite.',
  perSceneClassification: Object.fromEntries(Object.entries(MAP).sort((a, b) => parseInt(a[0].slice(2)) - parseInt(b[0].slice(2))).map(([s, c]) => [s, { category: c, shots: shotsByScene[s] || 0 }])),
};
writeFileSync(join(here, 'runs/benchmark/genre-distribution-f10.json'), JSON.stringify(out, null, 1));
console.log('GENRE DISTRIBUTION (target vs current shot-weighted):');
for (const r of rows) console.log(`  ${r.category.padEnd(8)} target ${String(r.targetPct).padStart(2)}% | current ${String(r.currentShotPct).padStart(4)}% (${r.scenes} sc / ${r.shots} sh) | gap ${r.gapPts > 0 ? '+' : ''}${r.gapPts}pts ${r.direction}`);
console.log('target sum:', sumTarget + '%');
