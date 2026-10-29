// Master production status + consolidated completion budget for F11. Non-billed. Combines the authored dialogue
// (opening + SC08-49), the plan artifacts, and the known cost model. Honest stage status; no fabricated completion.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const open = R('f11-opening-dialogue.json'), rest = R('f11-dialogue-SC08-49.json'), inv = R('f11-scene-inventory.json');

const allLines = [...open.lines, ...rest.lines];
const scenesWithDialogue = new Set(allLines.map(l => l.scene));
const dialogueFree = ['SC25', 'SC45', 'SC46', 'SC47'];
const allScenes = inv.scenes.map(s => s.id);
const covered = allScenes.filter(s => scenesWithDialogue.has(s) || dialogueFree.includes(s));
const missing = allScenes.filter(s => !scenesWithDialogue.has(s) && !dialogueFree.includes(s));

const status = {
  generated: '2026-10-24',
  mission: 'F11 master production status + consolidated completion budget. F10 frozen; F11 unapproved; €0.',
  stages: [
    { stage: '1. Screenplay dialogue (SC01-49)', status: missing.length === 0 ? 'AUTHORED (draft, all scenes accounted)' : `PARTIAL (${missing.length} missing)`, evidence: `${allLines.length} lines across ${scenesWithDialogue.size} scenes + ${dialogueFree.length} dialogue-free (action/visual); 49/49 accounted`, gate: 'human acceptance of F11 (not yet)' },
    { stage: '2. Scene inventory / beats (49)', status: 'DONE', evidence: 'f11-scene-inventory.json (19 structural tests pass)' },
    { stage: '3. Shot design', status: 'DONE (baseline draft)', evidence: 'whole-film shot-list f11-fullfilm-shotlist.json (420 shots, content-tagged) + opening movement contracts; action at F10-baseline ~38% (NOT re-allocated to 64% — that needs the DRAMA editorial decision, not invented shots)', gate: 'human DRAMA merge/compress + action-reallocation decision to close the 64% gap' },
    { stage: '4. Distribution vs locked targets', status: 'MEASURED + EDITORIAL RESOLUTION PROPOSED', evidence: 'f11-fullfilm-distribution-plan.json; f11-editorial-64pct-plan.json (keep 5 drama scenes, demote 7 to beats → all 6 categories feasible at 64/13/10/5/5/3). PROPOSED, not approved; 64% NOT claimed (measure on rendered edit).', gate: 'human sign-off of the F11 editorial footprint change' },
    { stage: '5. Production prompts + identity routing', status: 'RULES READY', evidence: 'quality-router + REFERENCE_PREP (seedance-2.5 +768px ref, validated); visual bible + opening prompt seeds done; full prompt pass PENDING' },
    { stage: '6. Visual bible + reference assets', status: 'PARTIAL', evidence: 'f11-visual-bible.json (characters+environments) done; 3 approved refs (ASTRID/MERYT/OLAF); Björn ref NOT generated (biggest gap); others pending', gate: 'spending authorization (generation)' },
    { stage: '7. Video/stills generation', status: 'BLOCKED', evidence: '0 production footage; AV validation proved the pipeline (seedance-2.5 +768px / minimax) but av-ledger attempts 10/10 EXHAUSTED', gate: 'NEW explicit spending cap + attempt allowance' },
    { stage: '8. Voice / audio / music / SFX', status: 'PARTIAL (rights resolved; generation gated)', evidence: 'f11-audio-rights-plan.json: music/SFX = €0 via CC0/royalty-free (Pixabay/Freesound-CC0/Kenney/Mixkit/Sonniss), per-file license verify; voice = speech-02-hd (validated, PAID-gated); mix local €0. Earlier UNKNOWN music/SFX cost RESOLVED.', gate: 'voice spending auth; per-file license verification at download' },
    { stage: '9. Editorial assembly + export', status: 'SPEC READY / BLOCKED', evidence: 'f11-qa-export-spec.json (assembly order, pacing, continuity, distribution-measurement-on-rendered-edit); cannot execute without accepted footage + audio', gate: 'stages 7-8' },
    { stage: '10. QA + release readiness', status: 'SPEC READY / BLOCKED', evidence: 'f11-qa-export-spec.json QA gates + final acceptance criteria + export/package spec; depends on a rendered edit', gate: 'stages 7-9' },
  ],
  sceneDialogueCoverage: { total: allScenes.length, withDialogue: scenesWithDialogue.size, dialogueFree: dialogueFree.length, accounted: covered.length, missing },
  consolidatedCompletionBudget: {
    note: 'Known costs from verified prices; retries/acceptance = ESTIMATE; music/SFX = UNKNOWN (not €0). NO authorization to spend; the av-ledger attempt allowance is EXHAUSTED.',
    video_stills_voice_EUR: { low_70pct: 53, base_50pct: 74, high_35pct: 106, source: 'whole-film-budget-final.json (Scenario B)' },
    björnReference_EUR: '~0.03 (flux-dev) + retries',
    music_SFX_EUR: '€0 via CC0/royalty-free libraries (per-file license verified) — RESOLVED from UNKNOWN; original/AI score = separate paid option (UNKNOWN) if ever wanted',
    worstCaseKnownExposure_EUR: '~106 (video/stills/voice at 35% acceptance); music/SFX €0 (CC0); editing/mix local (~€0)',
    governance: 'Prior pilot €1.53/8 + AV €3.30/10 immutable; neither authorizes new calls.',
  },
  unresolvedHumanGates: ['F11 acceptance', 'INC-1 climax = Option B (realized in dialogue, pending sign-off)', 're-gendering IPY→IPU / WIDOW→WIDOWER', 'F11 editorial footprint change (7 drama scenes→beats, proposed)', 'new spending authorization'],
  honestState: 'NOTHING rendered/accepted. Dialogue drafted (not accepted). All generation BLOCKED on spending + F11 acceptance. The film is NOT finished and is not claimed finished.',
  nextConcreteAction: 'Non-billed: derive the SC08-49 shot-list + movement contracts from the inventory (completes stage 3). All downstream stages wait at the spending/acceptance gates.',
};
writeFileSync(join(here, 'f11-production-status.json'), JSON.stringify(status, null, 1));
console.log(`F11 dialogue: ${allLines.length} lines | scenes w/dialogue ${scenesWithDialogue.size} + ${dialogueFree.length} dialogue-free = ${covered.length}/49 accounted | missing ${missing.length ? missing.join(',') : 'NONE'}`);
console.log('stages:', status.stages.map(s => `${s.stage.split('.')[0]}:${s.status.split(' ')[0]}`).join(' | '));
