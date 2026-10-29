// Tests that the 6 canonical prototype shots resolve to NON-EMPTY, canon-faithful prompts from the authored F10
// registers, and that each carries the correct scene + a plausible setting keyword (NORTH SEA / MARKET / SEAM-ROOT
// / CAIRN). Guards against the earlier regression where GENERIC prompts produced off-canon media. €0, local.
import { getFaithfulPrompt, resolvePrototypes, PROTOTYPE_SHOT_IDS } from './faithful-prompts-f10.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };

const EXPECT = {
  'SC40-SH06': { scene: 'SC40', kw: /SEAM-ROOT/i },
  'SC22-SH06': { scene: 'SC22', kw: /MARKET/i },
  'SC01-SH01': { scene: 'SC01', kw: /NORTH SEA/i },
  'SC43-SH03': { scene: 'SC43', kw: /SEAM-ROOT/i },
  'SC39-SH04': { scene: 'SC39', kw: /SEAM-ROOT/i },
  'SC48-SH02': { scene: 'SC48', kw: /CAIRN/i },
};

for (const [id, exp] of Object.entries(EXPECT)) {
  const p = getFaithfulPrompt(id);
  ok(`${id} resolves`, !!p);
  ok(`${id} non-empty fullPrompt`, !!(p && p.fullPrompt && p.fullPrompt.length > 30));
  ok(`${id} correct scene`, p && p.scene === exp.scene);
  ok(`${id} canon keyword present`, p && exp.kw.test(p.fullPrompt || ''));
}
// the prototype map covers all 6 and resolves
const r = resolvePrototypes();
ok('all 6 prototypes resolve', Object.values(r).every(Boolean) && Object.keys(r).length === 6);
ok('prototype ids stable', PROTOTYPE_SHOT_IDS.SC01 === 'SC01-SH01');

console.log(`\nFAITHFUL-PROMPTS TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
process.exit(fail === 0 ? 0 : 1);
