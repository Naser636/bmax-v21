// Generate COMPLETE, F10-grounded prompts for EVERY PREMIUM_VIDEO shot (63), reusing ONE canonical reference bible
// so identities/costumes/props stay coherent (no incompatible variants). Zero-cost PREP: prompts/plans, NOT media.
// Every reference is TO_CREATE (none claimed to exist). Durations/costs are ESTIMATES. No media generated.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SL = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

// ---- CANONICAL BIBLE: imported from the shared module so video + still prompts never diverge.
import { CHAR, LOC, PALETTE } from './ref-bible-f10.mjs';

// ---- scene bodies in positional order (SCnn = nth "### " part), matching the shot-list numbering.
const parts = F10.split(/^### /m).slice(1);
const sceneBody = {};
parts.forEach((p, i) => { sceneBody['SC' + String(i + 1).padStart(2, '0')] = p; });
// first stage-direction (italic *...*) of a scene → dramatic grounding anchor (trimmed, single-line).
const firstStage = body => {
  const m = body.match(/^\*(?!\*)([\s\S]*?)\*\s*$/m) || body.match(/\*(?!\*)([^*]{20,}?)\*/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

const refObj = (name, type) => ({ ref: name, type, status: 'TO_CREATE' });
const shots = SL.shots.filter(s => s.mediaCategory === 'PREMIUM_VIDEO');
const out = [];
for (const s of shots) {
  const body = sceneBody[s.scene] || '';
  const anchorFull = firstStage(body);
  const anchor = anchorFull.slice(0, 220);
  const chars = (s.continuityRefs || []).filter(r => r.type === 'character').map(r => r.ref);
  const locName = (s.continuityRefs || []).find(r => r.type === 'location')?.ref || 'UNSPECIFIED';
  const loc = LOC[locName] || LOC.UNSPECIFIED;
  const isEstablisher = s.shotType.includes('WIDE');
  const identity = chars.map(c => { const b = CHAR[c] || { look: c, costume: '', mark: '', status: 'TO_CREATE' }; return `${c} (${b.look}; ${b.costume}${b.mark ? '; ' + b.mark : ''})`; });
  const prompt = `${locName} — ${loc.decor}. ${isEstablisher ? 'WIDE establisher, camera-only slow push-in' : 'INSERT action beat, handheld/whip'}, ~${s.targetSec}s. ` +
    `DRAMATIC BEAT: ${anchor || s.dramaticFunction}. ` +
    `IN FRAME: ${identity.length ? identity.join(' | ') : 'environment only'}. ` +
    `LIGHT: ${loc.light}; palette ${PALETTE[s.act] || PALETTE.I}. ` +
    `${isEstablisher ? 'Subjects essentially static; only the camera moves (still+Ken-Burns candidate).' : 'Motion is the point: coherent subject movement, legible geography, readable water/crowd.'} ` +
    `[prompt is a PLAN; not generated; all refs TO_CREATE]`;
  out.push({
    id: s.id, scene: s.scene, sceneHead: s.sceneHead, act: s.act, role: isEstablisher ? 'establisher' : 'action-insert',
    scriptAnchor: anchor,
    identityRefs: chars.map(c => refObj(c, 'character')),
    locationRef: refObj(locName, 'location'),
    costumeNotes: chars.map(c => (CHAR[c] ? `${c}: ${CHAR[c].costume}` : `${c}: TO_CREATE`)),
    propNotes: chars.map(c => (CHAR[c]?.mark ? `${c}: ${CHAR[c].mark}` : null)).filter(Boolean),
    framing: s.shotType, movement: s.movement, durationSecEstimated: s.targetSec,
    light: loc.light, palette: PALETTE[s.act] || PALETTE.I,
    continuity: ['identity ≥4/5 vs ref across the shot', 'costume/props stable with the bible', (chars.includes('MERYT') ? 'Meryt RIGHT-forearm wound state correct for scene order' : null)].filter(Boolean),
    dramaticOutcome: anchor ? anchor.slice(0, 120) : s.dramaticFunction,
    fullPrompt: prompt,
    rejectionCriteria: isEstablisher
      ? 'cardboard parallax / palette wrong / subject visibly moving when it should be a held tableau'
      : 'identity drift · impossible/weightless motion · unreadable geography · water with no boundary · crowd clones · forgotten wound/continuity · artifacts on faces',
    method: isEstablisher ? 'STILL_ANIMATABLE (Ken-Burns) candidate — see establisher substitution' : 'premium text-to-video',
    costEurEstimated: s.costEurEstimated, costStatus: 'ESTIMATED',
  });
}

const summary = {
  generated: 'F10 video-prompt coverage (PREP; prompts/plans, NOT media)',
  reference: '37_SCREENPLAY_60MIN_F10.md',
  budgetAuthorizedThisMission: 0,
  totalVideoShots: out.length,
  establishers: out.filter(o => o.role === 'establisher').length,
  actionInserts: out.filter(o => o.role === 'action-insert').length,
  note: 'Every reference TO_CREATE; none claimed to exist. One canonical bible reused across all prompts (no incompatible variants). Costs/durations ESTIMATED. The 6 benchmark/HIGH shots also carry an extended spec in prompt-register-highrisk-benchmark-f10.json.',
  bibleCharacters: Object.keys(CHAR), bibleLocations: Object.keys(LOC),
  shots: out,
};
writeFileSync(new URL('./video-prompts-f10.json', import.meta.url), JSON.stringify(summary, null, 1));
console.log(`video-prompts-f10: ${out.length} video shots (${summary.establishers} establishers + ${summary.actionInserts} inserts) | bible: ${Object.keys(CHAR).length} chars, ${Object.keys(LOC).length} locations | €0 generated`);
