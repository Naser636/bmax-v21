// Generation-Readiness Pilot Gate (local, €0, NO generation). Builds: a sourced eval-research note, a justified
// zero-waste pilot shot selection with acceptance/eliminatory/stop criteria, artistic recommendations (PROPOSED,
// both readings kept), and a consolidated pilot budget from VERIFIED first-party prices. Nothing is generated;
// no cost is invented. Outputs under runs/benchmark/.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const W = (f, o) => writeFileSync(join(here, 'runs/benchmark', f), JSON.stringify(o, null, 1));

// ---- §3 research note (sourced; nothing installed/run) ----
W('eval-research-note.json', {
  generated: '2026-10-24',
  disclaimer: 'Literature note only. NO benchmark installed, downloaded, or executed. No GPU confirmed. Compute != ability to observe absent media.',
  methods: [
    { name: 'VBench', dims: ['subject/background consistency', 'motion smoothness', 'temporal flicker', 'aesthetic/imaging quality', 'dynamic degree'], mapTo: 'CIQE temporal/exposure (partial)', needs: 'VBench repo + CLIP/other models + GPU', status: 'NEEDS_ABSENT_DEPS' },
    { name: 'VBench-2.0', dims: ['faithfulness', 'commonsense', 'controllability', 'creativity (higher-order)'], mapTo: 'narrative/identity (semantic) — NOT deterministic', needs: 'models + GPU', status: 'NEEDS_ABSENT_DEPS' },
    { name: 'EvalCrafter', dims: ['visual quality', 'text-video alignment', 'motion quality', 'temporal consistency'], mapTo: 'prompt-fidelity (semantic)', needs: 'models + GPU', status: 'NEEDS_ABSENT_DEPS' },
    { name: 'VGA-Bench / video-grounded alignment', dims: ['prompt grounding', 'spatial/temporal alignment'], mapTo: 'scene fidelity (semantic)', needs: 'models', status: 'NEEDS_ABSENT_DEPS' },
  ],
  usableNow: ['CIQE deterministic: exposure, dynamic range, flicker, temporal_pop, scene instability, black frames, stream integrity, audio presence/content/clipping/level/continuity'],
  humanRequired: ['character identity vs refs', 'period authenticity', 'performance/emotion', 'narrative fidelity', 'aesthetic judgment'],
  autoScoreLimits: 'Automatic scores never prove artistic quality; they flag signal-level issues only. All thresholds are proposals until calibrated on human-annotated media.',
  decision: 'For 0€/no-GPU/no-media now: use local CIQE + artistic-reviewer routing semantics to human. Revisit VBench family only after real media + compute + authorization.',
});

// ---- §4 pilot selection (representative + risk cases) ----
const PILOT = [
  { id: 'SC01-SH01', model: 'minimax/video-01', why: 'canonical opening establisher; night+storm water, intro ASTRID/OLAF identity; hardest establishing look', risk: 'water realism, night exposure, identity intro', worstEur: 0.46 },
  { id: 'SC40-SH06', model: 'minimax/video-01', why: 'hero action-insert; crowd+water+multiple characters (Börk/Vigge/Seth-Nakht) — highest complexity & identity load', risk: 'crowd artifacts, multi-identity, action legibility', worstEur: 0.46 },
  { id: 'SC22-SH06', model: 'minimax/video-01', why: 'market tide action+crowd; tests crowd distortion (known failure mode)', risk: 'crowd melt, water motion', worstEur: 0.46 },
  { id: 'SC43-SH03', model: 'minimax/speech-02-hd', why: 'intimate FR voice beat; tests French emotional TTS + sync intent', risk: 'FR naturalness, emotion, (voice only)', worstEur: 0.10 },
  { id: 'SC39-SH04', model: 'minimax/video-01', why: 'wound INFLICTED — first half of the SC39->SC48 continuity pair (risk case, do not pre-resolve staging)', risk: 'wound continuity vs SC48', worstEur: 0.46 },
  { id: 'SC48-SH02', model: 'black-forest-labs/flux-dev', why: 'wound HEALED/bound — second half of the pair; still, cheap; validates wound-progression continuity', risk: 'wound must match SC39 progression', worstEur: 0.03 },
  { id: 'SC15-SH01', model: 'minimax/video-01', why: 'court scene right after SC14 deathbed — tests the SC14->SC15 abrupt palette contrast (flagged MEDIUM)', risk: 'palette raccord with SC14', worstEur: 0.46 },
].map(p => ({ ...p, promptStatus: getFaithfulPrompt(p.id)?.derived ? 'DRAFT' : 'AUTHORED', hasPrompt: !!getFaithfulPrompt(p.id)?.fullPrompt }));
const pilotBase = Math.round(PILOT.reduce((a, p) => a + p.worstEur, 0) * 100) / 100;
W('pilot-plan.json', {
  generated: '2026-10-24', noGeneration: true,
  selection: PILOT, selectionCount: PILOT.length,
  procedure: ['1) verify provider+model availability/price/billing LIVE (read-only) before any call',
    '2) generate ONLY this pilot batch under a bounded ledger (reserve-before-call, HALT at cap)',
    '3) inspect real media + metadata (sha256/duration/ffprobe)',
    '4) evaluate technical (CIQE) + narrative/identity/continuity (human) + sound',
    '5) fix prompts, re-run ONLY targeted shots (no auto-retry beyond cap)',
    '6) decide on EVIDENCE whether to authorize the next batch',
    '7) STOP immediately if defects/costs/uncertainty exceed limits'],
  acceptanceCriteria: ['technical: CIQE worstSeverity <= MINOR', 'identity >=4/5 (human)', 'no period anachronism (human)', 'wound SC39<->SC48 continuity holds (human)', 'FR voice natural+intelligible (human)', 'human artistic >=7.5/10'],
  eliminatoryDefects: ['character identity mismatch', 'period anachronism', 'unreadable action', 'wound discontinuity', 'black/corrupt media', 'audio silent/clipping'],
  dependencies: ['reference sheets for ASTRID/OLAF/MERYT ideally generated FIRST (identity lock)', 'SC39 before SC48 (wound progression)'],
  budget: { pilotWorstBaseEur: pilotBase, withRetryX2_5Eur: Math.round(pilotBase * 2.5 * 100) / 100, note: 'from VERIFIED first-party prices (minimax/video-01 $0.50, flux-dev $0.025, speech-02-hd $0.10). FX 1USD<=1EUR. NOT an authorization.' },
  stopThresholds: ['cumulative spend reaches the bounded authorized amount', '>=8 attempts without an accepted shot', 'any eliminatory defect unresolved after one targeted fix', 'provider billing mode unverifiable (prepaid/auto-reload risk)'],
});

// ---- §5 artistic recommendations (PROPOSED; both readings kept) ----
W('artistic-recommendations.json', {
  generated: '2026-10-24', status: 'PROPOSED — not canonical facts; human arbitration required',
  items: [
    { id: 'olaf-sc43-44', question: 'Olaf dies vs departs through the seam', readings: ['A) dies at SC43 farewell (body taken to grey sea SC44)', 'B) departs alive through the seam homeward (Astrid stays)'], recommendation: 'Reading B (departs alive) — "Close it. Live on the far side... before I go" + SC44 "Take him to the grey sea" reads as sending him HOME; it also sharpens Astrid\'s sacrifice (she stays, he lives). KEEP both readings visible until human decides.', consequence: 'affects SC43/44 staging, Olaf media (alive vs deceased), emotional beat' },
    { id: 'meryt-wound', question: 'wound staging SC39->SC48', recommendation: 'Left forearm graze inflicted SC39 (disarm beat), same forearm bound/healing at the cairn SC48; identical skin tone/costume; no gore (F8). Lock a single reference.', consequence: 'continuity pair must match; needs reference sheet' },
    { id: 'palettes', question: 'SC14->SC15 and SC36->SC37 abrupt palette', recommendation: 'Treat as INTENTIONAL tonal contrast (intimate deathbed -> commander\'s hall) with a brief motivated dissolve; not an error.', consequence: 'editor transition choice' },
    { id: 'sound-raccords', question: '20 MEDIUM sound transitions', recommendation: 'Continuous ambience bed per location + J/L-cuts across ambience changes at voice boundaries.', consequence: 'editor/mix; no media yet' },
    { id: 'performance', question: 'performance/emotion direction', recommendation: 'Contained, naturalistic performance; restraint over melodrama (bible AB-04). PROPOSED only.', consequence: 'human DA' },
  ],
});
console.log(`pilot-gate built: pilot=${PILOT.length} shots, worst base €${pilotBase} (x2.5 €${Math.round(pilotBase * 2.5 * 100) / 100}); research+recommendations written`);
