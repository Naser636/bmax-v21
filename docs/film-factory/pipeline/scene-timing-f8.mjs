// Scene-by-scene STAGED-timing model for F7 — honest runtime estimate (range), not word-count, not "validated".
// Per scene: dialogue cues (**NAME:**) × seconds/cue + action words × seconds/word, with set-piece FLOORS for the
// sequences whose screen time is determined by staged action, not text length. Low/High rates give a RANGE.
import { readFileSync } from "node:fs";
const d = readFileSync("/home/ubuntu/bmax-v21/docs/film-factory/31_SCREENPLAY_60MIN_F8.md","utf8");
// split into scenes at "### " headings within the fiction body
const body = d.split(/## Draft F7 status/)[0];
const parts = body.split(/^### /m).slice(1);
// set-piece / montage scenes get a staged FLOOR (min seconds) — their screen time is action-driven
const FLOORS = {
  "1.":150, "3.":90, "16.":120, "17.":90, "22.":90, "23.":90, "24.":120, "28.":90,
  "29.":180, "30.":90, "30A":75, "35.":60, "36.":150, "18B":135, "14A":120, "37.":45,
};
const RL = {cue:[10,18], word:[0.30,0.52]}; // low/high: sec per dialogue cue; sec per action word
let loTot=0, hiTot=0; const rows=[];
for (const p of parts) {
  const head = p.split("\n")[0].trim();
  const key = (head.match(/^[0-9]+[A-Z]?\./)||head.match(/^[0-9]+[A-Z]/)||[head.slice(0,3)])[0];
  const cues = (p.match(/^\*\*[A-ZÀ-Þ][A-ZÀ-Þ\- ]+?:\*\*/gm)||[]).length;
  // action words = italic stage-direction text, stripped of markup
  const action = (p.match(/^\*(?!\*)[\s\S]*?\*$/gm)||[]).join(" ").replace(/[*_()]/g," ");
  const aw = action.split(/\s+/).filter(Boolean).length;
  let lo = cues*RL.cue[0] + aw*RL.word[0];
  let hi = cues*RL.cue[1] + aw*RL.word[1];
  const floorKey = Object.keys(FLOORS).find(k=>head.startsWith(k));
  if (floorKey){ lo=Math.max(lo,FLOORS[floorKey]); hi=Math.max(hi,FLOORS[floorKey]*1.4); }
  loTot+=lo; hiTot+=hi;
  rows.push({scene:head.slice(0,46), cues, aw, lo:Math.round(lo), hi:Math.round(hi), setpiece:!!floorKey});
}
const m=s=>Math.round(s/60*10)/10;
console.log("scene                                           cues aw   lo(s) hi(s)");
for(const r of rows) console.log(`${(r.setpiece?'*':' ')}${r.scene.padEnd(46)} ${String(r.cues).padStart(3)} ${String(r.aw).padStart(4)} ${String(r.lo).padStart(5)} ${String(r.hi).padStart(5)}`);
console.log(`\nSCENES=${rows.length}  (*=set-piece floor applied)`);
console.log(`ESTIMATED STAGED RUNTIME RANGE: ${m(loTot)}–${m(hiTot)} min  (low=terse direction, high=suspense-staged)`);
console.log(`vs target 60 (accept >=55): low ${m(loTot)>=55?'MEETS':'under'}, high ${m(hiTot)>=55?'MEETS':'under'}`);
// scenes that could be lengthened (non-setpiece, short) to close any gap — targeted, not padding
const shortNonSet = rows.filter(r=>!r.setpiece && r.hi<60).sort((a,b)=>a.hi-b.hi).slice(0,8).map(r=>r.scene.split(/ —|\./)[0]);
console.log(`shortest non-setpiece scenes (candidates for targeted lengthening): ${shortNonSet.join(" | ")}`);
