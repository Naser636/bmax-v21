// Tests for the image model-selection policy. Deterministic, no network, no paid call. Covers the CTO-required
// cases + a distinct validation case (different from the 2 benchmark briefs) proving the ROUTING decision.
import assert from 'node:assert';
import { selectImageModel } from './select-image-model.mjs';

let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log('  ok -', n); pass++; };

// 1) commercial image request ⇒ flux-schnell
const c = selectImageModel({ kind: 'image', usage: 'commercial' });
ok('commercial image ⇒ flux-schnell', c.selected && c.id === 'flux-schnell' && c.commercialOk === true);

// 2) internal non-commercial draft ⇒ flux-dev ONLY when the policy explicitly allows it
const draftOptIn = selectImageModel({ kind: 'image', usage: 'internal-draft', allowNonCommercialDraft: true });
ok('internal draft + explicit opt-in ⇒ flux-dev permitted', draftOptIn.selected && draftOptIn.id === 'flux-dev');
const draftNoOptIn = selectImageModel({ kind: 'image', usage: 'internal-draft', allowNonCommercialDraft: false });
ok('internal draft WITHOUT opt-in ⇒ NOT flux-dev (safe default schnell)', draftNoOptIn.id === 'flux-schnell');

// 3) NO path selects flux-dev for a commercial deliverable (even if the non-commercial flag is set)
const cEvenWithFlag = selectImageModel({ kind: 'image', usage: 'commercial', allowNonCommercialDraft: true });
ok('commercial NEVER selects flux-dev (license-barred) even with opt-in flag', cEvenWithFlag.id === 'flux-schnell' && cEvenWithFlag.id !== 'flux-dev');
// exhaustively: across all commercial inputs, flux-dev is never chosen
const commercialNeverDev = [true, false, undefined].every(f => selectImageModel({ kind: 'image', usage: 'commercial', allowNonCommercialDraft: f }).id !== 'flux-dev');
ok('exhaustive: flux-dev never selected for any commercial request', commercialNeverDev);

// 4) out-of-scope requests are NOT silently routed to an unvalidated model (deny-by-default)
const video = selectImageModel({ kind: 'video', usage: 'commercial' });
ok('out-of-scope kind (video) ⇒ deny, no silent routing', video.selected === false && video.model === null && /OUT_OF_SCOPE/.test(video.reason));
const unknownUsage = selectImageModel({ kind: 'image', usage: 'marketing-billboard' });
ok('unknown usage ⇒ deny-by-default (no silent model)', unknownUsage.selected === false && unknownUsage.model === null);
const empty = selectImageModel({});
ok('empty request ⇒ deny-by-default', empty.selected === false && empty.model === null);

// 5) DISTINCT validation case (not benchmark brief A or B): a NEW commercial still request routes to flux-schnell,
//    proving the decision deterministically WITHOUT any paid provider call.
const distinct = selectImageModel({ kind: 'image', usage: 'commercial', brief: 'poster still — harbour at golden hour, crowd silhouettes (UNSEEN brief)' });
ok('distinct unseen commercial brief ⇒ flux-schnell (deterministic, no paid call)', distinct.selected && distinct.id === 'flux-schnell');
ok('selection carries rule provenance (auditable)', /model-selection-benchmark 2026-10-26/.test(distinct.provenance));

console.log(`\nSELECT-IMAGE-MODEL — ${pass} assertions passed.`);
