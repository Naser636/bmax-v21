// IMAGE MODEL-SELECTION POLICY — the single deterministic encoding of the CTO-documented selection rule
// (benchmark 2026-10-26, MODEL_SELECTION_BENCHMARK_PROTOCOL.md). Pure, no network, no paid call. Reusable by the
// pipeline's (currently scattered, hardcoded) flux call-sites. NOT an ODG-runtime primitive: image-model selection
// is a film-pipeline concern; the runtime capability-router routes ODG CAPABILITIES (Memory→Rules→LocalLLM→ExternalAI)
// and has no media-model/license notion — forcing it there would be an out-of-architecture component (see compass).
//
// Verified facts (model license_url + replicate.com/pricing, observed 2026-10-24):
//   flux-schnell : Apache-2.0 (commercial OK),      $0.003/img  — 2/2 usable on 2 briefs
//   flux-dev     : FLUX.1-dev NON-COMMERCIAL,        $0.025/img  — 2/2 usable on 2 briefs
// Decisive axes = LICENSE + COST (both verified/deterministic). Latency + artistic quality are NOT decision
// criteria at this stage (n=2; quality awaits human review). Scope: images, these two models only — deny-by-default
// outside it (never silently route to an unvalidated model).

'use strict';

export const MODELS = Object.freeze({
  'flux-schnell': { model: 'black-forest-labs/flux-schnell', license: 'Apache-2.0', commercialOk: true,  usdPerImg: 0.003 },
  'flux-dev':     { model: 'black-forest-labs/flux-dev',     license: 'FLUX.1-dev', commercialOk: false, usdPerImg: 0.025 },
});
export const RULE_PROVENANCE = 'model-selection-benchmark 2026-10-26 (4/4 usable; license+cost decisive; quality human-deferred, n=2)';

/**
 * selectImageModel({ kind, usage, allowNonCommercialDraft }) → { model, id, reason, commercialOk } | deny.
 *   kind  : must be 'image' (scope guard). Anything else ⇒ OUT_OF_SCOPE (no silent routing).
 *   usage : 'commercial' (shippable deliverable) | 'internal-draft' (non-commercial internal/previz).
 *   allowNonCommercialDraft : explicit opt-in to use a non-commercial model for an internal draft.
 * Deny-by-default: unknown kind/usage returns a non-selecting result the caller MUST handle.
 */
export function selectImageModel(req = {}) {
  const { kind = 'image', usage = null, allowNonCommercialDraft = false } = req;
  const deny = (reason) => Object.freeze({ id: null, model: null, selected: false, reason, provenance: RULE_PROVENANCE });
  const pick = (id, reason) => Object.freeze({ id, model: MODELS[id].model, selected: true, commercialOk: MODELS[id].commercialOk, reason, provenance: RULE_PROVENANCE });

  if (kind !== 'image') return deny(`OUT_OF_SCOPE: rule covers images only (got kind=${JSON.stringify(kind)}); do not route to an unvalidated model`);
  if (usage !== 'commercial' && usage !== 'internal-draft') return deny(`OUT_OF_SCOPE: usage must be 'commercial' | 'internal-draft' (got ${JSON.stringify(usage)}); deny-by-default`);

  // Commercial/shippable deliverable: ALWAYS flux-schnell. flux-dev is license-barred here, regardless of any flag.
  if (usage === 'commercial') return pick('flux-schnell', 'commercial deliverable ⇒ flux-schnell (Apache-2.0 commercial-clean + 8.3× cheaper + reliable); flux-dev license-barred for commercial ship');

  // Internal non-commercial draft: flux-dev only if explicitly opted in; otherwise the safe commercial-clean default.
  if (allowNonCommercialDraft === true) return pick('flux-dev', 'internal non-commercial draft + explicit opt-in ⇒ flux-dev permitted (NON-COMMERCIAL; never shippable)');
  return pick('flux-schnell', 'internal draft without non-commercial opt-in ⇒ safe default flux-schnell (commercial-clean)');
}

export default selectImageModel;
