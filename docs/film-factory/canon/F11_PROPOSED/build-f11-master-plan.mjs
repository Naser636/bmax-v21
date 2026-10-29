// CONSOLIDATED F11 end-to-end production master plan (SSOT). Reads existing artifacts; maps the 7 accepted
// tranche-1 clips to scenes; computes per-scene existing/missing coverage. No paid call. F10 unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const shotlist = R('f11-fullfilm-shotlist.json');
const edit = R('f11-editorial-64pct-plan.json');
const audit = JSON.parse(readFileSync(join(here, '../../pipeline/runs/production-t1/throughput-audit.json'), 'utf8'));

// the 7 ACCEPTED tranche-1 clips mapped to the scene(s) they can serve (reuse)
const EXISTING = {
  SC01: ['E1-storm-establisher (ENV)', 'A1b-oar (Björn helm)', 'A3b-sea (atmosphere)'],
  SC04: ['A4b-march-twosun'],
  SC06: ['R1-rescue (reusable SC18/SC40)'],
  SC38: ['G1-greatsword-strike', 'A2b-v2-greatsword-stance'],
};
// per-scene planned shot counts + content, from the whole-film shotlist
const planned = {};
for (const s of shotlist.shots) (planned[s.scene] ??= { content: s.content, shots: 0 })['shots']++;

// opening (SC01-07) required beats + what's missing
const OPENING_BEATS = {
  SC01: { beats: ['storm wide establisher ✓(E1)', 'Björn at the steering-oar ✓(A1b)', 'Astrid reads/shouts ✗', 'Olaf lashed to mast ✗', 'the crest UNRAVELS into the gold seam ✗', 'the seam takes the ship ✗'], have: 3, missing: ['Astrid read', 'Olaf at mast', 'gold-seam-takes-ship'] },
  SC02: { beats: ['crew on deck, wrong-coloured sea', 'Tove comedy vs Björn deadpan'], have: 0, missing: ['SC02 coverage (comedy beat)'] },
  SC03: { beats: ['two worlds stack (storm above, desert below)', 'Björn tries to cut the light — fails'], have: 0, missing: ['crossing/two-worlds VFX', 'Björn-cuts-light'] },
  SC04: { beats: ['crew on two-sun shore ✓(A4b adaptable)', 'Olaf names the impossible', 'leadership handoff Olaf→Björn'], have: 1, missing: ['Olaf two-sun reaction', 'handoff two-shot'] },
  SC05: { beats: ['Meryt river-patrol takes the strangers', 'IPU watches'], have: 0, missing: ['patrol/capture', 'Meryt intro', 'IPU'] },
  SC06: { beats: ['wrong-tide surge', 'Astrid calls the read', 'Björn hauls a figure clear ✓(R1)'], have: 1, missing: ['tide VFX wide', 'Astrid call'] },
  SC07: { beats: ['Seth-Nakht arrives, claims them', 'cold standoff (Björn rage held)'], have: 0, missing: ['Seth-Nakht intro', 'standoff two-shot'] },
};

const sceneMap = Object.keys(planned).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2))).map(sc => ({
  scene: sc, content: planned[sc].content, plannedShots: planned[sc].shots,
  existingAccepted: EXISTING[sc] || [], existingCount: (EXISTING[sc] || []).length,
  status: (EXISTING[sc] || []).length ? 'PARTIAL (clips exist)' : 'PLANNED (0 generated)',
}));
const scenesWithAssets = sceneMap.filter(s => s.existingCount > 0).length;

const plan = {
  generated: '2026-10-25',
  mission: 'F11 end-to-end production MASTER PLAN (SSOT). Consolidates inventory + scene map + continuity + opening + workflow + quality gate. No paid call; F10 frozen.',
  inventoryReconciliation: {
    paid_EUR: audit.inventory.ledgers_paid_EUR, totalPaid_EUR: 10.23,
    t1Cap: '€15 (ctoBoundedPaidRunAuthorized); spent €5.40; remaining €9.60; 18/20 attempts',
    acceptedClips: 7, rejected: 1, acceptedSeconds: 39.88, assembledSeconds: 17.29,
    priorLedgers: 'pilot €1.53/8 + av €3.30/10 IMMUTABLE (F10/AV tests, not production)',
    capRespected: true,
  },
  lockedDistribution: { ACTION: 64, STORY: 13, TENSION: 10, DRAMA: 5, COMEDY: 5, WORLD: 3, note: 'FIXED; measured on the rendered edit (definition-of-done), not claimed.' },
  continuityConstraints: { ref: 'f11-visual-bible.json (characters/environments/invariants) + continuity-rulebook (if present)', keyInvariants: ['Himinkljúfr greatsword tracked (UNDERSIZED on text — use greatsword-bearing Björn ref)', 'Björn identity = minimax subject_reference (seedance E005-rejects his face)', 'Astrid star-chart tattoo (canon)', 'Olaf arm-ring→Björn SC43', 'two-sun sky plate Act III', 'steering-oar NOT wheel', 'wool tunic (not bare chest)', 'audio added in post (shots silent), CC0 verified per-file'] },
  sceneMap: { totalScenes: 49, totalPlannedShots: shotlist.totalShots, scenesWithExistingAssets: scenesWithAssets, scenes: sceneMap },
  openingDesign_SC01_07: { note: 'A COHERENT opening needs all beats below — NOT just a montage of available clips. Missing shots are explicit.', beats: OPENING_BEATS, existingClips: 5, missingShotsCount: Object.values(OPENING_BEATS).reduce((a, b) => a + b.missing.length, 0) },
  workflowEfficiency_MEASURED: {
    costPerGeneratedSecond_EUR: '≈0.11 (minimax €0.60/5.64s) / ≈0.13 (seedance €0.80/6.04s)',
    costPerAcceptedSecond_EUR: { genOnly: 0.110, allIn: 0.135 }, costPerAcceptedClip_EUR: 0.629,
    rejectionRate_observed: '1/8 = 12.5% (t1, curated); plan at 15-30% at scale',
    achievableWithinRemaining_EUR_9_60: '≈13-16 more minimax clips OR mix; enough for ~1-2 more coherent SEQUENCES (not the whole opening)',
    recommendedWorkflow: 'W-B reuse-hybrid (seedance text-only env + minimax Björn identity + flux/Ken-Burns coverage + CC0 audio €0 + TTS); maximize reuse/holds',
  },
  fullFilmEstimate_EUR: { note: 'measured clip cost × shot-based model; action-first = video-heavy', band: { accept85: 270, accept70: 327, accept55: 414 }, correction: 'prior €53-106 undercounted; €60-70 NOT achievable for 60-min action-first' },
  qualityGate: { ref: 'f11-qa-export-spec.json', gates: ['automatable: integrity, 1080p+ after upscale, fps, duration, CIQE (black/flicker/pop/stream/audio-when-present)', 'HUMAN: full-motion identity across the clip, action readability, dialogue intelligibility + lip-sync, audio mix, pacing, ≥7.5/10 cinematic', 'final: realized distribution MEASURED on the rendered edit vs 64/13/10/5/5/3'] },
  unresolvedBlockers: ['F11 human acceptance (editorial footprint change, INC-1=B, re-gendering)', 'greatsword renders undersized (fix: greatsword-bearing Björn ref)', 'multi-character identity in one shot (minimax=single; seedance rejects Björn)', 'full-film budget €270-414 >> €15 tranche → needs future authorizations', 'human cinematic review of the 7 clips + SC01 assembly'],
  nextAction: 'Within the remaining €9.60 (2 attempts): ONE minimax call with the greatsword-bearing Björn ref (bjorn-ref-3) to fix the undersized greatsword — the single highest-value shot (unblocks all Björn hero-action). Worst-case €0.60 < €15. Then upscale the SC01 assembly to 1080p (local €0) and prepare CC0 audio for a first audiovisual SC01. Resume broader generation only under a new tranche authorization sized to the €270-414 full-film reality.',
  successDefinition: 'measurable progress toward a COHERENT editable film (scene-mapped, continuity-locked, reuse-driven) — not disconnected clips. No fabricated completion; no budget overrun.',
};
writeFileSync(join(here, 'f11-production-master-plan.json'), JSON.stringify(plan, null, 1));
console.log(`MASTER PLAN: 49 scenes / ${shotlist.totalShots} planned shots | scenes with assets ${scenesWithAssets} | accepted clips 7 | opening missing shots ${plan.openingDesign_SC01_07.missingShotsCount}`);
console.log(`budget: t1 €5.40/€15 spent, €9.60 remaining | full-film €270-414 | next: greatsword-ref fix (€0.60)`);
