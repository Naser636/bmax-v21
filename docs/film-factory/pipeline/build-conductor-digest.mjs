// Emit a human-readable markdown digest of the 49-scene conductor (from scene-conductor-f10.json). PREP, €0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(here, 'scene-conductor-f10.json'), 'utf8'));
const d = C.durationReconciliation;
let md = `# F10 — 49-Scene Conductor (digest) — generated, PREP only\n\n`;
md += `Source: scene-conductor-f10.json (from F10 + registers). **No media produced; no artistic validation.** `;
md += `Durations: theoretical **${d.theoreticalScenarioMin.lo}–${d.theoreticalScenarioMin.hi} min** · planned edit **60** · `;
md += `**real exported = NONE (not validated)**. Generated coverage ${d.generatedCoverageMin} min.\n\n`;
md += `Dramatic-function gate: **${C.dramaticFunctionGate.allPass ? 'ALL 49 PASS' : 'FAIL'}**, ${C.dramaticFunctionGate.flags.length} flags. `;
md += `SC47 (suns part): intentional silence **${C.dramaticFunctionGate.sc47.intentionalSilenceOk ? 'OK' : 'REVIEW'}**.\n\n`;
md += `| # | Scene | Functions | Shots | Dlg | Human/Env mv | Staged s | Gen s | Risks |\n|--:|---|---|--:|--:|---|--:|--:|---|\n`;
for (const r of C.rows) {
  const risks = r.risks.map(x => x.cause).filter(x => x !== 'none at current thresholds').join('; ') || '—';
  md += `| ${r.order} | ${r.head.replace(/\|/g, '/').slice(0, 40)} | ${r.dramaticFunctions.join('+')} | ${r.shotsInOrder.length} | ${r.dialogueLines} | ${r.movement.human}/${r.movement.environment} | ${r.durations.stagedLoSec}-${r.durations.stagedHiSec} | ${r.durations.generatedOutputSec} | ${risks.slice(0, 40)} |\n`;
}
md += `\n**Legend:** ${C.legend}\n`;
md += `\n**Reuse/coverage:** ~${Math.round((3600 - d.generatedCoverageMin * 60) / 60)} min of the 60 is hold/reuse/score-over-still — UNPROVEN until a real cut (NEEDS_REAL_MEDIA). The 41 motion shots stay NEEDS_REAL_MEDIA.\n`;
writeFileSync(join(here, '..', '45_SCENE_CONDUCTOR_DIGEST.md'), md);
console.log(`conductor digest -> docs/film-factory/45_SCENE_CONDUCTOR_DIGEST.md (${C.rows.length} scenes)`);
