// Regenerate the F11 OPENING (SC01–07) shot-list + movement contracts from the F11 inventory, and MEASURE its
// content distribution (shot-weighted AND estimated screen-time) vs the locked 64/13/10/5/5/3 target.
// NON-billed, no F10 change, no F11 approval. Estimates are LABELLED; 64% is NOT claimed achieved (nothing rendered).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const inv = JSON.parse(readFileSync(join(here, 'f11-scene-inventory.json'), 'utf8'));
const byScene = Object.fromEntries(inv.scenes.map(s => [s.id, s]));

// per-scene shot spec: content category + (video@sec count, coverage@sec count) → an action-first opening
const SPEC = {
  SC01: { content: 'ACTION', video: [10, 6], cover: [4, 4] },
  SC02: { content: 'COMEDY', video: [0, 0], cover: [3, 3.5] },
  SC03: { content: 'ACTION', video: [7, 6], cover: [2, 4] },
  SC04: { content: 'WORLD', video: [3, 6], cover: [1, 4] },      // two-sun establishers
  SC05: { content: 'TENSION', video: [1, 5], cover: [4, 4] },
  SC06: { content: 'ACTION', video: [9, 6], cover: [3, 4] },
  SC07: { content: 'TENSION', video: [0, 0], cover: [5, 4] },
};
const TARGET = { ACTION: 64, STORY: 13, TENSION: 10, DRAMA: 5, COMEDY: 5, WORLD: 3 };

const shots = [];
for (const [sc, sp] of Object.entries(SPEC)) {
  let n = 0;
  const mk = (kind, dur) => { n++; const id = `F11-${sc}-SH${String(n).padStart(2, '0')}`; shots.push({ id, scene: sc, content: sp.content, mediaCategory: kind === 'v' ? 'PREMIUM_VIDEO' : 'STILL_ANIMATABLE', durationSec: dur, björnAction: byScene[sc].bjornBeat || null, promptSeed: `${byScene[sc].beat.slice(0, 90)} | canon: steering-oar not wheel, Björn+Himinkljúfr, photoreal` }); };
  for (let i = 0; i < sp.video[0]; i++) mk('v', sp.video[1]);
  for (let i = 0; i < sp.cover[0]; i++) mk('c', sp.cover[1]);
}

// distribution: shot-weighted + screen-time estimate
const cats = Object.keys(TARGET);
const shotBy = {}, secBy = {}; let totSec = 0;
for (const s of shots) { shotBy[s.content] = (shotBy[s.content] || 0) + 1; secBy[s.content] = (secBy[s.content] || 0) + s.durationSec; totSec += s.durationSec; }
const dist = cats.map(c => ({ category: c, target: TARGET[c], shotPct: +(((shotBy[c] || 0) / shots.length) * 100).toFixed(1), screenTimeEstPct: +(((secBy[c] || 0) / totSec) * 100).toFixed(1), shots: shotBy[c] || 0, sec: secBy[c] || 0 }));

// movement contracts for the action scenes (Björn physical action)
const contracts = [
  { scene: 'SC01', beat: 'storm — Björn hauls the steering-oar; the crest becomes the seam', initial: 'SŌLFARI beam-on to a hill-high black wave; BJÖRN hauls the steering-oar by main strength, Himinkljúfr on his back; OLAF lashed, failing; ASTRID shouting reads', trajectory: 'Björn throws his full weight to take the wave bow-first; the crest curls to break', contact: 'where foam should be the water UNRAVELS into a seam of gold light', consequence: 'the ship is driven through; Björn useless against the sea (deep-water dread seeded)', final: 'SŌLFARI slews on; crew thrown', raccord: 'hard cut to the two-worlds stack (SC03)', weaponCostume: 'Himinkljúfr slung (not drawn); crew soaked; Olaf grey', camera: 'locked wide → hard push on the unravelling crest', durationSec: 6 },
  { scene: 'SC03', beat: 'the crossing — Björn tries to cut the light, fails (flaw)', initial: 'two worlds stack (storm above, desert below)', trajectory: 'Björn draws Himinkljúfr and swings at the seam of light', contact: 'the blade passes through light/water — nothing to cut', consequence: 'the sword is useless here — the thesis of his arc is planted', final: 'the ship is driven onto the impossible shore', raccord: 'cut to the two-sun shore (SC04)', weaponCostume: 'Himinkljúfr DRAWN then sheathed; no damage dealt', camera: 'vertigo tilt between the stacked worlds', durationSec: 6 },
  { scene: 'SC06', beat: 'first tide — muscle on her mind (Björn hauls IPU clear on Astrid\'s read)', initial: 'on the strand; a sudden WRONG tide gathers; ASTRID senses it', trajectory: 'ASTRID calls the line; BJÖRN sprints and bodily hauls IPU and a guard off the strand', contact: 'the water takes the strand a beat behind them', consequence: 'lives saved by HER read + HIS strength — first grudging trust', final: 'Björn sets IPU down, soaked, staring at Astrid (he acted without understanding)', raccord: 'cut to Meryt\'s reaction / Seth-Nakht\'s arrival (SC07)', weaponCostume: 'Himinkljúfr slung; no kill; no gore', camera: 'tracking sprint, then a tight two-shot Björn↔Astrid', durationSec: 6 },
];

writeFileSync(join(here, 'f11-opening-shotlist.json'), JSON.stringify({ generated: '2026-10-24', scope: 'F11 opening SC01–07 (DRAFT)', totalShots: shots.length, totalSecEst: totSec, shots }, null, 1));
writeFileSync(join(here, 'f11-opening-movement-contracts.json'), JSON.stringify({ generated: '2026-10-24', note: 'Björn action contracts for the opening action scenes', contracts }, null, 1));
writeFileSync(join(here, 'f11-opening-distribution.json'), JSON.stringify({
  generated: '2026-10-24', scope: 'OPENING SC01–07 ONLY (setup-weighted; NOT the whole-film distribution)',
  target: TARGET, totalShots: shots.length, totalSecEst: totSec,
  distribution: dist,
  bases: { shotWeighted: 'shots per content-category / total shots (ESTIMATE)', screenTimeEst: 'summed per-shot DURATION ESTIMATES / total (ESTIMATE — NOT measured minutes)' },
  honesty: 'These are ESTIMATES from a draft shot-list. The 64% target is NOT claimed achieved — that requires a RENDERED edit measured on real footage. Opening is setup-weighted (tension/world front-loaded); whole-film distribution is the governing measure (genre-distribution-f10.json / future F11 equivalent).',
}, null, 1));

console.log(`F11 OPENING: ${shots.length} shots, ~${totSec}s est | contracts ${contracts.length}`);
console.log('distribution (OPENING only — ESTIMATE):');
for (const d of dist) console.log(`  ${d.category.padEnd(8)} target ${String(d.target).padStart(2)}% | shot-wt ${String(d.shotPct).padStart(4)}% | screen-time-est ${String(d.screenTimeEstPct).padStart(4)}% (${d.shots} sh / ${d.sec}s)`);
