// §2 — verify the 26 lot-v3 plans end-to-end (do NOT assume READY == producible). Adds the PROMPT-READINESS
// dimension the classifier cannot cover: a shot is production-ready only if it ALSO has a distinct, beat-specific
// AUTHORED prompt (the shotlist promptSeed is a generic scene placeholder, shared by all shots in a scene).
// €0, read-only. Output f11-lot-prompt-audit.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRoster, loadBeats, classifyShot, STATUS } from './shot-readiness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const batch = JSON.parse(readFileSync(join(canon, 'f11-tranche-10eur-batch.json'), 'utf8'));
const sl = JSON.parse(readFileSync(join(canon, 'f11-fullfilm-shotlist.json'), 'utf8'));
const roster = loadRoster(); const beats = loadBeats();
const slById = Object.fromEntries(sl.shots.map(s => [s.id.replace(/^F11-/, ''), s]));

// authored prompts exist as dedicated producers/specs; a generic scene seed is NOT a beat-specific prompt.
const AUTHORED = new Set(['SC01-olaf-mast', 'SC17-SH01']); // Olaf (produced) + SC17 read (produced via authored prompt)
// per-scene seed uniqueness: if all shots in a scene share one seed, individual shots are NOT beat-distinct
const seedByScene = {}; for (const s of sl.shots) (seedByScene[s.scene] ??= new Set()).add(s.promptSeed);

const rows = (batch.batch || []).map(b => {
  const sh = slById[b.shot];
  const cls = sh ? classifyShot({ ...sh, id: b.shot }, roster, beats[b.scene] || '') : { status: 'NO_SHOTLIST_ENTRY' };
  const sceneSeedsDistinct = (seedByScene[b.scene]?.size || 0) > 1;
  const promptAuthored = AUTHORED.has(b.shot) || AUTHORED.has(b.scene + '-' + b.shot);
  const promptReady = promptAuthored; // only an authored beat-specific prompt counts
  return {
    order: b.order, scene: b.scene, shot: b.shot, subject: b.subject, media: b.mediaCategory, maxEur: b.maxEur,
    classifierStatus: cls.status, classifierReady: cls.status === STATUS.READY,
    sceneSeedBeatDistinct: sceneSeedsDistinct,
    promptAuthored, promptReady,
    productionReady: (cls.status === STATUS.READY) && promptReady,
    needs: promptReady ? [] : ['author a distinct, beat-specific single-subject prompt (the shotlist seed is a generic scene placeholder)'],
  };
});

const productionReady = rows.filter(r => r.productionReady).length;
const classifierReadyButNoPrompt = rows.filter(r => r.classifierReady && !r.promptReady).length;
const audit = {
  generated: '2026-10-25', document: '§2 lot-v3 end-to-end plan verification (classifier + prompt-readiness)',
  batchSize: rows.length,
  summary: {
    classifierReady: rows.filter(r => r.classifierReady).length,
    promptAuthored: rows.filter(r => r.promptAuthored).length,
    productionReady,
    classifierReadyButPromptMissing: classifierReadyButNoPrompt,
  },
  finding: `All ${rows.length} lot shots pass the identity/VFX CLASSIFIER, but ${classifierReadyButNoPrompt} lack a distinct beat-specific AUTHORED prompt (the shotlist uses one generic seed per scene). READY (classifier) != PRODUCTION-READY. No new paid call until prompts are authored + verified.`,
  gate: 'NO paid call: production-ready count = ' + productionReady + ' (need authored prompts first).',
  preparationPlan: 'Author distinct single-subject prompts per beat, in chronological order, for the next coherent scene (e.g. SC17 remaining beats), then re-verify (classifier READY + authored prompt + ref + preflight) before spending.',
  rows,
};
writeFileSync(join(canon, 'f11-lot-prompt-audit.json'), JSON.stringify(audit, null, 1));
console.log(`§2 LOT AUDIT: ${rows.length} shots | classifier-READY ${audit.summary.classifierReady} | prompt-authored ${audit.summary.promptAuthored} | PRODUCTION-READY ${productionReady}`);
console.log(`  finding: ${classifierReadyButNoPrompt} are classifier-READY but LACK a beat-specific authored prompt -> NOT production-ready`);
console.log(`  GATE: no paid call until prompts authored (prep incomplete). Next: author SC17 remaining beats as a sequence.`);
