// Tests for the AV edit plan: 49 scenes, shots traceable, media-dependent steps stay NEEDS_REAL_MEDIA/BLOCKED,
// voice directions sourced from the bible, silence handled, OSS $0, no edit/mix/export declared. READ-ONLY.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(readFileSync(join(here, 'av-edit-plan-f10.json'), 'utf8'));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const validIds = new Set(SL.shots.map(s => s.id));
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL ' + n));

ok('covers 49 scenes', P.scenes === 49 && P.plan.length === 49);
ok('mission budget €0', P.budgetAuthorizedThisMission === 0);
ok('tools are OSS $0', /\$0/.test(P.tools) && /DaVinci|Audacity|ffmpeg/.test(P.tools));
ok('mix/export BLOCKED', /BLOCKED/.test(P.mediaDependentStatuses.mixAndExport));
ok('picture + voiceSync + continuity = NEEDS_REAL_MEDIA', P.mediaDependentStatuses.picture === 'NEEDS_REAL_MEDIA' && P.mediaDependentStatuses.voiceSync === 'NEEDS_REAL_MEDIA' && P.mediaDependentStatuses.continuity === 'NEEDS_REAL_MEDIA');
ok('no edit/mix/export declared done', /No edit performed/.test(P.note) && /no export/i.test(P.note));
ok('music never substitutes for motion/performance (stated)', P.plan.every(s => !s.music || /does NOT replace|never substitute/i.test(JSON.stringify(P.note) + JSON.stringify(s.music))));

let shotTotal = 0;
for (const s of P.plan) {
  for (const id of s.pictureCut.order) { shotTotal++; if (!validIds.has(id)) { fail++; console.log(`  FAIL ${s.scene}: unknown shot ${id}`); } }
  ok(`${s.scene}: picture cut PLANNED + NEEDS_REAL_MEDIA to cut`, s.pictureCut.status === 'PLANNED' && /NEEDS_REAL_MEDIA/.test(s.pictureCut.note));
  ok(`${s.scene}: continuity NEEDS_REAL_MEDIA`, s.continuity.status === 'NEEDS_REAL_MEDIA');
  if (!s.silenceIntentional) ok(`${s.scene}: voice sync NEEDS_REAL_MEDIA + directions present`, s.voice.status === 'NEEDS_REAL_MEDIA' && Array.isArray(s.voice.directions) && s.voice.directions.length >= 1);
  else ok(`${s.scene}: silent scene handled (voice N/A)`, s.voice.status === 'N/A' && s.silenceIntentional === true);
}
ok('picture-cut shot total = 420 (traceable)', shotTotal === 420);

console.log(`av-edit-plan-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
if (fail) process.exit(1);
