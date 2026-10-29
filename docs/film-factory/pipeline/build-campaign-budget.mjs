// §2/§3 OPTIMIZED chronological campaign plan + per-scene/per-shot BUDGET. €0, read-only.
// Quality LOCKED; only spend optimized. Uses the AUTHORITATIVE shot classification (mediaCategory:
// PREMIUM_VIDEO vs STILL_ANIMATABLE) instead of pricing every missing shot as video — stills are the INTENDED
// medium for dialogue/world coverage (Ken-Burns), NOT a quality downgrade. Separates PROVEN vs HYPOTHETICAL
// savings, reconciles historical forecasts, and reports cost per ACCEPTED FINAL MINUTE (not just per clip).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const R = (b, f) => JSON.parse(readFileSync(join(b, f), 'utf8'));
const timeline = R(canon, 'f11-film-timeline.json');
const shotlist = R(canon, 'f11-fullfilm-shotlist.json');
const dossier = R(canon, 'f11-production-resume-dossier.json');

// verified worst-case unit prices (FX 1USD<=1EUR)
const PRICE = { video: 0.60, still: 0.03, voice: 0.10 };
const SCEN = [{ name: 'MIN', accept: 0.85 }, { name: 'EXPECTED', accept: 0.70 }, { name: 'PRUDENT', accept: 0.55 }];
const MARGIN = 0.15;
const RUNTIME_MIN = 60; // target final runtime

// per-scene shot classification from the AUTHORITATIVE shotlist
const byScene = {};
for (const sh of shotlist.shots) {
  const s = (byScene[sh.scene] ??= { video: 0, still: 0, content: {} });
  if (sh.mediaCategory === 'PREMIUM_VIDEO') s.video++; else s.still++;
  s.content[sh.content] = (s.content[sh.content] || 0) + 1;
}
// existing reusable clips are ALL video (mp4) — offset video shots scene-by-scene
const existingVideoByScene = {};
for (const sc of timeline.scenes) existingVideoByScene[sc.scene] = (sc.existingAssets || []).length;

const PRIORITY_FIRST = { scene: 'SC01', shot: 'Olaf-lashed-to-mast', kind: 'PREMIUM_VIDEO', maxEur: PRICE.video, dep: 'reuses storm plate; minimax; OLAF ref exists; preflight-gated' };

let totV = 0, totS = 0, existV = 0;
const rows = timeline.scenes.map(s => {
  const b = byScene[s.scene] || { video: 0, still: 0, content: {} };
  const have = existingVideoByScene[s.scene] || 0;
  const missV = Math.max(0, b.video - have);
  const missS = b.still; // no stills generated yet
  totV += missV; totS += missS; existV += Math.min(have, b.video);
  const baseEur = +(missV * PRICE.video + missS * PRICE.still).toFixed(2);
  return {
    scene: s.scene, act: s.act, content: s.content, narrativePurpose: s.narrativePurpose,
    plannedVideo: b.video, plannedStill: b.still, reusableClips: have, reusableStatus: have ? 'HUMAN_REVIEW_PENDING (none accepted)' : '—',
    missingVideo: missV, missingStill: missS,
    optimalMethod: missV + missS === 0 ? 'fully covered (reuse)' : `reuse ${have} + ${missV}×video(€0.60) + ${missS}×still(€0.03, Ken-Burns)`,
    perSceneBaseEur: baseEur, localFreeOps: have ? ['assemble/raccord/ambience (€0)'] : [],
  };
});
const baseVideoEur = +(totV * PRICE.video).toFixed(2);
const baseStillEur = +(totS * PRICE.still).toFixed(2);
const dialogueLines = 141; const voiceEur = +(dialogueLines * PRICE.voice).toFixed(2); const musicEur = 0;

function scenario({ name, accept }) {
  const retry = +(1 / accept).toFixed(2);
  const video = baseVideoEur * retry, still = baseStillEur * retry;
  const subtotal = video + still + voiceEur + musicEur;
  const total = +(subtotal * (1 + MARGIN)).toFixed(0);
  return { name, acceptPct: accept * 100, retryFactor: retry, videoEur: +video.toFixed(0), stillEur: +still.toFixed(1), voiceEur, musicEur, marginPct: MARGIN * 100, total_EUR: total, costPerAcceptedMinute_EUR: +(total / RUNTIME_MIN).toFixed(2) };
}
const scenarios = SCEN.map(scenario);

// naive all-video model (previous) for the PROVEN-saving delta
const naiveAllVideoExpected = +(((totV + totS) * PRICE.video * (1 / 0.70) + voiceEur) * (1 + MARGIN)).toFixed(0);
const optimizedExpected = scenarios.find(s => s.name === 'EXPECTED').total_EUR;

const plan = {
  generated: '2026-10-25', mission: '§2/§3 OPTIMIZED budget — quality LOCKED, spend minimized. Forecast, NOT an authorization. T1 attempts EXHAUSTED (20/20).',
  lockedDistribution: dossier.lockedDistribution,
  qualityLocked: ['character identity/appearance consistency', 'credible motion + readable action', 'costume/weapon/env/raccord continuity', 'cinematic image/framing/exposure/pacing', 'intelligible dialogue + credible sync', 'complete mixed soundtrack', 'narrative continuity SC01→SC49', 'existing technical + cinematic acceptance thresholds'],
  shotClassification: { plannedVideo: totV + existV, plannedStill: totS, source: 'authoritative f11-fullfilm-shotlist.json mediaCategory', note: '188 PREMIUM_VIDEO + 232 STILL_ANIMATABLE across 420 shots' },
  priorityFirstPaidShot: PRIORITY_FIRST,
  perScene: rows,
  totals: { scenes: rows.length, totalPlannedShots: shotlist.totalShots, reusableClips: dossier.reusableAssets.length, missingVideo: totV, missingStill: totS, baseVideoEur, baseStillEur, dialogueLines, voiceEur, musicEur, baseTotalNoRetry_EUR: +(baseVideoEur + baseStillEur + voiceEur).toFixed(2) },
  budgetScenarios_EUR: scenarios,
  optimizationHierarchy: [
    '1. REUSE an existing clip that meets ALL criteria (9 clips; cross-scene e.g. R1-rescue→SC18/SC40)',
    '2. LOCAL crop/edit/derivative with no quality loss (Ken-Burns on stills; raccord; temp ambience)',
    '3. Better refs/model/duration/params to cut failures (minimax subject_reference for identity; preflight guards)',
    '4. Smart shot-grouping ONLY when it holds/improves continuity+quality',
    '5. Best total-cost provider at VERIFIED-equal quality (minimax €0.60 video vs seedance €0.70; flux €0.03 still)',
    '6. Generate new ONLY when necessary',
  ],
  // CORRECTED framing (CVIII++ Phase 1.4): a "proven" saving requires a reproducible, normalised comparison.
  savings: {
    BASELINE_CORRECTION_not_a_method_saving: {
      id: 'still-vs-video classification', deltaVsAllVideoExpected_EUR: naiveAllVideoExpected - optimizedExpected,
      honest: 'This €' + (naiveAllVideoExpected - optimizedExpected) + ' is NOT a method-driven saving — it is a CORRECTION of an all-video STRAWMAN baseline I had over-counted. Pricing the 232 stills at €0.025–0.03 (their INTENDED medium per the authoritative shotlist) is the PLAN, not a discovered economy. The only hard fact is the verified unit prices (video $0.50/6s flat vs still $0.025).',
    },
    PROVEN_reproducible: [
      { id: 'temporal multi-beat per flat-rate clip', detail: 'minimax is FLAT $0.50 for a ~6s 720p clip. A clip with a performance arc yields >=2 distinct edit beats at full res (NO crop). DEMONSTRATED: A1b €0.50 -> beatA(head-down, 2.76s)+beatB(head-up/defiance, 2.64s), both decode clean => €0.25/edit-beat.', evidence: 'runs/production-t1/reuse-proof/A1b-beatA-intro.mp4 + A1b-beatB-defiance.mp4', scope: 'PROVEN on 1 clip; film-wide factor is ESTIMATED below' },
      { id: 'preflight E005 avoidance', detail: 'PL-2 blocks seedance+Björn BEFORE any paid call (7 reproduced E005 failures) — avoids retry waste on a known-fail route', basis: 'INC-T1-001; operating-contract guard (route-level; not €-quantified to avoid double-count)' },
    ],
    ESTIMATED_needs_validation: [
      { id: 'film-wide reuse factor', detail: 'IF a conservative 1.3 of the 188 video shots are served by multi-beat clips, paid video gens drop ~23% (see reuseOptimized scenario). Confidence MEDIUM — depends how many clips have a usable performance arc; VALIDATE per-clip during production (€0 at edit time).' },
      { id: 'provider arbitrage', detail: 'a cheaper video provider at verified-equal identity/quality could undercut €0.50 — requires a controlled equal-quality paid A/B (NOT run here)' },
      { id: 'local vs neural upscale', detail: '720p->1080p by local lanczos is €0 (resolution met; detail caveat); a neural upscaler may raise quality at a per-clip cost — A/B needed' },
    ],
  },
  hiddenCosts: {
    upscale_720_to_1080: { requirement: 'deliverable is 1080p+; minimax maxRes=720p => every video clip needs upscaling', localLanczos_EUR: 0, note: 'local ffmpeg lanczos produces 1920x1080 at €0 (DEMONSTRATED: reuse-proof/A1b-beatA-1080.mp4) — resolution is met but detail is not enhanced; a neural upscaler would cost per clip. Flagged, not hidden.' },
    stills_upscale: { note: 'flux stills may also need upscaling to 1080p+; local €0 (same lanczos path)' },
    proMix: { note: 'a professional final audio mix may be human/out-of-scope beyond the voice+CC0 budget' },
  },
  reuseOptimized_EUR: (() => {
    const RF = 1.3; // CONSERVATIVE, ESTIMATED (proven lever, unvalidated film-wide factor)
    const videoGens = Math.ceil(totV / RF);
    const base = videoGens * PRICE.video + totS * PRICE.still;
    const exp = +((base * (1 / 0.70) + voiceEur) * (1 + MARGIN)).toFixed(0);
    const pru = +((base * (1 / 0.55) + voiceEur) * (1 + MARGIN)).toFixed(0);
    return { reuseFactorAssumed: RF, videoGens, note: 'ESTIMATE — temporal multi-beat applied to video only; validate per-clip in production', EXPECTED_EUR: exp, PRUDENT_EUR: pru, deltaVsNoReuseExpected_EUR: optimizedExpected - exp };
  })(),
  forecastReconciliation: {
    historical: { c2c_reuse_adjusted_EUR: '167–401', perShot_allVideo_EUR: '351–532' },
    thisOptimized_EUR: `${scenarios[0].total_EUR}–${scenarios[2].total_EUR}`,
    explanation: 'The €351–532 model over-priced by treating all 411 missing shots as €0.60 video. Correct classification (188 video / 232 still) collapses the gap: stills at €0.03 remove ~€' + (naiveAllVideoExpected - optimizedExpected) + ' at EXPECTED. c2c (€167–401) additionally assumes reuse/hold factors (fewer unique clips); this optimized model counts every planned shot once (no reuse>1 yet) → it sits at the credible LOW end, converging with c2c.',
    doNotMix: 'These are FORECASTS. Already-PAID = €11.63 (t1 6.80 + pilot 1.53 + av 3.30) is separate and NOT part of these forward budgets.',
  },
  costPerUnit: { perAcceptedClip_EUR: 0.629, perAcceptedFinalMinute_EUR: scenarios.map(s => ({ scenario: s.name, eur: s.costPerAcceptedMinute_EUR })) },
  audioMixEstimate_EUR: { dialogue_voice: voiceEur, music_CC0: 0, sfx_ambience: 'CC0/synth (€0 if licence-clear) or licensed pack (verify)', mix: 'local ffmpeg (€0) for work mix; pro mix = human/out-of-scope', note: 'final audio needs per-file licence verification; temp synth bed is WORK-only' },
  authorizationNeeded: {
    blocker: 'T1 attempts 20/20 EXHAUSTED → reserve() throws ATTEMPT CAP; €8.20 residue NOT spendable.',
    suggestedAttemptBudget: { MIN: Math.ceil((totV + totS) / 0.85), EXPECTED: Math.ceil((totV + totS) / 0.70), PRUDENT: Math.ceil((totV + totS) / 0.55) },
    note: 'A forecast (€171/€204/€255 or any) is NOT an authorization. No paid call runs until a new attempt+budget authorization is recorded.',
  },
};
writeFileSync(join(canon, 'f11-campaign-budget.json'), JSON.stringify(plan, null, 1));
console.log(`OPTIMIZED BUDGET: missing ${totV} video + ${totS} still | base €${(baseVideoEur + baseStillEur).toFixed(0)} gen + €${voiceEur} voice`);
for (const s of scenarios) console.log(`  ${s.name.padEnd(9)} accept ${s.acceptPct}% ×${s.retryFactor} | video €${s.videoEur} + still €${s.stillEur} + voice €${s.voiceEur} +${s.marginPct}% => €${s.total_EUR} (€${s.costPerAcceptedMinute_EUR}/accepted-min)`);
console.log(`CORRECTION: the €${naiveAllVideoExpected - optimizedExpected} 'still-vs-video' delta is a BASELINE CORRECTION (all-video strawman), NOT a method saving.`);
console.log(`PROVEN lever: temporal multi-beat — A1b €0.50 -> 2 edit beats (€0.25/beat). ESTIMATED film-wide (reuse 1.3): EXPECTED €${plan.reuseOptimized_EUR.EXPECTED_EUR} (vs €${optimizedExpected}, -€${plan.reuseOptimized_EUR.deltaVsNoReuseExpected_EUR}) — VALIDATE per-clip.`);
console.log(`hidden cost flagged: 720p->1080p upscale (local lanczos €0; neural = paid A/B).`);
