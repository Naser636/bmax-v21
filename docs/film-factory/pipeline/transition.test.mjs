// Locks the scene-transition raccord audit against regression. €0, read-only.
import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const a = R('runs/benchmark/transition-audit-f10.json');
const sl = R('shot-list-f10.json');
const scenes = new Set(sl.shots.map(s => s.scene));
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
ok('48 transitions (49 scenes - 1)', a.totalTransitions===48);
ok('every transition references real scenes', a.transitions.every(t=>scenes.has(t.from)&&scenes.has(t.to)));
ok('transitions are consecutive in canonical order', a.transitions.every((t,i,arr)=> i===0 || arr[i-1].to===t.from));
ok('no CRITICAL asserted from metadata only', (a.bySeverity.CRITICAL||0)===0);
ok('severity totals sum to 48', Object.values(a.bySeverity).reduce((x,y)=>x+y,0)===48);
ok('each transition carries evidence fields', a.transitions.every(t=>'paletteSimilarity' in t && 'sharedCharacters' in t && 'severity' in t));
ok('MEDIUM/HIGH carry a proposed correction', a.transitions.filter(t=>['MEDIUM','HIGH'].includes(t.severity)).every(t=>t.proposedCorrection));
ok('insufficient-info dimensions declared', a.insufficientInfoDimensions.length>=4);
console.log(`TRANSITION TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
