// Asserts 100% canon-linked prompt coverage: every F10 shot resolves to a non-empty fullPrompt. €0, local.
import { getFaithfulPrompt } from './faithful-prompts-f10.mjs';
import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
let covered = 0, missing = [];
for (const sh of sl.shots) { const p = getFaithfulPrompt(sh.id); if (p && p.fullPrompt && p.fullPrompt.length > 20) covered++; else missing.push(sh.id); }
const pass = covered === sl.totalShots && missing.length === 0;
console.log(`PROMPT-COVERAGE TEST: ${pass ? 'PASS' : 'FAIL'} (${covered}/${sl.totalShots})` + (missing.length ? ` missing ${missing.length}` : ''));
process.exit(pass ? 0 : 1);
