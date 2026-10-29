// Builds the canonical SSOT character-registry-f10.json + character-scene-shot-matrix.json.
// Ground truth: shot-list-f10.json (appearances) + runs/pilot/refs/*.webp (real refs, sha256 from disk).
// Reconciles and SUPERSEDES identity-registry-f10.json / character-dossier-f10.json / visual-references-status.json.
// No paid call.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRegistry, validateRegistry } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

// appearances (ground truth) + distinct shot-list character names
const byChar = {};
for (const s of sl.shots) { const sid = s.id || s.shotId; for (const r of (s.continuityRefs || [])) if (r.type === 'character') (byChar[r.ref] ??= []).push(sid); }
const shotListChars = Object.keys(byChar).sort();

// real references from disk (sha256 is computed, never inherited)
const refdir = join(here, 'runs', 'pilot', 'refs');
const realRefs = {};
for (const name of ['ASTRID', 'MERYT', 'OLAF']) {
  const p = join(refdir, name + '.webp');
  if (existsSync(p)) { const buf = readFileSync(p); realRefs[name] = { file: `runs/pilot/refs/${name}.webp`, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }; }
}

const characters = buildRegistry(byChar, realRefs);
const v = validateRegistry(characters, shotListChars);
if (!v.ok) { console.error('REGISTRY INVALID:', v.errors); process.exit(1); }

const registry = {
  generated: '2026-10-24',
  ssot: true,
  authority: 'CANONICAL — single source of truth for character identity. Supersedes identity-registry-f10.json, character-dossier-f10.json (reference sub-tree), and visual-references-status.json (character counts).',
  supersedes: ['identity-registry-f10.json', 'character-dossier-f10.json', 'visual-references-status.json'],
  idRule: 'CHAR-### immutable & unique. Never renumber; never reuse; never a new id for the same character in another scene; costume/injury/age are continuity states, not identities.',
  stateEnum: ['TEXT_ONLY', 'REFERENCE_PENDING', 'REFERENCE_APPROVED', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED'],
  totals: { characters: characters.length, withRealReference: Object.keys(realRefs).length, principal: characters.filter(c => c.referenceTier === 'PRINCIPAL').length, recurring: characters.filter(c => c.referenceTier === 'RECURRING_SECONDARY').length, minor: characters.filter(c => c.referenceTier === 'MINOR').length },
  reconciliation: {
    note: 'The superseded registries disagreed with disk truth. This SSOT reconciles against runs/pilot/refs/*.webp (computed sha256).',
    resolved: [
      'identity-registry-f10.json said ASTRID referenceImage=NONE; disk has ASTRID.webp (sha256 recorded) -> REFERENCE_APPROVED.',
      'visual-references-status.json said realImagesProduced=0; disk has 3 (ASTRID/MERYT/OLAF) -> corrected to 3.',
      'REFERENCE_APPROVED asserts the reference asset only; production identity-lock stays HUMAN_REQUIRED (humanProductionSignoff=false).',
    ],
  },
  characters,
};
writeFileSync(join(here, 'runs/benchmark/character-registry-f10.json'), JSON.stringify(registry, null, 1));

// character × scene × shot matrix (inverse view; char ids are stable keys)
const matrix = characters.map(c => ({ id: c.id, name: c.canonicalName, tier: c.referenceTier, state: c.state, sceneCount: c.appearances.sceneCount, shotCount: c.appearances.shotCount, scenes: c.appearances.scenes, shots: (byChar[c.canonicalName] || []).slice().sort() }));
writeFileSync(join(here, 'runs/benchmark/character-scene-shot-matrix.json'), JSON.stringify({ generated: '2026-10-24', source: 'character-registry-f10.json (SSOT) + shot-list-f10.json', totalCharacters: matrix.length, totalShots: sl.shots.length, matrix }, null, 1));

console.log(`SSOT written: ${characters.length} chars | refs ${Object.keys(realRefs).length} | principal ${registry.totals.principal} recurring ${registry.totals.recurring} minor ${registry.totals.minor} | validate OK`);
for (const c of characters) console.log(`  ${c.id} ${c.canonicalName.padEnd(11)} ${c.referenceTier.padEnd(20)} ${c.state.padEnd(20)} shots=${c.appearances.shotCount}`);
