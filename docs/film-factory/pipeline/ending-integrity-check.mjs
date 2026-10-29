// Ending-integrity + franchise-seed guard for F10 (the adopted reference).
// Read-only. Asserts (A) the stand-alone closure invariants and (B) the latent, NON-cliffhanger franchise seeds
// are present in F10's real text. Any future edit that silently erodes the ending OR the seeds fails here.
// This check adds NOTHING to the screenplay — it only verifies what is already there.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const F10 = readFileSync(join(here, '..', '37_SCREENPLAY_60MIN_F10.md'), 'utf8');

// Substring (not regex) to survive rewording of surrounding prose; each is a load-bearing phrase verified present.
const CLOSURE = [
  ['seam closes permanently',        'The single coin splits. One sun sinks for good'],
  ['false seas do not return',       'The false seas drain and do not return'],
  ['the seam is gone',               'The seam is gone'],
  ["Astrid's unforced choice (arc)", "I chose it. No one told me to."],
  ['choice is the whole of her',     'was the whole of her'],
  ["Olaf's sacrifice, not Astrid's", "Owe it me — not you"],
  ['crew sent home before the shut', 'Take the crew home'],
  ['climax has a real cost (Börk)',  'BÖRK'],
  ['Seth-Nakht turned, not forgiven','not forgiven, but no longer the man on the'],
  ['title card / hard close',        'TITLE: LA PORTE DU SOLEIL.'],
  ['hard out',                       'CUT TO BLACK'],
];
// Organic, non-cliffhanger seeds (Option B is ALREADY satisfied by these — see 38_FRANCHISE_READINESS_AUDIT.md).
const SEEDS = [
  ['river runs further (forward quest)', 'runs further than anyone'],
  ['Astrid chooses the river herself',   "Then it had better be me"],
  ['Ipy succeeds (the stick passes)',    'hands Ipy the stick'],
  ['other seams whispered once',         'no one to shut the tear the day'],
  ['Nefer-Ka still guards a horizon',    'watches the horizon he still guards'],
  ['the mother, left unexplained',       "I didn't choose you. I'm"],
];
// Anti-cliffhanger: these would indicate a FORCED hook was added against the mandate. All must be ABSENT.
const FORBIDDEN = [
  ['no post-credits stinger',   'POST-CREDIT'],
  ['no mid-credits stinger',    'MID-CREDIT'],
  ['no "to be continued"',      'TO BE CONTINUED'],
  ['no explicit sequel bumper', 'CHAPTER ONE'],
];

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log(`  PASS  ${name}`)) : (fail++, console.log(`  FAIL  ${name}`)); };

console.log('A. CLOSURE INVARIANTS (film 1 stands alone):');
for (const [name, needle] of CLOSURE) ok(name, F10.includes(needle));
console.log('B. ORGANIC FRANCHISE SEEDS (present — Option B already met, no addition needed):');
for (const [name, needle] of SEEDS) ok(name, F10.includes(needle));
console.log('C. NO ARTIFICIAL HOOK (forbidden — must be absent):');
for (const [name, needle] of FORBIDDEN) ok(name, !F10.includes(needle));

const total = pass + fail;
console.log(`\nending-integrity-check (F10): ${pass}/${total} PASS` + (fail ? `  (${fail} FAIL)` : ''));
if (fail) process.exit(1);
