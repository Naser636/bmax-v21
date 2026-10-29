// W-REFS (local, €0) — builds a prioritized reference-sheet plan from the F10 registers. Aggregates every
// identityRef (character) and locationRef (location) across all 260 authored shots (64 video + 196 still), scores
// priority by appearance spread + narrative act coverage, cross-checks the bibles, and flags missing refs, unused
// bible entries, and name inconsistencies. No network. Output: reference-sheet-plan.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

const vp = read('video-prompts-f10.json');
const sp = read('still-prompts-f10.json');
const shots = [...(vp.shots || []), ...(sp.shots || [])];
const bibleChars = new Set((vp.bibleCharacters || []).map(String));
const bibleLocs = new Set((vp.bibleLocations || []).map(String));

const norm = (s) => String(s).trim().toUpperCase().replace(/[\s_-]+/g, ' ');

function aggregate(kind) {
  const map = new Map(); // ref -> {ref, scenes:Set, shots:count, acts:Set, firstScene, statuses:Set}
  for (const sh of shots) {
    const refs = kind === 'character'
      ? (sh.identityRefs || []).filter(r => r.type === 'character')
      : (sh.locationRef ? [sh.locationRef] : []).concat((sh.identityRefs || []).filter(r => r.type === 'location'));
    for (const r of refs) {
      if (!r || !r.ref) continue;
      const key = r.ref;
      if (!map.has(key)) map.set(key, { ref: key, scenes: new Set(), shots: 0, acts: new Set(), firstScene: sh.scene, statuses: new Set() });
      const e = map.get(key);
      e.scenes.add(sh.scene); e.shots++; if (sh.act) e.acts.add(sh.act); if (r.status) e.statuses.add(r.status);
    }
  }
  return map;
}

function toPlan(map, bible, type) {
  const arr = [...map.values()].map(e => {
    const sceneCount = e.scenes.size, actCount = e.acts.size;
    // priority: appearance spread (scenes) + cross-act presence (continuity burden)
    const score = sceneCount + actCount * 1.5;
    const priority = sceneCount >= 5 ? 'P1' : sceneCount >= 2 ? 'P2' : 'P3';
    return { ref: e.ref, type, sceneCount, shotCount: e.shots, actCount, firstScene: e.firstScene,
      inBible: bible.has(e.ref), statuses: [...e.statuses], priority, score: Math.round(score * 10) / 10 };
  }).sort((a, b) => b.score - a.score);
  return arr;
}

const charMap = aggregate('character');
const locMap = aggregate('location');
const characters = toPlan(charMap, bibleChars, 'character');
const locations = toPlan(locMap, bibleLocs, 'location');

// missing from bible (referenced but not listed) and unused bible entries
const usedChars = new Set(charMap.keys()), usedLocs = new Set(locMap.keys());
const missingChars = characters.filter(c => !c.inBible).map(c => c.ref);
const missingLocs = locations.filter(l => !l.inBible).map(l => l.ref);
const unusedBibleChars = [...bibleChars].filter(c => !usedChars.has(c));
const unusedBibleLocs = [...bibleLocs].filter(l => !usedLocs.has(l));

// name inconsistencies: refs that normalize to the same token but differ in raw form
function inconsistencies(map) {
  const byNorm = new Map();
  for (const ref of map.keys()) { const n = norm(ref); if (!byNorm.has(n)) byNorm.set(n, new Set()); byNorm.get(n).add(ref); }
  return [...byNorm.values()].filter(s => s.size > 1).map(s => [...s]);
}
const nameInconsistencies = { characters: inconsistencies(charMap), locations: inconsistencies(locMap) };

const plan = {
  generated: '2026-10-24', source: 'video-prompts-f10.json + still-prompts-f10.json (260 shots)',
  coverage: {
    distinctCharacters: characters.length, charactersInBible: characters.filter(c => c.inBible).length,
    distinctLocations: locations.length, locationsInBible: locations.filter(l => l.inBible).length,
    bibleCharacters: bibleChars.size, bibleLocations: bibleLocs.size,
  },
  priorityCharacters: characters,
  priorityLocations: locations,
  gaps: { charactersReferencedNotInBible: missingChars, locationsReferencedNotInBible: missingLocs,
    unusedBibleCharacters: unusedBibleChars, unusedBibleLocations: unusedBibleLocs },
  nameInconsistencies,
  note: 'Priority = scene spread + cross-act presence. All refs are status TO_CREATE (no real reference sheets generated yet — that needs paid generation, currently blocked on credit). This plan LOCKS what to create first for identity/continuity.',
};
writeFileSync(join(here, 'runs/benchmark/reference-sheet-plan.json'), JSON.stringify(plan, null, 1));
console.log(JSON.stringify({ chars: characters.length, locs: locations.length, coverage: plan.coverage,
  top5chars: characters.slice(0, 5).map(c => `${c.ref}(${c.priority},${c.sceneCount}sc)`),
  missingChars, missingLocs: missingLocs.slice(0, 8), inconsistencies: nameInconsistencies }, null, 1));
