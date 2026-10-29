// Whole-film F11 shot-list (49 scenes) from the inventory + F10 scene structure + content classification.
// Completes stage 3 (shot design) at film scale. Non-billed; F10 unchanged (read-only). Durations = ESTIMATES.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(here, 'f11-fullfilm-distribution-plan.json'), 'utf8'));
const inv = JSON.parse(readFileSync(join(here, 'f11-scene-inventory.json'), 'utf8'));
const sl10 = JSON.parse(readFileSync(join(here, '../F10_FROZEN_2026-10-24/shot-list-f10.json'), 'utf8'));
const CAT = plan.contentClassification;
const f10Shots = {}; for (const s of sl10.shots) f10Shots[s.scene] = (f10Shots[s.scene] || 0) + 1;
const byScene = Object.fromEntries(inv.scenes.map(s => [s.id, s]));

// action scenes get more PREMIUM_VIDEO + longer durations (action-first); dialogue scenes more coverage, shorter.
const shots = [];
for (const sc of Object.keys(CAT).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)))) {
  const cat = CAT[sc], n = f10Shots[sc] || 6, isAction = cat === 'ACTION';
  const vidShare = isAction ? 0.7 : cat === 'WORLD' ? 0.6 : 0.25;
  const vid = Math.round(n * vidShare), cov = n - vid;
  const vidSec = isAction ? 6 : 6, covSec = isAction ? 4 : 3.5;
  let k = 0;
  const mk = (kind, sec) => { k++; shots.push({ id: `F11-${sc}-SH${String(k).padStart(2, '0')}`, scene: sc, content: cat, mediaCategory: kind === 'v' ? 'PREMIUM_VIDEO' : 'STILL_ANIMATABLE', durationSec: sec, decisiveAgent: byScene[sc]?.decisiveAgent || null, promptSeed: `${(byScene[sc]?.beat || '').slice(0, 80)} | canon: Björn+Himinkljúfr, steering-oar not wheel, photoreal; identity via seedance-2.5 +768px ref` }); };
  for (let i = 0; i < vid; i++) mk('v', vidSec);
  for (let i = 0; i < cov; i++) mk('c', covSec);
}
const totSec = shots.reduce((a, s) => a + s.durationSec, 0);
const cats = ['ACTION', 'STORY', 'TENSION', 'DRAMA', 'COMEDY', 'WORLD'];
const dist = cats.map(c => { const ss = shots.filter(s => s.content === c); const sec = ss.reduce((a, s) => a + s.durationSec, 0); return { category: c, shots: ss.length, shotPct: +(ss.length / shots.length * 100).toFixed(1), screenTimeEstPct: +(sec / totSec * 100).toFixed(1) }; });

writeFileSync(join(here, 'f11-fullfilm-shotlist.json'), JSON.stringify({ generated: '2026-10-24', scope: 'F11 whole-film shot-list (DRAFT, ESTIMATE durations)', totalShots: shots.length, totalSecEst: totSec, note: 'Durations are per-shot ESTIMATES (not a rendered-edit measurement). 64% is a TARGET; realized share needs a rendered edit. PREMIUM_VIDEO identity shots route to seedance-2.5 +768px ref (validated).', distributionEst: dist, shots }, null, 1));
console.log(`F11 whole-film shot-list: ${shots.length} shots, ~${Math.round(totSec / 60)}min est`);
for (const d of dist) console.log(`  ${d.category.padEnd(8)} ${String(d.shots).padStart(3)} shots | shot-wt ${d.shotPct}% | screen-time-est ${d.screenTimeEstPct}%`);
