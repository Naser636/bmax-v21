// GATE 3 (local, €0) — audits all 420 prompts (260 AUTHORED + 160 DERIVED/DRAFT) against the artistic bible:
// canon anchor present (scene setting referenced), no anachronism/modern terms, exclusion clause (anti-artifact),
// adequate length, and AUTHORED vs DRAFT distinction. Flags contradictions/omissions. Output: prompt-audit-f10.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));

const ANACHRONISM = /\b(modern|skyscraper|car|phone|smartphone|neon|city skyline|contemporary|plastic|jeans|suit|helicopter|drone shot|cgi)\b/i;
const VAGUE = /\b(etc\.?|and so on|something|various stuff|nice|cool|epic af)\b/i;

const rows = sl.shots.map(s => {
  const fp = getFaithfulPrompt(s.id);
  const p = fp?.fullPrompt || '';
  const status = fp?.derived ? 'DRAFT' : (p ? 'AUTHORED' : 'MISSING');
  // scan only the DESCRIPTIVE part (before the anti-artifact EXCLUDE clause), so the EXCLUDE text ("modern...")
  // is not mistaken for an actual anachronism.
  const descriptive = p.split(/EXCLUDE:/i)[0];
  // anchor: any significant setting word (>=4 chars) present in the prompt
  const settingWords = (s.setting || '').split(/[^A-Za-z]+/).filter(w => w.length >= 4);
  const anchorOk = settingWords.length === 0 || settingWords.some(w => new RegExp(w, 'i').test(p));
  const issues = [];
  if (!p || p.length < 20) issues.push('MISSING/too-short prompt');
  if (p && !anchorOk) issues.push('canon anchor (setting) not referenced');
  if (ANACHRONISM.test(descriptive)) issues.push('ANACHRONISM/modern term');
  if (VAGUE.test(descriptive)) issues.push('vague filler term');
  if (status === 'DRAFT' && !/EXCLUDE:/i.test(p)) issues.push('DRAFT missing EXCLUDE clause');
  return { id: s.id, scene: s.scene, status, len: p.length, issues };
});
const withIssues = rows.filter(r => r.issues.length);
const byIssue = {}; for (const r of withIssues) for (const i of r.issues) byIssue[i] = (byIssue[i] || 0) + 1;
const out = {
  generated: '2026-10-24', totalShots: rows.length,
  statusCounts: rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}),
  shotsWithIssues: withIssues.length, issueBreakdown: byIssue,
  rule: 'AUTHORED (260) and DRAFT (160) are NOT equivalent: any promotion of a DRAFT is explicit, justified, tested. No invented detail; anachronisms/vague terms flagged.',
  anachronisms: withIssues.filter(r => r.issues.some(i => /ANACHRONISM/.test(i))).map(r => r.id),
  missingAnchor: withIssues.filter(r => r.issues.some(i => /canon anchor/.test(i))).map(r => r.id).slice(0, 30),
  samples: withIssues.slice(0, 15),
};
writeFileSync(join(here, 'runs/benchmark/prompt-audit-f10.json'), JSON.stringify(out, null, 1));
console.log(`prompt-audit: ${rows.length} prompts | status ${JSON.stringify(out.statusCounts)} | withIssues ${withIssues.length} | breakdown ${JSON.stringify(byIssue)}`);
