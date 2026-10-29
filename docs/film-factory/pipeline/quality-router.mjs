// QUALITY-AWARE model router. Routes each shot by ARTISTIC/continuity needs; filters models that MEET the hard
// requirements (identity support + resolution), then ranks QUALITY-CLASS FIRST and uses price only as a tie-break
// WITHIN the same quality class. Never auto-selects a cheaper, lower/unverified quality tier to cut cost.
// Provides verified FALLBACKS (redundancy). Pure/deterministic. No provider call.
import { MODEL_BY_CATEGORY } from './style-lock-f10.mjs';

// Capabilities + prices VERIFIED read-only on Replicate 2026-10-24 (schema + price page).
// qualityClass: 1 = we INSPECTED real output (pilot); 2 = specs verified, cinematic quality UNVERIFIED; 3 = "lite"
// tier, specs verified, quality UNVERIFIED (expected lower). Lower number = preferred.
export const VERIFIED_PRICES = {
  'black-forest-labs/flux-dev': { perImg: 0.025, kind: 'still', priceStatus: 'VERIFIED', qualityClass: 1, qualityStatus: 'pilot-inspected' },
  'bytedance/seedance-2.5': { perSec: 0.1028, identity: 'multi', maxRes: 720, priceStatus: 'VERIFIED', qualityClass: 1, qualityStatus: 'pilot-inspected' },
  'minimax/video-01': { perClip: 0.50, identity: 'single', clipSec: 6, maxRes: 720, priceStatus: 'VERIFIED', qualityClass: 1, qualityStatus: 'pilot-inspected' },
  'google/veo-3-fast': { perSec: 0.15, identity: 'startframe', maxRes: 1080, nativeAudio: true, priceStatus: 'VERIFIED', qualityClass: 2, qualityStatus: 'reputation-only (not us-inspected)' },
  'bytedance/seedance-2.0': { perSec: 0.10, identity: 'multi', maxRes: 4000, priceStatus: 'VERIFIED', qualityClass: 2, qualityStatus: 'specs-verified; quality UNVERIFIED', note: 'multi-ref AND 1080p/4k — resolves multi+1080; price may vary by resolution (UNVERIFIED above 720p)' },
  'bytedance/seedance-1-pro': { perSec: 0.03, identity: 'startframe', maxRes: 1080, priceStatus: 'VERIFIED', qualityClass: 2, qualityStatus: 'specs-verified; quality UNVERIFIED' },
  'bytedance/seedance-1-lite': { perSec: 0.018, identity: 'multi', maxRes: 1080, priceStatus: 'VERIFIED', qualityClass: 3, qualityStatus: 'LITE tier — quality UNVERIFIED, expected lower; NOT auto-selected on price' },
  'minimax/speech-02-hd': { per1000tok: 0.10, kind: 'voice', priceStatus: 'VERIFIED', qualityClass: 1 },
  // Music & SFX: cost is UNKNOWN (no verified provider/rights). NOT €0 by default.
  'MUSIC(unverified)': { perCue: null, kind: 'music', priceStatus: 'UNKNOWN', note: 'needs a verified licensed source (then its real price, possibly €0) OR an integrated+priced model. Until then UNKNOWN — not zero.' },
  'SFX(unverified)': { perUnit: null, kind: 'sfx', priceStatus: 'UNKNOWN', note: 'library rights/price not verified — UNKNOWN, not zero.' },
};

// Reference-image preparation rules (EVIDENCE-BACKED, av-fair-compare 2026-10-24). Required BEFORE a call.
export const REFERENCE_PREP = {
  'bytedance/seedance-2.5': { maxRefWidthPx: 768, note: 'resize reference images to ≤768px wide (E005 face/size filter); non-close-up framing helps. Documented supported usage, not evasion.' },
  'bytedance/seedance-2.0': { maxRefWidthPx: 768, note: 'same E005 face/size filter as 2.5' },
  'minimax/video-01': { maxRefWidthPx: null, note: 'subject_reference accepted our face ref without resize (fallback identity path)' },
};
// Confirmed by the fair head-to-head: for CHARACTER/IDENTITY shots seedance-2.5 (+768px ref) reproduced the
// reference face + costume + sleeve motif and held identity across frames, beating minimax (different/younger
// face, generic garb). minimax/video-01 subject_reference = identity FALLBACK.

const IDENTITY_RANK = { none: 0, startframe: 1, single: 2, multi: 3 };
const VIDEO_MODELS = ['bytedance/seedance-2.5', 'bytedance/seedance-2.0', 'bytedance/seedance-1-pro', 'bytedance/seedance-1-lite', 'google/veo-3-fast', 'minimax/video-01'];

const unitCost = (m, dur) => { const p = VERIFIED_PRICES[m]; return p.perClip != null ? p.perClip : (p.perSec != null ? +(p.perSec * dur).toFixed(4) : null); };

export function routeShot(shot) {
  const { mediaCategory, identityNeed = 'none', durationSec = 6, resolutionNeed = 720, actionComplexity = 'low', continuityCritical = false } = shot;

  if (mediaCategory === 'STILL_ANIMATABLE') return still('black-forest-labs/flux-dev', shot);
  if (mediaCategory === 'AUDIO_LINE') return voice('minimax/speech-02-hd', shot);
  if (mediaCategory === 'MUSIC_CUE') return { model: 'MUSIC(unverified)', estUnitCostUSD: null, priceBasis: VERIFIED_PRICES['MUSIC(unverified)'], priceStatus: 'UNKNOWN', qualityReview: null, tradeoff: null, fallbacks: [], rationale: 'MUSIC_CUE: cost UNKNOWN (no verified source) — not €0', canonicalRoute: MODEL_BY_CATEGORY[mediaCategory] || null };

  // PREMIUM_VIDEO: filter by HARD requirements (identity + resolution), never relaxed for price.
  const need = IDENTITY_RANK[identityNeed];
  const qualifying = VIDEO_MODELS.filter(m => { const p = VERIFIED_PRICES[m]; return IDENTITY_RANK[p.identity] >= need && p.maxRes >= resolutionNeed; });

  if (qualifying.length === 0) {
    // No verified model meets the hard requirements → preserve the blocker (do NOT downgrade a requirement).
    return { model: null, estUnitCostUSD: null, priceBasis: null, priceStatus: 'N/A', qualityReview: null, tradeoff: `NO verified model meets identity=${identityNeed}+res=${resolutionNeed}p — BLOCKED (not downgraded)`, fallbacks: [], rationale: `blocked: no qualifier for identity=${identityNeed}, res=${resolutionNeed}p`, canonicalRoute: MODEL_BY_CATEGORY[mediaCategory] || null };
  }
  // rank: quality-class ASC (prefer inspected/higher quality), then price ASC WITHIN class.
  const ranked = qualifying.slice().sort((a, b) => {
    const qa = VERIFIED_PRICES[a].qualityClass, qb = VERIFIED_PRICES[b].qualityClass;
    if (qa !== qb) return qa - qb;
    return (unitCost(a, durationSec) ?? 1e9) - (unitCost(b, durationSec) ?? 1e9);
  });
  const model = ranked[0];
  const chosen = VERIFIED_PRICES[model];
  const qualityReview = chosen.qualityClass > 1 ? 'HUMAN_QUALITY_SIGN_OFF_REQUIRED (quality UNVERIFIED for this tier)' : null;
  const fallbacks = ranked.slice(1).map(m => ({ model: m, qualityClass: VERIFIED_PRICES[m].qualityClass, estUnitCostUSD: unitCost(m, durationSec), qualityStatus: VERIFIED_PRICES[m].qualityStatus }));
  return {
    model, estUnitCostUSD: unitCost(model, durationSec), priceBasis: chosen, priceStatus: chosen.priceStatus,
    qualityReview, tradeoff: null, fallbacks,
    rationale: `identity=${identityNeed}(${need}),res=${resolutionNeed}p,dur=${durationSec}s → qualifying=[${qualifying.join(',')}] → quality-class-first → ${model} (class ${chosen.qualityClass})` + (qualityReview ? ' | ' + qualityReview : '') + (fallbacks.length ? ` | fallbacks=[${fallbacks.map(f => f.model).join(',')}]` : ''),
    canonicalRoute: MODEL_BY_CATEGORY[mediaCategory] || null,
  };
}

function still(model, shot) { const p = VERIFIED_PRICES[model]; return { model, estUnitCostUSD: p.perImg, priceBasis: p, priceStatus: p.priceStatus, qualityReview: null, tradeoff: null, fallbacks: [], rationale: `${shot.mediaCategory}: canonical still`, canonicalRoute: MODEL_BY_CATEGORY[shot.mediaCategory] || null }; }
function voice(model, shot) { const p = VERIFIED_PRICES[model]; return { model, estUnitCostUSD: +((p.per1000tok || 0) * 0.04).toFixed(4), priceBasis: p, priceStatus: p.priceStatus, qualityReview: null, tradeoff: null, fallbacks: [], rationale: `${shot.mediaCategory}: dialogue line`, canonicalRoute: MODEL_BY_CATEGORY[shot.mediaCategory] || null }; }
