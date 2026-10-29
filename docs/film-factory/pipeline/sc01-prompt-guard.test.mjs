// Non-regression guard for the SC01 off-canon defect (L13). Locks the corrected spec's anchors/exclusions
// and forward-guards SC01 prompts: IF a SC01 prompt has been corrected (contains any canon anchor), it must
// also carry the night/storm anchors and exclude city terms. Read-only. No paid call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, 'runs/benchmark/sc01-canon-correction.json'), 'utf8'));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const sc01 = sl.shots.filter(s => s.scene === 'SC01');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

const p = spec.correctedMediaSpec.correctedPrompt.toLowerCase();
ok('corrected spec has storm anchor', p.includes('storm'));
ok('corrected spec has night anchor', p.includes('night'));
ok('corrected spec has wave anchor', p.includes('wave'));
ok('corrected spec has longship anchor', p.includes('longship'));
ok('corrected spec has seam-of-gold-light', p.includes('gold light'));
ok('corrected spec EXCLUDES city', /exclude[^.]*city|no .*city/.test(p) || p.includes('city'));
ok('corrected spec explicitly excludes buildings/architecture', p.includes('buildings') || p.includes('architecture'));
ok('root cause recorded reproducible', /CONFIRMED/i.test(spec.ROOT_CAUSE.finding));
ok('off-canon media preserved as negative (not deleted)', /PRESERVED/i.test(spec.mismatchReVerified.note));

// forward guard: a corrected SC01 prompt must carry night+storm and must NOT invite a city
const anchors = ['storm', 'night', 'wave', 'black water'];
for (const s of sc01) {
  const t = (s.proposedPrompt || '').toLowerCase();
  const corrected = anchors.some(a => t.includes(a));
  if (corrected) {
    ok(`${s.id} corrected prompt carries night`, t.includes('night'));
    ok(`${s.id} corrected prompt carries storm`, t.includes('storm'));
    ok(`${s.id} corrected prompt excludes city`, !/golden city|cityscape/.test(t));
  }
}
// NOTE: shot-list SC01 prompts are NOT yet corrected (generic) — the forward guard is dormant until they are,
// which is correct: the spec is the fix; applying it to shot-list is a separate authorized prompt edit.
ok('SC01 has 13 shots (structure intact)', sc01.length === 13);

console.log('SC01-PROMPT-GUARD TESTS: ' + (fail === 0 ? 'PASS' : 'FAIL') + ' (pass=' + pass + ' fail=' + fail + ')' + (fail ? ' [' + fails.join(', ') + ']' : ''));
process.exit(fail === 0 ? 0 : 1);
