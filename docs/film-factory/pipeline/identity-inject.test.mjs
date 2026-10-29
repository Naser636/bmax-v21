import { injectIdentity, availableRefs } from './identity-inject.mjs';
import { applyStyle, styleViolations, routeModel } from './style-lock-f10.mjs';
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
const refs=availableRefs();
ok('3 reference images available (ASTRID/MERYT/OLAF)', ['ASTRID','MERYT','OLAF'].every(c=>refs[c]));
ok('SETH-NAKHT not yet referenced (honest gap)', !refs['SETH-NAKHT']);
// video injection -> subject_reference, does not break prompt/style
const vi=injectIdentity({prompt:applyStyle('SC22 beat with ASTRID')},'ASTRID','minimax/video-01',refs);
ok('video inject uses subject_reference', vi.injected && vi.field==='subject_reference' && vi.input.subject_reference);
ok('inject preserves the prompt+style', vi.input.prompt && styleViolations(vi.input.prompt).length===0);
// still injection -> image
const si=injectIdentity({prompt:applyStyle('SC48 Meryt')},'MERYT','black-forest-labs/flux-dev',refs);
ok('still inject uses image field', si.injected && si.field==='image');
// missing ref handled honestly
const mi=injectIdentity({prompt:'x'},'SETH-NAKHT','minimax/video-01',refs);
ok('missing ref => not injected, honest reason', mi.injected===false && /no reference image/.test(mi.reason));
// routing unaffected
ok('routing intact', routeModel('STILL_ANIMATABLE').correctModel==='black-forest-labs/flux-dev');
console.log(`IDENTITY-INJECT TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
