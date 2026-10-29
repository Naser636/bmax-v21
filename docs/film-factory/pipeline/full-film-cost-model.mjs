// Full-film (authoritative F10, 420 shots) cost model — 3 scenarios. Reads the real inventory; prices VERIFIED
// on Replicate 2026-10-24. Retry/acceptance rates are EXPLICIT ESTIMATES (hypotheses) until a pilot measures them.
// No paid call. Reproducible: edit assumptions here and re-run.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8')).shots;

const cat = {}; const sec = {};
for (const s of S) { const c = s.mediaCategory; cat[c] = (cat[c] || 0) + 1; sec[c] = (sec[c] || 0) + (s.targetSec || 0); }
const PV = cat.PREMIUM_VIDEO, PVsec = sec.PREMIUM_VIDEO, ST = cat.STILL_ANIMATABLE, AUD = cat.AUDIO_LINE, MUS = cat.MUSIC_CUE;
const refsNeeded = 9;

// VERIFIED unit prices (USD), Replicate 2026-10-24
const P = { flux: 0.025, seed25_s: 0.1028, seed1_s: 0.03, veo_s: 0.15, minimax_clip: 0.50, speech_1k: 0.10 };
const FX = 1.08; // EUR = USD/FX (assumed)
const eur = u => +(u / FX).toFixed(2);
const avgPVsec = PVsec / PV; // ~5.2

// --- Scenario A: BASELINE (current plan, no optimization) ---
// PV all on minimax ($0.50/clip); EVERY still flux + i2v-animated on seedance-1-pro; voice; music est; refs.
const A = {};
A.pv = PV * P.minimax_clip;
A.still = ST * P.flux + sec.STILL_ANIMATABLE * P.seed1_s; // animate all 729s
A.voice = (AUD * 40 / 1000) * P.speech_1k; // ~40 tok/line
A.music = MUS * 0.40; // ESTIMATE
A.refs = refsNeeded * P.flux * 3; // 3 rolls
A.sfx = 2.0; // ESTIMATE
A.base = A.pv + A.still + A.voice + A.music + A.refs + A.sfx;
A.retry = { pv: 2.5, still: 2.0, voice: 1.3, music: 1.5, refs: 1.0, sfx: 1.5 };
A.withRetries = A.pv * A.retry.pv + A.still * A.retry.still + A.voice * A.retry.voice + A.music * A.retry.music + A.refs + A.sfx * A.retry.sfx;

// --- Scenario B: OPTIMIZED (routing + reference reuse + validation-first + retry control) ---
const B = {};
// route 64 PV: 30 identity→seedance-2.5, 10 realism→veo-fast, 24 simple→seedance-1-pro
B.pv = 30 * avgPVsec * P.seed25_s + 10 * avgPVsec * P.veo_s + 24 * avgPVsec * P.seed1_s;
// animate only 60 of 196 stills (rest Ken-Burns $0 in edit)
B.still = ST * P.flux + 60 * (sec.STILL_ANIMATABLE / ST) * P.seed1_s;
B.voice = A.voice; B.music = MUS * 0.40; B.refs = refsNeeded * P.flux * 3; B.sfx = 2.0;
B.base = B.pv + B.still + B.voice + B.music + B.refs + B.sfx;
// lower retries: PROVEN pre-gen gates + flux-still validation-first catch defects pre-spend
B.retry = { pv: 1.8, still: 1.3, voice: 1.2, music: 1.3, refs: 1.0, sfx: 1.3 };
B.withRetries = B.pv * B.retry.pv + B.still * B.retry.still + B.voice * B.retry.voice + B.music * B.retry.music + B.refs + B.sfx * B.retry.sfx;

// --- Scenario C: MAX PRACTICAL REDUCTION (same quality gate) ---
const C = {};
// minimize per-second: seedance-2.5 only for ~24 truly identity-critical; 4 hero veo; rest seedance-1-pro; tighter 5s
const cPVsec = 5;
C.pv = 24 * cPVsec * P.seed25_s + 4 * 6 * P.veo_s + (PV - 28) * cPVsec * P.seed1_s;
// Ken-Burns for most coverage; animate only 30 stills @3s
C.still = ST * P.flux + 30 * 3 * P.seed1_s;
C.voice = A.voice; C.music = 0; /* licensed library €0 (flagged) */ C.refs = refsNeeded * P.flux * 2; C.sfx = 0; /* library */
C.base = C.pv + C.still + C.voice + C.music + C.refs + C.sfx;
C.retry = { pv: 1.5, still: 1.2, voice: 1.2, music: 1.0, refs: 1.0, sfx: 1.0 };
C.withRetries = C.pv * C.retry.pv + C.still * C.retry.still + C.voice * C.retry.voice + C.music * C.retry.music + C.refs + C.sfx;

const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]));
const out = {
  generated: '2026-10-24',
  mission: 'Full-film (authoritative F10, 420 shots) cost model — 3 scenarios. €0 spent; no paid call.',
  inventory: { scenes: 49, shots: S.length, PREMIUM_VIDEO: PV, PREMIUM_VIDEO_sec: PVsec, STILL_ANIMATABLE: ST, STILL_sec: sec.STILL_ANIMATABLE, AUDIO_LINE: AUD, MUSIC_CUE: MUS, charactersNeedingRefs: refsNeeded, avgPVsec: +avgPVsec.toFixed(2) },
  pricesVERIFIED_USD: P, fxAssumption: `EUR = USD / ${FX}`,
  estimateHonesty: 'Unit prices are VERIFIED. Retry/acceptance multipliers are ESTIMATES (hypotheses) — NOT measured beyond the 8-attempt pilot. Music/SFX are ESTIMATES (no integrated provider). Editing is local (ffmpeg, ~€0 compute).',
  scenarios: {
    A_baseline: { desc: 'current plan; all-PV minimax; animate all stills; no optimization', components_USD: round({ pv: A.pv, still: A.still, voice: A.voice, music: A.music, refs: A.refs, sfx: A.sfx }), base_USD: +A.base.toFixed(2), retryMultipliers: A.retry, withRetries_USD: +A.withRetries.toFixed(2), withRetries_EUR: eur(A.withRetries) },
    B_optimized: { desc: 'model routing (seedance-2.5/veo-fast/seedance-1-pro by need) + Ken-Burns for most coverage + validation-first + gated retry control', components_USD: round({ pv: B.pv, still: B.still, voice: B.voice, music: B.music, refs: B.refs, sfx: B.sfx }), base_USD: +B.base.toFixed(2), retryMultipliers: B.retry, withRetries_USD: +B.withRetries.toFixed(2), withRetries_EUR: eur(B.withRetries) },
    C_maxReduction: { desc: 'min per-second routing + tight durations + Ken-Burns default + licensed-library music/sfx (€0) + tightest gated retries; SAME quality gate', components_USD: round({ pv: C.pv, still: C.still, voice: C.voice, music: C.music, refs: C.refs, sfx: C.sfx }), base_USD: +C.base.toFixed(2), retryMultipliers: C.retry, withRetries_USD: +C.withRetries.toFixed(2), withRetries_EUR: eur(C.withRetries) },
  },
  savings: { B_vs_A_USD: +(A.withRetries - B.withRetries).toFixed(2), B_vs_A_pct: +((1 - B.withRetries / A.withRetries) * 100).toFixed(0), C_vs_A_USD: +(A.withRetries - C.withRetries).toFixed(2), C_vs_A_pct: +((1 - C.withRetries / A.withRetries) * 100).toFixed(0) },
};
writeFileSync(join(here, 'runs/benchmark/full-film-cost-analysis.json'), JSON.stringify(out, null, 1));
console.log('FULL-FILM COST (with retries, USD → EUR):');
console.log('  A baseline    $' + A.withRetries.toFixed(2) + ' (€' + eur(A.withRetries) + ')');
console.log('  B optimized   $' + B.withRetries.toFixed(2) + ' (€' + eur(B.withRetries) + ')  save ' + out.savings.B_vs_A_pct + '%');
console.log('  C max-reduce  $' + C.withRetries.toFixed(2) + ' (€' + eur(C.withRetries) + ')  save ' + out.savings.C_vs_A_pct + '%');
