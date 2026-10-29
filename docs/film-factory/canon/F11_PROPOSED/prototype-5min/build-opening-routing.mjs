// Integrate the quality router with the opening asset manifest (NON-BILLED). Derives each shot's hard
// requirements from its contract, routes via the quality-first router, and records the decision + price basis.
// If the router cannot satisfy a HARD requirement (returns a tradeoff), the shot is BLOCKED_FOR_QUALITY_REVIEW
// rather than silently taking a cheaper/weaker model. No provider call; no media.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeShot } from '../../../pipeline/quality-router.mjs';
import { fromManifestShot } from '../../../pipeline/shot-requirements.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(readFileSync(join(here, 'opening-asset-manifest.json'), 'utf8'));

const routed = man.shots.map(s => {
  const req = fromManifestShot(s);
  const r = routeShot(req);
  const blocked = r.model === null; // model null ⇒ no qualifier met the HARD requirements (preserved blocker)
  return {
    assetId: s.assetId, beat: s.beat, scene: s.scene, kind: s.kind,
    derivedRequirements: req,
    status: blocked ? 'BLOCKED_FOR_QUALITY_REVIEW' : 'ROUTED',
    model: r.model,
    estUnitCostUSD: r.estUnitCostUSD,
    priceStatus: r.priceStatus,
    qualityReview: r.qualityReview || null,
    fallbacks: r.fallbacks || [],
    unresolvedConstraint: blocked ? r.tradeoff : null,
    reqFingerprint: JSON.stringify(req), // stale-detection: recompute from the contract must match this
    rationale: r.rationale,
  };
});

const routedOnly = routed.filter(x => x.status === 'ROUTED');
const costKnown = routedOnly.filter(x => typeof x.estUnitCostUSD === 'number');
const estBaseUSD = +costKnown.reduce((a, x) => a + x.estUnitCostUSD, 0).toFixed(4);
const costUnknown = routedOnly.length - costKnown.length;
const qualityReviewCount = routedOnly.filter(x => x.qualityReview).length;
const byModel = {};
for (const x of routedOnly) byModel[x.model] = (byModel[x.model] || 0) + 1;

writeFileSync(join(here, 'opening-routing.json'), JSON.stringify({
  generated: '2026-10-24',
  mission: 'Opening manifest × quality-router integration (non-billed). Costs are VERIFIED-price arithmetic (1 attempt, no retry). Acceptance NOT assumed here.',
  source: 'opening-asset-manifest.json + quality-router.mjs + shot-requirements.mjs',
  totals: { shots: routed.length, routed: routedOnly.length, blockedForQualityReview: routed.length - routedOnly.length, estBaseUSD, estBaseEUR: +(estBaseUSD / 1.08).toFixed(2), costUnknownShots: costUnknown, qualityReviewRequired: qualityReviewCount },
  modelsUsed: byModel,
  note: 'estBaseUSD is 1-attempt arithmetic from VERIFIED prices; it is NOT a production cost (no retries/acceptance). Reconciles to the per-shot sum with no double-counting.',
  shots: routed,
}, null, 1));

console.log(`opening routing: ${routed.length} shots | routed ${routedOnly.length} | BLOCKED ${routed.length - routedOnly.length} | estBase $${estBaseUSD} (€${(estBaseUSD / 1.08).toFixed(2)})`);
console.log('models:', JSON.stringify(byModel));
