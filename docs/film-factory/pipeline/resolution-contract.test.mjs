// Tests for resolution-requirement integrity (CONTRACT vs ASSUMED vs BLOCKED_FOR_REQUIREMENT). Hermetic; no provider call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromShotListShot } from './shot-requirements.mjs';
import { routeShot, VERIFIED_PRICES } from './quality-router.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8')).shots;
const fmt = JSON.parse(readFileSync(join(here, 'runs/benchmark/production-format.json'), 'utf8'));
const summary = JSON.parse(readFileSync(join(here, 'runs/benchmark/fullfilm-routing-summary.json'), 'utf8'));
const DEL = 1080;
const pvShot = { mediaCategory: 'PREMIUM_VIDEO', continuityRefs: [{ type: 'character', ref: 'A' }, { type: 'character', ref: 'B' }], targetSec: 6 };

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// 1. explicit requirements are validated → CONTRACT
ok('explicit per-shot resolution → CONTRACT', fromShotListShot({ ...pvShot, resolution: '1080p' }).resolutionSource === 'CONTRACT');
ok('deliverable + native policy → CONTRACT (generation=deliverable)', (() => { const r = fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'native' }); return r.resolutionSource === 'CONTRACT' && r.resolutionNeed === DEL; })());
ok('deliverable + upscale policy → CONTRACT (generate 720 → upscale)', (() => { const r = fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'upscale' }); return r.resolutionSource === 'CONTRACT' && r.resolutionNeed === 720; })());

// 2. unproven requirements cannot be relabelled CONTRACT
ok('no evidence (no perShot, no deliverable) → ASSUMED, never CONTRACT', (() => { const r = fromShotListShot(pvShot); return r.resolutionSource === 'ASSUMED' && r.resolutionSource !== 'CONTRACT'; })());

// 3. missing requirement stays visibly ASSUMED or BLOCKED (never silently resolved)
ok('deliverable CONTRACT but policy undecided → BLOCKED_FOR_REQUIREMENT (null res)', (() => { const r = fromShotListShot(pvShot, { deliverableResolution: DEL }); return r.resolutionSource === 'BLOCKED_FOR_REQUIREMENT' && r.resolutionNeed === null; })());
ok('deliverable contract is traceable (3 provenance docs)', fmt.deliverableResolution.status === 'CONTRACT' && fmt.deliverableResolution.provenance.length >= 3);

// 4. changed requirement invalidates stale routing (fingerprint changes)
ok('changing resolution source changes the requirements fingerprint', JSON.stringify(fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'native' })) !== JSON.stringify(fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'upscale' })));
ok('BLOCKED vs decided produce different fingerprints', JSON.stringify(fromShotListShot(pvShot, { deliverableResolution: DEL })) !== JSON.stringify(fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'native' })));

// 5. rebuild preserves shot IDs + cost reconciliation
const nativeShots = S.length; // every shot present
ok('primary pass accounts for all 420 shots (routed + blocked)', summary.primaryPass.routed + summary.primaryPass.blocked === 420);
ok('primary PV generation resolution is BLOCKED_FOR_REQUIREMENT (64)', summary.primaryPass.resClass.blockedForRequirement === 64);
ok('decision-support scenarios route all 420 (no shot lost)', summary.decisionSupport.native_1080.routed === 420 && summary.decisionSupport.upscale_720.routed === 420);
ok('scenario byCategory reconciles to estBase (native)', Math.abs(Object.values(summary.decisionSupport.native_1080.byCat).reduce((a, c) => a + c.usd, 0) - summary.decisionSupport.native_1080.estBaseUSD) < 0.05);

// 6. no resolution change silently downgrades quality class or relaxes identity
const RANK = { none: 0, startframe: 1, single: 2, multi: 3 };
const native = routeShot(fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'native' }));
const upscale = routeShot(fromShotListShot(pvShot, { deliverableResolution: DEL, genPolicy: 'upscale' }));
ok('native-1080 keeps multi-identity (not relaxed) + flags quality-review', RANK[VERIFIED_PRICES[native.model].identity] >= RANK['multi'] && !!native.qualityReview);
ok('upscale-720 keeps the class-1 inspected model (no silent quality downgrade)', VERIFIED_PRICES[upscale.model].qualityClass === 1 && RANK[VERIFIED_PRICES[upscale.model].identity] >= RANK['multi']);
ok('neither policy routes multi-identity to a lower identity capability', [native, upscale].every(r => RANK[VERIFIED_PRICES[r.model].identity] >= RANK['multi']));

console.log('RESOLUTION-CONTRACT TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
