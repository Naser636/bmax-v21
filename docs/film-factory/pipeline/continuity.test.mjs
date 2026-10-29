// Locks the continuity audit + cross-artifact integrity against regression. €0, read-only.
import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const aud = R('runs/benchmark/continuity-audit-f10.json');
const en = R('runs/benchmark/storyboard-enrichment-f10.json');
const src = R('dialogues-f10.json').lines; const dub = R('runs/benchmark/dubbing-fr-proposed.json').lines;
const sl = R('shot-list-f10.json');
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
ok('audit has no UNPROVEN', (aud.summary.UNPROVEN||0)===0);
ok('audit olaf+helgi+meryt-guilt+bork+double-dawn VERIFIED', ['olaf-death','helgi-horse','meryt-guilt','bork-vigge','double-dawn'].every(id=>aud.checks.find(c=>c.id===id)?.verdict==='VERIFIED'));
ok('420 camera diagrams distinct, 0 broken', en.cameraDiagrams.length===420 && new Set(en.cameraDiagrams.map(c=>c.id)).size===420 && en.cameraDiagrams.every(c=>sl.shots.some(s=>s.id===c.id)));
ok('141 dialogue lines, EN verbatim, FR aligned', src.length===141 && dub.length===141 && dub.every(d=>{const s=src.find(x=>x.order===d.order);return s&&s.text===d.en&&s.scene===d.scene;}));
ok('141 audio shots all linked to a dialogue line', en.audioLineToDialogue.unlinked===0);
console.log(`CONTINUITY TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
