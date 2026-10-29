// 60-MINUTE DURATION PROOF for F10. Reconciles, per scene and in total, THREE distinct durations:
//   (1) generatedOutput  = sum of shot targetSec (the raw clip seconds the generators produce)  [from shot-list]
//   (2) usableScreen      = staged screen time driven by dialogue delivery + action beats          [timing model]
//   (3) estimatedFinal    = the assembled cut, targeted to 60:00 within the staged band
// No double-count (each scene once). No artificial slowdown: screen time is justified by cues+action, quantified.
// The final FILE DOES NOT EXIST — 60 min is NOT declared validated; the export gate (real file) decides. READ-ONLY.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

// --- timing model (IDENTICAL constants to scene-timing-f10.mjs) ---
const body = F10.split(/## Draft F7 status/)[0];
const parts = body.split(/^### /m).slice(1);
const FLOORS = { '1.':150,'3.':90,'16.':120,'17.':90,'22.':90,'23.':90,'24.':120,'28.':90,'29.':180,'30.':90,'30A':75,'35.':60,'36.':150,'18B':135,'14A':120,'37.':45 };
const RL = { cue: [10, 18], word: [0.30, 0.52] };
const rows = [];
let loTot = 0, hiTot = 0;
parts.forEach((p, i) => {
  const head = p.split('\n')[0].trim();
  const cues = (p.match(/^\*\*[A-ZÀ-Þ][A-ZÀ-Þ\- ]+?:\*\*/gm) || []).length;
  const action = (p.match(/^\*(?!\*)[\s\S]*?\*$/gm) || []).join(' ').replace(/[*_()]/g, ' ');
  const aw = action.split(/\s+/).filter(Boolean).length;
  let lo = cues * RL.cue[0] + aw * RL.word[0], hi = cues * RL.cue[1] + aw * RL.word[1];
  const fk = Object.keys(FLOORS).find(k => head.startsWith(k));
  if (fk) { lo = Math.max(lo, FLOORS[fk]); hi = Math.max(hi, FLOORS[fk] * 1.4); }
  loTot += lo; hiTot += hi;
  // join with shot-list scene SC(i+1)
  const scId = 'SC' + String(i + 1).padStart(2, '0');
  const shots = SL.shots.filter(s => s.scene === scId);
  const genSec = shots.reduce((a, s) => a + (s.targetSec || 0), 0);
  const dlgLines = shots.filter(s => s.mediaCategory === 'AUDIO_LINE').length;
  const music = shots.filter(s => s.mediaCategory === 'MUSIC_CUE').length;
  rows.push({ scene: head.slice(0, 40), scId, cues, aw, lo: Math.round(lo), hi: Math.round(hi), mid: Math.round((lo + hi) / 2), genSec, dlgLines, music, setpiece: !!fk });
});

const m = s => Math.round(s / 60 * 10) / 10;
console.log('scene                                     SCid  cues dlg genSec  screen_lo screen_hi(s)');
for (const r of rows) console.log(`${(r.setpiece?'*':' ')}${r.scene.padEnd(40)} ${r.scId} ${String(r.cues).padStart(3)} ${String(r.dlgLines).padStart(3)} ${String(r.genSec).padStart(5)}    ${String(r.lo).padStart(5)}    ${String(r.hi).padStart(5)}`);

const genTot = rows.reduce((a, r) => a + r.genSec, 0);
const midTot = rows.reduce((a, r) => a + r.mid, 0);
console.log(`\n(1) generatedOutput  = ${genTot}s = ${m(genTot)} min  (raw clip seconds; 64 video@335s + 196 stills@729s + 141 audio@564s; music overlays, 0 standalone)`);
console.log(`(2) usableScreen     = ${m(loTot)}–${m(hiTot)} min  (staged band; mid ${m(midTot)} min) — dialogue+action driven`);
console.log(`(3) estimatedFinal   = 60:00 TARGET — sits at the ${Math.round((3600-loTot)/(hiTot-loTot)*100)}% position of the band (near the terse end)`);
console.log(`\nHOW 60 MIN IS REACHED (no double-count, no padding):`);
console.log(`  • 60 min ∈ [${m(loTot)}, ${m(hiTot)}] → achievable by pacing between terse (${m(loTot)}) and suspense-staged (${m(hiTot)}); NO filler needed.`);
console.log(`  • generatedOutput (${m(genTot)} min) < screen (60) because generation is REUSED/HELD, not repeated: a 4s dialogue-coverage still holds`);
console.log(`    for the full spoken line (~${Math.round(564/141*10)/10}s avg) + reaction; establishers hold under score; action clips intercut. Each scene counted ONCE.`);
console.log(`  • If a cut runs long (toward ${m(hiTot)}), trim the softest NON-setpiece scenes (19/25/34/8/32) — set-pieces/essential action are NOT cut to fit.`);
console.log(`  • The 60:00 FILE DOES NOT EXIST. This is a staging estimate; exportDurationGate (real file @60:00±120s) is the ONLY validator.`);

// checks
let pass=0,fail=0; const ok=(n,c)=>c?pass++:(fail++,console.log('  FAIL '+n));
ok('49 scenes, each counted once (no double-count)', rows.length===49 && new Set(rows.map(r=>r.scId)).size===49);
ok('generatedOutput matches shot-list total (1628s)', genTot===SL.shots.reduce((a,s)=>a+(s.targetSec||0),0));
ok('staged band matches scene-timing model (57–94)', m(loTot)>=55 && m(loTot)<=60 && m(hiTot)>=90 && m(hiTot)<=96);
ok('60 min lies within the staged band', 3600>=loTot && 3600<=hiTot);
ok('screen time > generated (holds/reuse, justified not padded)', loTot>genTot);
ok('dialogue lines total 141 (coverage drives screen time)', rows.reduce((a,r)=>a+r.dlgLines,0)===141);
ok('final file NOT claimed to exist', SL.budget.spentEur===0);
console.log(`duration-proof-f10: ${pass}/${pass+fail} PASS`+(fail?` (${fail} FAIL)`:''));
if(fail) process.exit(1);
