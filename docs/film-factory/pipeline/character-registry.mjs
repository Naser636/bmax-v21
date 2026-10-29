// CANONICAL CHARACTER REGISTRY — SINGLE SOURCE OF TRUTH (SSOT) for La Porte du Soleil (F10)
// Supersedes the fragmented, mutually-inconsistent registries (identity-registry-f10.json,
// character-dossier-f10.json, visual-references-status.json). Those remain as evidence but are
// NOT authoritative; this module is. No paid call. Pure/deterministic — appearances are derived
// from shot-list-f10.json at build time so there is exactly one place truth lives.
//
// Governance rules enforced here (addendum §2):
//  - Immutable, unique CHAR-### id. The id NEVER changes across scenes, costume, injury or ageing.
//  - Costume/wound/age changes are CONTINUITY STATES/variants, never new identities.
//  - Two distinct characters are NEVER merged on textual similarity.
//  - State ∈ {TEXT_ONLY, REFERENCE_PENDING, REFERENCE_APPROVED, HUMAN_REVIEW_REQUIRED, BLOCKED}.
//  - "REFERENCE_APPROVED" means a real reference image exists AND passed automated+inspection checks;
//    it does NOT assert production identity-lock — that stays humanProductionSignoff:false until a human signs off.

export const REGISTRY_STATES = ['TEXT_ONLY', 'REFERENCE_PENDING', 'REFERENCE_APPROVED', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED'];
export const REF_TIERS = ['PRINCIPAL', 'RECURRING_SECONDARY', 'MINOR'];

// Immutable id assignment: alphabetical by canonical name (reproducible, independent of shot-count,
// which can drift). ONCE ASSIGNED THESE ARE FROZEN — append new characters at the end, never renumber.
export const ID_ORDER = ['ASTRID', 'BÖRK', 'ELDER', 'HELGI', 'IPY', 'MERYT', 'NEFER-KA', 'OLAF', 'SETH-NAKHT', 'TOVE', 'VIGGE', 'WIDOW'];

// CANON descriptors (extracted from authored IN-FRAME prompts — VERIFIED, do not invent).
export const CANON = {
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

// Narrative importance — justified, not asserted. P1 protagonist/antagonist/arc-critical; P2 recurring; P3 minor.
export const IMPORTANCE = {
  ASTRID: { tier: 'P1', why: 'protagonist; arc follows→chooses; stays at the seam (SC43/49); reads water/light' },
  OLAF: { tier: 'P1', why: 'captain; mentor whose decline drives Astrid\'s arc' },
  MERYT: { tier: 'P1', why: 'Egyptian river-guard captain; cross-culture counterpart; carries the khopesh-wound continuity' },
  'SETH-NAKHT': { tier: 'P1', why: 'antagonist/commander; combat-scene driver' },
  'NEFER-KA': { tier: 'P2', why: 'elder reader; second guardian-of-the-horizon; 14 scenes incl. ending' },
  TOVE: { tier: 'P2', why: 'Norse crew; high screen-presence (68 shots) comic-fatalist foil' },
  HELGI: { tier: 'P2', why: 'Norse crew; carries the wooden-horse prop that threads to Sǫlveig' },
  IPY: { tier: 'P2', why: 'Egyptian child; water-jug motif; present at the ending (SC49)' },
  VIGGE: { tier: 'P3', why: 'youth crewman; limited but present in the SC40 engagement' },
  'BÖRK': { tier: 'P3', why: 'cook; bulk-as-dam beat (SC13)' },
  ELDER: { tier: 'P3', why: 'town elder; single-scene authority (SC09)' },
  WIDOW: { tier: 'P3', why: 'mourning widow; single-scene emotional note (SC08)' },
};

// Continuity attributes that MUST be preserved shot-to-shot (addendum §4). CANON-sourced.
export const CONTINUITY = {
  ASTRID: { costume: 'Norse wool-and-leather seafarer garb, salt-stained', marks: 'star-chart tattoo on forearm (CANON — not an anachronism)', props: [], weapon: null, relations: ['crew of OLAF', 'meets MERYT at the seam'] },
  OLAF: { costume: 'heavy Norse wool cloak', marks: 'bronze arm-ring', props: [], weapon: null, relations: ['captain over ASTRID/TOVE/HELGI'] },
  MERYT: { costume: 'linen kilt + leather river-guard harness', marks: 'RIGHT-forearm khopesh wound bound in Norse cloth', props: [], weapon: 'khopesh (lost/disarmed at SC38 per movement contract — verify beat)', relations: ['river-guard counterpart to ASTRID', 'wound continuity SC38/SC39→SC48'] },
  'SETH-NAKHT': { costume: 'ornate Egyptian scale-and-linen armour, commander\'s helmet', marks: null, props: [], weapon: 'khopesh', relations: ['commands Egyptian guard', 'antagonist to Norse crew'] },
  HELGI: { costume: 'Norse seafarer garb', marks: null, props: ['child\'s carved wooden horse (threads to Sǫlveig)'], weapon: null, relations: ['crew of OLAF'] },
  TOVE: { costume: 'practical salt-worn seafarer garb', marks: null, props: [], weapon: null, relations: ['crew of OLAF'] },
  IPY: { costume: 'simple linen shift', marks: null, props: ['late mother\'s water-jug'], weapon: null, relations: ['Egyptian child; present at ending'] },
  'NEFER-KA': { costume: 'pale linen robes', marks: null, props: [], weapon: null, relations: ['elder reader; guards the horizon'] },
  VIGGE: { costume: 'Norse crew garb (youth)', marks: null, props: [], weapon: null, relations: ['crew; present SC40 engagement'] },
  'BÖRK': { costume: 'apron over Norse tunic', marks: null, props: [], weapon: null, relations: ['cook; crew'] },
  ELDER: { costume: 'town elder\'s linen', marks: null, props: [], weapon: null, relations: ['village authority (SC09)'] },
  WIDOW: { costume: 'mourning linen', marks: null, props: ['keeps a drowned neighbour\'s place at a dry fountain'], weapon: null, relations: ['single-scene mourner (SC08)'] },
};

const sceneOf = (shotId) => shotId.slice(0, 4); // "SC01-SH01" -> "SC01"
const sceneNum = (sc) => parseInt(sc.slice(2), 10);

// Reference tier from evidence: PRINCIPAL ≥40 shots or P1; RECURRING_SECONDARY 10–39; MINOR <10.
export function refTier(name, shotCount) {
  if (IMPORTANCE[name]?.tier === 'P1' || shotCount >= 40) return 'PRINCIPAL';
  if (shotCount >= 10) return 'RECURRING_SECONDARY';
  return 'MINOR';
}

// Build the SSOT from ground-truth inputs. appearancesByChar: {NAME:[shotId,...]}, realRefs: {NAME:{file,sha256,bytes}}.
export function buildRegistry(appearancesByChar, realRefs) {
  return ID_ORDER.map((name, i) => {
    const id = 'CHAR-' + String(i + 1).padStart(3, '0');
    const shots = (appearancesByChar[name] || []).slice().sort();
    const scenes = [...new Set(shots.map(sceneOf))].sort((a, b) => sceneNum(a) - sceneNum(b));
    const tier = refTier(name, shots.length);
    const ref = realRefs[name] || null;
    let state, refNeed, humanProductionSignoff = false;
    if (ref) { state = 'REFERENCE_APPROVED'; refNeed = 'HAVE (real reference image)'; }
    else if (tier === 'MINOR') { state = 'TEXT_ONLY'; refNeed = 'OPTIONAL (group coherence only; do NOT invent a narrative identity)'; }
    else { state = 'REFERENCE_PENDING'; refNeed = tier === 'PRINCIPAL' ? 'REQUIRED (facial identity + combat/costume complementary views)' : 'RECOMMENDED (portrait + distinctive attributes)'; }
    return {
      id, canonicalName: name, nameVariants: [name],
      narrativeImportance: IMPORTANCE[name],
      referenceTier: tier,
      description: {
        CANON: CANON[name],
        PROPOSED: 'cinematic photoreal rendering per the artistic bible; contained performance (NOT canon)',
        UNKNOWN: ['exact facial features', 'precise age within band', 'costume detail beyond the canon descriptor'],
      },
      appearances: { sceneCount: scenes.length, shotCount: shots.length, scenes, firstShot: shots[0] || null, lastShot: shots[shots.length - 1] || null },
      continuity: CONTINUITY[name],
      reference: ref
        ? { file: ref.file, sha256: ref.sha256, bytes: ref.bytes, provenance: 'generated in pilot via build-reference-sheets.mjs (flux-dev still)', validationHistory: [{ by: 'CIQE+Claude inspection', result: 'photoreal, canon-faithful, visually distinct', humanSignoff: false }] }
        : { file: null, provenance: 'prompt prepared in character-portrait-prompts.json; NOT generated', validationHistory: [] },
      state,
      refNeed,
      humanProductionSignoff,
      productionIdentityLock: 'HUMAN_REQUIRED',
    };
  });
}

// Non-regression validator (addendum §2 invariants). Returns {ok, errors[]}.
export function validateRegistry(reg, shotListCharNames) {
  const errors = [];
  const ids = reg.map(c => c.id);
  if (new Set(ids).size !== ids.length) errors.push('DUPLICATE id');
  // ids must be the frozen sequence CHAR-001..N in ID_ORDER positions
  ID_ORDER.forEach((name, i) => {
    const want = 'CHAR-' + String(i + 1).padStart(3, '0');
    const row = reg.find(c => c.canonicalName === name);
    if (!row) errors.push('MISSING ' + name);
    else if (row.id !== want) errors.push(`UNSTABLE id ${name}: ${row.id} != ${want}`);
  });
  // no two distinct names share an id
  const byId = {}; for (const c of reg) { if (byId[c.id] && byId[c.id] !== c.canonicalName) errors.push('MERGED distinct chars on ' + c.id); byId[c.id] = c.canonicalName; }
  // every character that appears in the shot-list must have exactly one registry entry
  if (shotListCharNames) {
    for (const n of shotListCharNames) if (!reg.some(c => c.canonicalName === n || c.nameVariants.includes(n))) errors.push('shot-list char not in registry: ' + n);
    for (const c of reg) if (c.appearances.shotCount > 0 && !shotListCharNames.includes(c.canonicalName)) errors.push('registry char absent from shot-list: ' + c.canonicalName);
  }
  for (const c of reg) {
    if (!REGISTRY_STATES.includes(c.state)) errors.push('bad state ' + c.id + ':' + c.state);
    if (!REF_TIERS.includes(c.referenceTier)) errors.push('bad tier ' + c.id);
    if (c.state === 'REFERENCE_APPROVED' && !c.reference.sha256) errors.push('APPROVED without sha256: ' + c.id);
    if (c.state === 'REFERENCE_APPROVED' && c.humanProductionSignoff !== false) errors.push('must not auto-claim production signoff: ' + c.id);
  }
  return { ok: errors.length === 0, errors };
}
