// Validate the FR voice bible: every F10 speaking character covered, line counts match F10, required fields
// present, no stereotyped accent asserted without script justification. READ-ONLY, no audio.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const VB = JSON.parse(readFileSync(join(here, 'fr-voice-bible-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

// Count dialogue cues per character directly from F10.
const cues = [...F10.matchAll(/^\*\*([A-ZÀ-Þ][A-ZÀ-Þ'\- ]+?):\*\*/gm)].map(m => m[1].trim());
const counts = {};
for (const c of cues) counts[c] = (counts[c] || 0) + 1;
const speakers = Object.keys(counts);

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

ok('mission budget authorized = €0', VB.budgetAuthorizedThisMission === 0);
ok('accent rule present + forbids stereotyped accents', /NOT by stereotyped/i.test(VB.accentRule));
ok('global continuity rules present', Array.isArray(VB.globalContinuity) && VB.globalContinuity.length >= 3);

const covered = new Set(VB.voices.map(v => v.character));
ok(`every F10 speaker covered (${speakers.length})`, speakers.every(s => covered.has(s)));
ok('no extra non-speaking entries', VB.voices.every(v => counts[v.character] !== undefined));

const REQ = ['character','lines','ageLook','pitchTexture','pace','articulation','accentJustified','accentNote','emotionalArc','continuityRules'];
for (const v of VB.voices) {
  for (const f of REQ) ok(`${v.character}:${f}`, v[f] !== undefined && v[f] !== '');
  ok(`${v.character}: line count matches F10 (${counts[v.character]})`, v.lines === counts[v.character]);
  ok(`${v.character}: continuity rules non-empty`, Array.isArray(v.continuityRules) && v.continuityRules.length >= 1);
  // accent discipline: if no justification, the note must say no/neutral accent (not a cultural caricature).
  if (v.accentJustified === false) ok(`${v.character}: unjustified accent => neutral/no accent`, /neutral|no accent/i.test(v.accentNote));
}
const total = pass + fail;
console.log(`fr-voice-bible-check: ${pass}/${total} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
