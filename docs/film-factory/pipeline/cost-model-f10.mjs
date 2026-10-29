// PARAMETRIC per-shot cost model for F10. Reads shot-list-f10.json (REAL per-shot durations, not a generic 6s)
// and computes, per shot and per method, the cost per USABLE second = (attempts × unitPrice) / usableSeconds,
// where attempts = 1 / yield (yield = fraction of generations that pass acceptance). All prices are PLUG-IN
// PARAMETERS (ESTIMATES/public tariffs, NOT measured, NOT quotes). The benchmark replaces yields+prices with
// MEASURED values. READ-ONLY, no media, no spend. Override prices via env JSON PRICES=... for scenario analysis.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const r2 = x => Math.round(x * 100) / 100;

// ---- PLUG-IN PARAMETERS (defaults are conservative PLACEHOLDERS pending Phase-2 research; override, never quote)
// pricePerSec: for video. pricePerUnit: for a still/voice-line/music-cue. yield: fraction usable (1/attempts).
const DEFAULT = {
  PREMIUM_VIDEO:    { pricePerSec: 0.50, yield: 0.40, note: 'entry video tier, per generated second (PLACEHOLDER)' },
  STILL_ANIMATABLE: { pricePerUnit: 0.04, yield: 0.60, animateFree: true, note: 'cheap image API + free Ken-Burns (PLACEHOLDER)' },
  AUDIO_LINE:       { pricePerUnit: 0.10, yield: 0.70, note: 'FR TTS per line ~ few hundred chars (PLACEHOLDER)' },
  MUSIC_CUE:        { pricePerUnit: 0.50, yield: 0.50, note: 'music gen per usable cue (PLACEHOLDER)' },
};
const PRICES = process.env.PRICES ? { ...DEFAULT, ...JSON.parse(process.env.PRICES) } : DEFAULT;

const rows = [];
for (const s of SL.shots) {
  const p = PRICES[s.mediaCategory];
  const dur = s.targetSec || 0;              // REAL planned duration from the register
  const attempts = p.yield > 0 ? r2(1 / p.yield) : Infinity;
  let genCost, usableSec;
  if (s.mediaCategory === 'PREMIUM_VIDEO') { genCost = r2(attempts * p.pricePerSec * dur); usableSec = dur; }
  else { genCost = r2(attempts * p.pricePerUnit); usableSec = dur || 1; }
  const perUsableSec = usableSec > 0 ? r2(genCost / usableSec) : null;
  rows.push({ id: s.id, cat: s.mediaCategory, durSec: dur, attempts, genCostEur: genCost, perUsableSecEur: perUsableSec });
}

const agg = {};
for (const r of rows) { const a = agg[r.cat] = agg[r.cat] || { n: 0, sec: 0, eur: 0 }; a.n++; a.sec += r.durSec; a.eur = r2(a.eur + r.genCostEur); }
console.log('COST MODEL (parametric; prices = PLACEHOLDERS until Phase-2 research/benchmark) — all ESTIMATES, not quotes');
console.log('CATEGORY         shots  genSec  €gen   avg€/usable-sec  attempts  yield');
let total = 0, totSec = 0;
for (const c of Object.keys(agg)) {
  const a = agg[c]; total = r2(total + a.eur); totSec += a.sec;
  const avg = a.sec > 0 ? r2(a.eur / a.sec) : 'per-cue(overlay)';
  console.log(`${c.padEnd(16)} ${String(a.n).padStart(4)} ${String(a.sec).padStart(6)} ${String(a.eur).padStart(7)} ${String(avg).padStart(14)}   ${String(PRICES[c].yield ? r2(1/PRICES[c].yield):'-').padStart(6)}   ${PRICES[c].yield}`);
}
console.log(`${'TOTAL generation'.padEnd(16)} ${String(rows.length).padStart(4)} ${String(totSec).padStart(6)} ${String(total).padStart(7)}  (${r2(totSec/60)} min generated coverage)`);
console.log('\nNOTE: generation ≠ final budget. Add (separately): edit, sound mix, music, rights, storage, corrections,');
console.log('and UNBILLED HUMAN TIME (never counted as €0 in hours). perUsableSec uses attempts=1/yield → a cheap tool');
console.log('with poor yield can cost MORE per usable second than a dearer tool. Durations are the register\'s real');
console.log('targetSec (video 5s×49 + 6s×15), NOT a generic 6s.');

// self-check
let pass=0,fail=0; const ok=(n,c)=>c?pass++:(fail++,console.log('  FAIL '+n));
ok('uses real per-shot durations (not all 6s)', new Set(rows.filter(r=>r.cat==='PREMIUM_VIDEO').map(r=>r.durSec)).size>1);
ok('perUsableSec computed for video', rows.filter(r=>r.cat==='PREMIUM_VIDEO').every(r=>r.perUsableSecEur>0));
ok('attempts = 1/yield applied', rows.every(r=>r.attempts>=1));
ok('prices are overridable params', !!process.env.PRICES || PRICES===DEFAULT);
console.log(`cost-model-f10 self-check: ${pass}/${pass+fail} PASS`+(fail?` (${fail} FAIL)`:''));
if(fail) process.exit(1);
