// Strengthened integration tests for router × opening manifest (+ full-film). Hermetic; no provider call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeShot, VERIFIED_PRICES } from '../../../pipeline/quality-router.mjs';
import { fromManifestShot, fromShotListShot } from '../../../pipeline/shot-requirements.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(readFileSync(join(here, 'opening-asset-manifest.json'), 'utf8'));
const routing = JSON.parse(readFileSync(join(here, 'opening-routing.json'), 'utf8'));
const full = JSON.parse(readFileSync(join(here, '../../../pipeline/runs/benchmark/fullfilm-routing-summary.json'), 'utf8'));
const shotList = JSON.parse(readFileSync(join(here, '../../../pipeline/shot-list-f10.json'), 'utf8')).shots;

const RANK = { none: 0, startframe: 1, single: 2, multi: 3 };
let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// 1. every manifest shot accounted for
ok('every manifest shot is in the routing output', routing.shots.length === man.shots.length && man.shots.every(m => routing.shots.some(r => r.assetId === m.assetId)));
ok('routed + blocked == total', routing.totals.routed + routing.totals.blockedForQualityReview === routing.shots.length);

// 2. no ROUTED shot violates its identity/resolution requirement
ok('no ROUTED shot uses a model below its identity need', routing.shots.filter(s => s.status === 'ROUTED').every(s => {
  const cap = VERIFIED_PRICES[s.model]?.identity; if (cap === undefined) return true; // stills/voice/music: no identity rank
  return RANK[cap] >= RANK[s.derivedRequirements.identityNeed];
}));
ok('no ROUTED video shot below its resolution need', routing.shots.filter(s => s.status === 'ROUTED' && VERIFIED_PRICES[s.model]?.maxRes).every(s => VERIFIED_PRICES[s.model].maxRes >= s.derivedRequirements.resolutionNeed));

// 3. unknown prices stay unknown; no fabricated acceptance/quality scores
ok('music price is UNKNOWN (null), not an invented/zero price', VERIFIED_PRICES['MUSIC(unverified)'].perCue === null && VERIFIED_PRICES['MUSIC(unverified)'].priceStatus === 'UNKNOWN');
ok('routing records NO acceptance probability or quality score fields', routing.shots.every(s => s.acceptanceRate === undefined && s.qualityScore === undefined));
ok('every ROUTED shot carries a priceStatus', routing.shots.filter(s => s.status === 'ROUTED').every(s => typeof s.priceStatus === 'string' && s.priceStatus.length > 0));

// 4. determinism — identical input → identical route
const sample = man.shots[0];
const r1 = routeShot(fromManifestShot(sample)), r2 = routeShot(fromManifestShot(sample));
ok('router is deterministic for identical input', JSON.stringify(r1) === JSON.stringify(r2));

// 5. estimates reconcile (no double-count)
const sum = +routing.shots.filter(s => s.status === 'ROUTED').reduce((a, s) => a + (s.estUnitCostUSD || 0), 0).toFixed(4);
ok('per-shot estimates reconcile to the rollup total', Math.abs(sum - routing.totals.estBaseUSD) < 1e-6);

// 6a. multi+1080 now RESOLVES to a verified 1080-capable multi-ref model (seedance-2.0) with a quality-review flag — NOT blocked, NOT downgraded
const hi = routeShot(fromManifestShot({ kind: 'action', identityCritical: true, charactersPresent: ['CHAR-013', 'CHAR-001'], resolution: '1080p', durationSec: 6 }));
ok('multi+1080 resolves to seedance-2.0 + quality-review (not blocked, not downgraded)', hi.model === 'bytedance/seedance-2.0' && !!hi.qualityReview && !hi.tradeoff);
// 6b. a TRULY impossible requirement preserves the blocker (model=null)
const blk = routeShot({ mediaCategory: 'PREMIUM_VIDEO', identityNeed: 'multi', durationSec: 6, resolutionNeed: 8000 });
ok('impossible requirement → model=null (preserved blocker)', blk.model === null && !!blk.tradeoff);

// 7. full-film routing integrity
ok('full-film primary: routed + blocked == 420', full.primaryPass.routed + full.primaryPass.blocked === 420);
ok('full-film primary blocks PV generation-resolution (BLOCKED_FOR_REQUIREMENT 64)', full.primaryPass.resClass.blockedForRequirement === 64);
ok('full-film native scenario byCat reconciles to estBaseUSD', Math.abs(Object.values(full.decisionSupport.native_1080.byCat).reduce((a, c) => a + c.usd, 0) - full.decisionSupport.native_1080.estBaseUSD) < 0.05);
ok('full-film: no PV shot below identity need (spot via re-derive)', shotList.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').every(s => { const r = routeShot(fromShotListShot(s)); if (r.tradeoff) return true; const cap = VERIFIED_PRICES[r.model]?.identity; return cap === undefined || RANK[cap] >= RANK[fromShotListShot(s).identityNeed]; }));
ok('full-film documents the deliverable CONTRACT + the generation blocker (not invented)', full.formatContract.status === 'CONTRACT' && /BLOCKED|OPEN/i.test(full.primaryPass.note));

console.log('OPENING-ROUTING TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
