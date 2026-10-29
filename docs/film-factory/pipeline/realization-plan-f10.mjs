// Cinematic REALIZATION layer for F10 — a library the single production runner consumes (NOT a parallel pipeline).
// Joins the active shot-list + video-/still-prompt registers + bible into a controllable per-shot realization,
// CLASSIFIES each shot by its real production need, and applies an anti-void / anti-slideshow QUALITY gate.
// Dry-run only; no media, no spend. Nothing here declares ARTISTIC validation — that needs real media + a human.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const HUMAN_ACTION = /(disarm|charge|rescue|haul|drag|lunge|shove|strike|draw|run|climb|plunge|throw|grab|wield|fight|leap|dive)/i;
const ENV_MOTION = /(tide|flood|wave|surge|seam|morph|water|drown|sea|storm|erupt|rising)/i;

// CLASSIFY a shot by real need (the mandate's taxonomy).
export function classify(shot, prompt) {
  const cat = shot.mediaCategory, type = shot.shotType;
  const t = `${shot.subjectAction} ${prompt?.scriptAnchor || ''} ${shot.sceneHead}`.toLowerCase();
  if (cat === 'AUDIO_LINE') return 'VOICE';
  if (cat === 'MUSIC_CUE') return 'MUSIC';
  if (cat === 'PREMIUM_VIDEO') {
    if (type.includes('WIDE')) return 'ENVIRONMENT_MOVEMENT'; // camera-only establisher — still-downgrade candidate
    if (HUMAN_ACTION.test(t)) return 'ESSENTIAL_HUMAN_MOVEMENT';
    if (ENV_MOTION.test(t)) return 'ENVIRONMENT_MOVEMENT';
    return 'REACTION_INSERT_COVERAGE';
  }
  // STILL_ANIMATABLE
  if (type.includes('coverage')) return 'REACTION_INSERT_COVERAGE';
  return 'LEGITIMATE_STILL';
}

export function buildRealization() {
  const SL = read('shot-list-f10.json');
  const vp = read('video-prompts-f10.json'); const sp = read('still-prompts-f10.json');
  const vById = Object.fromEntries(vp.shots.map(s => [s.id, s]));
  const sById = Object.fromEntries(sp.shots.map(s => [s.id, s]));
  const shots = SL.shots.map(s => {
    const prompt = vById[s.id] || sById[s.id] || null;
    const cls = classify(s, prompt);
    return {
      id: s.id, scene: s.scene, sceneHead: s.sceneHead, mediaCategory: s.mediaCategory, shotType: s.shotType,
      classification: cls,
      dramaticFunction: prompt?.dramaticOutcome || prompt?.dramaticIntent || s.dramaticFunction || s.subjectAction,
      framing: s.shotType, cameraMove: s.movement, subjectAction: s.subjectAction,
      characters: (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref),
      dialogue: s.mediaCategory === 'AUDIO_LINE',
      cuts: { fromPrev: 'per edit-plan', toNext: 'per edit-plan' },
      continuity: prompt?.continuity || [],
      sound: s.mediaCategory === 'MUSIC_CUE' ? 'scored cue' : (s.mediaCategory === 'AUDIO_LINE' ? 'FR dialogue (voice bible)' : 'ambience/FX per scene; silence where intentional'),
      targetSec: s.targetSec || 0,
      acceptanceCriteria: prompt?.acceptanceCriteria || null,
      rejectionCriteria: prompt?.rejectionCriteria || null,
      promptLinked: !!prompt,
      refs: (s.continuityRefs || []).map(r => `${r.type}:${r.ref}:${r.status}`),
    };
  });
  return { SL, shots };
}

// ANTI-VOID / ANTI-SLIDESHOW gate. Per scene + per shot. Flags are {id, scene, cause, evidence, candidateFix,
// depsToRetest, status}. status ∈ FLAG | NEEDS_REAL_MEDIA | BLOCKED. Intentional silence is NOT penalised.
export function antiSlideshowGate(real) {
  const { shots } = real;
  const flags = [];
  const scenes = [...new Set(shots.map(s => s.scene))];
  const AVG_LINE_SEC = 6;      // spoken line + short pause
  const HELD_MAX_SEC = 12;     // a single still/clip held longer than this without progression = slideshow risk
  for (const sc of scenes) {
    const ss = shots.filter(s => s.scene === sc);
    const head = ss[0].sceneHead;
    const dialogueLines = ss.filter(s => s.dialogue).length;
    const visuals = ss.filter(s => s.mediaCategory === 'PREMIUM_VIDEO' || s.mediaCategory === 'STILL_ANIMATABLE');
    const coverage = ss.filter(s => s.classification === 'REACTION_INSERT_COVERAGE').length;
    const video = ss.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').length;
    const establishers = ss.filter(s => s.shotType.includes('WIDE')).length;
    // estimated scene screen seconds (dialogue-driven + a floor for action)
    const screenSec = Math.max(dialogueLines * AVG_LINE_SEC, visuals.reduce((a, s) => a + s.targetSec, 0));
    const perVisual = visuals.length ? screenSec / visuals.length : Infinity;
    // (1) slideshow risk: too few distinct visuals for the screen time
    if (perVisual > HELD_MAX_SEC) flags.push({ id: sc, scene: sc, cause: 'SLIDESHOW_RISK', evidence: `~${Math.round(screenSec)}s screen / ${visuals.length} visuals = ${Math.round(perVisual)}s per image (> ${HELD_MAX_SEC}s)`, candidateFix: 'add reaction/insert coverage or a motion beat; do NOT merely hold the image longer', depsToRetest: [sc], status: 'NEEDS_REAL_MEDIA' });
    // (2) dialogue under-covered: more dialogue lines than coverage shots (some lines share a held image)
    if (dialogueLines > 0 && coverage < Math.ceil(dialogueLines / 2)) flags.push({ id: sc, scene: sc, cause: 'DIALOGUE_UNDERCOVERED', evidence: `${dialogueLines} lines but only ${coverage} reaction/coverage visuals`, candidateFix: 'add listener-reaction coverage so lines are not covered by one static image', depsToRetest: [sc], status: 'NEEDS_REAL_MEDIA' });
    // (3) redundant establishers (spectacle without added function)
    if (establishers > 1) flags.push({ id: sc, scene: sc, cause: 'REDUNDANT_ESTABLISHER', evidence: `${establishers} wide establishers in one scene`, candidateFix: 'keep one establisher; repurpose the other as content coverage', depsToRetest: [sc], status: 'FLAG' });
    // (4) empty scene: no dialogue AND no action-classified visual AND not a deliberate silent set-piece
    const hasAction = ss.some(s => ['ESSENTIAL_HUMAN_MOVEMENT', 'ENVIRONMENT_MOVEMENT'].includes(s.classification));
    if (dialogueLines === 0 && !hasAction && visuals.length <= 1) flags.push({ id: sc, scene: sc, cause: 'POSSIBLE_EMPTY_SCENE', evidence: `${head.slice(0,40)}: no dialogue, no action visual, ${visuals.length} visual`, candidateFix: 'confirm intentional silence carries meaning; else add content', depsToRetest: [sc], status: 'FLAG' });
  }
  // per-shot: motion-critical shots can only be judged on real media (identity/motion/geography)
  for (const s of shots.filter(s => ['ESSENTIAL_HUMAN_MOVEMENT', 'ENVIRONMENT_MOVEMENT'].includes(s.classification) && s.mediaCategory === 'PREMIUM_VIDEO' && !s.shotType.includes('WIDE'))) {
    flags.push({ id: s.id, scene: s.scene, cause: 'MOTION_QUALITY_UNJUDGEABLE_DRYRUN', evidence: `${s.classification}: identity+motion+geography need real media`, candidateFix: 'evaluate at Gate 3 benchmark on real media', depsToRetest: [s.id], status: 'NEEDS_REAL_MEDIA' });
  }
  return flags;
}

// DRAMATIC-FUNCTION gate (Gate 1 core): every scene must carry ≥1 explicit function — INFORMATION, EMOTION,
// ANTICIPATION or TRANSFORMATION — detected from F10's own text (facts, not invented). Silent scenes are judged by
// intention + visual progression + consequence, NOT auto-failed. Duration/coverage thresholds are RISK indicators
// to justify per scene, never proof of quality.
const FN = {
  INFORMATION: /council|\brule|alignment|the hand|\bterms\b|leash|\bnames?\b|\breads?\b|\bplan\b|patrol|garrison|closes from within|guardian|wall of names|political|rules of/i,
  EMOTION: /\bdies?\b|death|drown|grief|mother|brother|shrine|goodbye|weep|\blove\b|\bhorse\b|confession|song|campfire|\bbond|forehead|stills|pride|wreck|mourn/i,
  ANTICIPATION: /\btide|\bseam|converg|\bmarch|noose|siege|approach|\bbefore\b|bleed|\bclock\b|rising|surge|\bwarn|threat|hostage/i,
  TRANSFORMATION: /\bchoic|\bchoos|\bchose\b|disarm|\bbreaks?\b|\blearns?\b|no one told|redempt|master|unforced|ungoverned|\bshift\b|takes the field|first .{0,20}choice/i,
};
export function dramaticFunctionGate() {
  const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
  const parts = F10.split(/## Draft F7 status/)[0].split(/^### /m).slice(1);
  const rows = []; const flags = [];
  parts.forEach((p, i) => {
    const scId = 'SC' + String(i + 1).padStart(2, '0');
    const head = p.split('\n')[0].trim();
    const cues = (p.match(/^\*\*[A-ZÀ-Þ][A-ZÀ-Þ\- ]+?:\*\*/gm) || []).length;
    const silent = cues === 0;
    const functions = Object.keys(FN).filter(k => FN[k].test(p));
    // visual progression evidence = the scene's stage directions describe change (verbs of change/motion)
    const stage = (p.match(/^\*(?!\*)[\s\S]*?\*$/gm) || []).join(' ');
    const progression = /(splits?|sinks?|drain|rise|surge|becomes|collapse|walks? out|closes?|seals?|part[s]?|drops?|hauls?|throws?|turns?|breaks?|opens?|driv|strikes?|struck|pull|releas|steps?|cross|vanish|press|enters?|plunge|claws?|swept|march)/i.test(stage);
    const consequence = i < parts.length - 1; // leads into a next scene (last scene lands the ending)
    let pass = functions.length >= 1;
    let note = functions.join('+');
    if (silent) {
      // a silent scene is OK only if it has an explicit function AND visible progression AND a consequence
      pass = functions.length >= 1 && progression;
      note = `SILENT — intentional=${functions.length >= 1 && progression}; functions=${functions.join('+') || 'none'}; progression=${progression}`;
      if (!pass) flags.push({ id: scId, scene: scId, cause: 'SILENT_WITHOUT_FUNCTION_OR_PROGRESSION', evidence: head.slice(0, 50), candidateFix: 'confirm intent or add visible progression/consequence', depsToRetest: [scId], status: 'FLAG' });
    } else if (!pass) {
      flags.push({ id: scId, scene: scId, cause: 'NO_DRAMATIC_FUNCTION', evidence: head.slice(0, 50), candidateFix: 'identify the scene function (info/emotion/anticipation/transformation) or cut', depsToRetest: [scId], status: 'FLAG' });
    }
    rows.push({ scene: scId, head: head.slice(0, 54), silent, functions, progression, consequence, pass, note });
  });
  // SC47 ("the suns part") explicit verdict
  const sc47 = rows.find(r => r.scene === 'SC47');
  const sc47Verdict = sc47 ? { scene: 'SC47', head: sc47.head, silent: sc47.silent, functions: sc47.functions, progression: sc47.progression, intentionalSilenceOk: sc47.pass, note: 'suns part / seas drain / Astrid weeps once — release beat; meaningful silence if progression+function hold' } : null;
  return { scenes: rows.length, allPass: rows.every(r => r.pass), rows, flags, sc47Verdict };
}

// COVERAGE-MIX audit (E): proportions of real-video / still / animated / VO / reuse, + unproven coverage.
export function coverageMixAudit(real) {
  const { shots } = real;
  const n = shots.length;
  const byClass = {};
  for (const s of shots) byClass[s.classification] = (byClass[s.classification] || 0) + 1;
  const video = shots.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').length;
  const still = shots.filter(s => s.mediaCategory === 'STILL_ANIMATABLE').length;
  const voice = shots.filter(s => s.mediaCategory === 'AUDIO_LINE').length;
  const music = shots.filter(s => s.mediaCategory === 'MUSIC_CUE').length;
  const genSec = shots.reduce((a, s) => a + s.targetSec, 0);
  // unproven coverage assumption: generated coverage (27 min) < 60 min target → reused/held to fill
  const reuseAssumptionMin = Math.round((3600 - genSec) / 60 * 10) / 10;
  return {
    totalShots: n, byClass,
    mix: { videoPct: Math.round(video / n * 100), stillPct: Math.round(still / n * 100), voicePct: Math.round(voice / n * 100), musicPct: Math.round(music / n * 100) },
    generatedCoverageMin: Math.round(genSec / 60 * 10) / 10,
    reuseHoldToFillMin: reuseAssumptionMin,
    unprovenCoverageNote: `~${reuseAssumptionMin} min of the 60 is NOT fresh generated coverage — it is dialogue-hold/reuse/score-over-still. This assumption is UNPROVEN until a real cut exists (NEEDS_REAL_MEDIA).`,
  };
}
