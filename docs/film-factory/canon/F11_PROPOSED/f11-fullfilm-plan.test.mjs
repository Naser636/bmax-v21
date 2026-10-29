// Validate the whole-film F11 distribution plan. Hermetic; no paid call.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(readFileSync(join(here, 'f11-fullfilm-distribution-plan.json'), 'utf8'));
const CATS = ['ACTION', 'STORY', 'TENSION', 'DRAMA', 'COMEDY', 'WORLD'];

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

ok('locked targets sum exactly 100', Object.values(p.lockedTarget).reduce((a, b) => a + b, 0) === 100);
ok('targets unchanged (64/13/10/5/5/3)', p.lockedTarget.ACTION === 64 && p.lockedTarget.STORY === 13 && p.lockedTarget.TENSION === 10 && p.lockedTarget.DRAMA === 5 && p.lockedTarget.COMEDY === 5 && p.lockedTarget.WORLD === 3);
ok('all 49 scenes classified', Object.keys(p.contentClassification).length === 49);
ok('every scene maps to a valid category', Object.values(p.contentClassification).every(c => CATS.includes(c)));
ok('scene-count sums to 49', Object.values(p.sceneCountsByCategory).reduce((a, b) => a + b, 0) === 49);
ok('governing measure = screen-time estimate, labelled', /SCREEN-TIME/i.test(p.governingMeasure) && /ESTIMATE/i.test(p.governingMeasure));
ok('target screen-time plan sums to ~100% of runtime', Math.abs(p.targetScreenTimePlan.reduce((a, x) => a + x.targetSec, 0) - p.runtimeSecAssumed) < 2);
ok('DRAMA flagged as the structural blocker (12 scenes vs 5%)', /DRAMA/.test(p.structuralBlocker.finding) && p.structuralBlocker.severity.includes('DRAMA'));
ok('COMEDY correctly NOT a blocker (distributed beats)', /distributed beats|beat-level/i.test(p.comedyNote) && p.structuralBlocker.notABlocker.some(x => /comedy/i.test(x)));
ok('64% NOT claimed achieved', /NOT claimed achieved/i.test(p.honesty));
ok('minimum adjustments listed (no scene invention)', Array.isArray(p.minimumAdjustments) && p.minimumAdjustments.length >= 3 && !JSON.stringify(p.minimumAdjustments).match(/add.*scene|new scene/i));

// F10 frozen intact
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const sums = readFileSync(join(F10, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
ok('F10 frozen intact', sums.every(([h, f]) => existsSync(join(F10, f)) && createHash('sha256').update(readFileSync(join(F10, f))).digest('hex') === h));

console.log('F11-FULLFILM-PLAN TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
