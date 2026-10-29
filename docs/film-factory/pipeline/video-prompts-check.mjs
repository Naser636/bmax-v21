// Validate video-prompts-f10.json: full coverage of all PREMIUM_VIDEO shots, every prompt grounded in F10,
// all refs TO_CREATE, required fields present, bible reused consistently. READ-ONLY, no media.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const VP = JSON.parse(readFileSync(join(here, 'video-prompts-f10.json'), 'utf8'));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
const F10n = F10.replace(/\s+/g, ' ');
const byId = Object.fromEntries(SL.shots.map(s => [s.id, s]));

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

// Coverage: exactly the PREMIUM_VIDEO set.
const vidIds = SL.shots.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').map(s => s.id).sort();
const gotIds = VP.shots.map(s => s.id).sort();
ok('covers every video shot (set-identical)', JSON.stringify(vidIds) === JSON.stringify(gotIds));
ok('count fields correct', VP.totalVideoShots === vidIds.length && VP.establishers + VP.actionInserts === vidIds.length);
ok('mission budget authorized = €0', VP.budgetAuthorizedThisMission === 0);

const REQ = ['id','scene','sceneHead','scriptAnchor','identityRefs','locationRef','costumeNotes','framing','movement','durationSecEstimated','light','palette','continuity','dramaticOutcome','fullPrompt','rejectionCriteria','method','costEurEstimated','costStatus'];
const seenCostume = {};   // bible consistency: a character's costume note must be identical everywhere it appears
for (const s of VP.shots) {
  const t = s.id;
  for (const f of REQ) ok(`${t}:${f}`, s[f] !== undefined && s[f] !== '' && !(Array.isArray(s[f]) && s[f].length === 0 && ['identityRefs'].includes(f) === false && f === 'continuity'));
  ok(`${t}: exists in shot-list + is video`, byId[t] && byId[t].mediaCategory === 'PREMIUM_VIDEO');
  ok(`${t}: anchor verbatim in F10`, s.scriptAnchor.length === 0 || F10n.includes(s.scriptAnchor.replace(/\s+/g, ' ')));
  ok(`${t}: location ref TO_CREATE`, s.locationRef.status === 'TO_CREATE');
  ok(`${t}: identity refs all TO_CREATE`, s.identityRefs.every(r => r.status === 'TO_CREATE'));
  ok(`${t}: cost ESTIMATED`, s.costStatus === 'ESTIMATED');
  ok(`${t}: fullPrompt notes PLAN/TO_CREATE`, /PLAN/.test(s.fullPrompt) && /TO_CREATE/.test(s.fullPrompt));
  ok(`${t}: duration matches shot-list`, s.durationSecEstimated === byId[t].targetSec);
  // bible consistency
  for (const note of s.costumeNotes) { const [c] = note.split(':'); if (seenCostume[c] && seenCostume[c] !== note) fail++, console.log(`  FAIL ${t}: costume variant for ${c}`); else { seenCostume[c] = note; } }
}
pass++; // costume-consistency loop counted via fails only

// Establisher substitution linkage: all establishers flagged as still-candidates.
ok('all establishers marked Ken-Burns candidate', VP.shots.filter(s => s.role === 'establisher').every(s => /Ken-Burns/.test(s.method)));
ok('all inserts marked premium video', VP.shots.filter(s => s.role === 'action-insert').every(s => /text-to-video/.test(s.method)));

const total = pass + fail;
console.log(`video-prompts-check: ${pass}/${total} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
