// Validate pricing-register-f10.json: every tariff carries a source + verified flag, nothing is presented as a
// quote/measured spend, unverified items are explicitly flagged, and OSS post-production is $0. READ-ONLY.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(readFileSync(join(here, 'pricing-register-f10.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

ok('observed date present', /^\d{4}-\d{2}-\d{2}$/.test(P.observed));
ok('disclaimer: not quotes / not measured', /NOT quotes/i.test(P.disclaimer) && /NOT measured/i.test(P.disclaimer));
ok('FX is flagged ESTIMATE', /ESTIMATE/i.test(P.fxNote));

const priced = [...P.video, ...P.image, ...P.voiceFR, ...P.music, ...P.cloudGpu];
for (const e of priced) {
  const label = e.tool || e.provider;
  ok(`${label}: has source`, !!e.source);
  ok(`${label}: has verified flag`, e.verified === 'OFFICIAL' || e.verified === 'UNVERIFIED');
  // a null price MUST be an explicitly unverified / unavailable item (never a silent gap)
  const price = e.usdPerSec ?? e.usdPerImage ?? e.usdPer1kChars ?? e.usdPerTrack ?? e.usdPerHour;
  if (price === null) ok(`${label}: null price is flagged UNVERIFIED/caveated`, e.verified === 'UNVERIFIED' && !!e.caveat);
}
ok('OSS post-production all $0', P.ossPostProduction.every(o => o.usd === 0 && o.license));
ok('OSS licenses present', P.ossPostProduction.every(o => /GPL|LGPL|MPL|freeware/i.test(o.license)));
ok('commercial-use gates documented', Array.isArray(P.commercialUseGates) && P.commercialUseGates.length >= 4);
ok('biggest risks documented (yield unmeasured called out)', P.biggestRisks.some(r => /YIELD|UNMEASURED/i.test(r)));
ok('at least one OFFICIAL video + image + voice + music source', P.video.some(x=>x.verified==='OFFICIAL') && P.image.some(x=>x.verified==='OFFICIAL') && P.voiceFR.some(x=>x.verified==='OFFICIAL') && P.music.some(x=>x.verified==='OFFICIAL'));

console.log(`pricing-register-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
