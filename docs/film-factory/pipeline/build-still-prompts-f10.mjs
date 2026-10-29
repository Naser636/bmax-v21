// Generate COMPLETE, F10-grounded prompts for EVERY STILL_ANIMATABLE shot (196), reusing the shared canonical
// bible (ref-bible-f10.mjs) so stills and video never diverge. Zero-cost PREP: prompts/plans, NOT media. Every
// reference TO_CREATE. Costs/durations ESTIMATED. No media generated.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHAR, LOC, PALETTE } from './ref-bible-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

const parts = F10.split(/^### /m).slice(1);
const sceneBody = {}; parts.forEach((p, i) => { sceneBody['SC' + String(i + 1).padStart(2, '0')] = p; });
const firstStage = body => { const m = body.match(/^\*(?!\*)([\s\S]*?)\*\s*$/m) || body.match(/\*(?!\*)([^*]{20,}?)\*/); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
const refObj = (name, type) => ({ ref: name, type, status: 'TO_CREATE' });

// composition per still sub-type
function composition(s, speaker) {
  if (s.shotType.includes('WIDE')) return 'WIDE establisher — the full set; characters placed in geography';
  if (s.shotType.includes('coverage')) return `MED/CU on ${speaker || 'the speaker'} — line coverage, eyeline for shot/reverse`;
  return 'INSERT — a detail / visual-business beat (prop, hand, object, environment)';
}

const stills = SL.shots.filter(s => s.mediaCategory === 'STILL_ANIMATABLE');
const out = [];
for (const s of stills) {
  const body = sceneBody[s.scene] || '';
  const anchor = firstStage(body).slice(0, 220);
  // coverage shots name their speaker in subjectAction ("NAME — line coverage")
  const speaker = (s.subjectAction.match(/^([A-ZÀ-Þ][A-ZÀ-Þ'\- ]+?)\s+—/) || [])[1]?.trim();
  const chars = (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref);
  const locName = (s.continuityRefs || []).find(r => r.type === 'location')?.ref || 'UNSPECIFIED';
  const loc = LOC[locName] || LOC.UNSPECIFIED;
  const role = s.shotType.includes('WIDE') ? 'establisher-still' : s.shotType.includes('coverage') ? 'coverage-still' : 'insert-still';
  const identity = chars.map(c => { const b = CHAR[c] || { look: c, costume: '', mark: '' }; return `${c} (${b.look}; ${b.costume}${b.mark ? '; ' + b.mark : ''})`; });
  const prompt = `${locName} — ${loc.decor}. STILL image, ${composition(s, speaker)}, animated by subtle Ken-Burns/parallax (~${s.targetSec}s hold). ` +
    `DRAMATIC INTENT: ${anchor || s.dramaticFunction}. IN FRAME: ${identity.length ? identity.join(' | ') : 'environment/detail only'}. ` +
    `LIGHT: ${loc.light}; palette ${PALETTE[s.act] || PALETTE.I}. Still-cinematography: no implausible in-frame motion. ` +
    `[prompt is a PLAN; not generated; all refs TO_CREATE]`;
  out.push({
    id: s.id, scene: s.scene, sceneHead: s.sceneHead, act: s.act, role,
    scriptAnchor: anchor,
    composition: composition(s, speaker),
    identityRefs: chars.map(c => refObj(c, 'character')),
    locationRef: refObj(locName, 'location'),
    costumeNotes: chars.map(c => (CHAR[c] ? `${c}: ${CHAR[c].costume}` : `${c}: TO_CREATE`)),
    propNotes: chars.map(c => (CHAR[c]?.mark ? `${c}: ${CHAR[c].mark}` : null)).filter(Boolean),
    light: loc.light, palette: PALETTE[s.act] || PALETTE.I,
    dramaticIntent: anchor ? anchor.slice(0, 120) : s.dramaticFunction,
    continuity: ['identity ≥4/5 vs ref', 'costume/props stable with the bible', (chars.includes('MERYT') ? 'Meryt RIGHT-forearm wound state correct for scene order' : null)].filter(Boolean),
    fullPrompt: prompt,
    rejectionCriteria: 'identity drift · wrong costume/props · cardboard parallax / flatness · implausible in-frame motion on a still · palette wrong · forgotten wound/continuity',
    method: 'STILL_ANIMATABLE (image gen + Ken-Burns/parallax); no video',
    durationSecEstimated: s.targetSec, costEurEstimated: s.costEurEstimated, costStatus: 'ESTIMATED',
  });
}
const summary = {
  generated: 'F10 still-prompt coverage (PREP; prompts/plans, NOT media)', reference: '37_SCREENPLAY_60MIN_F10.md',
  budgetAuthorizedThisMission: 0, totalStills: out.length,
  byRole: { establisher: out.filter(o => o.role === 'establisher-still').length, coverage: out.filter(o => o.role === 'coverage-still').length, insert: out.filter(o => o.role === 'insert-still').length },
  note: 'Shared bible with video prompts (ref-bible-f10.mjs). Every ref TO_CREATE; none claimed to exist. Costs/durations ESTIMATED.',
  shots: out,
};
writeFileSync(new URL('./still-prompts-f10.json', import.meta.url), JSON.stringify(summary, null, 1));
console.log(`still-prompts-f10: ${out.length} stills (${summary.byRole.establisher} establisher + ${summary.byRole.coverage} coverage + ${summary.byRole.insert} insert) | shared bible | €0 generated`);
