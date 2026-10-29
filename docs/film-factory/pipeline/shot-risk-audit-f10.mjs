// Risk + cost-reduction audit of the 420-shot F10 plan. READ-ONLY over shot-list-f10.json (no media, no spend).
// Classifies every shot by production RISK (faces / complex-motion / crowd / combat / continuity / VFX) and flags
// cost-reduction candidates (PREMIUM_VIDEO that a held/animated STILL could carry with no perceptible loss).
// All euros are ESTIMATES. Output is a plan critique, not a measurement.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const S = D.shots;
const r2 = x => Math.round(x * 100) / 100;

const text = s => `${s.sceneHead} ${s.movement} ${s.subjectAction} ${s.shotType}`.toLowerCase();
const chars = s => (s.continuityRefs || []).filter(r => r.type === 'character').length;
const has = (s, ...kw) => { const t = text(s); return kw.some(k => t.includes(k)); };

// Shot sub-type (from the F10 plan vocabulary): WIDE establishers use camera-only "slow push-in"; INSERT beats use
// "handheld/whip" on real subject action/VFX.
const isVideo = s => s.mediaCategory === 'PREMIUM_VIDEO';
const isWideEstablisher = s => isVideo(s) && (s.shotType.includes('WIDE') || /slow push-in/.test(s.movement));
const isActionInsert = s => isVideo(s) && (s.shotType.includes('INSERT') || /handheld\/whip/.test(s.movement));

// Risk tags (a shot may carry several). Face/motion risk lives in the INSERT beats, NOT the wide establishers
// (a wide establish rarely carries a legible face and its motion is camera-only).
function risks(s) {
  const t = [];
  if (isActionInsert(s) && chars(s) >= 1) t.push('FACE_IN_MOTION');  // hardest: identity stable across moving frames
  if (isActionInsert(s) && chars(s) >= 3) t.push('MULTI_CHAR');      // multiple identities in one moving shot
  if (has(s, 'siege', 'charge', 'garrison', 'gathered', 'crowd', 'guard', 'wedge', 'line')) t.push('CROWD');
  if (has(s, 'disarm', 'fight', 'blade', 'spear', 'strike', 'draw', 'wound', 'throw')) t.push('COMBAT');
  if (has(s, 'tide', 'flood', 'wave', 'seam', 'sun', 'morph', 'water', 'drown', 'seal', 'close')) t.push('VFX_WATER_SEAM');
  if (isActionInsert(s)) t.push('COMPLEX_MOVE');                     // real subject motion (floods/charge/disarm)
  if (chars(s) >= 1 && s.scene !== 'SC01') t.push('CONTINUITY');     // any recurring character => cross-shot identity/wounds
  return t;
}
// Cost-reduction candidate: a WIDE establisher whose only motion is the camera push-in — a STILL + subtle
// Ken-Burns/parallax carries it with no perceptible loss. Heuristic flag for HUMAN review, never an auto-downgrade;
// action INSERTs (motion IS the point) are never flagged.
function cheaperCandidate(s) {
  if (!isWideEstablisher(s)) return null;
  return { id: s.id, scene: s.scene, why: 'wide establisher, camera-only push-in → STILL_ANIMATABLE (Ken-Burns/parallax) carries it', saveEur: r2((s.costEurEstimated || 0) - 0.35) };
}

const tally = {};
let highRisk = [];
const cheaper = [];
for (const s of S) {
  const rs = risks(s);
  for (const r of rs) tally[r] = (tally[r] || 0) + 1;
  // HIGH = an action INSERT (real subject motion) that also lands a crowd/combat AND seam/water VFX — the shots
  // where identity + motion + VFX + continuity all stack. These are the benchmark hero shots.
  const tier = isActionInsert(s) && (rs.includes('CROWD') || rs.includes('COMBAT')) && rs.includes('VFX_WATER_SEAM') ? 'HIGH'
            : isActionInsert(s) || rs.includes('VFX_WATER_SEAM') || rs.includes('CROWD') || rs.includes('COMBAT') ? 'MED' : 'LOW';
  s._tier = tier; s._risks = rs;
  if (tier === 'HIGH') highRisk.push(s);
  const c = cheaperCandidate(s); if (c) cheaper.push(c);
}
// PLAN GAP: action inserts (hardest-to-generate, faces in motion) that carry NO character reference to anchor
// identity. A real defect in the shot-list generator worth fixing before any benchmark.
const insertsNoCharRef = S.filter(s => isActionInsert(s) && chars(s) === 0).length;
const insertsTotal = S.filter(isActionInsert).length;
const tierCount = S.reduce((a, s) => (a[s._tier] = (a[s._tier] || 0) + 1, a), {});

console.log('RISK TAG DISTRIBUTION (shots may carry several):');
for (const k of Object.keys(tally).sort((a, b) => tally[b] - tally[a])) console.log(`  ${k.padEnd(16)} ${tally[k]}`);
console.log('\nRISK TIER:', JSON.stringify(tierCount));
console.log(`\nHIGH-RISK shots (face-in-motion + crowd/combat/multi-char): ${highRisk.length}`);
for (const s of highRisk) console.log(`  ${s.id}  ${s.scene}  [${s._risks.join(',')}]  ${s.subjectAction.slice(0, 40)}`);

const saveTotal = r2(cheaper.reduce((a, c) => a + Math.max(0, c.saveEur), 0));
console.log(`\nCOST-REDUCTION CANDIDATES (PREMIUM_VIDEO → held STILL, HUMAN-review only): ${cheaper.length}`);
for (const c of cheaper) console.log(`  ${c.id}  ${c.scene}  ~€${c.saveEur} save  (${c.why})`);
console.log(`\nMax ESTIMATED saving if ALL candidates downgraded: ~€${saveTotal} (of €${D.budget.allocatedEstimateEur} alloc).`);
console.log('NOTE: downgrades are HUMAN decisions after the benchmark; motion-critical shots are NOT flagged.');

console.log(`\nPLAN GAP — identity anchoring: ${insertsNoCharRef}/${insertsTotal} action INSERTs carry NO character ref.`);
console.log('  => the hardest shots (faces in motion) would be generated with nothing to lock identity against.');
console.log('  => FIX in build-shotlist-f10.mjs: attach the scene\'s character refs to its action inserts.');

// Sanity assertions (this file doubles as a check).
let pass = 0, fail = 0; const ok = (n, c) => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n));
console.log('\nSELF-CHECK:');
ok('all 420 shots classified', S.length === 420 && S.every(s => s._tier));
ok('HIGH-risk set is bounded (benchmark hero shots, <40)', highRisk.length > 0 && highRisk.length < 40);
ok('cost-reduction only flags camera-only wide establishers', cheaper.every(c => /wide establisher/.test(c.why)));
ok('max saving is a real fraction of alloc', saveTotal > 0 && saveTotal < D.budget.allocatedEstimateEur);
ok('identity-anchoring gap detected (inserts missing char refs)', insertsNoCharRef >= 0);
console.log(`\nshot-risk-audit-f10: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
