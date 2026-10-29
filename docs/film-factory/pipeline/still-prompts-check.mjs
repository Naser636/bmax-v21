// Validate still-prompts-f10.json: full coverage of all STILL_ANIMATABLE shots, F10-grounded, all refs TO_CREATE,
// required fields, bible consistency (costume note identical wherever a character appears, and identical to video).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SP = JSON.parse(readFileSync(join(here, 'still-prompts-f10.json'), 'utf8'));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const VP = JSON.parse(readFileSync(join(here, 'video-prompts-f10.json'), 'utf8'));
const F10n = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8').replace(/\s+/g, ' ');
const byId = Object.fromEntries(SL.shots.map(s => [s.id, s]));

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

const stillIds = SL.shots.filter(s => s.mediaCategory === 'STILL_ANIMATABLE').map(s => s.id).sort();
const gotIds = SP.shots.map(s => s.id).sort();
ok('covers every still (set-identical)', JSON.stringify(stillIds) === JSON.stringify(gotIds));
ok('count fields correct', SP.totalStills === stillIds.length && SP.byRole.establisher + SP.byRole.coverage + SP.byRole.insert === stillIds.length);
ok('mission budget authorized = €0', SP.budgetAuthorizedThisMission === 0);

const REQ = ['id','scene','sceneHead','composition','identityRefs','locationRef','costumeNotes','light','palette','dramaticIntent','continuity','fullPrompt','rejectionCriteria','method','durationSecEstimated','costEurEstimated','costStatus'];
// cross-check: a character's costume note must be identical to the one used in video prompts (no divergence).
const videoCostume = {};
for (const s of VP.shots) for (const n of s.costumeNotes || []) { const [c] = n.split(':'); videoCostume[c] = n; }
const seen = {};
for (const s of SP.shots) {
  const t = s.id;
  for (const f of REQ) ok(`${t}:${f}`, s[f] !== undefined && s[f] !== '' && !(Array.isArray(s[f]) && f === 'continuity' && s[f].length === 0));
  ok(`${t}: exists + is still`, byId[t] && byId[t].mediaCategory === 'STILL_ANIMATABLE');
  ok(`${t}: anchor verbatim F10`, s.scriptAnchor.length === 0 || F10n.includes(s.scriptAnchor.replace(/\s+/g, ' ')));
  ok(`${t}: location TO_CREATE`, s.locationRef.status === 'TO_CREATE');
  ok(`${t}: identities TO_CREATE`, s.identityRefs.every(r => r.status === 'TO_CREATE'));
  ok(`${t}: cost ESTIMATED`, s.costStatus === 'ESTIMATED');
  ok(`${t}: method is still (no video)`, /STILL_ANIMATABLE/.test(s.method) && /no video/.test(s.method));
  ok(`${t}: duration matches shot-list`, s.durationSecEstimated === byId[t].targetSec);
  ok(`${t}: fullPrompt PLAN/TO_CREATE`, /PLAN/.test(s.fullPrompt) && /TO_CREATE/.test(s.fullPrompt));
  for (const note of s.costumeNotes) {
    const [c] = note.split(':');
    if (seen[c] && seen[c] !== note) { fail++; console.log(`  FAIL ${t}: still costume variant for ${c}`); } else seen[c] = note;
    if (videoCostume[c] && videoCostume[c] !== note) { fail++; console.log(`  FAIL ${t}: still≠video costume for ${c}`); }
  }
}
pass++;
console.log(`still-prompts-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
