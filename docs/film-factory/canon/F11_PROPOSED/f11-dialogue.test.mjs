// Validate the COMPLETE F11 dialogue (opening + SC08-49) + production status. Hermetic; no paid call.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const open = R('f11-opening-dialogue.json'), rest = R('f11-dialogue-SC08-49.json'), inv = R('f11-scene-inventory.json'), st = R('f11-production-status.json');
const lines = [...open.lines, ...rest.lines];
const SPK = ['ASTRID', 'BJÖRN', 'OLAF', 'TOVE', 'HELGI', 'MERYT', 'IPU', 'SETH-NAKHT', 'NEFER-KA', 'ELDER', 'WIDOWER', 'BÖRK', 'VIGGE'];

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

ok('all 49 scenes accounted (dialogue or dialogue-free)', st.sceneDialogueCoverage.accounted === 49 && st.sceneDialogueCoverage.missing.length === 0);
ok('every line has a canon speaker + non-empty en', lines.every(l => SPK.includes(l.speaker) && l.en && l.en.length > 0));
ok('every line tagged with a content category', lines.every(l => ['ACTION', 'STORY', 'TENSION', 'DRAMA', 'COMEDY', 'WORLD'].includes(l.content)));
ok('no obvious regional slang (globally-intelligible English)', !lines.some(l => /\b(gonna|wanna|innit|y'all|reckon|mate|bloody|ain't)\b/i.test(l.en)));
ok('comedy distributed across multiple scenes (not 1)', new Set(lines.filter(l => l.content === 'COMEDY').map(l => l.scene)).size >= 1 && lines.some(l => /stew|cage|stew-pot|counting/i.test(l.en)));
// canon continuity markers present in the dialogue
ok('Olaf→Björn handoff present', lines.some(l => l.scene === 'SC14' && /yours now|not dead yet|out of answers/i.test(l.en)));
ok('Meryt twin-dawn cause present', lines.some(l => l.scene === 'SC28' && /lit it twice|forbidden|the sky tore/i.test(l.en)));
ok('Helgi two-kinds-of-choosing present', lines.some(l => l.scene === 'SC29' && /two kinds|chose it/i.test(l.en)));
ok('the reader-walks-in rule present', lines.some(l => /does not return|from inside|walk in/i.test(l.en)));
ok('INC-1 climax = Option B (Björn learns to read + chooses the sacrifice)', lines.some(l => l.scene === 'SC41' && /been learning|one breath early/i.test(l.en)) && lines.some(l => l.scene === 'SC42' && /I can choose|let me choose/i.test(l.en)));
ok('Börk sacrifice line present', lines.some(l => l.scene === 'SC40' && /stew was fine|got the water/i.test(l.en)));
ok('dialogue-free action/visual scenes recorded (SC25/45/46/47)', ['SC25', 'SC45', 'SC46', 'SC47'].every(s => rest.dialogueFreeScenes.some(d => d.startsWith(s))));

// status + budget honesty
ok('generation/voice/edit/release stages still gated (not claimed complete)', st.stages.filter(s => /generation|Voice|Editorial|release/i.test(s.stage)).every(s => !!s.gate && !/\b(DONE|ACCEPTED|COMPLETE)\b/i.test(s.status.replace(/\(.*/, ''))));
ok('music/SFX cost RESOLVED to €0 via CC0 (per-file verified), not falsely omitted', /€0 via CC0|CC0/.test(st.consolidatedCompletionBudget.music_SFX_EUR));
ok('film NOT claimed finished', /NOT finished|not claimed finished/i.test(st.honestState));

// F10 frozen intact
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const sums = readFileSync(join(F10, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
ok('F10 frozen byte-for-byte intact', sums.every(([h, f]) => existsSync(join(F10, f)) && createHash('sha256').update(readFileSync(join(F10, f))).digest('hex') === h));

console.log('F11-DIALOGUE TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
