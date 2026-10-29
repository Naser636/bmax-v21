// §4 (local, €0) — sequential storyboard REVIEW for CTO browsing. Structured JSON + human-readable Markdown that
// walks the 49 scenes in canonical order and their shots in order, with framing/movement/action/visual-intent/
// characters. It is a TEXT/structured review — explicitly NOT real storyboard images (none exist). Non-destructive.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const si = JSON.parse(readFileSync(join(here, 'runs/benchmark/shot-intent-f10.json'), 'utf8'));

const order = [...new Set(si.fiches.map(f => f.canonRef.value.scene))];
const review = order.map(sc => {
  const shots = si.fiches.filter(f => f.canonRef.value.scene === sc);
  return { scene: sc, sceneHead: shots[0].canonRef.value.sceneHead, act: shots[0].canonRef.value.act, shotCount: shots.length,
    shots: shots.map(f => ({ id: f.id, framing: f.framing.value, movement: f.cameraMovement.value,
      action: f.visibleAction.value, visualIntent: f.visualIntent.value, characters: f.characters.value,
      dramaticPurpose: f.dramaticPurpose.value, humanReview: f.humanReviewRequired.length })) };
});

let md = '# Storyboard sequentiel — La Porte du Soleil (F10)\n\n';
md += '> REVUE TEXTUELLE/STRUCTUREE pour relecture CTO — PAS des images de storyboard reelles. ';
md += 'Aucune image de reference ne existe encore. Budget 0 EUR.\n\n';
for (const s of review) {
  md += `## ${s.scene} — ${s.sceneHead} (Acte ${s.act}, ${s.shotCount} plans)\n`;
  for (const sh of s.shots) {
    md += `- **${sh.id}** [${sh.framing}, ${sh.movement}] ${(sh.action || '').slice(0, 72)}`;
    if (sh.characters.length) md += ` · ${sh.characters.join(',')}`;
    md += '\n';
  }
  md += '\n';
}

writeFileSync(join(here, 'runs/benchmark/storyboard-review-f10.json'), JSON.stringify({
  generated: '2026-10-24', isRealImages: false,
  note: 'Sequential TEXT review for CTO browsing — NOT storyboard images. No reference images exist.',
  totalScenes: review.length, totalShots: si.totalShots, scenes: review }, null, 1));
writeFileSync(join(here, 'runs/benchmark/storyboard-review-f10.md'), md);
console.log(`storyboard-review: ${review.length} scenes, ${si.totalShots} shots (TEXT review, not images). md + json written.`);
