// Focused AUTOMATED gates for the F11 screenplay DRAFT (scene inventory). Verifies the structural acceptance
// gates against the ACTUAL authored scenes — not the registry. Creative quality (comedy that lands, dramatic
// coherence) remains HUMAN review. No paid call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const inv = JSON.parse(readFileSync(join(here, 'f11-scene-inventory.json'), 'utf8'));
const reg = JSON.parse(readFileSync(join(here, 'character-registry-f11.json'), 'utf8'));
const S = inv.scenes;
const FEMALES = reg.characters.filter(c => c.gender === 'F').map(c => c.canonicalName); // ASTRID, MERYT

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

const decisiveCount = {};
for (const s of S) decisiveCount[s.decisiveAgent] = (decisiveCount[s.decisiveAgent] || 0) + 1;

// --- protagonist drives the decisive arcs ---
ok('49 scenes authored', S.length === 49);
ok('Björn is decisive at the climax (SC45 AND SC46)', ['SC45', 'SC46'].every(id => S.find(s => s.id === id).decisiveAgent === 'BJÖRN'));
ok('Björn is decisive in the field (SC38)', S.find(s => s.id === 'SC38').decisiveAgent === 'BJÖRN');
ok('Björn carries the plurality of decisive scenes', Object.entries(decisiveCount).every(([k, v]) => k === 'BJÖRN' || v <= decisiveCount['BJÖRN']));
ok('Björn decisive in a clear majority of action/climax set', ['SC06', 'SC18', 'SC22', 'SC32', 'SC37', 'SC38', 'SC45', 'SC46'].every(id => S.find(s => s.id === id).decisiveAgent === 'BJÖRN'));

// --- the two females are genuinely secondary ---
ok('former lead ASTRID has ZERO decisive scenes', (decisiveCount['ASTRID'] || 0) === 0);
ok('NEITHER female is ever the decisive agent (strict secondary)', FEMALES.every(f => (decisiveCount[f] || 0) === 0));
ok('no female decisive in ANY action/climax scene', ['SC01','SC03','SC06','SC18','SC21','SC22','SC24','SC25','SC30','SC32','SC37','SC38','SC40','SC45','SC46'].every(id => !FEMALES.includes(S.find(s => s.id === id).decisiveAgent)));
ok('both females still PRESENT and functional (appear in multiple scenes)', FEMALES.every(f => S.filter(s => s.present.includes(f)).length >= 3));
ok('only ASTRID + MERYT ever appear as female cast in scenes', S.every(s => s.present.every(p => !['IPY','WIDOW'].includes(p))));

// --- male-led principal arcs ---
const maleLeads = ['BJÖRN', 'OLAF', 'SETH-NAKHT', 'NEFER-KA', 'HELGI', 'TOVE', 'BÖRK', 'VIGGE', 'ELDER', 'WIDOWER', 'IPU', 'ENSEMBLE', '—'];
ok('every decisive agent is male/ensemble/none (never a female lead)', S.every(s => maleLeads.includes(s.decisiveAgent)));
ok('protagonist Björn present in all three acts', ['I','II','III'].every(a => S.some(s => s.act === a && s.present.includes('BJÖRN'))));

// --- comedy present and purposeful ---
const comedyScenes = S.filter(s => s.comedy);
ok('comedy present in multiple scenes (>=8)', comedyScenes.length >= 8);
ok('comedy spans setup+escalation+payoff (all 3 acts)', ['I','II','III'].every(a => comedyScenes.some(s => s.act === a)));

// --- mystery ladder intact ---
const rungs = S.filter(s => s.mysteryRung);
ok('mystery rungs present across the film (>=6)', rungs.length >= 6);
ok('the closing rule appears before the climax', S.some(s => /walks in|from within|does not return/i.test(s.mysteryRung || '') && parseInt(s.id.slice(2)) <= 46));

// --- re-gender applied in scenes ---
ok('IPU + WIDOWER appear (re-gendered); IPY/WIDOW do not', S.some(s => s.present.includes('IPU')) && S.some(s => s.present.includes('WIDOWER')));

// --- Björn is more than muscle (arc beats) ---
ok('Björn has learn-to-read arc beats (SC16/17/36/41)', ['SC16','SC17','SC36','SC41'].every(id => (S.find(s => s.id === id).bjornBeat || '').length > 0));
ok('Björn final decisive act is NOT a swing (SC45)', /not a swing|plants|sets his hand|steps in/i.test(S.find(s => s.id === 'SC45').beat + S.find(s => s.id === 'SC45').bjornBeat));

console.log('F11-SCREENPLAY TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
console.log('decisive counts:', JSON.stringify(decisiveCount));
console.log('NOTE: structural gates only. Comedy quality, dramatic coherence, action readability, dialogue voice = HUMAN creative review (pending).');
process.exit(fail === 0 ? 0 : 1);
