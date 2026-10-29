// Concentration / assumption risk audit of the full-film routing. Read-only; no provider call.
// Flags WARNINGS (and justified blockers) without relaxing the quality gate.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeShot, VERIFIED_PRICES } from './quality-router.mjs';
import { fromShotListShot } from './shot-requirements.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8')).shots;

const fmt = JSON.parse(readFileSync(join(here, 'runs/benchmark/production-format.json'), 'utf8'));
const deliverable = parseInt(String(fmt.deliverableResolution.value), 10);
const byModel = {}; let multiIdentity = 0, resAssumed = 0, resBlocked = 0, resContract = 0, pv = 0, musicUnknown = 0, costUnknown = 0, pvWithFallback = 0, qualityReview = 0;
for (const s of S) {
  // resolution classification under the OPEN policy (authoritative state)
  const reqOpen = fromShotListShot(s, { deliverableResolution: deliverable });
  if (s.mediaCategory === 'PREMIUM_VIDEO') {
    pv++; if (reqOpen.identityNeed === 'multi') multiIdentity++;
    if (reqOpen.resolutionSource === 'ASSUMED') resAssumed++; else if (reqOpen.resolutionSource === 'BLOCKED_FOR_REQUIREMENT') resBlocked++; else if (reqOpen.resolutionSource === 'CONTRACT') resContract++;
  }
  if (s.mediaCategory === 'MUSIC_CUE') musicUnknown++;
  // model distribution is policy-conditional → probe under the NATIVE scenario (a concrete decided policy)
  const r = routeShot(fromShotListShot(s, { deliverableResolution: deliverable, genPolicy: 'native' }));
  if (r.model) byModel[r.model] = (byModel[r.model] || 0) + 1;
  if (r.priceStatus === 'UNKNOWN') costUnknown++;
  if (s.mediaCategory === 'PREMIUM_VIDEO') { if ((r.fallbacks || []).length > 0) pvWithFallback++; if (r.qualityReview) qualityReview++; }
}
const total = S.length;
const topModelShare = Math.max(...Object.values(byModel)) / total;
const VIDEO = ['bytedance/seedance-2.5', 'bytedance/seedance-2.0', 'bytedance/seedance-1-pro', 'bytedance/seedance-1-lite', 'google/veo-3-fast', 'minimax/video-01'];
const videoModelCounts = Object.fromEntries(VIDEO.filter(m => byModel[m]).map(m => [m, byModel[m]]));
const domVideoModel = Object.entries(videoModelCounts).sort((a, b) => b[1] - a[1])[0] || ['(none)', 0];
const videoOnOneModel = pv ? domVideoModel[1] / pv : 0;

const warnings = [];
const warn = (severity, id, finding, mitigation) => warnings.push({ severity, id, finding, mitigation });

const fallbackCoverage = pv ? pvWithFallback / pv : 0;
if (videoOnOneModel >= 0.9) warn(fallbackCoverage >= 0.9 ? 'MEDIUM' : 'HIGH', 'RISK-1 single-video-model concentration', `${(videoOnOneModel * 100).toFixed(0)}% of PREMIUM_VIDEO routes to ${domVideoModel[0]} (under the probed native-1080 policy). Verified multi-identity FALLBACKS exist for ${(fallbackCoverage * 100).toFixed(0)}% of PV — registered for redundancy, but their cinematic quality is UNVERIFIED.`, 'Keep the highest-inspected-quality model as primary (quality-first). Get HUMAN quality sign-off before relying on any fallback. Concentration mitigated (fallbacks registered) not eliminated (quality unproven).');
warn('MEDIUM', 'RISK-2 720p on the PRIMARY identity model', `seedance-2.5 (primary) maxes at 720p. A 1080p/4k multi-identity path now EXISTS via seedance-2.0 (quality UNVERIFIED) — so 720p is no longer forced, but using 1080 means an unverified-quality model.`, 'HUMAN sign-off via the opening validation: is 720p (inspected) acceptable, or is 1080 (seedance-2.0, unverified) worth the quality risk? Do NOT silently switch.');
if (multiIdentity / Math.max(pv, 1) >= 0.9) warn('MEDIUM', 'RISK-3 multi-identity ubiquity', `${multiIdentity}/${pv} PV shots are multi-identity → the cost floor is set by a multi-ref model.`, 'Confirm multi-identity is truly required per shot (vs background figures); a genuinely single-subject shot could route cheaper — only if quality holds.');
if (musicUnknown > 0) warn('HIGH', 'RISK-4 music cost UNKNOWN', `${musicUnknown} MUSIC_CUE shots have UNKNOWN cost (no verified source/rights; router returns null, NOT €0).`, 'Verify a licensed/royalty-free source with rights (then its real price) OR integrate+price a music model. Until then music cost stays UNKNOWN and is excluded from arithmetic totals.');
warn('MEDIUM', 'RISK-5 per-shot generation resolution BLOCKED_FOR_REQUIREMENT', `Reclassified from the earlier silent ASSUMED-720: the deliverable 1080p+ is now CONTRACT (traced to docs 14/39/03), but the per-shot GENERATION resolution for ${resBlocked} PV shots is BLOCKED pending the generate-native-1080 vs upscale-from-720 decision (quality-affecting per rubric #7). resAssumed=${resAssumed}, resContract=${resContract}.`, 'HUMAN decision: native-1080 (seedance-2.0, quality UNVERIFIED) vs upscale-720 (seedance-2.5 inspected + upscale artifact risk). See fullfilm-routing-summary decisionSupport. Do NOT invent a per-shot requirement to clear the blocker.');
warn('LOW', 'RISK-6 single still/voice provider', `stills=${byModel['black-forest-labs/flux-dev'] || 0} on flux-dev, voice on speech-02-hd (single providers each).`, 'Lower risk (cheap, swappable); keep provider abstraction; qualify alternates opportunistically.');

const out = {
  generated: '2026-10-24', mission: 'Full-film routing concentration/assumption risk audit. No gate relaxation. €0.',
  distribution: { total, byModelUnderNativePolicy: byModel, dominantVideoModel: domVideoModel[0], topModelSharePct: +(topModelShare * 100).toFixed(1), videoConcentrationPct: +(videoOnOneModel * 100).toFixed(1), multiIdentityPV: multiIdentity, pvWithVerifiedFallback: pvWithFallback, fallbackCoveragePct: +(fallbackCoverage * 100).toFixed(1), resolutionClass: { CONTRACT_deliverable: '1080p+', perShotGeneration_BLOCKED_FOR_REQUIREMENT: resBlocked, ASSUMED: resAssumed, CONTRACT: resContract }, musicCostUnknown: musicUnknown, costUnknownShots: costUnknown, qualityReviewRequired: qualityReview },
  warnings,
  blockers: [],
  policy: 'These are RISKS/WARNINGS, not quality-gate relaxations. No shot is force-routed to a weaker/unverified model to cut cost (quality-class-first). Fallbacks are REGISTERED for redundancy but require human quality sign-off before use. Blockers are empty because no shot FAILS a hard requirement (the router BLOCKS those with model=null); these risks are portfolio-level.',
  topMitigationsBeforeScale: ['human quality sign-off on a registered fallback before relying on it (RISK-1)', 'human 720p-vs-1080 decision via the opening validation (RISK-2)', 'verify the music source/rights or price a model — cost is UNKNOWN until then (RISK-4)', 'backfill explicit resolution per PV shot in the shot-list (RISK-5)'],
};
writeFileSync(join(here, 'runs/benchmark/fullfilm-risk-audit.json'), JSON.stringify(out, null, 1));
console.log(`risk audit: ${warnings.length} warnings | dominant video ${domVideoModel[0]} ${out.distribution.videoConcentrationPct}% (fallback-coverage ${out.distribution.fallbackCoveragePct}%) | multi-ID PV ${multiIdentity}/${pv} | gen-res BLOCKED ${resBlocked} / ASSUMED ${resAssumed} / CONTRACT ${resContract} | music-UNKNOWN ${musicUnknown}`);
for (const w of warnings) console.log(`  [${w.severity}] ${w.id}`);
