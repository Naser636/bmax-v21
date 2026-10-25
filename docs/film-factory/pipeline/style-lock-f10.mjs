// VISUAL STYLE LOCK v1 (local, €0). A reusable, testable spec that (a) routes each shot to the correct model by
// its CANONICAL mediaCategory (STILL_ANIMATABLE -> photoreal still model; PREMIUM_VIDEO -> video model), (b) appends
// an explicit photoreal-cinematic style anchor (positive + negative constraints) to every prompt, and (c) detects
// style/anachronism red flags in a prompt BEFORE generation. A text control never guarantees the image — final
// acceptance still requires real-media inspection.
export const STYLE_ANCHOR = 'STYLE: photorealistic cinematic live-action film, shot on 35mm, naturalistic motivated lighting, realistic human skin/anatomy/proportions, real fabrics and materials, filmic color grade, shallow depth of field where motivated. NOT cartoon, NOT 3D animation, NOT CGI/Pixar/DreamWorks render, NOT anime, NOT illustration, NOT video-game, no toon/cel shading, no stylized exaggeration. No invented modern objects/symbols; keep every detail anchored to the F10 canon.';

// Correct model per canonical mediaCategory (the pilot bug was routing a STILL_ANIMATABLE shot to a video model).
export const MODEL_BY_CATEGORY = {
  STILL_ANIMATABLE: 'black-forest-labs/flux-dev', // photoreal still (animate via Ken-Burns in post)
  PREMIUM_VIDEO: 'minimax/video-01',
  AUDIO_LINE: 'minimax/speech-02-hd',
  MUSIC_CUE: null,
};
export const WORST_BY_CATEGORY = { STILL_ANIMATABLE: 0.03, PREMIUM_VIDEO: 0.46, AUDIO_LINE: 0.10, MUSIC_CUE: 0.50 };

export function applyStyle(fullPrompt) {
  if (!fullPrompt) return fullPrompt;
  return fullPrompt.includes('STYLE: photorealistic cinematic') ? fullPrompt : `${fullPrompt}\n${STYLE_ANCHOR}`;
}

// red-flag detector: terms that push toward non-photoreal renders, or model/category mismatch risk.
const CARTOON = /\b(cartoon|animation|animated|3d render|cgi|pixar|dreamworks|anime|illustration|stylized|toon|cel.?shad|video.?game|render style)\b/i;
export function styleViolations(text = '') {
  const t = String(text);
  // scan the AUTHOR's descriptive prompt (before the STYLE anchor) — the anchor's own "NOT cartoon" negatives are the fix, not a violation.
  const descriptive = t.split(/STYLE: photorealistic cinematic/i)[0];
  const v = [];
  if (CARTOON.test(descriptive)) v.push('non-photoreal style term present');
  if (!/photorealistic cinematic/i.test(t)) v.push('missing photoreal style anchor');
  return v;
}

// routing check: returns the correct model for a shot category, flags a mismatch vs a proposed model.
export function routeModel(mediaCategory, proposedModel = null) {
  const correct = MODEL_BY_CATEGORY[mediaCategory] || null;
  return { correctModel: correct, mismatch: !!(proposedModel && correct && proposedModel !== correct), worstEur: WORST_BY_CATEGORY[mediaCategory] ?? null };
}
