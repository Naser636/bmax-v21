// Phase B (local, €0) — composes CANON-FAITHFUL fullPrompts for every shot that lacks one in the authored
// registers, DERIVED from the F10 shot-list's own fields (sceneHead/shotType/movement/subjectAction/era/palette/
// continuityRefs/targetSec/refusalRule). Each prompt therefore has a verifiable canonical link (scene + refs) and
// describes a filmable action + framing + movement + intention + era + characters + continuity + EXCLUSIONS.
// Output: derived-prompts-f10.json. Provenance is explicit (auto-derived DRAFT, pending human refinement).
// Does NOT mutate the authored registers or any narrative canon.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

const sl = read('shot-list-f10.json');
const haveFull = new Set([...(read('video-prompts-f10.json').shots || []), ...(read('still-prompts-f10.json').shots || [])]
  .filter(s => s.fullPrompt && s.fullPrompt.length > 20).map(s => s.id));

const EXCLUDE = 'EXCLUDE: modern objects/clothing/architecture, vehicles, text/watermarks/logos, anachronisms, extra or deformed limbs/faces/fingers, duplicated people, warped geometry, period-inconsistent props.';

function compose(sh) {
  const chars = (sh.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref);
  const locs = (sh.continuityRefs || []).filter(r => r.type === 'location').map(r => r.ref);
  const isVideo = sh.mediaCategory === 'PREMIUM_VIDEO';
  const medium = isVideo ? `cinematic VIDEO shot (~${sh.targetSec || 5}s)` : `cinematic STILL frame`;
  const mv = sh.movement && sh.movement !== 'none' ? `, ${sh.movement} camera move` : '';
  const parts = [
    `${sh.setting} — ${sh.sceneHead}.`,
    `${medium}, ${sh.shotType || 'MED'}${mv}.`,
    `Action: ${sh.subjectAction || sh.dramaticFunction || 'scene beat'}.`,
    chars.length ? `Characters (match canon refs): ${chars.join(', ')}.` : '',
    `Era: ${sh.era}. Palette: ${sh.palette}.`,
    locs.length ? `Location continuity: ${locs.join(', ')}.` : '',
    sh.refusalRule ? `Continuity rule: ${sh.refusalRule}.` : '',
    EXCLUDE,
  ];
  return parts.filter(Boolean).join(' ');
}

const derived = [];
for (const sh of sl.shots) {
  if (haveFull.has(sh.id)) continue;
  derived.push({ id: sh.id, scene: sh.scene, act: sh.act, kind: sh.mediaCategory === 'PREMIUM_VIDEO' ? 'video' : 'image',
    canonLink: { scene: sh.scene, sceneHead: sh.sceneHead, refs: (sh.continuityRefs || []).map(r => r.ref) },
    fullPrompt: compose(sh) });
}
const out = { generated: '2026-10-24', provenance: 'AUTO-DERIVED (DRAFT) from shot-list-f10.json canonical fields — every prompt is canon-linked; pending human refinement. Not a replacement for authored registers.',
  count: derived.length, shots: derived };
writeFileSync(join(here, 'derived-prompts-f10.json'), JSON.stringify(out, null, 1));
console.log(`derived ${derived.length} faithful prompts | sample:`, derived[0] ? `${derived[0].id}: ${derived[0].fullPrompt.slice(0, 120)}` : 'none');
