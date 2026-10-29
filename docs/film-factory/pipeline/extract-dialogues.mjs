// Phase 1 (local, €0) — extracts the exact French... NO: the F10 screenplay dialogue is in English; the FR track
// is a DUBBING target. This extracts the CANONICAL dialogue lines (speaker + text + scene + order) from the F10
// screenplay, mapping each to its SCxx via the scene-number prefix in the shot-list sceneHeads. It PRESERVES text
// verbatim and FLAGS scenes/lines not found instead of inventing. Output: dialogues-f10.json. (The French
// rendering itself must be a human/translation step — NOT fabricated here.)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SCREENPLAY = join(here, '..', '37_SCREENPLAY_60MIN_F10.md');
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

// map scene-number prefix (e.g. "1.", "30A.") -> SCxx, from shot-list sceneHeads
const prefixToScene = new Map();
for (const sh of sl.shots) {
  const m = (sh.sceneHead || '').match(/^([0-9]+[A-Z]?)\.\s/);
  if (m) prefixToScene.set(m[1], sh.scene);
}

const lines = readFileSync(SCREENPLAY, 'utf8').split('\n');
const out = [];
let curScene = null, curPrefix = null, order = 0;
const stripParen = (t) => t.replace(/\*\([^)]*\)\*/g, ' ').replace(/\s+/g, ' ').trim();
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const h = ln.match(/^#{2,4}\s+([0-9]+[A-Z]?)\.\s+(.*)$/);
  if (h) { curPrefix = h[1]; curScene = prefixToScene.get(h[1]) || null; continue; }
  const d = ln.match(/^\*\*([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 \-'’]+):\*\*\s*(.*)$/);
  if (d) {
    const speaker = d[1].trim();
    let raw = d[2];
    // join soft-wrapped continuation lines (markdown wraps dialogue across physical lines). Stop at a blank line,
    // a new speaker (**), a scene header (#), or a stage-action line that is ENTIRELY italic (*...*).
    while (i + 1 < lines.length) {
      const nx = lines[i + 1];
      if (nx.trim() === '' || /^#{1,6}\s/.test(nx) || /^\*\*/.test(nx) || /^\s*\*[^*].*\*\s*$/.test(nx) || /^---/.test(nx)) break;
      raw += ' ' + nx; i++;
    }
    const text = stripParen(raw);
    if (text) out.push({ scene: curScene, scenePrefix: curPrefix, order: ++order, speaker, text });
  }
}

// coverage vs AUDIO_LINE shots
const audioScenes = new Set(sl.shots.filter(s => s.mediaCategory === 'AUDIO_LINE').map(s => s.scene));
const scenesWithDialogue = new Set(out.map(l => l.scene).filter(Boolean));
const audioScenesWithoutDialogue = [...audioScenes].filter(s => !scenesWithDialogue.has(s)).sort();
const bySceneCounts = {}; for (const l of out) if (l.scene) bySceneCounts[l.scene] = (bySceneCounts[l.scene] || 0) + 1;
const unmatchedPrefixes = [...new Set(out.filter(l => !l.scene).map(l => l.scenePrefix))];

const doc = {
  generated: '2026-10-24', source: '37_SCREENPLAY_60MIN_F10.md',
  note: 'Canonical dialogue (English source). FR dubbing is a SEPARATE human/translation step — NOT fabricated. Lines preserved verbatim; scenes/lines not found are flagged, never invented.',
  totalLines: out.length, audioLineShots: sl.shots.filter(s => s.mediaCategory === 'AUDIO_LINE').length,
  scenesWithDialogue: scenesWithDialogue.size, bySceneCounts,
  audioScenesWithoutDialogue, unmatchedScenePrefixes: unmatchedPrefixes,
  lines: out,
};
writeFileSync(join(here, 'dialogues-f10.json'), JSON.stringify(doc, null, 1));
console.log(`extracted ${out.length} dialogue lines across ${scenesWithDialogue.size} scenes | audioLineShots=${doc.audioLineShots} | audioScenesWithoutDialogue=${audioScenesWithoutDialogue.length} [${audioScenesWithoutDialogue.join(',')}] | unmatchedPrefixes=[${unmatchedPrefixes.join(',')}]`);
