// Validate the F11 opening artifacts (dialogue + shot-list + contracts + distribution). Hermetic; no paid call.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const R = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const dlg = R('f11-opening-dialogue.json'), sl = R('f11-opening-shotlist.json'), mc = R('f11-opening-movement-contracts.json'), dist = R('f11-opening-distribution.json'), inv = R('f11-scene-inventory.json');
const SCENES = ['SC01', 'SC02', 'SC03', 'SC04', 'SC05', 'SC06', 'SC07'];
const CATS = ['ACTION', 'STORY', 'TENSION', 'DRAMA', 'COMEDY', 'WORLD'];
const byScene = Object.fromEntries(inv.scenes.map(s => [s.id, s]));

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

// dialogue
ok('dialogue covers SC01–07', SCENES.every(s => dlg.lines.some(l => l.scene === s)));
ok('every line has speaker + non-empty en', dlg.lines.every(l => l.speaker && typeof l.en === 'string' && l.en.length > 0));
ok('speakers are canon characters (incl. re-gendered IPU)', dlg.lines.every(l => ['ASTRID', 'BJÖRN', 'OLAF', 'TOVE', 'HELGI', 'MERYT', 'IPU', 'SETH-NAKHT'].includes(l.speaker)));
ok('SC02 carries the comedy beat', dlg.lines.some(l => l.scene === 'SC02' && l.content === 'COMEDY'));
ok('globally-intelligible English (no obvious regional slang)', !dlg.lines.some(l => /\b(gonna|wanna|innit|y'all|reckon|mate|bloody)\b/i.test(l.en)));

// shot-list
ok('shot-list covers SC01–07', SCENES.every(s => sl.shots.some(x => x.scene === s)));
ok('totalShots matches array', sl.totalShots === sl.shots.length);
ok('unique shot ids', new Set(sl.shots.map(s => s.id)).size === sl.shots.length);
ok('every shot has valid content + mediaCategory + duration', sl.shots.every(s => CATS.includes(s.content) && ['PREMIUM_VIDEO', 'STILL_ANIMATABLE'].includes(s.mediaCategory) && s.durationSec > 0));
ok('action scenes SC01/03/06 are tagged ACTION', ['SC01', 'SC03', 'SC06'].every(s => sl.shots.filter(x => x.scene === s).every(x => x.content === 'ACTION')));
ok('Björn is the decisive agent in the opening action scenes', ['SC01', 'SC03', 'SC06'].every(s => byScene[s].decisiveAgent === 'BJÖRN'));

// distribution
ok('distribution covers all 6 categories', dist.distribution.length === 6 && CATS.every(c => dist.distribution.some(d => d.category === c)));
ok('shot-weighted sums ~100%', Math.abs(dist.distribution.reduce((a, d) => a + d.shotPct, 0) - 100) < 1.0);
ok('screen-time estimate sums ~100%', Math.abs(dist.distribution.reduce((a, d) => a + d.screenTimeEstPct, 0) - 100) < 1.0);
ok('distribution is LABELLED as estimate (not claimed achieved)', /ESTIMATE/i.test(dist.honesty) && /NOT claimed achieved/i.test(dist.honesty));
ok('opening is action-forward (action ≥ 60% shot-wt)', dist.distribution.find(d => d.category === 'ACTION').shotPct >= 60);

// movement contracts (Björn action)
ok('contracts for the 3 action scenes', ['SC01', 'SC03', 'SC06'].every(s => mc.contracts.some(c => c.scene === s)));
ok('contracts carry the 6 movement fields + weapon + camera', mc.contracts.every(c => c.initial && c.trajectory && c.contact && c.consequence && c.final && c.raccord && c.weaponCostume && c.camera));
ok('weapon continuity = Himinkljúfr tracked, no wheel', mc.contracts.every(c => /Himinkljúf/i.test(c.weaponCostume)) && !mc.contracts.some(c => /wheel/i.test(JSON.stringify(c))));

// canon preservation: F10 frozen unchanged
const F10 = join(here, '../F10_FROZEN_2026-10-24');
const sums = readFileSync(join(F10, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
ok('F10 frozen intact (every checksum matches)', sums.every(([h, f]) => existsSync(join(F10, f)) && createHash('sha256').update(readFileSync(join(F10, f))).digest('hex') === h));

console.log('F11-OPENING TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
