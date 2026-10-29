// Resolves CANON-FAITHFUL generation prompts for F10 shots from the authored registers (video-prompts-f10.json +
// still-prompts-f10.json). The prototype benchmark previously used GENERIC prompts → off-canon media (e.g. SC01
// generated as a golden city instead of F10's "NORTH SEA — STORM — NIGHT"). Wiring these faithful prompts is a
// FREE local fix so the NEXT authorized paid run is faithful to La Porte du Soleil. No network, €0.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

const VID = read('video-prompts-f10.json').shots || [];
const STILL = read('still-prompts-f10.json').shots || [];
const vById = new Map(VID.map(s => [s.id, s]));
const sById = new Map(STILL.map(s => [s.id, s]));
let DERIVED = []; try { DERIVED = read('derived-prompts-f10.json').shots || []; } catch {}
const dById = new Map(DERIVED.map(s => [s.id, s]));

export function getFaithfulPrompt(shotId) {
  const v = vById.get(shotId); if (v) return { id: shotId, kind: 'video', scene: v.scene, sceneHead: v.sceneHead, palette: v.palette, fullPrompt: v.fullPrompt, identityRefs: v.identityRefs || [] };
  const s = sById.get(shotId); if (s) return { id: shotId, kind: 'image', scene: s.scene, sceneHead: s.sceneHead, palette: s.palette, fullPrompt: s.fullPrompt, identityRefs: s.identityRefs || [] };
  const dd = dById.get(shotId); if (dd) return { id: shotId, kind: dd.kind, scene: dd.scene, sceneHead: dd.canonLink?.sceneHead, palette: null, fullPrompt: dd.fullPrompt, identityRefs: [], derived: true };
  return null;
}

// The canonical 5-prototype benchmark set (per benchmark-cost-estimate-f10.json), mapped to faithful shot ids.
export const PROTOTYPE_SHOT_IDS = {
  SC40: 'SC40-SH06',       // hero action-insert — SEAM-ROOT, the cost of the line
  SC22: 'SC22-SH06',       // action/crowd/tide — MARKET, second tide
  SC01: 'SC01-SH01',       // establisher — NORTH SEA, storm, night (longship SOLFARI, ASTRID)
  SC43: 'SC43-SH03',       // intimate still (+ FR voice) — SEAM-ROOT convergence
  SC39: 'SC39-SH04',       // SEAM-ROOT — Seth-Nakht's choice
  SC48: 'SC48-SH02',       // THE CAIRN — single-sun morning (wound continuity w/ SC39)
};

export function resolvePrototypes() {
  const out = {};
  for (const [k, id] of Object.entries(PROTOTYPE_SHOT_IDS)) out[k] = getFaithfulPrompt(id);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = resolvePrototypes();
  for (const [k, p] of Object.entries(r)) console.log(`${k} (${p?.id}) [${p?.kind}] ${p?.sceneHead} :: ${(p?.fullPrompt || 'MISSING').slice(0, 90)}`);
}
