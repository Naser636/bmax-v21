// Tests the W-REFS reference-sheet plan: coverage, priority ordering, gap detection, consistency. €0, local.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'runs/benchmark/reference-sheet-plan.json'), 'utf8'));

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

ok('has 12 characters', plan.priorityCharacters.length === 12);
ok('has >=21 locations', plan.priorityLocations.length >= 21);
ok('ASTRID is top-priority protagonist', plan.priorityCharacters[0].ref === 'ASTRID' && plan.priorityCharacters[0].priority === 'P1');
ok('priority is sorted by score desc', plan.priorityCharacters.every((c, i, a) => i === 0 || a[i - 1].score >= c.score));
ok('all characters are in the bible', plan.gaps.charactersReferencedNotInBible.length === 0);
ok('RIVER-TOWN EDGE flagged as missing from location bible', plan.gaps.locationsReferencedNotInBible.includes('RIVER-TOWN EDGE'));
ok('no character name inconsistencies', plan.nameInconsistencies.characters.length === 0);
ok('no location name inconsistencies', plan.nameInconsistencies.locations.length === 0);
ok('coverage numbers present', plan.coverage.distinctCharacters === 12 && plan.coverage.charactersInBible === 12);
ok('each ref carries priority+sceneCount', plan.priorityCharacters.every(c => c.priority && typeof c.sceneCount === 'number'));

console.log(`\nREFERENCE-PLAN TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
process.exit(fail === 0 ? 0 : 1);
