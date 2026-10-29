// Manifest ↔ routing consistency tests. Hermetic; no provider call. Guards the router-sourced manifest.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeShot, VERIFIED_PRICES } from '../../../pipeline/quality-router.mjs';
import { fromManifestShot } from '../../../pipeline/shot-requirements.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(readFileSync(join(here, 'opening-asset-manifest.json'), 'utf8'));
const routing = JSON.parse(readFileSync(join(here, 'opening-routing.json'), 'utf8'));
const byId = new Map(routing.shots.map(r => [r.assetId, r]));

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// 1. manifest is router-sourced; 1:1 mapping
ok('manifest flagged routerSourced', man.routerSourced === true);
ok('every manifest asset maps to exactly one routing decision', man.shots.every(s => byId.has(s.assetId)) && man.shots.length === routing.shots.length && new Set(man.shots.map(s => s.assetId)).size === man.shots.length);

// 2. manifest.model === router decision (sourced, not hardcoded)
ok('manifest model equals routing model for every shot', man.shots.every(s => { const r = byId.get(s.assetId); return s.model === (r.status === 'ROUTED' ? r.model : null); }));

// 3. deterministic rebuild: re-derive + re-route from the manifest contract → same model/cost
ok('rebuild is deterministic (re-route matches stored)', man.shots.every(s => {
  const r = routeShot(fromManifestShot(s));
  const expectModel = r.tradeoff ? null : r.model;
  const expectCost = r.tradeoff ? null : r.estUnitCostUSD;
  return s.model === expectModel && (s.estUnitCostUSD === expectCost || Math.abs((s.estUnitCostUSD || 0) - (expectCost || 0)) < 1e-9);
}));

// 4. stale detection — fingerprint matches recompute; a mutated contract changes the fingerprint
ok('stored reqFingerprint matches a fresh derive (not stale)', man.shots.every(s => s.reqFingerprint === JSON.stringify(fromManifestShot(s))));
const mutated = { ...man.shots.find(s => s.kind === 'action'), resolution: '1080p', charactersPresent: ['CHAR-013', 'CHAR-001'], identityCritical: true };
ok('mutating a shot contract changes its fingerprint (stale detectable)', JSON.stringify(fromManifestShot(mutated)) !== man.shots.find(s => s.kind === 'action').reqFingerprint);

// 5. unknown prices never silently zero
ok('music price is UNKNOWN (not a confident 0)', VERIFIED_PRICES['MUSIC(unverified)'].priceStatus === 'UNKNOWN' && VERIFIED_PRICES['MUSIC(unverified)'].perCue === null);
ok('any €0 unit cost carries a non-VERIFIED priceStatus (zero only when flagged)', man.shots.every(s => s.routingStatus !== 'ROUTED' || s.estUnitCostUSD > 0 || (s.priceStatus && s.priceStatus !== 'VERIFIED')));

// 6. totals reconcile, no double-count
const sum = +man.shots.filter(s => s.routingStatus === 'ROUTED').reduce((a, s) => a + (s.estUnitCostUSD || 0), 0).toFixed(4);
ok('manifest routed cost sum reconciles to routing rollup', Math.abs(sum - routing.totals.estBaseUSD) < 1e-6);

// 7. BLOCKED / invalid cannot be production-ready
ok('BLOCKED shots have model=null', man.shots.filter(s => s.routingStatus === 'BLOCKED_FOR_QUALITY_REVIEW').every(s => s.model === null));
ok('NO shot is marked generated/accepted (all PLANNED, null sha/accepted/source)', man.shots.every(s => s.status === 'PLANNED' && s.sha256 === null && s.accepted === null && s.sourceFile === null));
ok('every ROUTED shot model is capability-valid for its identity need', man.shots.filter(s => s.routingStatus === 'ROUTED').every(s => {
  const cap = VERIFIED_PRICES[s.model]?.identity; if (cap === undefined) return true;
  const RANK = { none: 0, startframe: 1, single: 2, multi: 3 };
  const need = JSON.parse(s.reqFingerprint).identityNeed;
  return RANK[cap] >= RANK[need];
}));

console.log('MANIFEST-ROUTING-CONSISTENCY TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
