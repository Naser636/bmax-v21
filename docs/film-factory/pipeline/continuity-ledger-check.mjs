// Validate the continuity ledger against F10: every state anchor is verbatim in F10, and the ordering rules hold
// (dead characters don't speak after death; wound inflicted before bound; suns one-way; prop handoff order; tide
// escalation). Flags contradictions (FAIL) and ambiguities (reported, non-fatal). Data-driven from F10. READ-ONLY.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHAR } from './ref-bible-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(readFileSync(join(here, 'continuity-ledger-f10.json'), 'utf8'));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');
const F10n = F10.replace(/\s+/g, ' ');

// script-scene label -> comparable number (30A -> 30.5)
const sceneNum = lbl => { const m = String(lbl).match(/^(\d+)([A-Z]?)/); return m ? parseInt(m[1], 10) + (m[2] ? 0.5 : 0) : NaN; };
// parse F10 scenes in order; for each dialogue cue, record its script-scene number.
const parts = F10.split(/^### /m).slice(1).map(p => ({ label: p.split('\n')[0].trim().split('.')[0] + (/^\d+[A-Z]/.test(p.trim()) ? '' : ''), head: p.split('\n')[0].trim(), body: p }));
const lastLine = {};
for (const s of parts) {
  const n = sceneNum(s.head);
  for (const m of s.body.matchAll(/^\*\*([A-ZÀ-Þ][A-ZÀ-Þ'\- ]+?):\*\*/gm)) {
    const c = m[1].trim(); lastLine[c] = Math.max(lastLine[c] || -1, n);
  }
}

let pass = 0, fail = 0, ambig = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.log('  CONTRADICTION ' + n));

ok('mission budget authorized = €0', L.budgetAuthorizedThisMission === 0);
// 1. anchors verbatim in F10
for (const t of L.threads) for (const st of t.states) ok(`${t.thread} @${st.scene}: anchor in F10`, F10n.includes(st.anchor.replace(/\s+/g, ' ')));
// 2. dead characters do not speak after death
const deaths = { OLAF: 33, HELGI: 24, 'BÖRK': sceneNum('30A') };
for (const [c, d] of Object.entries(deaths)) ok(`${c}: no dialogue after death scene ${d}`, (lastLine[c] ?? -1) <= d);
// 3. wound inflicted before bound
const wt = L.threads.find(t => t.thread === 'Meryt forearm wound');
ok('Meryt wound: inflicted(30) before bound(38)', sceneNum(wt.states[0].scene) < sceneNum(wt.states[1].scene));
// 4. suns one-way: no genuine single-sun scene BODY before 37 (exclude the sequence header line)
let singleSunBefore37 = 0;
for (const s of parts) { const n = sceneNum(s.head); const body = s.body.replace(/^## SEQUENCE[^\n]*\n/m, ''); if (n < 37 && /single[- ]sun|one sun sinks|single coin splits/i.test(body)) singleSunBefore37++; }
ok('suns one-way: no single-sun scene body before 37', singleSunBefore37 === 0);
// 5. prop handoff + tide escalation ordering (monotonic scene numbers in the listed order)
for (const name of ['Wooden horse prop', 'Tides (escalation)']) {
  const t = L.threads.find(x => x.thread === name);
  const nums = t.states.map(s => sceneNum(s.scene));
  ok(`${name}: states in ascending scene order`, nums.every((v, i) => i === 0 || v > nums[i - 1]));
}
// 6. every character named across threads is in the bible (and thus TO_CREATE)
const named = new Set();
for (const t of L.threads) { const m = t.thread.match(/^([A-ZÀ-Þ][a-zà-ÿ\-]*)/); }
for (const key of ['Meryt','Olaf','Helgi','Börk','Astrid','Ipy','Seth-Nakht']) ok(`bible has ${key}`, !!CHAR[key.toUpperCase()]);
// 7. ambiguities are reported (non-fatal) but must be a non-empty, acknowledged list
ambig = L.knownAmbiguities.length;
ok('known ambiguities acknowledged (not silently dropped)', ambig >= 1);

console.log(`\nambiguities flagged (non-fatal, for human review): ${ambig}`);
for (const a of L.knownAmbiguities) console.log('  ~ ' + a);
console.log(`continuity-ledger-check: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} CONTRADICTIONS)` : ' — no contradictions'));
if (fail) process.exit(1);
