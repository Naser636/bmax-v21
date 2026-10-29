// Focused AUTOMATED checks for Canon Revision V1 (F11_PROPOSED). These verify the STRUCTURAL acceptance gates
// that can be checked mechanically. They do NOT judge creative quality (comedy that works, coherent drama,
// readable action) — that is HUMAN creative review, explicitly out of scope for an automated test.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const reg = JSON.parse(readFileSync(join(here, 'character-registry-f11.json'), 'utf8'));
const audit = JSON.parse(readFileSync(join(here, 'role-reassignment-audit-49.json'), 'utf8'));

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// --- ACCEPTANCE GATE: cast composition ---
const females = reg.characters.filter(c => c.gender === 'F');
const males = reg.characters.filter(c => c.gender === 'M');
ok('exactly two female characters', females.length === 2);
ok('both females are genuinely secondary (tier SECONDARY)', females.every(c => c.tier === 'SECONDARY'));
ok('the two females are ASTRID + MERYT', females.map(c => c.canonicalName).sort().join(',') === 'ASTRID,MERYT');
ok('exactly one PROTAGONIST', reg.characters.filter(c => c.tier === 'PROTAGONIST').length === 1);
ok('protagonist is the Viking BJÖRN (male)', (() => { const p = reg.characters.find(c => c.tier === 'PROTAGONIST'); return p && p.canonicalName === 'BJÖRN' && p.gender === 'M'; })());
ok('protagonist has a combat signature + real weaknesses (not just muscular)', (() => { const p = reg.characters.find(c => c.tier === 'PROTAGONIST'); return p && p.combatSignature && Array.isArray(p.flaws) && p.flaws.length >= 2; })());
ok('principal non-secondary dramatic/action tiers are male', reg.characters.filter(c => ['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING'].includes(c.tier)).every(c => c.gender === 'M'));

// --- ACCEPTANCE GATE: Astrid is not a relabeled lead ---
ok('Astrid retains ZERO decisive-lead scenes', audit.astridRetainsAnyDecisive === false);
ok('decisive scenes reassigned to Björn (>0)', audit.decisiveReassignedToBjorn > 0);
ok('every reassigned scene names Björn as decisive', audit.audit.filter(a => a.decisiveReassigned).every(a => /BJÖRN/.test(a.f11DecisiveAgent)));

// --- registry well-formed / traceable ---
ok('13 characters total', reg.characters.length === 13);
ok('unique ids', new Set(reg.characters.map(c => c.id)).size === 13);
ok('all 12 F10 characters mapped forward', reg.characters.filter(c => c.f10Name).length === 12);
ok('re-gendered minors logged (IPY→IPU, WIDOW→WIDOWER)', reg.characters.some(c => c.f10Name === 'IPY' && c.canonicalName === 'IPU') && reg.characters.some(c => c.f10Name === 'WIDOW' && c.canonicalName === 'WIDOWER'));
ok('all tiers valid', reg.characters.every(c => ['PROTAGONIST', 'ANTAGONIST', 'SECONDARY', 'SUPPORTING', 'MINOR'].includes(c.tier)));

// --- REVERSIBILITY: original F10 recoverable (frozen snapshot verifies) ---
ok('F10 frozen snapshot + manifest exist', existsSync(join(F10, 'SHA256SUMS')) && existsSync(join(F10, '37_SCREENPLAY_60MIN_F10.md')));
const sums = readFileSync(join(F10, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
ok('every frozen file matches its recorded checksum (original intact)', sums.every(([h, f]) => existsSync(join(F10, f)) && createHash('sha256').update(readFileSync(join(F10, f))).digest('hex') === h));
// the live F10 screenplay still equals the frozen copy (not overwritten)
const liveScreenplay = join(here, '../../37_SCREENPLAY_60MIN_F10.md');
ok('live F10 screenplay unchanged vs frozen', existsSync(liveScreenplay) && createHash('sha256').update(readFileSync(liveScreenplay)).digest('hex') === createHash('sha256').update(readFileSync(join(F10, '37_SCREENPLAY_60MIN_F10.md'))).digest('hex'));

console.log('CANON-REVISION-V1 TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
console.log('NOTE: automated structural gates only. Comedy quality, dramatic coherence, action readability = HUMAN creative review (pending).');
process.exit(fail === 0 ? 0 : 1);
