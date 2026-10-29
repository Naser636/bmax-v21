// Hermetic tests for quality-router + cost-ledger-schema. No provider call; all inputs are deterministic fixtures
// (clearly SIMULATED — not real provider results).
import { routeShot, VERIFIED_PRICES, REFERENCE_PREP } from './quality-router.mjs';
import { fromManifestShot, fromShotListShot } from './shot-requirements.mjs';
import { emptyLedger, recordAttempt, validateAttempt, costPerAcceptedShot, costPerAcceptedMinute, acceptanceRate, defectHistogram } from './cost-ledger-schema.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// --- resolution contract vs assumed (schema) ---
ok('manifest shot WITH resolution → resolutionSource=CONTRACT', fromManifestShot({ kind: 'action', resolution: '720p', durationSec: 6 }).resolutionSource === 'CONTRACT');
ok('legacy shot-list PV WITHOUT resolution → resolutionSource=ASSUMED (flagged)', (() => { const r = fromShotListShot({ mediaCategory: 'PREMIUM_VIDEO', continuityRefs: [{ type: 'character', ref: 'X' }], targetSec: 6 }); return r.resolutionSource === 'ASSUMED' && r._assumptions.length > 0; })());
ok('shot-list PV WITH explicit resolution → CONTRACT (legacy handling, no silent assumption)', fromShotListShot({ mediaCategory: 'PREMIUM_VIDEO', resolution: '1080p', continuityRefs: [], targetSec: 6 }).resolutionSource === 'CONTRACT');
// --- fallback eligibility by VERIFIED capability (not name) ---
ok('fallback must meet hard reqs: a multi-identity fallback truly supports reference_images', ['bytedance/seedance-2.0', 'bytedance/seedance-1-lite'].every(m => VERIFIED_PRICES[m].identity === 'multi'));
ok('fallbacks carry a qualityStatus (unverified flagged)', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 720 }).fallbacks.every(f => f.qualityStatus));
// evidence-backed reference-prep rule (av-fair-compare)
ok('seedance reference-prep rule = resize refs ≤768px (E005)', REFERENCE_PREP['bytedance/seedance-2.5'].maxRefWidthPx === 768);

// --- router: quality-first routing ---
ok('still → flux-dev', routeShot({ mediaCategory: 'STILL_ANIMATABLE' }).model === 'black-forest-labs/flux-dev');
ok('audio → speech-02-hd', routeShot({ mediaCategory: 'AUDIO_LINE' }).model === 'minimax/speech-02-hd');
ok('music → cost UNKNOWN (null), NOT €0', routeShot({ mediaCategory: 'MUSIC_CUE' }).estUnitCostUSD === null && routeShot({ mediaCategory: 'MUSIC_CUE' }).priceStatus === 'UNKNOWN');
// QUALITY-CLASS-FIRST: multi-identity 720 → seedance-2.5 (class-1 inspected), NOT the cheaper class-3 lite
ok('multi-identity 720 → seedance-2.5 (quality-class-1, not the cheaper lite)', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 720 }).model === 'bytedance/seedance-2.5');
ok('multi-identity 720 is NOT downgraded to seedance-1-lite despite lite being cheapest', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 720 }).model !== 'bytedance/seedance-1-lite');
// multi-identity 720 now has verified fallbacks (redundancy)
ok('multi-identity 720 offers verified fallbacks (seedance-2.0 / 1-lite)', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 720 }).fallbacks.some(f => f.model === 'bytedance/seedance-2.0'));
// multi-identity + 1080: seedance-2.5 no longer qualifies (720); seedance-2.0 (class-2, 4k) does → ROUTES with quality-review (NOT blocked, NOT a downgrade)
const hi = routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 1080 });
ok('multi+1080 → seedance-2.0 (qualifies on 1080+multi) with quality-review flag', hi.model === 'bytedance/seedance-2.0' && !!hi.qualityReview && !hi.tradeoff);
// no identity + 1080 → cheapest qualifying class-2 (seedance-1-pro $0.03 < veo $0.15)
ok('no-identity 1080 → cheapest qualifying class-2 (seedance-1-pro)', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'none', durationSec: 6, resolutionNeed: 1080 }).model === 'bytedance/seedance-1-pro');
// single-identity 720 → class-1 models seedance-2.5 vs minimax; tie-break price → minimax ($0.50 < $0.617)
ok('single-identity 6s → minimax (class-1, cheaper tie-break)', routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'single', durationSec: 6, resolutionNeed: 720 }).model === 'minimax/video-01');
// TRUE blocker: a requirement NO verified model meets (res beyond 4k) → model null, preserved blocker
const blk = routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 8000 });
ok('impossible requirement → model=null + preserved blocker (not downgraded)', blk.model === null && !!blk.tradeoff);
ok('every route carries a rationale', ['STILL_ANIMATABLE', 'PREMIUM_VIDEO', 'AUDIO_LINE'].every(c => routeShot({ mediaCategory: c, identityNeed: 'single' }).rationale));

// --- cost ledger: hermetic, no fabrication ---
ok('empty ledger → cost-per-accepted undefined (NOT zero)', costPerAcceptedShot(emptyLedger()).costPerAcceptedShotUSD === null);
ok('rejected attempt requires a defectCategory', !validateAttempt({ shotId: 'S1', model: 'm', estCostUSD: 0.5, accepted: false }).ok);
ok('accepted attempt must not carry a defect', !validateAttempt({ shotId: 'S1', model: 'm', estCostUSD: 0.5, accepted: true, defectCategory: 'identity_drift' }).ok);
// SIMULATED run: S1 rejected (identity_drift) then accepted; S2 accepted
let L = emptyLedger();
L = recordAttempt(L, { shotId: 'S1', attemptN: 1, model: 'bytedance/seedance-2.5', estCostUSD: 0.62, durationSec: 6, accepted: false, defectCategory: 'identity_drift' });
L = recordAttempt(L, { shotId: 'S1', attemptN: 2, model: 'bytedance/seedance-2.5', estCostUSD: 0.62, durationSec: 6, accepted: true, defectCategory: 'none' });
L = recordAttempt(L, { shotId: 'S2', attemptN: 1, model: 'minimax/video-01', estCostUSD: 0.50, durationSec: 6, accepted: true });
ok('cumulative cost sums all attempts incl. rejected', L.cumCostUSD === 1.74);
ok('cost-per-accepted-shot counts rejected cost over ACCEPTED shots', costPerAcceptedShot(L).costPerAcceptedShotUSD === +(1.74 / 2).toFixed(4));
ok('acceptance rate = accepted/total attempts', acceptanceRate(L).rate === +(2 / 3).toFixed(3));
ok('cost-per-accepted-minute from accepted seconds (12s)', costPerAcceptedMinute(L).costPerAcceptedMinuteUSD === +(1.74 / (12 / 60)).toFixed(2));
ok('defect histogram records the rejection', defectHistogram(L).identity_drift === 1);
ok('ledger append is immutable (recordAttempt returns new state)', (() => { const a = emptyLedger(); const b = recordAttempt(a, { shotId: 'X', model: 'm', estCostUSD: 1, accepted: true }); return a.attempts.length === 0 && b.attempts.length === 1; })());

console.log('QUALITY-ROUTER+COST-LEDGER TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
