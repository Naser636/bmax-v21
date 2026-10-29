// Tests for the 49-scene conductor: completeness, source traceability, dramatic functions, SC47, the three
// distinct durations (no false 60:00), dependencies, coverage-assumption flags, no artistic validation. READ-ONLY.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(here, 'scene-conductor-f10.json'), 'utf8'));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const validIds = new Set(SL.shots.map(s => s.id));
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

ok('covers 49 scenes', C.scenes === 49 && C.rows.length === 49);
ok('mission budget €0', C.budgetAuthorizedThisMission === 0);
ok('scene ids SC01..SC49 unique & ordered', C.rows.every((r, i) => r.scene === 'SC' + String(i + 1).padStart(2, '0')));

// source traceability: every shot id in the conductor exists in the active shot-list; counts match
let allShots = 0;
for (const r of C.rows) {
  for (const s of r.shotsInOrder) { allShots++; if (!validIds.has(s.id)) { fail++; console.log(`  FAIL ${r.scene}: unknown shot ${s.id}`); } }
  ok(`${r.scene}: shot count matches shot-list`, r.shotsInOrder.length === SL.shots.filter(x => x.scene === r.scene).length);
}
ok('conductor shot total = 420 (full traceable coverage)', allShots === 420);

// dramatic function: every scene carries ≥1 function; gate allPass
ok('functionGate allPass (every scene has a function)', C.dramaticFunctionGate.allPass === true && C.dramaticFunctionGate.flags.length === 0);
ok('every scene row lists ≥1 dramatic function', C.rows.every(r => Array.isArray(r.dramaticFunctions) && r.dramaticFunctions.length >= 1));
ok('functions ⊆ {INFORMATION,EMOTION,ANTICIPATION,TRANSFORMATION}', C.rows.every(r => r.dramaticFunctions.every(f => ['INFORMATION', 'EMOTION', 'ANTICIPATION', 'TRANSFORMATION'].includes(f))));

// SC47 explicit intentional-silence verdict
const sc47 = C.dramaticFunctionGate.sc47;
ok('SC47 evaluated for intentional silence', sc47 && sc47.scene === 'SC47' && sc47.silent === true && sc47.intentionalSilenceOk === true && sc47.functions.length >= 1);

// three distinct durations; 60:00 NOT validated
const d = C.durationReconciliation;
ok('theoretical scenario band present', d.theoreticalScenarioMin.lo > 0 && d.theoreticalScenarioMin.hi > d.theoreticalScenarioMin.lo);
ok('planned edit target = 60', d.plannedEditTargetMin === 60);
ok('real exported measured = null (NOT validated)', d.realExportedMeasuredMin === null);
ok('60 ∈ theoretical band but note says not validated', 60 >= d.theoreticalScenarioMin.lo && 60 <= d.theoreticalScenarioMin.hi && /NOT validated/i.test(d.note));

// each scene distinguishes staged vs generated vs (no) final; deps + coverage assumptions present
ok('every scene has 3-way duration fields', C.rows.every(r => typeof r.durations.stagedLoSec === 'number' && typeof r.durations.generatedOutputSec === 'number' && /real export/i.test(r.durations.note)));
ok('scenes with >1 shot declare dependencies', C.rows.filter(r => r.shotsInOrder.length > 1).every(r => /depend/.test(r.dependencies)));
ok('coverage assumptions flagged where screen>generated', C.rows.some(r => /UNPROVEN/.test(r.coverageAssumptions)));

// no false success / no artistic validation anywhere
ok('every scene marks media TO_CREATE', C.rows.every(r => /TO_CREATE/.test(r.toProduce)));
ok('legend forbids artistic validation claim', /no artistic validation/i.test(C.legend));
ok('risks are indicators (status field), not quality proof', C.rows.every(r => Array.isArray(r.risks) && r.risks.every(x => x.status)));

console.log(`scene-conductor-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
