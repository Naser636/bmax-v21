// English-first screenplay & retention audit (CTO §5). Read-only. Does NOT modify the dialogue master.
// Emits evidence; classifies proposed improvements SAFE_EDITORIAL vs CANON_CHANGING. No line is rewritten here.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const j = JSON.parse(readFileSync(join(here, 'runs/benchmark/dubbing-fr-proposed.json'), 'utf8'));
const L = j.lines;

const bySpk = {}; for (const l of L) bySpk[l.speaker] = (bySpk[l.speaker] || 0) + 1;
const scenesWithDialogue = new Set(L.map(l => l.scene));

const RISK = /\b(gonna|wanna|gotta|ain't|bloody|bugger|mate|reckon|y'all|fixin'|lemme|gimme|innit|cheerio|blimey|dang|heck|buddy|folks|kiddo|arse|bollocks)\b/i;
const NAUT = /\b(beam-on|leeward|windward|gunwale|thwart|bilge|yardarm|halyard|clew|luff|abaft|forecastle|shoulder|lame)\b/i;

const slang = L.filter(l => RISK.test(l.en));
const jargon = L.filter(l => NAUT.test(l.en));
const long = L.filter(l => l.en.length > 120);

const report = {
  generated: '2026-10-24',
  mission: 'English-first screenplay & retention audit (CTO §5)',
  authority: 'Audit only. The English master (141 lines) is PRESERVED unchanged. Proposed edits are LOGGED, not applied.',
  totals: { lines: L.length, speakers: Object.keys(bySpk).length, scenesWithDialogue: scenesWithDialogue.size, scenesTotal: 49 },
  speakerVoicePresence: Object.entries(bySpk).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ speaker: k, lines: v })),
  openingHook: {
    firstLines: L.slice(0, 6).map(l => ({ order: l.order, scene: l.scene, speaker: l.speaker, en: l.en })),
    assessment: 'Opening is IN MEDIAS RES (storm, ship broaching). Strong visceral stakes and immediate jeopardy. RISK: line 1 ("She\'s pulling beam-on. I hold, she rolls. I fall off, I lose the next shoulder.") is dense sailing jargon as the very first words — the physical peril reads, but the specific mechanics may not land for a general international audience. A clear emotional/with-stakes line nearby is advisable.',
  },
  findings: [
    { id: 'SCR-1', dimension: 'opening-clarity', severity: 'MEDIUM', class: 'SAFE_EDITORIAL', evidence: 'Line 1 opens on sailing jargon (beam-on / shoulder / lame).', proposal: 'Keep the jargon for authenticity but ensure the surrounding 2–3 lines carry the plain human stake (survival, who/what is at risk). Do NOT delete the jargon — add clarity around it, or let image carry mechanics.', canonImpact: 'none — performance/edit nuance, not a plot or line-meaning change' },
    { id: 'SCR-2', dimension: 'international-intelligibility', severity: 'LOW', class: 'SAFE_EDITORIAL', evidence: 'regionalSlangFlags count below.', proposal: 'Review flagged idioms for broadly-intelligible alternatives where a regional idiom could confuse non-native or non-regional audiences; preserve character voice.', canonImpact: 'none if meaning/voice preserved' },
    { id: 'SCR-3', dimension: 'nautical-jargon-load', severity: 'MEDIUM', class: 'SAFE_EDITORIAL', evidence: 'nauticalJargonFlags count below; concentrated in SC01 storm.', proposal: 'In the storm act, let staging/VFX carry the mechanics; trim the DENSITY of technical terms per line so suspense is not gated on jargon comprehension. Keep terms that characterize ASTRID as an expert navigator.', canonImpact: 'none — reduce density, keep meaning; translation-readiness improves' },
    { id: 'SCR-4', dimension: 'pacing', severity: 'LOW', class: 'SAFE_EDITORIAL', evidence: 'longLines count below (>120 chars).', proposal: 'Flag long lines for possible breath/beat splits in performance; no textual cut required.', canonImpact: 'none' },
    { id: 'SCR-5', dimension: 'time-travel-mystery-clarity', severity: 'MEDIUM', class: 'CANON_CHANGING_IF_ALTERED', evidence: 'The seam/time-bleed mechanism is revealed through action + reader characters (ASTRID, NEFER-KA). Any added expository line to "explain the rules" would be a new dialogue line = canon change.', proposal: 'PROPOSAL ONLY: consider ONE human-authored clarifying beat for the time-travel rules if test audiences are lost — but this ADDS a line and therefore requires explicit canon authorization. Do NOT add silently.', canonImpact: 'CANON CHANGE — requires human approval' },
    { id: 'SCR-6', dimension: 'distinct-voices', severity: 'LOW', class: 'OBSERVATION', evidence: 'Speaker line-presence distribution below; ASTRID dominant (protagonist), antagonist SETH-NAKHT and mentor OLAF present.', proposal: 'Voices are role-differentiated in the text. Distinctiveness in delivery is a HUMAN_REQUIRED performance/casting judgement, not verifiable from text.', canonImpact: 'none' },
    { id: 'SCR-7', dimension: 'translation-readiness', severity: 'INFO', class: 'OBSERVATION', evidence: 'A FR proposed track already exists (status PROPOSED, not validated).', proposal: 'Future FR/ES masters MUST derive from the approved EN master and preserve meaning/tone/humour/timing. The existing FR track is PROPOSED and must be human-validated before use.', canonImpact: 'none' },
  ],
  regionalSlangFlags: slang.map(l => ({ order: l.order, speaker: l.speaker, en: l.en })),
  nauticalJargonFlags: jargon.map(l => ({ order: l.order, scene: l.scene, speaker: l.speaker, en: l.en })),
  longLines: long.map(l => ({ order: l.order, len: l.en.length, speaker: l.speaker, en: l.en })),
  classificationSummary: {
    SAFE_EDITORIAL: 'performance/edit/clarity nuances that do NOT change line meaning, plot, or canon (SCR-1..4)',
    CANON_CHANGING: 'anything that ADDS/removes/alters a dialogue line or event (SCR-5) — requires explicit human canon authorization; NOT applied here',
    OBSERVATION: 'facts/known-limits, no action (SCR-6,7)',
  },
  preservation: 'ZERO lines modified. English master intact (141 lines). This file is advisory evidence for a human editorial decision.',
};
writeFileSync(join(here, 'runs/benchmark/screenplay-audit-f10.json'), JSON.stringify(report, null, 1));
console.log(`screenplay audit: ${L.length} lines, ${report.totals.speakers} speakers, dialogue in ${report.totals.scenesWithDialogue}/49 scenes`);
console.log(`  slang flags: ${slang.length} | nautical-jargon flags: ${jargon.length} | long lines: ${long.length}`);
console.log(`  findings: ${report.findings.length} (SAFE_EDITORIAL + 1 CANON_CHANGING flagged, 0 applied)`);
