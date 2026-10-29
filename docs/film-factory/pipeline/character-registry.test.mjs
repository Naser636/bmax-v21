// Non-regression tests for the canonical character-registry SSOT (addendum §2/§7).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRegistry, validateRegistry, REGISTRY_STATES, ID_ORDER, refTier } from './character-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const reg = JSON.parse(readFileSync(join(here, 'runs/benchmark/character-registry-f10.json'), 'utf8'));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const chars = reg.characters;
const shotListChars = [...new Set(sl.shots.flatMap(s => (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref)))].sort();

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// FROZEN id snapshot — if this breaks, an id moved (forbidden)
const FROZEN = { ASTRID: 'CHAR-001', 'BÖRK': 'CHAR-002', ELDER: 'CHAR-003', HELGI: 'CHAR-004', IPY: 'CHAR-005', MERYT: 'CHAR-006', 'NEFER-KA': 'CHAR-007', OLAF: 'CHAR-008', 'SETH-NAKHT': 'CHAR-009', TOVE: 'CHAR-010', VIGGE: 'CHAR-011', WIDOW: 'CHAR-012' };

ok('12 characters', chars.length === 12);
ok('unique ids', new Set(chars.map(c => c.id)).size === 12);
ok('ids are frozen (stable mapping)', chars.every(c => c.id === FROZEN[c.canonicalName]));
ok('validateRegistry passes against shot-list', validateRegistry(chars, shotListChars).ok);
ok('every shot-list character has exactly one entry', shotListChars.every(n => chars.filter(c => c.canonicalName === n).length === 1));
ok('no registry char absent from shot-list', chars.every(c => c.appearances.shotCount === 0 || shotListChars.includes(c.canonicalName)));
ok('all states in enum', chars.every(c => REGISTRY_STATES.includes(c.state)));
ok('CANON/PROPOSED/UNKNOWN all present', chars.every(c => c.description.CANON && c.description.PROPOSED && Array.isArray(c.description.UNKNOWN)));
// provenance truth: the 3 APPROVED refs match disk sha256 exactly
ok('REFERENCE_APPROVED sha256 matches disk', chars.filter(c => c.state === 'REFERENCE_APPROVED').every(c => {
  const p = join(here, c.reference.file); if (!existsSync(p)) return false;
  return createHash('sha256').update(readFileSync(p)).digest('hex') === c.reference.sha256;
}));
ok('no APPROVED ref auto-claims production signoff', chars.filter(c => c.state === 'REFERENCE_APPROVED').every(c => c.humanProductionSignoff === false && c.productionIdentityLock === 'HUMAN_REQUIRED'));
// distinct characters never merged on textual similarity (ELDER vs NEFER-KA vs WIDOW all Egyptian elders/old women)
ok('similar-description distinct chars kept separate', new Set(['CHAR-003', 'CHAR-007', 'CHAR-012'].map(id => chars.find(c => c.id === id).canonicalName)).size === 3);
// id stays stable under costume/injury/age change: MERYT has a wound continuity but a single stable id
ok('injury does not fork identity (MERYT one id, wound is continuity)', chars.filter(c => c.canonicalName === 'MERYT').length === 1 && /wound/i.test(chars.find(c => c.id === 'CHAR-006').continuity.marks));
// refTier thresholds
ok('refTier: P1 -> PRINCIPAL', refTier('ASTRID', 208) === 'PRINCIPAL');
ok('refTier: <10 shots non-P1 -> MINOR', refTier('BÖRK', 2) === 'MINOR');
ok('refTier: 10..39 -> RECURRING_SECONDARY', refTier('VIGGE', 10) === 'RECURRING_SECONDARY');
// deterministic rebuild equals committed SSOT (no drift)
const byChar = {}; for (const s of sl.shots) { const sid = s.id; for (const r of (s.continuityRefs || [])) if (r.type === 'character') (byChar[r.ref] ??= []).push(sid); }
const realRefs = {}; for (const n of ['ASTRID', 'MERYT', 'OLAF']) { const p = join(here, 'runs/pilot/refs/' + n + '.webp'); if (existsSync(p)) { const b = readFileSync(p); realRefs[n] = { file: `runs/pilot/refs/${n}.webp`, sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length }; } }
const rebuilt = buildRegistry(byChar, realRefs);
ok('deterministic rebuild matches committed states/ids', rebuilt.every(c => { const o = chars.find(x => x.id === c.id); return o && o.canonicalName === c.canonicalName && o.state === c.state && o.referenceTier === c.referenceTier; }));
ok('ID_ORDER has 12 unique names', new Set(ID_ORDER).size === 12);

console.log('CHARACTER-REGISTRY TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
