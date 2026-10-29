// Production-resume DOSSIER (§4) — €0, read-only over real SSOT. Emits f11-production-resume-dossier.json:
// reusable assets, covered scenes/shots, chronological missing shots, audio needs+licences, per-generation max
// cost, required preflight checks, and the budget+attempts needed for the NEXT tranche. No paid call, no network.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const canon = join(here, '..', 'canon', 'F11_PROPOSED');
const R = (base, f) => JSON.parse(readFileSync(join(base, f), 'utf8'));

const timeline = R(canon, 'f11-film-timeline.json');
const shotlist = R(canon, 'f11-fullfilm-shotlist.json');
const master = R(canon, 'f11-production-master-plan.json');
const c2c = R(canon, 'f11-cost-to-complete.json');
const learning = R(here, 'f11-production-learning-ledger.json');
const led = (rel) => existsSync(join(here, rel)) ? R(here, rel) : null;
const t1 = led('runs/production-t1/t1-ledger.json');

// 1) reusable assets (every generated clip, its scene, status) — dedup derivatives out
const REUSABLE = [];
for (const s of timeline.scenes) for (const a of (s.existingAssets || [])) REUSABLE.push({ clip: a.clip, scene: s.scene, status: a.status, sec: a.sec, note: a.note || null });
const REJECTED = [];
for (const s of timeline.scenes) for (const r of (s.rejectedAssets || [])) REJECTED.push({ scene: s.scene, reason: r });

// 2) covered scenes + 3) chronological missing coverage
const bySceneShots = {}; for (const sh of shotlist.shots) (bySceneShots[sh.scene] ??= []).push(sh);
const scenesChrono = timeline.scenes.map(s => {
  const planned = (bySceneShots[s.scene] || []).length;
  const have = (s.existingAssets || []).length;
  const openingBeats = master.openingDesign_SC01_07?.beats?.[s.scene];
  return {
    scene: s.scene, act: s.act, content: s.content, narrativePurpose: s.narrativePurpose,
    plannedShots: planned, existingClips: have,
    coverage: have === 0 ? 'NONE' : (have >= planned ? 'FULL?' : 'PARTIAL'),
    keyMissingBeats: openingBeats ? openingBeats.missing : (have === 0 ? ['entire scene — no asset'] : ['remaining planned shots uncovered']),
    needsNewGeneration: have < planned,
  };
});
const missingShotsChrono = scenesChrono.filter(s => s.needsNewGeneration);
const estMissingShots = missingShotsChrono.reduce((a, s) => a + Math.max(0, s.plannedShots - s.existingClips), 0);

// 4) audio needs + licences
const audio = {
  sc01: { ambience: 'SYNTHESIZED-TEMP work bed built (temp-ambience-sc01.wav; muxed to sc01-opening-assembly-v3-worktrack.mp4) — procedurally generated via ffmpeg, NO third-party licence, NOT a final asset', dialogue: 'ASTRID/OLAF lines pending — needs TTS (speech-02-hd, paid, ATTEMPT-LOCKED) or licensed voice talent', music: 'none; needs verified CC0 (e.g. public-domain) sourced + per-file licence check' },
  general: 'All generated video is SILENT (PL-6). Final audio = verified CC0/licensed ambience+music + dialogue (TTS or talent) mixed in post. No licence may be assumed; verify each file before integration.',
  localAssetsFound: ['runs/validation-av/V4-speech02hd-dialogue.mp3 (paid-TTS sample; wrong content for SC01 ambience)'],
};

// 5) per-generation max cost (verified first-party prices, FX 1USD<=1EUR)
const perGenMaxCost = { video_minimax_video01: 0.60, still_flux_dev: 0.03, voice_speech02hd: 0.10, music_minimax: 0.60, note: 'reserve-worst-before-call; booked at worst-case (provider returns no per-call price)' };

// 6) required preflight checks (the executable guards)
const preflightChecks = learning.mandatoryLessons.map(l => ({ id: l.id, severity: l.guard?.severity, when: l.appliesWhen, rule: l.guard?.rule }));

// 7) next-tranche budget + attempts
const t1State = t1 ? { cap: t1.ceiling, spent: t1.spent, remaining: +(t1.ceiling - t1.spent - (t1.committed || 0)).toFixed(2), attempts: `${t1.attempts}/${t1.maxAttempts}`, attemptsLeft: t1.maxAttempts - t1.attempts } : null;
const nextTranche = {
  blocker: 'T1 attempts EXHAUSTED (20/20) — reserve() throws ATTEMPT CAP; €' + (t1State?.remaining ?? '?') + ' remaining is NOT spendable without a new authorization.',
  estMissingShots,
  costScenarios_EUR: c2c.scenarios?.map(s => ({ name: s.name, acceptPct: s.acceptPct, remainingClips: s.remainingClips, total_EUR: s.total_EUR })) || [],
  recommendation: 'Authorise a NEW tranche sized to the EXPECTED scenario (~€258, 70% accept) with an attempt budget >= estimated clips / accept-rate; keep per-call worst-case ceilings. The €167/€401 band and the €8.20 T1 residue are NOT authorizations.',
  firstShotsNextTranche: ['SC01 Olaf-lashed-to-mast (minimax, ~€0.60)', 'SC02 crew/comedy beat (minimax + flux)', '...then SC03→SC49 chronologically'],
};

// §4 Git onboarding (analysis only — NO policy change imposed)
const gitOnboarding = {
  problem: 'docs/film-factory/ is untracked: 606 MB / 738 files / 105 media binaries. A limited governance commit is dependency-broken; a full commit injects out-of-scope media.',
  options: [
    { id: 'A', name: 'ignore media + track source', how: 'add .gitignore rules for *.mp4/*.webp/*.png/*.mp3/*.wav + runs/ output, then commit only .mjs/.json/.md governance+pipeline source', pros: 'smallest history; keeps code reviewable; no LFS dep', cons: 'media not versioned (fine — regenerable/large)', risk: 'LOW', recommended: true },
    { id: 'B', name: 'scoped governance subtree', how: 'commit only the operating-method closure + its import deps as a curated set', pros: 'minimal', cons: 'dependency cascade is large and brittle to maintain', risk: 'MED' },
    { id: 'C', name: 'Git LFS for media', how: 'track media via LFS', pros: 'versions media', cons: 'repo-wide policy change; needs LFS infra/compat proof; 606 MB upload', risk: 'HIGH — reserved repo-policy decision', recommended: false },
  ],
  decision: 'RESERVED for CTO/repo-policy. Option A is the safest and is a reversible, non-destructive config change — but still a policy choice; not imposed here.',
};

const dossier = {
  generated: '2026-10-25', mission: 'F11 production-resume dossier (CII+ continuation). €0, read-only. Next-tranche ready.',
  truth: { timelineScenes: timeline.totalScenes, scenesWithAssets: timeline.scenesWithAssets, reconciliation: timeline.reconciliation },
  reusableAssets: REUSABLE, rejectedAssets: REJECTED,
  coveredScenes: scenesChrono.filter(s => s.existingClips > 0).map(s => ({ scene: s.scene, clips: s.existingClips, coverage: s.coverage })),
  chronology: scenesChrono,
  missingShotsChronological: missingShotsChrono.map(s => ({ scene: s.scene, content: s.content, plannedShots: s.plannedShots, existingClips: s.existingClips, keyMissingBeats: s.keyMissingBeats })),
  estMissingShots,
  audioNeeds: audio,
  perGenerationMaxCost_EUR: perGenMaxCost,
  requiredPreflightChecks: preflightChecks,
  t1Ledger: t1State,
  nextTranche, gitOnboarding,
  lockedDistribution: master.lockedDistribution,
  acceptanceNote: 'All existing clips are HUMAN_REVIEW_PENDING; none human-ACCEPTED. The film is NOT finished. Distribution 64/13/10/5/5/3 is MEASURED on the rendered edit, never claimed.',
};
writeFileSync(join(canon, 'f11-production-resume-dossier.json'), JSON.stringify(dossier, null, 1));
console.log(`DOSSIER: reusable ${REUSABLE.length} clips | covered ${dossier.coveredScenes.length} scenes | scenes needing generation ${missingShotsChrono.length} | est missing shots ~${estMissingShots}`);
console.log(`T1: ${t1State ? `spent €${t1State.spent}/€${t1State.cap}, remaining €${t1State.remaining}, attempts ${t1State.attempts} (left ${t1State.attemptsLeft})` : 'n/a'}`);
console.log(`NEXT TRANCHE: ~€${nextTranche.costScenarios_EUR.find(s => s.name === 'EXPECTED')?.total_EUR} (EXPECTED 70%) | first: ${nextTranche.firstShotsNextTranche[0]}`);
console.log(`GIT: recommend Option A (ignore media + track source) — reserved CTO decision.`);
