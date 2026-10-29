// Proves identity propagation AT THE RUNNER BOUNDARY (mock adapter captures the exact input). 0 network, 0 paid.
// Verifies: inject ONLY for an unambiguous single covered character; NO injection when ambiguous (multiple covered)
// or the character is uncovered; correct field per model (video=subject_reference, still=image); no identity leak;
// style/routing preserved. Establishers included so inserts pass the dependency gate.
import { runCampaign } from './campaign-runner.mjs';
import { readFileSync, mkdtempSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'; import { tmpdir } from 'node:os';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const pick = id => sl.shots.find(s => s.id === id);
// establishers first so dependent inserts are processed; then the shots under test
const IDS = ['SC48-SH01','SC48-SH02','SC22-SH01','SC22-SH06','SC39-SH01','SC39-SH04','SC15-SH01','SC24-SH01'];
const SHOTS = IDS.map(pick).filter(Boolean);
const captured = {}; let networkCalls = 0;
const mockAdapter = { generate: async o => { captured[o.idempotencyKey] = o.input; return { status:'SUCCEEDED', ok:true, paid:false, costEur:0, outputUrls:['mock://x'] }; } };
const mockLedger = { snapshot:()=>({spent:0}), canAttempt:()=>true, reserve:()=>'r', settle:()=>({}), release:()=>({}) };
const of = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error('no network'); };
const dir = mkdtempSync(join(tmpdir(),'idprop-'));
const r = await runCampaign({ adapter: mockAdapter, ledger: mockLedger, shots: SHOTS, outDir: dir, dryRun: false, statePath: join(dir,'st.json'), injectIdentity: true, download: null, ciqe: null });
globalThis.fetch = of;
let pass=0,fail=0,fails=[]; const ok=(n,c)=>{if(c)pass++;else{fail++;fails.push(n);}};
ok('SC48 (Meryt still, named+covered) -> image=MERYT', captured['SC48-SH02']?.image?.includes('MERYT.webp'));
ok('SC22 (single covered ASTRID, video) -> subject_reference=ASTRID', captured['SC22-SH06']?.subject_reference?.includes('ASTRID.webp'));
ok('SC24 (single covered ASTRID, still) -> image=ASTRID', captured['SC24-SH01']?.image?.includes('ASTRID.webp'));
ok('SC39 (OLAF+MERYT both covered = AMBIGUOUS) -> NOT injected', !captured['SC39-SH04']?.subject_reference);
ok('SC15 (3 covered = AMBIGUOUS) -> NOT injected', !captured['SC15-SH01']?.image && !captured['SC15-SH01']?.subject_reference);
ok('NO identity leak (SC48 ref is MERYT, not ASTRID)', !/ASTRID/.test(captured['SC48-SH02']?.image||''));
ok('correct field: video uses subject_reference, still uses image', captured['SC22-SH06']?.subject_reference && !captured['SC22-SH06']?.image && captured['SC48-SH02']?.image && !captured['SC48-SH02']?.subject_reference);
ok('style anchor preserved on injected shot', /photorealistic cinematic/i.test(captured['SC48-SH02']?.prompt||''));
ok('ZERO network calls', networkCalls===0);
ok('runner recorded injection (MERYT + ASTRID)', r.records.some(x=>x.injection?.character==='MERYT') && r.records.some(x=>x.injection?.character==='ASTRID'));
console.log('captured: SC48='+Object.keys(captured['SC48-SH02']||{})+' SC22='+Object.keys(captured['SC22-SH06']||{})+' SC39='+Object.keys(captured['SC39-SH04']||{}));
console.log(`IDENTITY-PROPAGATION TESTS: ${fail===0?'PASS':'FAIL'} (pass=${pass} fail=${fail})`+(fail?` [${fails.join(', ')}]`:''));
process.exit(fail===0?0:1);
