// Source-dated, auditable COST ESTIMATE for the 5 benchmark shots. Separates: provider unit price (sourced),
// expected attempts (1/yield), failed generations, usable yield, FX/VAT uncertainty, and WORST-CASE exposure
// (8-attempt cap). All ESTIMATES — NOT actual costs, NOT quotes. No paid call, no key, €0. READ-ONLY.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const PR = JSON.parse(readFileSync(join(here, 'pricing-register-f10.json'), 'utf8'));
const shot = id => SL.shots.find(s => s.id === id);
const r2 = x => Math.round(x * 100) / 100;

// sourced unit prices (USD) from the register, by role
const vTurbo = PR.video.find(v => /Turbo/.test(v.tool)).usdPerSec;      // 0.05 OFFICIAL
const vHero = PR.video.find(v => /Gen-4\.5/.test(v.tool)).usdPerSec;    // 0.12 OFFICIAL
const imgDev = PR.image.find(v => /dev/.test(v.tool)).usdPerImage;      // 0.025 OFFICIAL
const voice = PR.voiceFR.find(v => /ElevenLabs/.test(v.tool)).usdPer1kChars; // 0.182 (emotion-grade)
const FX = 0.92;              // 1 USD ≈ €0.92 — ESTIMATE, not measured
const FX_UNC = 0.05;          // ±5% currency drift assumption
const VAT = 0.20;             // EU VAT may apply on provider invoices (assumption; some providers add it)
const MAX_ATTEMPTS = 8;

// pre-set yields (ESTIMATE, UNMEASURED — the benchmark MEASURES these)
const Y = { video: 0.40, videoHero: 0.35, still: 0.55, voice: 0.70 };

const B = [
  { bm: 'B1-hero', id: 'SC40-SH06', kind: 'video', tier: 'hero', unit: vHero, dur: shot('SC40-SH06').targetSec, yield: Y.videoHero, note: 'siege: faces+crowd+water+motion → hero tier (Gen-4.5)' },
  { bm: 'B2-water-crowd', id: 'SC22-SH06', kind: 'video', tier: 'std', unit: vTurbo, dur: shot('SC22-SH06').targetSec, yield: Y.video, note: 'second tide + crowd (Turbo)' },
  { bm: 'B3-intimate', id: 'SC43-SH03', kind: 'still+voice', tier: 'still', unit: imgDev, dur: shot('SC43-SH03').targetSec, yield: Y.still, voiceChars: 180, note: 'Olaf two-shot still + FR VO (emotion)' },
  { bm: 'B4-establisher', id: 'SC01-SH01', kind: 'video', tier: 'std', unit: vTurbo, dur: shot('SC01-SH01').targetSec, yield: Y.video, altStill: imgDev, note: 'establisher video; still+Ken-Burns alt tested here' },
  { bm: 'B5a-wound-inflicted', id: 'SC39-SH04', kind: 'video', tier: 'std', unit: vTurbo, dur: shot('SC39-SH04').targetSec, yield: Y.video, note: 'Meryt disarm (continuity pair w/ SC48-SH02 still)' },
  { bm: 'B5b-wound-healed', id: 'SC48-SH02', kind: 'still', tier: 'still', unit: imgDev, dur: shot('SC48-SH02').targetSec, yield: Y.still, note: 'cairn: bound wound continuity (still)' },
];

const rows = B.map(b => {
  const expAttempts = r2(1 / b.yield);
  const failedPerUsable = r2(expAttempts - 1);
  // cost per usable item (USD): video = attempts × unit × dur ; still = attempts × unit ; + voice if present
  const genUsd = b.kind.startsWith('video') ? r2(expAttempts * b.unit * b.dur) : r2(expAttempts * b.unit);
  const voiceUsd = b.voiceChars ? r2((1 / Y.voice) * (b.voiceChars / 1000) * voice) : 0;
  const expUsd = r2(genUsd + voiceUsd);
  // worst-case: 8 attempts, no usable yield credit
  const worstUsd = r2((b.kind.startsWith('video') ? MAX_ATTEMPTS * b.unit * b.dur : MAX_ATTEMPTS * b.unit) + (b.voiceChars ? MAX_ATTEMPTS * (b.voiceChars / 1000) * voice : 0));
  const toEur = u => r2(u * FX);
  return { bm: b.bm, id: b.id, kind: b.kind, tier: b.tier, durSec: b.dur, unitUsd: b.unit, yield: b.yield, expectedAttempts: expAttempts, failedGensPerUsable: failedPerUsable,
    expectedUsd: expUsd, expectedEur: toEur(expUsd), worstCaseUsd: worstUsd, worstCaseEur: toEur(worstUsd), note: b.note };
});

const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
const expEurBase = sum('expectedEur'), worstEurBase = sum('worstCaseEur');
// uncertainty envelope: FX ±5% and possible +20% VAT on top of the EUR figures
const expEurHigh = r2(expEurBase * (1 + FX_UNC) * (1 + VAT));
const worstEurHigh = r2(worstEurBase * (1 + FX_UNC) * (1 + VAT));

const out = {
  generated: 'Benchmark (5-shot) auditable cost ESTIMATE — NOT actual costs, NOT a quote', reference: 'pricing-register-f10.json',
  pricesObserved: PR.observed, fxAssumption: `1 USD ≈ €${FX} (ESTIMATE); ±${FX_UNC * 100}% drift; VAT up to ${VAT * 100}% may apply`,
  budgetAuthorizedThisMission: 0, authorizedCeilingNote: 'proposed ≤€250 ceiling is NOT spend authorization',
  yieldsAreUnmeasured: true, maxAttemptsPerShot: MAX_ATTEMPTS,
  rows,
  totals: {
    expectedEur_base: expEurBase, expectedEur_withFXandVAT: expEurHigh,
    worstCaseEur_base: worstEurBase, worstCaseEur_withFXandVAT: worstEurHigh,
    worstCaseVsCeiling250: worstEurHigh <= 250 ? `within €250 (€${worstEurHigh})` : `EXCEEDS €250 (€${worstEurHigh})`,
  },
  caveats: [
    'Yields are PRE-SET ESTIMATES, UNMEASURED — the benchmark MEASURES them; real cost may differ.',
    'Prices observed ' + PR.observed + '; providers bill USD; FX + possible VAT add uncertainty (envelope shown).',
    'Worst-case = 8 attempts/shot with zero usable credit — the hard-stop ceiling, not an expectation.',
    'Veo excluded (availability uncertain); hero tier = Runway Gen-4.5, std = Gen-4 Turbo (both OFFICIAL-sourced).',
    'Estimate ≠ actual cost ≠ quote. No paid call made.',
  ],
};
writeFileSync(join(here, 'benchmark-cost-estimate-f10.json'), JSON.stringify(out, null, 1));
console.log('BENCHMARK COST ESTIMATE (5 shots) — ESTIMATES, not actual:');
console.log('bm              shot        kind         dur  unit$  yield  attempts  exp€   worst€');
for (const r of rows) console.log(`${r.bm.padEnd(15)} ${r.id.padEnd(11)} ${r.kind.padEnd(11)} ${String(r.durSec).padStart(3)}  ${String(r.unitUsd).padStart(5)}  ${String(r.yield).padStart(4)}  ${String(r.expectedAttempts).padStart(6)}   ${String(r.expectedEur).padStart(5)}  ${String(r.worstCaseEur).padStart(5)}`);
console.log(`\nEXPECTED total €${expEurBase} (base) / €${expEurHigh} (w/ FX+VAT)  |  WORST-CASE €${worstEurBase} (base) / €${worstEurHigh} (w/ FX+VAT)`);
console.log(`worst-case vs €250 ceiling: ${out.totals.worstCaseVsCeiling250}`);
