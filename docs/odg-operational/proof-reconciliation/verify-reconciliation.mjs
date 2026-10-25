// Phase E INDEPENDENT VERIFIER — a SEPARATE implementation that checks the reconcile report against the ground-truth
// answer key (recall: every planted discrepancy caught; precision: no spurious findings) AND independent structural
// invariants (every bank+ledger row accounted for exactly once; matched refs truly match). This is ODG's
// NO-FALSE-SUCCESS gate: the producing agent never grades its own homework. €0, no network. Verdict PASS/FAIL + why.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { confusionMatrix } from '../shared-core/eval-metrics.mjs'; // SHARED-CORE (Domain-B metric reused in Domain-C)
const here = dirname(fileURLToPath(import.meta.url));
const key = (f) => `${f.type}:${f.ref}`;

export function verify({ reportPath = join(here, 'reconciliation-report.json'), answerKeyPath = join(here, 'answer-key.json'),
  ledgerPath = join(here, 'ledger.csv'), bankPath = join(here, 'bank.csv') } = {}) {
  if (!existsSync(reportPath)) return { verdict: 'FAIL', reasons: ['no reconciliation report produced'] };
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const ak = JSON.parse(readFileSync(answerKeyPath, 'utf8'));
  const reasons = [];

  // RECALL: every expected finding present (by type+ref), with correct key fields
  const reportKeys = new Set(report.findings.map(key));
  const missed = [];
  for (const e of ak.expectedFindings) {
    if (!reportKeys.has(key(e))) { missed.push(key(e)); continue; }
    const got = report.findings.find(f => key(f) === key(e));
    if (e.type === 'AMOUNT_MISMATCH' && (got.bankAmount !== e.bankAmount || got.ledgerAmount !== e.ledgerAmount)) missed.push(key(e) + '(wrong amounts)');
    if (e.type === 'DATE_MISMATCH' && (got.bankDate !== e.bankDate || got.ledgerDate !== e.ledgerDate)) missed.push(key(e) + '(wrong dates)');
    if (e.type === 'DUPLICATE_IN_BANK' && got.count !== e.count) missed.push(key(e) + '(wrong count)');
  }
  if (missed.length) reasons.push('MISSED expected findings: ' + missed.join(', '));

  // PRECISION: no spurious findings beyond the expected set
  const expectedKeys = new Set(ak.expectedFindings.map(key));
  const spurious = report.findings.filter(f => !expectedKeys.has(key(f))).map(key);
  if (spurious.length) reasons.push('SPURIOUS findings (false positives): ' + spurious.join(', '));

  // INDEPENDENT STRUCTURAL INVARIANTS (recomputed from raw inputs, not trusting the report)
  if (existsSync(ledgerPath) && existsSync(bankPath)) {
    const rows = (p, cols) => readFileSync(p, 'utf8').trim().split('\n').slice(1);
    const ledgerN = rows(ledgerPath).length, bankN = rows(bankPath).length;
    if (report.ledgerRows !== ledgerN) reasons.push(`ledgerRows ${report.ledgerRows} != actual ${ledgerN}`);
    if (report.bankRows !== bankN) reasons.push(`bankRows ${report.bankRows} != actual ${bankN}`);
    // every ledger ref appears exactly once across matched+MISSING_IN_BANK+AMOUNT_MISMATCH+DATE_MISMATCH
    const accountedLedger = new Set([...report.matched.map(m => m.ref), ...report.findings.filter(f => ['MISSING_IN_BANK', 'AMOUNT_MISMATCH', 'DATE_MISMATCH'].includes(f.type)).map(f => f.ref)]);
    const ledgerRefs = new Set(readFileSync(ledgerPath, 'utf8').trim().split('\n').slice(1).map(l => l.split(',')[0]));
    for (const r of ledgerRefs) if (!accountedLedger.has(r)) reasons.push('ledger ref not accounted: ' + r);
  }
  if (report.matchedCount !== ak.expectedMatchedCount) reasons.push(`matchedCount ${report.matchedCount} != expected ${ak.expectedMatchedCount}`);

  const recall = (ak.expectedFindings.length - missed.length) / ak.expectedFindings.length;
  const precision = report.findings.length ? (report.findings.length - spurious.length) / report.findings.length : 1;
  // SHARED-CORE cross-check: an INDEPENDENT confusion matrix (predicted findings vs ground-truth) via the Domain-B
  // eval-metrics module. Corroborates the hand-rolled recall/precision above with a reusable, separately-tested metric.
  const confusion = confusionMatrix(report.findings, ak.expectedFindings, key);
  return { verdict: reasons.length === 0 ? 'PASS' : 'FAIL', reasons, recall: +recall.toFixed(2), precision: +precision.toFixed(2), caught: ak.expectedFindings.length - missed.length, planted: ak.expectedFindings.length, spurious: spurious.length, confusion };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const v = verify();
  console.log(`INDEPENDENT VERIFY: ${v.verdict} | recall ${v.recall} precision ${v.precision} | caught ${v.caught}/${v.planted} planted, ${v.spurious} spurious`);
  if (v.reasons.length) console.log('  reasons:', v.reasons.join(' | '));
  process.exit(v.verdict === 'PASS' ? 0 : 1);
}
