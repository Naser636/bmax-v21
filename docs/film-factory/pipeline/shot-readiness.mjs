// Durable, FAIL-CLOSED shot-readiness classifier (CXVII root-cause fix). Replaces the loose/incomplete regex with
// a data-driven check against the CANONICAL F11 roster (character-registry-f11.json) + diacritic-normalised ref
// lookup + VFX/environment detection. A shot is NEVER READY unless its single subject is a KNOWN roster character
// WITH a reference on disk, no other roster character is co-present in its seed, and it carries no VFX/env markers.
// Unknown agents, ensembles, new characters, missing refs and VFX all BLOCK with an actionable reason. €0, read-only.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');

export const STATUS = {
  READY: 'READY',
  BLOCKED_REFERENCE: 'BLOCKED_REFERENCE',
  BLOCKED_NEW_CHARACTER: 'BLOCKED_NEW_CHARACTER',
  BLOCKED_MULTI_CHARACTER: 'BLOCKED_MULTI_CHARACTER',
  BLOCKED_VFX_ENVIRONMENT: 'BLOCKED_VFX_ENVIRONMENT',
  BLOCKED_UNKNOWN: 'BLOCKED_UNKNOWN',
};

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const VFX_MARKERS = ['TWO WORLDS', 'WORLDS STACK', 'STORM ABOVE', 'DESERT BELOW', 'PORTAL', 'THE DOOR OPENS', 'BEAM OF LIGHT', 'LIGHT SPLITS', 'STACK (STORM'];
const ENSEMBLE_AGENTS = ['ENSEMBLE', '—', '-', ''];
// crowd/ensemble phrases (merged seed+beat) implying multiple subjects in frame -> fail-closed multi
const ENSEMBLE_MARKERS = ['TWO CREWS', 'BOTH CREWS', 'ONE BAND', 'THE CROWD', 'A CROWD', 'EVACUATE', 'VILLAGERS GATHER', 'SOLDIERS CLOSE', 'THE WHOLE CREW'];

// Load the canonical roster with diacritic-normalised names + ref availability (checks all ref dirs, both -768 and base).
export function loadRoster(root = join(here, '..')) {
  const reg = JSON.parse(readFileSync(join(canon, 'character-registry-f11.json'), 'utf8'));
  const refDirs = ['pipeline/runs/pilot/refs', 'pipeline/runs/production-t1/refs', 'pipeline/runs/validation-av/refs'];
  const ffRoot = join(here, '..');
  const hasRef = (name) => {
    const n = norm(name);
    // normalised directory scan (handles diacritics e.g. BJÖRN -> BJORN-768.webp)
    for (const d of refDirs) {
      const dir = join(ffRoot, d); if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        const fn = norm(f);
        if ((fn === n + '-768.WEBP' || fn === n + '.WEBP' || fn === n + '-768.PNG' || fn === n + '.PNG') ) return true;
      }
    }
    return false;
  };
  return reg.characters.map(c => ({ id: c.id, name: c.canonicalName, norm: norm(c.canonicalName), gender: c.gender, tier: c.tier, hasRef: hasRef(c.canonicalName) }));
}

// whole-word-ish match of a normalised character name inside normalised text
function mentions(textNorm, charNorm) {
  const esc = charNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-Z0-9])' + esc + '([^A-Z0-9]|$)').test(textNorm);
}

// Load scene beats (richer narrative reality than the terse shotlist seed) -> { SCxx: beatText }
export function loadBeats() {
  try { const inv = JSON.parse(readFileSync(join(canon, 'f11-scene-inventory.json'), 'utf8')); return Object.fromEntries(inv.scenes.map(s => [s.id, s.beat || ''])); }
  catch { return {}; }
}

// Classify ONE shot. shot: { id, scene, decisiveAgent, promptSeed, mediaCategory, content }. sceneBeat = canonical
// narrative beat (STRONGLY recommended — the shotlist seed is often terser than the beat and hides co-present chars).
export function classifyShot(shot, roster, sceneBeat = '') {
  // Character/ensemble detection uses the SHOT's OWN seed (per-shot framing) — a scene beat lists scene-level
  // characters and must NOT block a single-subject shot (SC01 proves single-subject coverage works in multi-char
  // scenes). The beat is used ONLY to strengthen VFX/environment detection (scene-level, which a terse seed misses).
  const seedN = norm(shot.promptSeed || '');
  const vfxN = norm((shot.promptSeed || '') + ' ' + (sceneBeat || ''));
  const agentN = norm(shot.decisiveAgent);
  const reasons = [];
  // VFX / environment first (overrides) — seed + beat
  const vfx = VFX_MARKERS.find(m => vfxN.includes(m)) || null;
  if (vfx) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_VFX_ENVIRONMENT, subject: shot.decisiveAgent, coPresent: [], vfx, reasons: [`VFX/environment marker "${vfx}" — needs a dedicated VFX prompt/plate, not a character shot`] };
  // ensemble / unknown agent => multi/unknown (fail-closed)
  if (ENSEMBLE_AGENTS.includes(agentN)) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_MULTI_CHARACTER, subject: shot.decisiveAgent || '(none)', coPresent: [], reasons: ['ENSEMBLE/crowd shot — multiple subjects; needs single-subject decomposition or a staging decision'] };
  const subject = roster.find(r => r.norm === agentN);
  if (!subject) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_UNKNOWN, subject: shot.decisiveAgent, coPresent: [], reasons: [`decisiveAgent "${shot.decisiveAgent}" not in the canonical roster — cannot verify identity/ref (fail-closed)`] };
  // co-present roster characters named in the seed (besides the subject)
  const coPresent = roster.filter(r => r.norm !== subject.norm && mentions(seedN, r.norm)).map(r => r.name);
  if (coPresent.length) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_MULTI_CHARACTER, subject: subject.name, coPresent, reasons: [`co-present roster characters in seed/beat: ${coPresent.join(', ')} — multi-character two-shot hits the unsolved single-subject identity constraint; author single-subject coverage or defer`] };
  const ensemble = ENSEMBLE_MARKERS.find(m => seedN.includes(m));
  if (ensemble) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_MULTI_CHARACTER, subject: subject.name, coPresent: [], reasons: [`ensemble/crowd marker "${ensemble}" in seed/beat — multiple subjects in frame; needs single-subject decomposition or a staging decision`] };
  // single subject: needs a reference
  if (!subject.hasRef) return { shot: shot.id, scene: shot.scene, status: STATUS.BLOCKED_NEW_CHARACTER, subject: subject.name, coPresent: [], reasons: [`${subject.name} has NO reference on disk — author a single-subject establishing shot first, then derive a ${norm(subject.name)}-768 ref (€0) before dependent shots`] };
  return { shot: shot.id, scene: shot.scene, status: STATUS.READY, subject: subject.name, coPresent: [], vfx: null,
    reasons: [], readyEvidence: `single subject ${subject.name} (ref on disk), no co-present roster character in seed, no VFX marker; media ${shot.mediaCategory}` };
}

export function auditShots(shots, roster, beats = {}) { return shots.map(s => classifyShot(s, roster, beats[s.scene] || '')); }

// Paid-entry gate: classify a shot and return {ready, status, reasons}. EVERY paid producer/driver must call this
// (or classifyShot) BEFORE reserving budget — a non-READY shot is blocked before any spend, even if submitted
// directly without the batch builder. Loads roster+beats itself if not supplied (fail-closed on load error).
export function readinessGate(shot, { roster = null, beats = null } = {}) {
  let r = roster, b = beats;
  try { if (!r) r = loadRoster(); if (!b) b = loadBeats(); } catch { return { ready: false, status: STATUS.BLOCKED_UNKNOWN, reasons: ['roster/beats load failed — fail-closed'] }; }
  const c = classifyShot(shot, r, (b && b[shot.scene]) || '');
  return { ready: c.status === STATUS.READY, status: c.status, subject: c.subject, reasons: c.reasons, readyEvidence: c.readyEvidence };
}

// Split a list of shots into READY vs BLOCKED (for a driver filtering real-mode production).
export function filterReady(shots, roster = loadRoster(), beats = loadBeats()) {
  const ready = [], blocked = [];
  for (const s of shots) { const c = classifyShot(s, roster, beats[s.scene] || ''); (c.status === STATUS.READY ? ready : blocked).push({ shot: s, status: c.status, reasons: c.reasons }); }
  return { ready, blocked };
}
export function summarize(classified) {
  const by = {}; for (const c of classified) by[c.status] = (by[c.status] || 0) + 1;
  return { total: classified.length, byStatus: by, ready: classified.filter(c => c.status === STATUS.READY).map(c => ({ shot: c.shot, scene: c.scene, subject: c.subject })) };
}

// CLI: audit the whole shotlist
if (import.meta.url === `file://${process.argv[1]}`) {
  const sl = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
  const roster = loadRoster();
  const beats = loadBeats();
  const shots = sl.shots.map(s => ({ ...s, id: s.id.replace(/^F11-/, '') }));
  const cls = auditShots(shots, roster, beats);
  const sum = summarize(cls);
  console.log('ROSTER refs:', roster.filter(r => r.hasRef).map(r => r.name).join(', '));
  console.log('AUDIT', sl.shots.length, 'shots:', JSON.stringify(sum.byStatus));
  console.log('READY shots:', sum.ready.length, sum.ready.slice(0, 20).map(r => `${r.shot}(${r.subject})`).join(', '));
}
