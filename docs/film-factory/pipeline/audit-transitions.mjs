// Scene-to-scene RACCORD audit (local, €0, read-only). Analyzes each adjacent transition in canonical F10 order
// (incl. inserted scenes like 30A→SC40) using ONLY data actually present: EXT/INT, location, time marker, palette,
// scene-level characters. For each it classifies CRITICAL / HIGH / MEDIUM / LOW / INSUFFICIENT_INFO with evidence
// and a PROPOSED (non-applied) correction. It NEVER invents data; emotional/sound/action-legibility raccords that
// need real media are marked INSUFFICIENT_INFO. Output: transition-audit-f10.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

const order = [...new Set(sl.shots.map(s => s.scene))].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
function sceneInfo(sc) {
  const shots = sl.shots.filter(s => s.scene === sc);
  const head = shots[0]?.sceneHead || '';
  const extint = (head.match(/\b(INT|EXT)\b/) || [])[1] || '?';
  const timeMarker = (head.match(/\b(CONTINUOUS|NIGHT|DAY|DAWN|DUSK|MORNING|NIGHTFALL|LATER|MOMENTS LATER)\b/i) || [])[1] || null;
  const setting = shots[0]?.setting || '';
  const palette = shots[0]?.palette || '';
  const chars = new Set(shots.flatMap(s => (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref)));
  return { sc, head, extint, timeMarker, setting, palette, chars: [...chars] };
}
const info = Object.fromEntries(order.map(sc => [sc, sceneInfo(sc)]));
const palSim = (a, b) => { const sa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean)), sb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean)); const inter = [...sa].filter(w => sb.has(w)).length, uni = new Set([...sa, ...sb]).size; return uni ? inter / uni : 1; };

const transitions = [];
for (let i = 1; i < order.length; i++) {
  const A = info[order[i - 1]], B = info[order[i]];
  const locationChange = A.setting !== B.setting;
  const extIntChange = A.extint !== B.extint && A.extint !== '?' && B.extint !== '?';
  const continuous = /CONTINUOUS/i.test(B.timeMarker || '');
  const sim = Math.round(palSim(A.palette, B.palette) * 100) / 100;
  const abruptPalette = sim < 0.12;
  const shared = A.chars.filter(c => B.chars.includes(c));
  const entering = B.chars.filter(c => !A.chars.includes(c));
  const exiting = A.chars.filter(c => !B.chars.includes(c));

  let severity = 'INFO', confidence = 0.5, issue = 'standard scene change', correction = null;
  if (continuous && locationChange && extIntChange && shared.length === 0) {
    severity = 'HIGH'; confidence = 0.55;
    issue = 'marked CONTINUOUS but location AND INT/EXT change with NO shared character — physical/geographic continuity doubtful';
    correction = 'confirm an on-screen connective (match-cut / shared element / the seam crossing) or re-label the time marker; director/storyboarder call';
  } else if (continuous && locationChange && shared.length > 0) {
    severity = 'MEDIUM'; confidence = 0.5;
    issue = 'CONTINUOUS across a location change carried by shared character(s) — plausible travel/crossing, verify spatial legibility';
    correction = 'ensure an establishing beat or motion carries the eye across the location change';
  } else if (abruptPalette) {
    severity = 'MEDIUM'; confidence = 0.45;
    issue = `abrupt palette shift (similarity ${sim}) — visual raccord uncertain; may be deliberate contrast`;
    correction = 'treat as a motivated transition (dissolve / match-cut) OR confirm as an intentional tonal beat';
  } else if (locationChange) {
    severity = 'LOW'; confidence = 0.5; issue = 'ordinary location change on a cut'; correction = null;
  }
  transitions.push({ from: A.sc, to: B.sc, fromHead: A.head, toHead: B.head,
    extIntChange, locationChange, toTimeMarker: B.timeMarker, paletteSimilarity: sim, abruptPalette,
    sharedCharacters: shared, entering, exiting, severity, confidence,
    issue, proposedCorrection: correction,
    unverifiable: ['action legibility at edit speed', 'eyeline/axis match', 'movement-direction continuity', 'sound raccord', 'emotional raccord'],
    note: 'eyeline/axis/movement/sound/emotion raccords are INSUFFICIENT_INFO without real media — human/media required' });
}
const sev = {}; for (const t of transitions) sev[t.severity] = (sev[t.severity] || 0) + 1;
const out = { generated: '2026-10-24', totalTransitions: transitions.length, bySeverity: sev,
  method: 'metadata-based (EXT/INT, location, time marker, palette, scene characters). CRITICAL requires real media to assert and is NOT claimed here.',
  insufficientInfoDimensions: ['eyeline/axis', 'movement direction', 'sound raccord', 'emotional raccord', 'action legibility'],
  transitions };
writeFileSync(join(here, 'runs/benchmark/transition-audit-f10.json'), JSON.stringify(out, null, 1));
console.log(`transitions: ${transitions.length} | severity: ${JSON.stringify(sev)}`);
console.log('HIGH:', transitions.filter(t => t.severity === 'HIGH').map(t => `${t.from}->${t.to}`).join(', ') || 'none');
console.log('MEDIUM:', transitions.filter(t => t.severity === 'MEDIUM').map(t => `${t.from}->${t.to}`).join(', ') || 'none');
