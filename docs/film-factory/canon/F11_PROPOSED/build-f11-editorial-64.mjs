// Editorial resolution to hit the LOCKED 64/13/10/5/5/3 on ESTIMATED screen-time, with the MINIMUM footprint
// change — NO canon events removed. Drama scenes that can't fit the 5% budget are DEMOTED to beats absorbed into
// adjacent scenes (their emotional content survives as a beat, not a standalone scene). PROPOSED F11 editorial
// decision — traced, NOT approved. Non-billed; F10 unchanged. 64% NOT claimed achieved (needs a rendered edit).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'f11-fullfilm-distribution-plan.json'), 'utf8'));
const CAT = plan.contentClassification;
const TARGET = { ACTION: 64, STORY: 13, TENSION: 10, DRAMA: 5, COMEDY: 5, WORLD: 3 };
const RUNTIME = 3600;

// essential DRAMA beats kept as standalone drama scenes (carry the emotional spine ~3 min)
const DRAMA_KEEP = ['SC28', 'SC29', 'SC43', 'SC44', 'SC48']; // Meryt confession, Helgi choice, Olaf death, Tove goodbye, cairn
// other DRAMA scenes → DEMOTE to a short emotional BEAT absorbed into the adjacent action/story scene (event kept)
const DRAMA_DEMOTE = { SC08: 'absorb into SC07 (town after the standoff — one mourning beat)', SC14: 'keep brief; the handoff is a beat within the garrison block (SC13-15)', SC20: 'absorb into SC19 (one quiet Tove↔Björn exchange within the band-forms scene)', SC27: 'merge with SC28 (the Björn↔Meryt bond + confession become one scene)', SC33: 'absorb into SC32 aftermath (Olaf beat tail of the third-tide crossing)', SC35: 'brief insert within SC34/36 (Ipu↔Meryt moment)', SC42: 'compress into SC41 (the refusal is the back half of the two-readers scene)' };

// recompute content category with demotions folded (demoted drama scenes count toward their ABSORBING scene's category or stay a brief drama beat)
const cats = Object.keys(TARGET);
const keptDramaScenes = Object.keys(CAT).filter(s => CAT[s] === 'DRAMA' && DRAMA_KEEP.includes(s));
const demotedDrama = Object.keys(CAT).filter(s => CAT[s] === 'DRAMA' && !DRAMA_KEEP.includes(s));

// target screen-time per category (seconds) and per-scene feasibility AFTER the editorial change
const sceneCountAfter = { ACTION: 17, STORY: 9, TENSION: 7, DRAMA: DRAMA_KEEP.length, COMEDY: 13 /*distributed beats*/, WORLD: 3 };
const alloc = cats.map(c => {
  const tgtSec = Math.round(TARGET[c] / 100 * RUNTIME);
  const n = sceneCountAfter[c];
  const perUnitSec = c === 'COMEDY' ? Math.round(tgtSec / 13) : Math.round(tgtSec / n); // comedy spread over 13 beat-scenes
  const band = { ACTION: [60, 240], STORY: [40, 150], TENSION: [40, 150], DRAMA: [30, 180], COMEDY: [8, 60], WORLD: [20, 90] }[c];
  const feasible = perUnitSec >= band[0] && perUnitSec <= band[1];
  return { category: c, targetPct: TARGET[c], targetMin: +(tgtSec / 60).toFixed(1), unitsAfterEdit: n, secPerUnit: perUnitSec, plausibleBand: `${band[0]}-${band[1]}s`, feasible };
});

const out = {
  generated: '2026-10-24',
  mission: 'F11 EDITORIAL RESOLUTION for the locked 64% action — PROPOSED, traced, NOT approved. No canon event removed. Non-billed.',
  lockedTarget: TARGET,
  decision: 'ODG editorial (autonomous, within mandate): keep 5 essential DRAMA scenes as the emotional spine (~3 min = 5%); DEMOTE the other 7 drama scenes to short emotional BEATS absorbed into adjacent action/story scenes (their story content is preserved — no event cut); extend the 17 ACTION scenes into set-pieces to carry 38.4 min (64%).',
  dramaKeptAsScenes: DRAMA_KEEP,
  dramaDemotedToBeats: DRAMA_DEMOTE,
  comedyMechanism: 'comedy stays DISTRIBUTED beats across 13 scenes (already designed) — ~14s/beat × 13 ≈ 3 min = 5%',
  screenTimeAllocationAfterEdit: alloc,
  feasibilityAfterEdit: alloc.every(a => a.feasible) ? 'ALL categories feasible after the editorial change' : 'still infeasible: ' + alloc.filter(a => !a.feasible).map(a => a.category).join(','),
  significantCanonChange: {
   isSignificant: true,
   whatChanges: 'F11 scene FOOTPRINT: 7 drama scenes become beats-within-scenes (not standalone). This changes pacing/structure, NOT story events, characters, relationships, or the climax.',
   status: 'PROPOSED — NOT approved. Requires human sign-off as part of F11 acceptance.',
   reversible: 'yes — the demotions are an editorial directive, not a dialogue/canon deletion; the lines remain in the dialogue file.',
  },
  honesty: '64% is NOT claimed achieved. This is a screen-time PLAN/estimate; the realized distribution must be MEASURED on the rendered edit (definition-of-done).',
};
writeFileSync(join(here, 'f11-editorial-64pct-plan.json'), JSON.stringify(out, null, 1));
console.log('F11 EDITORIAL 64% resolution (PROPOSED):');
console.log('  drama kept as scenes:', DRAMA_KEEP.join(','), '| demoted to beats:', demotedDrama.join(','));
for (const a of alloc) console.log(`  ${a.category.padEnd(8)} ${a.targetMin}min / ${a.unitsAfterEdit} units = ${a.secPerUnit}s [${a.feasible ? 'OK' : 'INFEASIBLE'}]`);
console.log('feasible after edit:', out.feasibilityAfterEdit);
