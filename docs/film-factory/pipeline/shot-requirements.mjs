// SHARED tooling: derive a quality-router input (hard requirements) from a shot CONTRACT.
// Used by BOTH the 5-min opening manifest and the full-film shot-list → one routing policy for the whole feature.
// Pure/deterministic. No provider call. Never invents resolution/identity it cannot derive — documents the assumption.

const KIND_TO_CATEGORY = { action: 'PREMIUM_VIDEO', est: 'PREMIUM_VIDEO', cov: 'STILL_ANIMATABLE' };

// identity need from the count of registry/named characters that must hold identity in-shot
function identityFromCount(n) { return n >= 2 ? 'multi' : n === 1 ? 'single' : 'none'; }

// opening asset-manifest shot → router input. resolutionSource = CONTRACT when the shot carries a resolution.
export function fromManifestShot(s) {
  const mediaCategory = KIND_TO_CATEGORY[s.kind] || 'PREMIUM_VIDEO';
  const chars = (s.charactersPresent || []).filter(c => /^CHAR-\d+$/.test(c)); // registry-identified
  let identityNeed = 'none';
  if (s.kind === 'action' && s.identityCritical === true) identityNeed = identityFromCount(chars.length);
  const hasContractRes = !!(s.resolution && /\d/.test(s.resolution));
  const resolutionNeed = hasContractRes ? parseInt(s.resolution, 10) : (s.kind === 'est' ? 1080 : 720);
  const resolutionSource = hasContractRes ? 'CONTRACT' : 'ASSUMED';
  return { mediaCategory, identityNeed, durationSec: s.durationSec || 6, resolutionNeed, resolutionSource, actionComplexity: s.kind === 'action' ? 'high' : 'low', continuityCritical: !!s.continuityLinks, _assumptions: resolutionSource === 'ASSUMED' ? ['resolutionNeed ASSUMED (not in contract)'] : [] };
}

// full-film shot-list shot → router input.
// Resolution precedence (highest first):
//  1. explicit per-shot `resolution`/`resolutionReq` on the shot → CONTRACT
//  2. opts.deliverableResolution (film-level CONTRACT, e.g. 1080) + opts.genPolicy:
//       'native'  → generate at the deliverable res (CONTRACT, deliverable+native)
//       'upscale' → generate 720, upscale to deliverable (CONTRACT, deliverable+upscale)
//       undefined → BLOCKED_FOR_REQUIREMENT (decision pending) — resolutionNeed=null
//  3. nothing → legacy ASSUMED 720 (flagged, backward-compatible default)
export function fromShotListShot(s, opts = {}) {
  const mediaCategory = s.mediaCategory;
  const chars = (s.continuityRefs || []).filter(r => r.type === 'character');
  const perShot = s.resolution ?? s.resolutionReq ?? null;
  const assumptions = [];
  let identityNeed = 'none', resolutionNeed = 720, resolutionSource = 'N/A', deliverableResolution = opts.deliverableResolution ?? null;
  if (mediaCategory === 'PREMIUM_VIDEO') {
    identityNeed = identityFromCount(chars.length);
    if (perShot != null) { resolutionNeed = parseInt(String(perShot), 10); resolutionSource = 'CONTRACT'; }
    else if (deliverableResolution != null) {
      if (opts.genPolicy === 'native') { resolutionNeed = deliverableResolution; resolutionSource = 'CONTRACT'; assumptions.push('generation=deliverable (native policy)'); }
      else if (opts.genPolicy === 'upscale') { resolutionNeed = 720; resolutionSource = 'CONTRACT'; assumptions.push('generate 720 → upscale to ' + deliverableResolution + ' (upscale policy)'); }
      else { resolutionNeed = null; resolutionSource = 'BLOCKED_FOR_REQUIREMENT'; assumptions.push('deliverable=' + deliverableResolution + ' is CONTRACT, but per-shot generation resolution is BLOCKED pending the generate-vs-upscale decision'); }
    }
    else { resolutionNeed = 720; resolutionSource = 'ASSUMED'; assumptions.push('resolutionNeed=720 ASSUMED (legacy shot; no resolution field and no deliverable supplied — NOT a verified requirement)'); }
  }
  return { mediaCategory, identityNeed, durationSec: s.targetSec || 6, resolutionNeed, resolutionSource, deliverableResolution, actionComplexity: 'high', continuityCritical: chars.length > 0, _assumptions: assumptions };
}
