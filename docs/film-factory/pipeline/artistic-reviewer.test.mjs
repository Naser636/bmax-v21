import { reviewShot, DIMENSIONS, ACCEPTANCE_STATES } from './artistic-reviewer.mjs';
import { execFileSync } from 'node:child_process'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { rmSync } from 'node:fs';
const FFMPEG = join(import.meta.dirname, 'vendor/node_modules/ffmpeg-static/ffmpeg');
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
// 1) no media -> BLOCKED_BY_EXTERNAL_DEPENDENCY, semantic all HUMAN_REVIEW_REQUIRED, no score
const r0 = reviewShot({ shotId:'X', mediaPath:null, intent:'test' });
ok('no-media -> BLOCKED_BY_EXTERNAL_DEPENDENCY', r0.acceptanceState==='BLOCKED_BY_EXTERNAL_DEPENDENCY');
ok('no artistic score emitted', r0.artisticScore.startsWith('NOT_EMITTED'));
ok('semantic dims = HUMAN_REVIEW_REQUIRED', DIMENSIONS.filter(d=>d.kind==='semantic').every(d=>r0.dimensions.find(f=>f.dimension===d.key)?.result==='HUMAN_REVIEW_REQUIRED'));
ok('semantic STUB clearly marked', r0.semanticStub.kind==='STUB' && r0.semanticStub.evaluated===false);
ok('no fabricated evidence (no timecode/visual detail)', r0.dimensions.every(f=>!/\d\d:\d\d/.test(JSON.stringify(f.evidence||''))));
// 2) real clean media -> ARTISTIC_REVIEW_REQUIRED, technical PASS
const clean = join(tmpdir(),`ar-clean-${process.pid}.mp4`); rmSync(clean,{force:true});
execFileSync(FFMPEG,['-hide_banner','-y','-f','lavfi','-i','testsrc2=s=320x240:r=25:d=1','-f','lavfi','-i','sine=frequency=300:d=1','-map','0:v','-map','1:a','-af','volume=0.2','-pix_fmt','yuv420p','-c:a','aac','-shortest',clean],{stdio:['ignore','ignore','ignore']});
const r1 = reviewShot({ shotId:'Y', mediaPath:clean });
ok('clean media -> ARTISTIC_REVIEW_REQUIRED', r1.acceptanceState==='ARTISTIC_REVIEW_REQUIRED');
ok('clean media technical PASS', r1.dimensions.find(f=>f.dimension==='technical_defects').result==='PASS');
// 3) black media -> TECHNICAL_FAIL (critical blocking)
const black = join(tmpdir(),`ar-black-${process.pid}.mp4`); rmSync(black,{force:true});
execFileSync(FFMPEG,['-hide_banner','-y','-f','lavfi','-i','color=c=black:s=320x240:r=25:d=1','-pix_fmt','yuv420p',black],{stdio:['ignore','ignore','ignore']});
const r2 = reviewShot({ shotId:'Z', mediaPath:black });
ok('black media -> TECHNICAL_FAIL', r2.acceptanceState==='TECHNICAL_FAIL');
ok('TECHNICAL_FAIL is blocking', r2.criticalBlocking.includes('technical_defects'));
ok('acceptance states are from the contract', ACCEPTANCE_STATES.includes(r0.acceptanceState)&&ACCEPTANCE_STATES.includes(r1.acceptanceState)&&ACCEPTANCE_STATES.includes(r2.acceptanceState));
rmSync(clean,{force:true}); rmSync(black,{force:true});
console.log(`ARTISTIC-REVIEWER TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
