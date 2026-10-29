import { applyStyle, routeModel, styleViolations, STYLE_ANCHOR } from './style-lock-f10.mjs';
import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url)); const sl=JSON.parse(readFileSync(join(here,'shot-list-f10.json'),'utf8'));
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
ok('applyStyle appends photoreal anchor', applyStyle('a shot').includes('photorealistic cinematic'));
ok('applyStyle idempotent', applyStyle(applyStyle('a shot')).split('photorealistic cinematic').length===2);
ok('styleViolations flags missing anchor', styleViolations('plain prompt').includes('missing photoreal style anchor'));
ok('styleViolations flags cartoon term', styleViolations('a cartoon render, photorealistic cinematic').includes('non-photoreal style term present'));
ok('anchored prompt has 0 violations', styleViolations(applyStyle('a desert'))?.length===0);
ok('routing: STILL->flux-dev', routeModel('STILL_ANIMATABLE').correctModel==='black-forest-labs/flux-dev');
ok('routing: VIDEO->minimax', routeModel('PREMIUM_VIDEO').correctModel==='minimax/video-01');
ok('routing detects the pilot mismatch (SC15 still sent to video)', routeModel('STILL_ANIMATABLE','minimax/video-01').mismatch===true);
// prove SC15 is canonically a STILL (the mis-route cause)
ok('SC15 canonical mediaCategory = STILL_ANIMATABLE', sl.shots.find(s=>s.id==='SC15-SH01').mediaCategory==='STILL_ANIMATABLE');
console.log(`STYLE-LOCK TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
