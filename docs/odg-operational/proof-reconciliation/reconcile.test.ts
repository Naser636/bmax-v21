// @ts-nocheck
// Phase E NEGATIVE + robustness tests. €0, no network. Proves fail-closed input handling, idempotency, and —
// the key differentiator — that the INDEPENDENT verifier CATCHES a planted false success (an agent hiding a
// discrepancy or inflating matches). A green here means the governance gate actually prevents false success.
import { reconcile } from './reconcile.js';
import { verify } from './verify-reconciliation.js';
import { writeFileSync, mkdtempSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n); } };
const td = () => mkdtempSync(join(tmpdir(), 'recon-'));

// 0) baseline positive: engine + independent verify PASS
{
  const report = reconcile();
  const rp = join(td(), 'r.json'); writeFileSync(rp, JSON.stringify(report));
  const v = verify({ reportPath: rp });
  ok('positive: independent verify PASS (5/5, precision 1)', v.verdict === 'PASS' && v.recall === 1 && v.precision === 1 && v.caught === 5);
  ok('positive: all 5 discrepancy types detected', Object.keys(report.byType).length === 5);
}

// 1) FAIL-CLOSED: missing input throws (no silent partial)
{
  let threw = false; try { reconcile({ bankPath: '/nonexistent/bank.csv' }); } catch (e) { threw = /INPUT_MISSING/.test(e.message); }
  ok('negative: missing input -> INPUT_MISSING throw', threw);
}

// 2) FAIL-CLOSED: malformed CSV (missing column) throws
{
  const d = td(); const bad = join(d, 'bank.csv'); writeFileSync(bad, 'ref,date\nINV-1,2026-03-01\n');
  let threw = false; try { reconcile({ bankPath: bad }); } catch (e) { threw = /INPUT_MALFORMED/.test(e.message); }
  ok('negative: malformed CSV (missing amount col) -> throw', threw);
}

// 3) FAIL-CLOSED: non-numeric amount throws
{
  const d = td(); const bad = join(d, 'bank.csv'); writeFileSync(bad, 'ref,date,amount,desc\nINV-1,2026-03-01,NOT_A_NUMBER,x\n');
  let threw = false; try { reconcile({ bankPath: bad }); } catch (e) { threw = /amount not numeric/.test(e.message); }
  ok('negative: non-numeric amount -> throw', threw);
}

// 4) NO-FALSE-SUCCESS: a tampered report (discrepancy hidden) MUST be caught by the independent verifier
{
  const good = reconcile();
  const tampered = JSON.parse(JSON.stringify(good));
  tampered.findings = tampered.findings.filter(f => f.type !== 'AMOUNT_MISMATCH'); // agent "hides" a costly error
  tampered.findingsCount = tampered.findings.length;
  const rp = join(td(), 'tampered.json'); writeFileSync(rp, JSON.stringify(tampered));
  const v = verify({ reportPath: rp });
  ok('no-false-success: hidden AMOUNT_MISMATCH -> verify FAIL', v.verdict === 'FAIL' && v.reasons.some(r => /MISSED/.test(r)) && v.recall < 1);
}

// 5) NO-FALSE-SUCCESS: inflated matchedCount (agent claims more matches) MUST be caught
{
  const good = reconcile();
  const tampered = { ...good, matchedCount: good.matchedCount + 3 };
  const rp = join(td(), 'inflated.json'); writeFileSync(rp, JSON.stringify(tampered));
  const v = verify({ reportPath: rp });
  ok('no-false-success: inflated matchedCount -> verify FAIL', v.verdict === 'FAIL' && v.reasons.some(r => /matchedCount/.test(r)));
}

// 6) NO-FALSE-SUCCESS: spurious finding (false positive) MUST be caught
{
  const good = reconcile();
  const tampered = JSON.parse(JSON.stringify(good));
  tampered.findings.push({ type: 'AMOUNT_MISMATCH', ref: 'INV-9999', ledgerAmount: 1, bankAmount: 2 });
  const rp = join(td(), 'spurious.json'); writeFileSync(rp, JSON.stringify(tampered));
  const v = verify({ reportPath: rp });
  ok('no-false-success: spurious finding -> verify FAIL (precision<1)', v.verdict === 'FAIL' && v.precision < 1);
}

// 7) IDEMPOTENT / deterministic: same inputs -> identical output
{
  const a = JSON.stringify(reconcile()), b = JSON.stringify(reconcile());
  ok('idempotent: deterministic identical output', a === b);
}

// 8) RECOVERY-style: report absent -> verify fails closed (not a silent pass)
{
  const v = verify({ reportPath: '/nonexistent/report.json' });
  ok('fail-closed: no report -> verify FAIL (not silent pass)', v.verdict === 'FAIL');
}

console.log(`\nRECONCILE PROOF TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
process.exit(fail === 0 ? 0 : 1);
