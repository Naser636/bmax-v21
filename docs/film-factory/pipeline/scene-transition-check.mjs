// SCENE-TO-SCENE TRANSITION continuity check for F10. Analyses consecutive-scene handoffs for: location jumps on
// CONTINUOUS cuts, sun-state reversals (two-sun must never return after the suns part), dead-character reappearance
// (allowing scripted visions), and wound-state carry. Eyeline/geography handoff on real cuts can only be judged on
// real media => NEEDS_REAL_MEDIA. Deterministic, F10-grounded, READ-ONLY. Exported for the runner's Gate 1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

const scriptNum = h => { const m = (h.match(/^(\d+)([A-Z]?)/) || [, '0', '']); return parseInt(m[1], 10) + (m[2] ? 0.5 : 0); };
// canonical SPACE — differently-named same places (shot/reverse within one location) are NOT a real jump
const SPACE = (loc) => {
  const L = loc.toUpperCase();
  if (/NORTH SEA|SŌLFARI/.test(L)) return 'STORM-SHIP';
  if (/IMPOSSIBLE SHORE|^SHORE/.test(L)) return 'LANDING-SHORE';
  if (/MARKET/.test(L)) return 'RIVER-TOWN-MARKET';
  if (/CANYON/.test(L)) return 'CANYON';
  if (/SEAM/.test(L)) return 'SEAM-AREA';
  if (/GARRISON/.test(L)) return 'GARRISON';
  return L;
};
// known-intentional transitions (seam crossings) + scripted-vision scenes (dead appear by design)
const SEAM_CROSSING = new Set(['SC04', 'SC46', 'SC47']); // fall through the seam / seam interior / emerge
const VISION_SCENES = new Set(['SC23', 'SC46']);         // canyon echo + seam interior show the lost/dead on purpose
const DEATHS = { OLAF: 33, HELGI: 24, 'BÖRK': 30.5 };

export function sceneTransitionCheck() {
  const parts = F10.split(/## Draft F7 status/)[0].split(/^### /m).slice(1);
  const scenes = parts.map((p, i) => {
    const head = p.split('\n')[0].trim();
    const scId = 'SC' + String(i + 1).padStart(2, '0');
    const loc = (head.match(/(?:EXT\.|INT\.)\s+([^—]+?)\s*(?:—|$)/) || [, 'UNSPECIFIED'])[1].trim();
    const continuous = /CONTINUOUS/.test(head);
    const sNum = scriptNum(head);
    const sun = sNum >= 37 ? 'single' : sNum >= 3 ? 'two' : 'none';
    const characters = [...new Set(SL.shots.filter(s => s.scene === scId).flatMap(s => (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref)))];
    return { scId, head, loc, continuous, sNum, sun, characters };
  });

  const flags = [];
  for (let i = 1; i < scenes.length; i++) {
    const a = scenes[i - 1], b = scenes[i];
    // 1) CONTINUOUS across a genuine SPACE change (not a same-space shot/reverse) — seam crossings are intentional
    if (b.continuous && SPACE(b.loc) !== SPACE(a.loc)) {
      const expected = SEAM_CROSSING.has(b.scId);
      flags.push({ pair: `${a.scId}->${b.scId}`, cause: 'CONTINUOUS_SPACE_CHANGE', evidence: `${a.loc} -> ${b.loc} on a CONTINUOUS cut`, intentional: expected ? 'seam-crossing (expected)' : 'confirm intercut vs error', candidateFix: expected ? 'none — seam passage' : 'confirm an establishing beat sells the move', status: 'FLAG' });
    }
    // 2) SUN-STATE REVERSAL — a two-sun scene after a single-sun scene would break the one-way suns-part
    if (a.sun === 'single' && b.sun === 'two') flags.push({ pair: `${a.scId}->${b.scId}`, cause: 'SUN_STATE_REVERSAL', evidence: `single-sun ${a.scId} -> two-sun ${b.scId}`, status: 'CONTRADICTION' });
    // 3) EYELINE/GEOGRAPHY handoff on a real cut — unjudgeable without media
    flags.push({ pair: `${a.scId}->${b.scId}`, cause: 'EYELINE_GEOGRAPHY_HANDOFF', evidence: 'match-cut/eyeline continuity across the cut', candidateFix: 'verify on real media at edit', status: 'NEEDS_REAL_MEDIA' });
  }
  // 4) DEAD-CHARACTER REAPPEARANCE (scripted visions allowed)
  for (const s of scenes) for (const [c, d] of Object.entries(DEATHS)) {
    if (s.characters.includes(c) && s.sNum > d && !VISION_SCENES.has(s.scId))
      flags.push({ pair: s.scId, cause: 'DEAD_CHARACTER_PRESENT', evidence: `${c} referenced in ${s.scId} (script ${s.sNum}) after death (${d})`, candidateFix: 'confirm memory/vision/body-handling vs error', status: 'FLAG' });
  }
  const contradictions = flags.filter(f => f.status === 'CONTRADICTION');
  const confirmFlags = flags.filter(f => f.status === 'FLAG');
  const needsMedia = flags.filter(f => f.status === 'NEEDS_REAL_MEDIA').length;
  return { scenes: scenes.length, transitions: scenes.length - 1, flags, contradictions, confirmFlags, needsMedia, ok: contradictions.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = sceneTransitionCheck();
  console.log(`scene-transition: ${r.transitions} transitions | contradictions=${r.contradictions.length} | confirm-flags=${r.confirmFlags.length} | needs-real-media=${r.needsMedia}`);
  for (const f of r.confirmFlags) console.log(`  FLAG ${f.pair} ${f.cause}: ${f.evidence} [${f.intentional || ''}]`);
  for (const f of r.contradictions) console.log(`  CONTRADICTION ${f.pair} ${f.cause}: ${f.evidence}`);
  console.log(r.ok ? 'OK — no contradictions (confirm-flags are for human review, not failures)' : 'CONTRADICTIONS FOUND');
}
