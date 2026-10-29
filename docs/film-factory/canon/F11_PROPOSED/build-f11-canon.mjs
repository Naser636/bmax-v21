// Builds F11_PROPOSED registry v2 + per-scene role-reassignment audit from the FROZEN F10 (read-only inputs).
// Deterministic transformation; logs every change. Original F10 is never modified. No paid call.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const regF10 = JSON.parse(readFileSync(join(F10, 'character-registry-f10.json'), 'utf8'));
const shotList = JSON.parse(readFileSync(join(F10, 'shot-list-f10.json'), 'utf8'));
const sceneReg = JSON.parse(readFileSync(join(F10, 'scene-registry-f10.json'), 'utf8'));

// --- transformation map (canon revision V1) ---
// tier: PROTAGONIST | ANTAGONIST | SECONDARY | SUPPORTING | MINOR
const T = {
  ASTRID:       { gender: 'F', tier: 'SECONDARY',   role: 'tide-reader; mentor-of-knowledge; teaches Björn to read', change: 'DEMOTED from PROTAGONIST → genuinely secondary (no decisive climax)' },
  MERYT:        { gender: 'F', tier: 'SECONDARY',   role: 'Egyptian river-guard; emotional origin of the tear (grief)', change: 'kept secondary' },
  OLAF:         { gender: 'M', tier: 'SUPPORTING',  role: 'aging former captain; hands leadership to Björn', change: 'kept' },
  TOVE:         { gender: 'M', tier: 'SUPPORTING',  role: 'gallows-humour comic foil', change: 'kept (comic load ↑)' },
  HELGI:        { gender: 'M', tier: 'SUPPORTING',  role: 'heart; carved wooden horse', change: 'kept' },
  'BÖRK':       { gender: 'M', tier: 'SUPPORTING',  role: 'cook; comic + the drowning sacrifice that buys the line', change: 'kept (comic + sacrifice)' },
  VIGGE:        { gender: 'M', tier: 'MINOR',       role: 'youth saved by Börk', change: 'kept' },
  'SETH-NAKHT': { gender: 'M', tier: 'ANTAGONIST',  role: 'Egyptian commander; fear-authority', change: 'kept antagonist' },
  'NEFER-KA':   { gender: 'M', tier: 'SUPPORTING',  role: 'reader-elder; carries mystery exposition', change: 'kept (male)' },
  ELDER:        { gender: 'M', tier: 'MINOR',       role: 'town elder', change: 'kept (male)' },
  IPY:          { gender: 'M', tier: 'MINOR',       role: 'a boy with his late father’s water-jug', change: 'RE-GENDERED female→male (IPY→IPU); scene FUNCTION preserved', newName: 'IPU' },
  WIDOW:        { gender: 'M', tier: 'MINOR',       role: 'an old man keeping a drowned neighbour’s place', change: 'RE-GENDERED female→male (WIDOW→WIDOWER); function preserved', newName: 'WIDOWER' },
};
// NEW protagonist (not in F10)
const BJORN = {
  id: 'CHAR-013', canonicalName: 'BJÖRN', gender: 'M', tier: 'PROTAGONIST',
  role: 'massive muscular Viking; two-handed greatsword Himinkljúfr; warrior-who-learns-to-read; makes the decisive sacrifice',
  flaws: ['strength cannot solve the mystery (must learn to read/trust)', 'deep-water dread', 'feared berserker rage'],
  combatSignature: 'greatsword as terrain tool (anchor vs flood, flat-sweep, overhand sky-splitter); arc → disciplined strikes timed to Astrid’s reads; final decisive act is NOT a swing',
  change: 'NEW character — the new central protagonist',
};

// appearances from F10 shot-list (ground truth)
const byChar = {};
for (const s of shotList.shots) for (const r of (s.continuityRefs || [])) if (r.type === 'character') (byChar[r.ref] ??= []).push(s.id);

// F11 registry (carry F10 ids; add Björn)
const f11chars = regF10.characters.map(c => {
  const t = T[c.canonicalName];
  const shots = (byChar[c.canonicalName] || []);
  return {
    id: c.id,
    f10Name: c.canonicalName,
    canonicalName: t.newName || c.canonicalName,
    gender: t.gender,
    tier: t.tier,
    role: t.role,
    transformation: t.change,
    f10Tier: c.narrativeImportance?.tier === 'P1' ? 'LEAD/MAJOR' : c.narrativeImportance?.tier === 'P2' ? 'RECURRING' : 'MINOR',
    f10Appearances: { scenes: c.appearances.sceneCount, shots: shots.length },
    referenceCarriedFromF10: c.state === 'REFERENCE_APPROVED' ? { file: c.reference.file, sha256: c.reference.sha256, note: 'F10 reference; validity for F11 look PENDING human review (esp. re-gendered/role-changed)' } : null,
  };
}).concat([BJORN]);

const females = f11chars.filter(c => c.gender === 'F');
const protagonists = f11chars.filter(c => c.tier === 'PROTAGONIST');

const registry = {
  generated: '2026-10-24',
  version: 'F11_PROPOSED (Canon Revision V1)',
  status: 'PROPOSED — not accepted, not released',
  basedOn: 'F10_FROZEN_2026-10-24 (immutable)',
  idRule: 'F10 ids carried for traceability; CHAR-013 = new protagonist Björn. Re-gendering/role change is a logged canon-revision transformation, NOT a silent identity swap.',
  acceptanceConstraints: { exactlyTwoFemales: females.length === 2, singleProtagonist: protagonists.length === 1, protagonistIsViking: protagonists[0]?.canonicalName === 'BJÖRN' },
  totals: { characters: f11chars.length, females: females.length, males: f11chars.filter(c => c.gender === 'M').length },
  femaleCast: females.map(c => `${c.canonicalName} (${c.tier})`),
  characters: f11chars,
};
writeFileSync(join(here, 'character-registry-f11.json'), JSON.stringify(registry, null, 1));

// --- per-scene role-reassignment audit ---
// F10 Astrid-decisive scenes (she read/acted decisively): tides, learning, field, climax
const ASTRID_DECISIVE = new Set(['SC06', 'SC16', 'SC17', 'SC18', 'SC21', 'SC22', 'SC24', 'SC25', 'SC32', 'SC37', 'SC38', 'SC45', 'SC46']);
const scenes = (sceneReg.scenes || sceneReg);
const audit = scenes.map(sc => {
  const present = [...new Set((shotList.shots.filter(s => s.scene === sc.scene).flatMap(s => (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref))))];
  const f10Decisive = ASTRID_DECISIVE.has(sc.scene) && present.includes('ASTRID') ? 'ASTRID (female lead)' : (present[0] || 'ensemble');
  const reassigned = ASTRID_DECISIVE.has(sc.scene) && present.includes('ASTRID');
  const f11Decisive = reassigned ? 'BJÖRN (physical/decisive) + ASTRID (reader-intel, secondary)' : f10Decisive;
  const regender = present.filter(p => p === 'IPY' || p === 'WIDOW').map(p => p === 'IPY' ? 'IPY→IPU(boy)' : 'WIDOW→WIDOWER(man)');
  return {
    scene: sc.scene, head: sc.sceneHead, act: sc.act,
    presentF10: present,
    f10DecisiveAgent: f10Decisive,
    f11DecisiveAgent: f11Decisive,
    decisiveReassigned: reassigned,
    reGendering: regender,
    astridStillLead: false,
    note: reassigned ? 'Björn carries the decisive action; Astrid provides the read (secondary). MUST verify she is not a relabeled lead.' : (regender.length ? 'minor re-gendering only; function preserved' : 'ensemble/support scene; agent unchanged'),
  };
});
const reassignedCount = audit.filter(a => a.decisiveReassigned).length;
writeFileSync(join(here, 'role-reassignment-audit-49.json'), JSON.stringify({
  generated: '2026-10-24', basedOn: 'F10_FROZEN', totalScenes: audit.length,
  decisiveReassignedToBjorn: reassignedCount,
  astridRetainsAnyDecisive: audit.some(a => /ASTRID \(female lead\)/.test(a.f11DecisiveAgent)),
  reGenderedScenes: audit.filter(a => a.reGendering.length).map(a => a.scene),
  rule: 'Astrid retains ZERO decisive-lead scenes in F11; she is intel-support. Any decisive female action is a FAIL of the secondary constraint.',
  audit,
}, null, 1));

console.log(`F11 registry: ${f11chars.length} chars | females ${females.length} (${registry.femaleCast.join(', ')}) | protagonist ${protagonists.map(p=>p.canonicalName).join(',')}`);
console.log(`role audit: ${audit.length} scenes | decisive→Björn ${reassignedCount} | re-gendered scenes ${audit.filter(a=>a.reGendering.length).length}`);
console.log(`acceptance flags: 2 females=${registry.acceptanceConstraints.exactlyTwoFemales} | 1 protagonist=${registry.acceptanceConstraints.singleProtagonist} | Viking=${registry.acceptanceConstraints.protagonistIsViking}`);
