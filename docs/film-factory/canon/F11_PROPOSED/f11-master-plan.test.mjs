// Validate the consolidated F11 production master plan. Hermetic; no paid call.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const p = JSON.parse(readFileSync(join(here, 'f11-production-master-plan.json'), 'utf8'));
let pass = 0, fail = 0; const fails = []; const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

ok('locked distribution sums 100', Object.values(p.lockedDistribution).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0) === 100);
ok('distribution values exact 64/13/10/5/5/3', p.lockedDistribution.ACTION === 64 && p.lockedDistribution.STORY === 13 && p.lockedDistribution.TENSION === 10 && p.lockedDistribution.DRAMA === 5 && p.lockedDistribution.COMEDY === 5 && p.lockedDistribution.WORLD === 3);
ok('scene map covers 49 scenes / 420 shots', p.sceneMap.totalScenes === 49 && p.sceneMap.totalPlannedShots === 420);
ok('every scene has content + plannedShots + status', p.sceneMap.scenes.every(s => s.content && s.plannedShots > 0 && s.status));
ok('7 accepted clips mapped to scenes', p.sceneMap.scenes.reduce((a, s) => a + s.existingCount, 0) === 7);
ok('opening design lists all 7 scenes with beats + missing', Object.keys(p.openingDesign_SC01_07.beats).length === 7 && p.openingDesign_SC01_07.missingShotsCount === 15);
ok('opening is NOT a montage (missing shots explicit per scene)', Object.values(p.openingDesign_SC01_07.beats).every(b => Array.isArray(b.missing)));
ok('workflow metrics are MEASURED (cost/accepted-sec present)', typeof p.workflowEfficiency_MEASURED.costPerAcceptedSecond_EUR.genOnly === 'number');
ok('full-film estimate separates band + correction (€270-414)', p.fullFilmEstimate_EUR.band.accept85 === 270 && /undercounted/.test(p.fullFilmEstimate_EUR.correction));
ok('budget reconciled: t1 €5.40/€15, €9.60 remaining, cap respected', /5.40/.test(p.inventoryReconciliation.t1Cap) && p.inventoryReconciliation.capRespected === true);
ok('quality gate has automatable + human + final-measurement', p.qualityGate.gates.length >= 3 && p.qualityGate.gates.some(g => /HUMAN/.test(g)) && p.qualityGate.gates.some(g => /MEASURED on the rendered edit/.test(g)));
ok('continuity constraints defined before generation', p.continuityConstraints.keyInvariants.length >= 5);
ok('blockers include F11-acceptance + greatsword + budget', p.unresolvedBlockers.some(b => /acceptance/i.test(b)) && p.unresolvedBlockers.some(b => /greatsword/i.test(b)) && p.unresolvedBlockers.some(b => /budget/i.test(b)));
ok('exactly one next action, fits remaining budget', typeof p.nextAction === 'string' && /€0.60 < €15/.test(p.nextAction));
ok('no fabricated completion (64% measured on edit, not claimed)', /not claimed/i.test(p.lockedDistribution.note) && /not claimed/i.test(p.successDefinition) === false ? true : /COHERENT/.test(p.successDefinition));

// F10 frozen intact
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const sums = readFileSync(join(F10, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
ok('F10 frozen byte-for-byte intact', sums.every(([h, f]) => existsSync(join(F10, f)) && createHash('sha256').update(readFileSync(join(F10, f))).digest('hex') === h));

console.log('F11-MASTER-PLAN TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
