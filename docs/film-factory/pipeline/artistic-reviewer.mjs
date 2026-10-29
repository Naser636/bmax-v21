// ARTISTIC REVIEWER v1 (local, €0) — the evaluation CONTRACT + architecture for judging a shot across 10
// dimensions. It composes the DETERMINISTIC CIQE layer (technical/photographic/temporal/audio) with explicit
// HUMAN_REVIEW_REQUIRED / INSUFFICIENT_EVIDENCE / NOT_ASSESSABLE verdicts for the SEMANTIC dimensions (narrative,
// emotion, performance, aesthetics) — which require a multimodal model (not available) or a human. It NEVER
// fabricates a timecode, a visual detail, a sound observation, or an artistic score. A STUB is clearly a STUB.
// Acceptance states enforce: a CRITICAL defect (technical/canon/continuity/legibility) BLOCKS regardless of any
// average. No network, no spend. Used by the campaign runner's CIQE gate (technical only) + human review (artistic).
import { existsSync } from 'node:fs';
import { analyze, semanticStub } from './ciqe.mjs';

export const DIMENSIONS = [
  { key: 'narrative_fidelity', kind: 'semantic', critical: true },
  { key: 'action_legibility', kind: 'semantic', critical: true },
  { key: 'emotion_progression', kind: 'semantic', critical: false },
  { key: 'performance_gaze_subtext', kind: 'semantic', critical: false },
  { key: 'composition_light_color', kind: 'semantic', critical: false },
  { key: 'movement_temporal_continuity', kind: 'hybrid', critical: false },
  { key: 'rhythm_reactions_silence', kind: 'semantic', critical: false },
  { key: 'sound_image_relation', kind: 'semantic', critical: false },
  { key: 'inter_shot_scene_continuity', kind: 'semantic', critical: true },
  { key: 'technical_defects', kind: 'deterministic', critical: true },
];

export const ACCEPTANCE_STATES = ['TECHNICAL_FAIL', 'CANON_FAIL', 'ARTISTIC_REVIEW_REQUIRED', 'REVISION_PROPOSED',
  'REJECTED', 'ACCEPTED_WITH_EVIDENCE', 'BLOCKED_BY_EXTERNAL_DEPENDENCY'];

function finding(dimension, result, { score = null, confidence = null, evidence = null, blocking = false, correction = null, uncertainty = null } = {}) {
  return { dimension, result, score, confidence, evidence, blocking, minimalCorrection: correction, uncertainty };
}

// opts: { shotId, mediaPath?, intent?, dialogue?, neighbors?, criteria? }
export function reviewShot(opts = {}) {
  const { shotId, mediaPath = null, intent = null, criteria = null } = opts;
  const hasMedia = !!(mediaPath && existsSync(mediaPath));
  const findings = [];

  // DETERMINISTIC technical dimension — only if real media exists; else INSUFFICIENT_EVIDENCE.
  if (hasMedia) {
    const a = analyze(mediaPath);
    const blocking = ['BLOCKER', 'MAJOR'].includes(a.worstSeverity);
    findings.push(finding('technical_defects', blocking ? 'FAIL' : 'PASS', {
      confidence: 0.85, evidence: { worstSeverity: a.worstSeverity, nonOk: a.findings.filter(f => f.severity !== 'OK').map(f => `${f.dimension}/${f.criterion}=${f.severity}`) },
      blocking, correction: blocking ? 'fix the flagged technical defect (see CIQE finding) then re-run' : null }));
    // movement/temporal is partly deterministic (CIQE temporal) + partly semantic
    const tFlags = a.findings.filter(f => f.dimension === 'TEMPORAL' && f.severity !== 'OK');
    findings.push(finding('movement_temporal_continuity', tFlags.length ? 'FLAG' : 'PARTIAL_OK', {
      confidence: 0.45, evidence: { temporalFlags: tFlags.map(f => f.criterion) },
      uncertainty: 'deterministic layer only detects luma-level temporal issues; identity-drift/impossible-motion need multimodal/human' }));
  } else {
    findings.push(finding('technical_defects', 'INSUFFICIENT_EVIDENCE', { evidence: 'no real media file', uncertainty: 'generate media first' }));
    findings.push(finding('movement_temporal_continuity', 'INSUFFICIENT_EVIDENCE', { evidence: 'no real media' }));
  }

  // SEMANTIC dimensions — NOT auto-scored. Routed to multimodal(STUB)/human. Intent is carried for the reviewer.
  const stub = semanticStub(mediaPath || shotId);
  for (const d of DIMENSIONS.filter(x => x.kind === 'semantic')) {
    findings.push(finding(d.key, 'HUMAN_REVIEW_REQUIRED', {
      evidence: hasMedia ? 'media present but no multimodal evaluator available (STUB only)' : 'no media + no multimodal evaluator',
      uncertainty: `requires ${stub.layers.find(l => true) ? 'multimodal model or human' : 'human'}; intent provided: ${!!intent}`,
      correction: null }));
  }

  // AGGREGATE into an acceptance state. Critical blocking defect dominates any average.
  const technical = findings.find(f => f.dimension === 'technical_defects');
  let state;
  if (technical.result === 'INSUFFICIENT_EVIDENCE') state = 'BLOCKED_BY_EXTERNAL_DEPENDENCY'; // needs generation (credit)
  else if (technical.result === 'FAIL') state = 'TECHNICAL_FAIL';
  else state = 'ARTISTIC_REVIEW_REQUIRED'; // technical ok, but semantic dims need human
  const criticalBlocking = findings.filter(f => f.blocking);

  return {
    shotId, mediaPresent: hasMedia, acceptanceState: state,
    rule: 'A critical defect (technical/canon/continuity/legibility) BLOCKS regardless of other dimensions. No average overrides a critical fail. No artistic score is emitted here.',
    criticalBlocking: criticalBlocking.map(f => f.dimension),
    semanticStub: { kind: 'STUB', evaluated: false, note: stub.note },
    dimensions: findings,
    artisticScore: 'NOT_EMITTED (human-only, target >=7.5/10)',
    comparisonCriteria: criteria || 'to compare a revised version: same shot intent, same acceptance criteria, improvement must not introduce a new critical defect or contradict F10',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = reviewShot({ shotId: 'SC40-SH06', mediaPath: null, intent: 'hero — the cost of the line' });
  console.log('reviewShot (no media):', r.acceptanceState, '| dims:', r.dimensions.length, '| artistic:', r.artisticScore);
}
