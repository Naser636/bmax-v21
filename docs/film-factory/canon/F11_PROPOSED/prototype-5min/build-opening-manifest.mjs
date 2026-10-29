// Builds the continuity-locked opening asset manifest (stable IDs, PLANNED status, checksum slots) + rulebook + handoff.
// No paid call. Every shot gets a stable assetId; sourceFile/sha256 are null until an accepted shot is registered.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

// beat → shot allocation (sum: 16 action + 6 establisher + 24 coverage = 46 video shots + 4 music cues)
const beats = [
  { beat: 'B1', scene: 'SC01', desc: 'storm hook', action: 4, est: 0, cov: 3 },
  { beat: 'B2', scene: 'SC03', desc: 'crossing/seam', action: 3, est: 0, cov: 1 },
  { beat: 'B3', scene: 'SC04', desc: 'two-sun shore', action: 1, est: 2, cov: 4 },
  { beat: 'B4', scene: 'SC02', desc: 'crew comedy', action: 1, est: 0, cov: 5 },
  { beat: 'B5', scene: 'SC06', desc: 'first tide (action)', action: 5, est: 1, cov: 5 },
  { beat: 'B6', scene: 'SC05', desc: 'mystery/patrol', action: 0, est: 1, cov: 2 },
  { beat: 'B7', scene: 'SC07', desc: 'Seth-Nakht cliffhanger', action: 2, est: 2, cov: 4 },
];
const MODEL = { action: { m: 'bytedance/seedance-2.5', sec: 6, res: '720p', identity: true }, est: { m: 'google/veo-3-fast', sec: 7, res: '1080p', identity: false }, cov: { m: 'black-forest-labs/flux-dev', sec: 5, res: 'still', identity: 'partial' } };
const PRESENT = { SC01: ['CHAR-013', 'CHAR-001', 'CHAR-008'], SC03: ['CHAR-013', 'CHAR-001'], SC04: ['CHAR-013', 'CHAR-008'], SC02: ['CHAR-013', 'BÖRK', 'TOVE'], SC06: ['CHAR-013', 'CHAR-001', 'IPU'], SC05: ['CHAR-006', 'IPU'], SC07: ['CHAR-013', 'CHAR-009', 'CHAR-001'] };

let n = 0; const shots = [];
for (const b of beats) {
  const mk = (kind, i) => {
    n++; const id = 'OPEN-SH' + String(n).padStart(3, '0');
    const spec = MODEL[kind];
    return {
      assetId: id, beat: b.beat, scene: b.scene, kind, model: spec.m, durationSec: spec.sec, resolution: spec.res,
      identityCritical: spec.identity, charactersPresent: PRESENT[b.scene] || [],
      promptRef: `prototype-plan.json#${b.scene}/${kind}`,
      conditioning: spec.identity === true ? 'reference_images=[BJÖRN(+ASTRID where present)]' : (kind === 'cov' ? 'flux-dev still + style anchor' : 'veo image start-frame (identity non-critical)'),
      prevShot: n > 1 ? 'OPEN-SH' + String(n - 1).padStart(3, '0') : null,
      nextShot: null, // filled after this loop
      continuityLinks: { greatsword: 'Himinkljúfr tracked', twoSunPlate: b.beat >= 'B3', olafState: 'failing', astridTattoo: 'canon' },
      status: 'PLANNED',
      sourceFile: null, sha256: null, generatedBy: null, accepted: null,
    };
  };
  for (let i = 0; i < b.action; i++) shots.push(mk('action', i));
  for (let i = 0; i < b.est; i++) shots.push(mk('est', i));
  for (let i = 0; i < b.cov; i++) shots.push(mk('cov', i));
}
for (let i = 0; i < shots.length - 1; i++) shots[i].nextShot = shots[i + 1].assetId;

const videoSec = shots.filter(s => s.kind !== 'cov').reduce((a, s) => a + s.durationSec, 0);
const covSec = shots.filter(s => s.kind === 'cov').reduce((a, s) => a + s.durationSec, 0);

const manifest = {
  generated: '2026-10-24', version: 'F11 opening asset manifest (PLANNED — no footage)',
  rule: 'Each accepted shot gets a stable assetId + exact source file + sha256 + model/prompt metadata + duration + prev/next links. An accepted shot is NEVER regenerated/replaced silently — only via a documented revision decision.',
  checksumDiscipline: 'On acceptance: write sourceFile path, compute sha256 from disk, set generatedBy (model+predictionId), accepted=true. Locked thereafter.',
  totals: { shots: shots.length, action: shots.filter(s => s.kind === 'action').length, establisher: shots.filter(s => s.kind === 'est').length, coverage: shots.filter(s => s.kind === 'cov').length, videoSec, coverageSec: covSec, targetTimelineSec: 300 },
  shots,
};
writeFileSync(join(here, 'opening-asset-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`manifest: ${shots.length} shots (action ${manifest.totals.action}/est ${manifest.totals.establisher}/cov ${manifest.totals.coverage}) | videoSec ${videoSec} + covSec ${covSec} | target 300s | unique ids ${new Set(shots.map(s => s.assetId)).size === shots.length}`);
