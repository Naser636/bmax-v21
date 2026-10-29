// Full-film (F10, 420 shots) routing under the authoritative FORMAT contract. Non-billed; canon read-only.
// PRIMARY pass: deliverable=1080p+ (CONTRACT) but per-shot generation resolution is BLOCKED_FOR_REQUIREMENT
// (generate-vs-upscale undecided). DECISION-SUPPORT: route under each candidate policy so the choice is informed.
// Never invents a per-shot requirement. No provider call.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routeShot } from './quality-router.mjs';
import { fromShotListShot } from './shot-requirements.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8')).shots;
const fmt = JSON.parse(readFileSync(join(here, 'runs/benchmark/production-format.json'), 'utf8'));
const deliverable = parseInt(String(fmt.deliverableResolution.value), 10); // 1080

function routePass(opts) {
  let estBaseUSD = 0, blocked = 0, costUnknown = 0, qualityReview = 0; const byModel = {}; const byCat = {};
  let contract = 0, assumed = 0, blockedReq = 0;
  for (const s of S) {
    const req = fromShotListShot(s, opts);
    if (s.mediaCategory === 'PREMIUM_VIDEO') { if (req.resolutionSource === 'CONTRACT') contract++; else if (req.resolutionSource === 'ASSUMED') assumed++; else if (req.resolutionSource === 'BLOCKED_FOR_REQUIREMENT') blockedReq++; }
    if (req.resolutionSource === 'BLOCKED_FOR_REQUIREMENT') { blocked++; continue; } // cannot safely route — preserve the blocker
    const r = routeShot(req);
    if (r.model === null) { blocked++; continue; }
    byModel[r.model] = (byModel[r.model] || 0) + 1;
    if (r.qualityReview) qualityReview++;
    (byCat[s.mediaCategory] ??= { shots: 0, usd: 0, costUnknown: 0 }); byCat[s.mediaCategory].shots++;
    if (typeof r.estUnitCostUSD === 'number') { estBaseUSD += r.estUnitCostUSD; byCat[s.mediaCategory].usd += r.estUnitCostUSD; }
    else { costUnknown++; byCat[s.mediaCategory].costUnknown++; }
  }
  estBaseUSD = +estBaseUSD.toFixed(2);
  for (const k of Object.keys(byCat)) byCat[k].usd = +byCat[k].usd.toFixed(2);
  return { routed: S.length - blocked, blocked, estBaseUSD, estBaseEUR: +(estBaseUSD / 1.08).toFixed(2), costUnknown, qualityReview, byModel, byCat, resClass: { contract, assumed, blockedForRequirement: blockedReq } };
}

// PRIMARY: deliverable CONTRACT, generation policy OPEN → PV blocked-for-requirement
const primary = routePass({ deliverableResolution: deliverable }); // genPolicy undefined
// DECISION-SUPPORT scenarios
const native = routePass({ deliverableResolution: deliverable, genPolicy: 'native' });
const upscale = routePass({ deliverableResolution: deliverable, genPolicy: 'upscale' });

writeFileSync(join(here, 'runs/benchmark/fullfilm-routing-summary.json'), JSON.stringify({
  generated: '2026-10-24',
  mission: 'Full-film routing under the FORMAT contract. deliverable=1080p+ CONTRACT; per-shot generation resolution OPEN → PV BLOCKED_FOR_REQUIREMENT in the primary pass. Non-billed.',
  formatContract: fmt.deliverableResolution,
  primaryPass: { note: 'authoritative state: PV generation resolution BLOCKED pending the generate-vs-upscale decision', ...primary },
  decisionSupport: {
    note: 'What routing/cost WOULD be under each candidate policy — provided to inform the decision, NOT a committed route.',
    native_1080: { note: 'generate ≥1080 natively → multi-identity leaves seedance-2.5 (720) for seedance-2.0 (quality UNVERIFIED, human sign-off)', ...native },
    upscale_720: { note: 'generate 720 (seedance-2.5, class-1 inspected) + upscale to 1080p+ (may soften — rubric #7 risk)', ...upscale },
  },
  interpretation: 'PRIMARY shows the honest blocker count. The two scenarios bound the cost/quality consequences. No per-shot generation resolution is asserted until the decision is made.',
}, null, 1));

console.log('FULL-FILM routing under FORMAT contract:');
console.log(`  PRIMARY (policy OPEN): routed ${primary.routed} | BLOCKED ${primary.blocked} (PV gen-res blocked-for-requirement ${primary.resClass.blockedForRequirement}) | estBase $${primary.estBaseUSD}`);
console.log(`  decision-support NATIVE-1080: routed ${native.routed}, estBase $${native.estBaseUSD}, qualityReview ${native.qualityReview}, models ${JSON.stringify(native.byModel)}`);
console.log(`  decision-support UPSCALE-720: routed ${upscale.routed}, estBase $${upscale.estBaseUSD}, qualityReview ${upscale.qualityReview}, models ${JSON.stringify(upscale.byModel)}`);
