// PHASE 2/4 (local, €0) — consolidated 12-character identity dossier + 9 prepared portrait prompts (NOT generated)
// + the proposed visual batch allocation. CANON (from authored prompts) / PROPOSED (artistic defaults) / UNKNOWN
// are separated. The 3 existing references (ASTRID/MERYT/OLAF) are preserved with their sha256 + validation status.
// NO paid call is made. Output: character-dossier-f10.json + character-portrait-prompts.json + visual-batch-plan.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyStyle } from './style-lock-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const sha = (p) => existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;

// CANON descriptors (extracted from authored IN FRAME prompts — VERIFIED)
const CANON = {
  ASTRID: 'woman ~19; salt-stained Norse wool-and-leather seafarer garb; star-chart tattoo on her forearm; often soaked; navigator',
  OLAF: 'man ~60s, grey, failing; heavy Norse wool cloak; bronze arm-ring; captain\'s bearing even when weak',
  HELGI: 'Norse crewman ~20s; Norse seafarer garb; carries a child\'s carved wooden horse',
  TOVE: 'Norse crew ~20s; practical salt-worn seafarer garb; grins at death out of habit',
  MERYT: 'Egyptian woman, river-guard captain; linen kilt + leather river-guard harness; RIGHT-forearm khopesh wound bound in Norse cloth',
  IPY: 'Egyptian child; simple linen shift; carries her late mother\'s water-jug; fearless',
  'SETH-NAKHT': 'man ~40s, commander; ornate Egyptian scale-and-linen armour, commander\'s helmet; khopesh',
  VIGGE: 'young Norse crewman (a youth)',
  WIDOW: 'old Egyptian woman; mourning linen; keeps a drowned neighbour\'s place at a dry fountain',
  ELDER: 'Egyptian elder; town elder\'s linen; village authority',
  'NEFER-KA': 'elder Egyptian reader; pale linen robes; calm; guards the horizon',
  'BÖRK': 'heavy-set Norse cook; apron over Norse tunic; bulk used as a living dam',
};
const ALL = Object.keys(CANON);
const REFDIR = join(here, 'runs', 'pilot', 'refs');
const haveRef = { ASTRID: 1, MERYT: 1, OLAF: 1 };

// appearances
const appearances = {}; for (const s of sl.shots) for (const r of (s.continuityRefs || [])) if (r.type === 'character') (appearances[r.ref] ??= new Set()).add(s.scene);

const portrait = (c) => applyStyle(`Character reference portrait, single person, three-quarter body, plain neutral grey studio background, even soft key light, sharp focus for identity. ${c}: ${CANON[c]}. World: original fantasy, Norse ∩ pharaonic (dramatized); historically-plausible materials; NO modern objects/symbols/text.`);

const dossier = ALL.map(c => {
  const rp = haveRef[c] ? join(REFDIR, c + '.webp') : null;
  return {
    ref: c, nameVariants: [c],
    CANON: { descriptor: CANON[c], appearsInScenes: [...(appearances[c] || [])].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2))), sceneCount: (appearances[c] || new Set()).size },
    PROPOSED: { note: 'cinematic photoreal rendering per the artistic bible; contained performance', status: 'PROPOSED (not canon)' },
    UNKNOWN: ['exact facial features', 'precise age within the band', 'detailed costume beyond the canon descriptor'],
    reference: haveRef[c] ? { file: `runs/pilot/refs/${c}.webp`, sha256: sha(rp), validation: 'VALIDATED by inspection (photoreal, canon-faithful, distinct)' } : { file: null, status: 'TO_GENERATE (prompt prepared)' },
    positiveConstraints: ['photoreal cinematic', 'canon garb/materials', 'visually distinct from other characters'],
    negativeConstraints: ['no cartoon/animation/3D render', 'no modern objects/symbols/tattoos beyond canon', 'no deformation'],
    visualDependencies: c === 'MERYT' ? ['wound continuity with SC39->SC48'] : c === 'HELGI' ? ['wooden horse prop -> Sǫlveig'] : [],
  };
});

writeFileSync(join(here, 'runs/benchmark/character-dossier-f10.json'), JSON.stringify({ generated: '2026-10-24', total: dossier.length, withRealReference: Object.keys(haveRef).length, characters: dossier }, null, 1));
// 9 prepared portrait prompts (NOT generated)
const prompts = ALL.filter(c => !haveRef[c]).map(c => ({ ref: c, model: 'black-forest-labs/flux-dev', kind: 'STILL_ANIMATABLE', worstEur: 0.03, prompt: portrait(c) }));
writeFileSync(join(here, 'runs/benchmark/character-portrait-prompts.json'), JSON.stringify({ generated: '2026-10-24', note: 'PREPARED prompts — NOT generated. No paid call made.', count: prompts.length, prompts }, null, 1));
// visual batch allocation (proposal, needs explicit authorization)
const base = Math.round(prompts.length * 0.03 * 100) / 100;
writeFileSync(join(here, 'runs/benchmark/visual-batch-plan.json'), JSON.stringify({
  generated: '2026-10-24', scope: '9 missing character references',
  unitPriceEur: 0.03, source: 'flux-dev $0.025/img (first-party, verified) + FX margin', minReferences: 9,
  proposedAttempts: 12, retryMargin: '~1.3x for re-rolls', baseCostEur: base, worstWithRetriesEur: Math.round(base * 1.3 * 100) / 100,
  priority: ['SETH-NAKHT (antagonist, multi-scene)', 'NEFER-KA (second reader)', 'TOVE', 'HELGI (wooden-horse prop)', 'IPY', 'VIGGE', 'BÖRK', 'WIDOW', 'ELDER'],
  acceptance: ['photoreal cinematic', 'canon-faithful', 'visually distinct', 'no anachronism', 'human identity confirm'],
  budgetRequest: { newAuthorizedEur: 'TBD by CTO', newAttemptAllowance: 'TBD (current 8-attempt pilot cap reached)', note: 'SEPARATE from the pilot cap. The remaining €4.55 is NOT an authorization and the 8-attempt counter must NOT be reset without explicit CTO approval.' },
  mediaTypes: { portraits: 9, stills: 'n/a this batch', videos: 'n/a this batch' },
}, null, 1));
console.log(`dossier: 12 chars (3 with real refs, 9 prepared) | portrait prompts: ${prompts.length} | batch base €${base} (x1.3 €${Math.round(base * 1.3 * 100) / 100})`);
