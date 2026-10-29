// SHOT -> CONTINUITY CONTRACT bindings (addendum §4). Verifiable links from each shot to:
// present character ids, authorized references, continuity state, movement contract (if any),
// previous/next shot, narrative/visual invariants, acceptance criteria + blocking defects.
// Reference injection REFUSES ambiguous associations (never guesses identity from text proximity).
// Generated for the scenes that have a movement contract (SC01/SC22/SC38/SC40) as the worked example;
// the same schema applies to all 420 shots. No paid call.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const reg = JSON.parse(readFileSync(join(here, 'runs/benchmark/character-registry-f10.json'), 'utf8'));
const mc = JSON.parse(readFileSync(join(here, '../action-rework/f10-movement-contracts.json'), 'utf8'));
const byName = Object.fromEntries(reg.characters.map(c => [c.canonicalName, c]));
const contractByScene = Object.fromEntries((mc.contracts || []).map(c => [c.scene, c]));

// authorized reference = ONLY a REFERENCE_APPROVED real asset
const authorizedRef = (c) => (c.state === 'REFERENCE_APPROVED' && c.reference.file) ? { file: c.reference.file, sha256: c.reference.sha256 } : null;

// refusal rule: inject a reference ONLY for an unambiguous single covered character.
// "covered" = REFERENCE_APPROVED. If 0 or >1 covered present -> REFUSE (no guessing).
function resolveInjection(presentCovered, subjectAction) {
  if (presentCovered.length === 1) return { inject: presentCovered[0].id, reason: 'single covered character present' };
  const named = presentCovered.filter(c => new RegExp('\\b' + c.canonicalName + '\\b').test(subjectAction || ''));
  if (named.length === 1) return { inject: named[0].id, reason: 'exactly one covered character named in subjectAction' };
  return { inject: null, reason: presentCovered.length === 0 ? 'no covered reference present' : 'AMBIGUOUS: multiple covered characters — refuse to guess' };
}

const scenes = ['SC01', 'SC22', 'SC38', 'SC40'];
const shots = sl.shots.filter(s => scenes.includes(s.scene));
const bindings = shots.map((s, i) => {
  const prev = shots[i - 1]?.id && shots[i - 1].scene === s.scene ? shots[i - 1].id : null;
  const next = shots[i + 1]?.id && shots[i + 1].scene === s.scene ? shots[i + 1].id : null;
  const present = (s.continuityRefs || []).filter(r => r.type === 'character').map(r => byName[r.ref]).filter(Boolean);
  const presentCovered = present.filter(c => c.state === 'REFERENCE_APPROVED');
  const inj = resolveInjection(presentCovered, s.subjectAction);
  const contract = contractByScene[s.scene] || null;
  return {
    shot: s.id, scene: s.scene,
    presentCharacters: present.map(c => ({ id: c.id, name: c.canonicalName, state: c.state, authorizedRef: authorizedRef(c) })),
    referenceInjection: inj,
    continuity: present.map(c => ({ id: c.id, costume: c.continuity.costume, weapon: c.continuity.weapon, wound: c.continuity.marks, props: c.continuity.props })),
    movementContractScene: contract ? s.scene : null,
    prevShot: prev, nextShot: next,
    invariants: [
      'character identity stable vs ' + (prev || 'scene-open'),
      'costume/weapon/wound continuous with prev shot',
      contract ? 'movement obeys scene contract (initial→trajectory→contact→consequence→final→raccord)' : 'staging continuous',
      'no modern object/text/symbol; no tattoo beyond ASTRID canon star-chart',
    ],
    acceptanceCriteria: s.acceptanceCriteria || 'photoreal, canon-faithful, identity+continuity preserved, no anachronism',
    blockingDefects: ['identity swap/merge', 'weapon or wound discontinuity', 'unintended motion loop', 'anachronism', 'geography/raccord break across cut'],
    mediaCategory: s.mediaCategory,
  };
});

// scene-level movement contract summary attached once per scene
const sceneContracts = scenes.filter(sc => contractByScene[sc]).map(sc => ({ scene: sc, contract: contractByScene[sc] }));

writeFileSync(join(here, 'runs/benchmark/shot-continuity-bindings.json'), JSON.stringify({
  generated: '2026-10-24',
  scope: 'contracted scenes SC01/SC22/SC38/SC40 as the worked example; schema applies to all 420 shots',
  source: 'shot-list-f10.json + character-registry-f10.json (SSOT) + f10-movement-contracts.json',
  refusalRule: 'reference injection requires an unambiguous single covered character; >1 covered or textual-proximity-only -> REFUSE',
  totalShotsBound: bindings.length, bindings, sceneContracts,
}, null, 1));

const injected = bindings.filter(b => b.referenceInjection.inject).length;
const refused = bindings.filter(b => !b.referenceInjection.inject && b.presentCharacters.some(c => c.state === 'REFERENCE_APPROVED')).length;
console.log(`bindings: ${bindings.length} shots | ref-injected ${injected} | refused-ambiguous/absent ${refused} | scene contracts ${sceneContracts.length}`);
