// Make the opening manifest ROUTER-SOURCED, SAFELY. Validate the full routing output BEFORE touching the
// manifest; back up the manifest; write atomically (temp + rename). Preserve all shot data + PLANNED status;
// NEVER set sourceFile/sha256/accepted/generatedBy. BLOCKED shots → model=null (cannot become production-ready).
// No provider call; no media.
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERIFIED_PRICES } from '../../../pipeline/quality-router.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manPath = join(here, 'opening-asset-manifest.json');
const man = JSON.parse(readFileSync(manPath, 'utf8'));
const routing = JSON.parse(readFileSync(join(here, 'opening-routing.json'), 'utf8'));
const byId = new Map(routing.shots.map(r => [r.assetId, r]));

// ---- VALIDATE routing BEFORE any write (abort on any failure) ----
const errs = [];
const rIds = routing.shots.map(r => r.assetId);
if (new Set(rIds).size !== rIds.length) errs.push('routing has duplicate assetIds');
const mIds = new Set(man.shots.map(s => s.assetId));
for (const s of man.shots) if (!byId.has(s.assetId)) errs.push('manifest shot missing a routing decision: ' + s.assetId);
for (const r of routing.shots) if (!mIds.has(r.assetId)) errs.push('routing has an extra shot not in manifest: ' + r.assetId);
for (const r of routing.shots) {
  if (!['ROUTED', 'BLOCKED_FOR_QUALITY_REVIEW'].includes(r.status)) errs.push('invalid status ' + r.assetId + ':' + r.status);
  if (r.status === 'ROUTED') {
    if (!r.model || !VERIFIED_PRICES[r.model]) errs.push('ROUTED without a known model: ' + r.assetId);
    if (typeof r.estUnitCostUSD !== 'number' || r.estUnitCostUSD < 0) errs.push('ROUTED without a valid cost: ' + r.assetId);
  } else { // BLOCKED
    if (r.model !== null) errs.push('BLOCKED shot must have model=null: ' + r.assetId);
  }
}
if (errs.length) { console.error('ABORT — routing invalid, manifest NOT modified:\n  ' + errs.join('\n  ')); process.exit(1); }

// ---- back up (recoverable) ----
copyFileSync(manPath, manPath.replace(/\.json$/, '.bak.json'));

// ---- build the new manifest in memory (preserve everything; add router fields) ----
const next = { ...man, routerSourced: true, routerSourcedAt: '2026-10-24', shots: man.shots.map(s => {
  const r = byId.get(s.assetId);
  return {
    ...s,
    model: r.status === 'ROUTED' ? r.model : null, // router decision replaces the hardcoded build-time model
    estUnitCostUSD: r.status === 'ROUTED' ? r.estUnitCostUSD : null,
    routingStatus: r.status,
    reqFingerprint: r.reqFingerprint,
    priceStatus: r.priceStatus,
    // status/sourceFile/sha256/accepted/generatedBy are PRESERVED untouched (never fabricated)
  };
}) };
// invariant: no accepted/sha/source was set
if (next.shots.some(s => s.sha256 !== null || s.accepted !== null || s.sourceFile !== null || s.status !== 'PLANNED')) {
  console.error('ABORT — refuse to write: a shot would be marked generated/accepted'); process.exit(1);
}

// ---- atomic write (temp + rename) ----
const tmp = manPath + '.tmp';
writeFileSync(tmp, JSON.stringify(next, null, 1));
renameSync(tmp, manPath);

const routed = next.shots.filter(s => s.routingStatus === 'ROUTED').length;
console.log(`manifest router-sourced: ${next.shots.length} shots | ROUTED ${routed} | BLOCKED ${next.shots.length - routed} | backup opening-asset-manifest.bak.json`);
