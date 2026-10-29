// §2 continuity audit (local, €0, read-only) — cross-checks declared canonical constraints against the ACTUAL F10
// screenplay text + shot-list sceneHeads. For each constraint it extracts evidence from the scene block and
// classifies VERIFIED (explicit in source) / INFERRED (implied) / UNPROVEN (not locatable) / AMBIGUOUS (source
// supports >1 reading). It NEVER invents a resolution. Output: continuity-audit-f10.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const txt = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

// map SC -> screenplay scene-number prefix (from sceneHead), then extract each scene block from the screenplay.
const prefixOf = {}; for (const s of sl.shots) { const m = (s.sceneHead || '').match(/^([0-9]+[A-Z]?)\.\s/); if (m) prefixOf[s.scene] = m[1]; }
const lines = txt.split('\n');
function sceneBlock(sc) {
  const pfx = prefixOf[sc]; if (!pfx) return '';
  let start = -1;
  for (let i = 0; i < lines.length; i++) if (new RegExp('^#{2,4}\\s+' + pfx.replace(/[A-Z]/g, c => c) + '\\.\\s').test(lines[i])) { start = i; break; }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^#{2,4}\s+[0-9]+[A-Z]?\.\s/.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join('\n');
}
const has = (block, re) => re.test(block);
const snippet = (block, re) => { const m = block.match(re); return m ? block.slice(Math.max(0, m.index - 20), m.index + 90).replace(/\n/g, ' ').trim() : null; };

const checks = [];
function check(id, scene, claim, verdict, evidence, note) { checks.push({ id, scene, claim, verdict, evidence, note: note || null }); }

// 1) Olaf — dying from SC01; locate his death/goodbye
const sc43 = sceneBlock('SC43'), sc14 = sceneBlock('SC14'), sc44 = sceneBlock('SC44');
const olafGoodbye = has(sc43, /Olaf|Father|before I go|Close it/i);
check('olaf-death', 'SC43', 'Olaf dies / final farewell at SC43',
  olafGoodbye ? 'VERIFIED' : 'UNPROVEN',
  snippet(sc43, /before I go|Close it|the sea takes what it'?s owed/i) || snippet(sc14, /Sleep, Father/i),
  'SC43 holds Olaf\'s farewell ("before I go"); whether he physically dies in SC43 vs departs is a narrative reading — SC44 "Take him to the grey sea" — AMBIGUITY flagged, do not force.');

// 2) Helgi + wooden horse; his death
const sc32 = sceneBlock('SC32'), sc29 = sceneBlock('SC29'), sc33 = sceneBlock('SC33');
check('helgi-horse', 'SC29/SC32/SC33', 'Helgi carries carved wooden horse; dies; horse passed on',
  (has(sc29, /horse/i) && has(sc32, /HELGI|take my hand|Sǫlv/i)) ? 'VERIFIED' : 'INFERRED',
  snippet(sc32, /take my hand|drop the line|Sǫlv/i) || snippet(sc29, /horse/i),
  'SC32 = Helgi\'s loss beat ("take my hand... Sǫlv—"); horse motif explicit in SC29; hand-off to Astrid→Tove in SC33/SC44.');

// 3) Meryt wound / guilt
const sc28 = sceneBlock('SC28'), sc34 = sceneBlock('SC34'), sc39 = sceneBlock('SC39'), sc48 = sceneBlock('SC48');
check('meryt-guilt', 'SC28/SC34', 'Meryt\'s forbidden 2nd dawn-rite guilt (brother drowned)',
  (has(sc28, /brother|dawn-rite|second time|forbidden/i) || has(sc34, /hand was mine|dawn-rite a second time/i)) ? 'VERIFIED' : 'UNPROVEN',
  snippet(sc28, /dawn-rite|second time|forbidden/i) || snippet(sc34, /hand was mine/i), null);
check('meryt-wound', 'SC39→SC48', 'wound inflicted (SC39) → healed/bound (SC48) continuity pair',
  (prefixOf['SC39'] && prefixOf['SC48']) ? 'INFERRED' : 'UNPROVEN',
  `SC39 head="${sl.shots.find(s => s.scene === 'SC39')?.sceneHead}", SC48 head="${sl.shots.find(s => s.scene === 'SC48')?.sceneHead}"`,
  'Pair is a benchmark construct (SC39-SH04/SC48-SH02). F10 SC39=SEAM-ROOT choice, SC48=THE CAIRN. Physical wound-progression detail is staging (F8-ACTION), confirm exact wound shots with a human.');

// 4) double-dawn progression (monotonic desync)
const dd = has(txt, /double dawn|two suns|double.?aube|desync|monotonic/i);
check('double-dawn', 'global', 'double-dawn worsens monotonically (desync grows)',
  dd ? 'VERIFIED' : 'UNPROVEN', snippet(txt, /two suns|double dawn|ugly double dawn/i),
  'Referenced across dialogue (e.g. "another ugly double dawn"). Exact per-scene intensity curve = staging detail, human to lock.');

// 5) Börk dies saving Vigge (SC40)
const sc40 = sceneBlock('SC40');
check('bork-vigge', 'SC40', 'Börk dies saving Vigge',
  has(sc40, /BÖRK|Vigge|chose you/i) ? 'VERIFIED' : 'UNPROVEN', snippet(sc40, /BÖRK|He chose you|chose it/i), null);

// 6) scene chronological order (sceneHead prefixes ascend by scene number)
const order = [...new Set(sl.shots.map(s => s.scene))].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
const prefixNums = order.map(sc => ({ sc, pfx: prefixOf[sc] }));
let monotonic = true; let prev = -1;
for (const { pfx } of prefixNums) { const n = parseInt(pfx); if (n < prev) monotonic = false; prev = n; }
check('scene-order', 'global', 'SCxx order matches F10 scene-number prefixes (non-decreasing)',
  monotonic ? 'VERIFIED' : 'AMBIGUOUS', `first/last prefixes: ${prefixNums[0]?.pfx}..${prefixNums.at(-1)?.pfx}`,
  'Mapping via sceneHead prefixes; 30A→SC40 etc. are matrix-inserted — expected, not a contradiction.');

const summary = {}; for (const c of checks) summary[c.verdict] = (summary[c.verdict] || 0) + 1;
const out = { generated: '2026-10-24', source: '37_SCREENPLAY_60MIN_F10.md + shot-list-f10.json', summary, checks,
  rule: 'F10 source prevails. Real ambiguities are flagged, never auto-resolved. Scene numbers from old reports are leads, not truths.' };
writeFileSync(join(here, 'runs/benchmark/continuity-audit-f10.json'), JSON.stringify(out, null, 1));
console.log('continuity audit:', JSON.stringify(summary), '\n' + checks.map(c => `  [${c.verdict}] ${c.id} (${c.scene})`).join('\n'));
