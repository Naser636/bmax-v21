// Regression test for the fail-closed shot-readiness classifier. Covers the CXVII false positives (SC03 VFX,
// SC08 new/multi, SC13 multi via BÖRK), the diacritic ref bug (BJÖRN), and fail-closed edge cases. €0, no network.
import { classifyShot, loadRoster, loadBeats, STATUS, norm, readinessGate, filterReady } from './shot-readiness.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

const roster = loadRoster();
const byName = Object.fromEntries(roster.map(r => [r.norm, r]));
const S = (over) => classifyShot({ id: 'T', scene: 'SCxx', mediaCategory: 'PREMIUM_VIDEO', content: 'ACTION', ...over }, roster);

// --- roster + diacritic ref bug ---
ok('diacritic: BJÖRN ref detected (BJORN-768 on disk)', byName['BJORN'].hasRef === true);
ok('refs present: ASTRID/MERYT/OLAF', byName['ASTRID'].hasRef && byName['MERYT'].hasRef && byName['OLAF'].hasRef);
ok('no ref: TOVE/BORK/WIDOWER (new chars)', byName['TOVE'].hasRef === false && byName['BORK'].hasRef === false && byName['WIDOWER'].hasRef === false);
ok('roster has all 13 incl. BÖRK + WIDOWER + ELDER', ['BORK', 'WIDOWER', 'ELDER'].every(n => byName[n]));

// --- READY (single subject, ref, non-VFX) ---
ok('READY: BJÖRN single-subject with ref', S({ decisiveAgent: 'BJÖRN', promptSeed: 'BJÖRN hauls the steering-oar in the storm' }).status === STATUS.READY);
ok('READY: OLAF single-subject (ref)', S({ decisiveAgent: 'OLAF', promptSeed: 'OLAF lashed to the mast, failing' }).status === STATUS.READY);

// --- the CXVII false positives ---
ok('VFX: two-worlds -> BLOCKED_VFX_ENVIRONMENT', S({ decisiveAgent: 'BJÖRN', promptSeed: 'for a beat two worlds stack (storm above, desert below)' }).status === STATUS.BLOCKED_VFX_ENVIRONMENT);
ok('multi: BÖRK co-present with BJÖRN -> BLOCKED_MULTI_CHARACTER', S({ decisiveAgent: 'BJÖRN', promptSeed: 'the Norse crew, caged; BÖRK cooks from nothing' }).status === STATUS.BLOCKED_MULTI_CHARACTER);
ok('new char: WIDOWER no ref -> BLOCKED (new or multi)', [STATUS.BLOCKED_NEW_CHARACTER, STATUS.BLOCKED_MULTI_CHARACTER].includes(S({ decisiveAgent: 'WIDOWER', promptSeed: 'the WIDOWER keeps a drowned place at a dry fountain' }).status));
ok('new char single-subject: TOVE alone no ref -> BLOCKED_NEW_CHARACTER', S({ decisiveAgent: 'TOVE', promptSeed: 'TOVE grins a gallows grin, alone in frame' }).status === STATUS.BLOCKED_NEW_CHARACTER);

// --- fail-closed edge cases ---
ok('ensemble agent -> BLOCKED_MULTI_CHARACTER', S({ decisiveAgent: 'ENSEMBLE', promptSeed: 'the whole crew on deck' }).status === STATUS.BLOCKED_MULTI_CHARACTER);
ok('unknown agent -> BLOCKED_UNKNOWN (fail-closed)', S({ decisiveAgent: 'RANDO', promptSeed: 'someone does something' }).status === STATUS.BLOCKED_UNKNOWN);
ok('empty agent -> BLOCKED (not READY)', S({ decisiveAgent: '', promptSeed: 'a wide shot' }).status !== STATUS.READY);
ok('multi takes precedence: subject+co-present even with refs', S({ decisiveAgent: 'BJÖRN', promptSeed: 'BJÖRN and ASTRID together at the oar' }).status === STATUS.BLOCKED_MULTI_CHARACTER);
ok('VFX overrides a valid subject', S({ decisiveAgent: 'OLAF', promptSeed: 'OLAF watches as a PORTAL opens' }).status === STATUS.BLOCKED_VFX_ENVIRONMENT);

// --- real shotlist regression (the exact reported cases) ---
const sl = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
const beats = loadBeats();
const real = (id) => { const s = sl.shots.find(x => x.id === id); return classifyShot({ ...s, id: s.id.replace(/^F11-/, '') }, roster, beats[s.scene] || ''); };
ok('real SC03-SH01 -> VFX', real('F11-SC03-SH01').status === STATUS.BLOCKED_VFX_ENVIRONMENT);
ok('real SC08-SH01 -> BLOCKED (not READY)', real('F11-SC08-SH01').status !== STATUS.READY);
ok('real SC13-SH01 -> BLOCKED (not READY)', real('F11-SC13-SH01').status !== STATUS.READY);
ok('real SC01-SH01 -> READY (single-subject, beat does not block)', real('F11-SC01-SH01').status === STATUS.READY);
ok('real SC17 (BJÖRN solo) -> READY', real('F11-SC17-SH01').status === STATUS.READY);
// beat-for-VFX: a scene whose VFX lives in the beat (not the terse seed) is still caught
ok('beat-VFX: VFX marker in beat (not seed) still blocks', classifyShot({ id: 'T', scene: 'SCx', decisiveAgent: 'BJÖRN', promptSeed: 'BJÖRN stands', mediaCategory: 'PREMIUM_VIDEO' }, roster, 'the two worlds stack, storm above desert below').status === STATUS.BLOCKED_VFX_ENVIRONMENT);

// --- paid-entry gate (readinessGate / filterReady) ---
ok('readinessGate: READY for BJÖRN solo', readinessGate({ id: 'g', scene: 'SCx', decisiveAgent: 'BJÖRN', promptSeed: 'BJÖRN alone', mediaCategory: 'PREMIUM_VIDEO' }, { roster }).ready === true);
ok('readinessGate: BLOCKS a VFX shot (not ready)', readinessGate({ id: 'g', scene: 'SCx', decisiveAgent: 'BJÖRN', promptSeed: 'two worlds stack', mediaCategory: 'PREMIUM_VIDEO' }, { roster }).ready === false);
ok('readinessGate: BLOCKS a new-character shot (TOVE no ref)', readinessGate({ id: 'g', scene: 'SCx', decisiveAgent: 'TOVE', promptSeed: 'TOVE alone', mediaCategory: 'PREMIUM_VIDEO' }, { roster }).ready === false);
{
  const fr = filterReady([
    { id: 'a', scene: 'SCx', decisiveAgent: 'BJÖRN', promptSeed: 'BJÖRN alone', mediaCategory: 'PREMIUM_VIDEO' },
    { id: 'b', scene: 'SCx', decisiveAgent: 'BJÖRN', promptSeed: 'two worlds stack', mediaCategory: 'PREMIUM_VIDEO' },
  ], roster, loadBeats());
  ok('filterReady splits READY vs BLOCKED', fr.ready.length === 1 && fr.ready[0].shot.id === 'a' && fr.blocked.length === 1 && fr.blocked[0].shot.id === 'b');
}

console.log(`\nSHOT-READINESS TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
process.exit(fail === 0 ? 0 : 1);
