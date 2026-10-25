// PIPELINE COVERAGE MATRIX (§3) — valid / invalid / missing / contradictory / duplicate / ambiguous /
// hidden-anomaly / false-positive+negative / falsified+inflated / idempotent / engine-verifier-separation /
// safe-stop / traceability / extractor-stub-contract. Pure, deterministic, €0, no network. Node >=18.
import { writeFileSync, mkdtempSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert';
import { reconcileRows } from './reconcile.mjs';
import { ingest } from './ingest.mjs';
import { runPipeline } from './run-pipeline.mjs';
import { verify } from './verify-reconciliation.mjs';
import { getExtractor, NotImplementedExtractor, makeSubstituteExtractor, textFixedExtractor } from './extract-adapter.mjs';
const here = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; failures.push(`${name}: ${e.message}`); } };
const tmp = mkdtempSync(join(tmpdir(), 'recon-test-'));
const w = (name, body) => { const p = join(tmp, name); writeFileSync(p, body); return p; };
const L = (rows) => rows.map((r, i) => ({ ...r, _src: { file: 'L', line: i + 2 } }));
const Bk = (rows) => rows.map((r, i) => ({ ...r, _src: { file: 'B', line: i + 2 } }));

// 1. VALID — matching rows reconcile with zero findings
t('valid: clean match => 0 findings, all matched', () => {
  const r = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 100 }]));
  assert.equal(r.findingsCount, 0); assert.equal(r.matchedCount, 1);
});

// 2. MISSING input file => ingest fail-closed => pipeline STOPS (no success)
t('missing: nonexistent file => ingest ok:false', () => {
  const r = ingest(join(tmp, 'nope.csv'), { kind: 'csv' });
  assert.equal(r.ok, false); assert.match(r.errors[0], /INPUT_MISSING/);
});

// 3. INVALID: malformed row (wrong field count) => fail-closed
t('invalid: malformed row count => ingest ok:false', () => {
  const p = w('bad.csv', 'ref,date,amount\nA,2026-01-01,100\nB,2026-01-02\n');
  const r = ingest(p, { kind: 'csv' });
  assert.equal(r.ok, false); assert.match(r.errors.join(), /INPUT_MALFORMED/);
});

// 4. INVALID: non-numeric amount => fail-closed
t('invalid: non-numeric amount => ingest ok:false', () => {
  const p = w('nn.csv', 'ref,date,amount\nA,2026-01-01,oops\n');
  const r = ingest(p, { kind: 'csv' });
  assert.equal(r.ok, false); assert.match(r.errors.join(), /not numeric/);
});

// 5. INVALID: missing required field (empty ref) => fail-closed
t('invalid: empty required field => ingest ok:false', () => {
  const p = w('mr.csv', 'ref,date,amount\n,2026-01-01,100\n');
  const r = ingest(p, { kind: 'csv' });
  assert.equal(r.ok, false); assert.match(r.errors.join(), /missing required field/);
});

// 6. CONTRADICTORY: same ref, different amount => AMOUNT_MISMATCH, classified NEEDS_REVIEW
t('contradictory: amount mismatch => NEEDS_REVIEW', () => {
  const r = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 90 }]));
  const f = r.findings.find(x => x.type === 'AMOUNT_MISMATCH');
  assert.ok(f); assert.equal(f.confidence, 'NEEDS_REVIEW');
});

// 7. DUPLICATE: same ref twice in bank => DUPLICATE_IN_BANK (CERTAIN)
t('duplicate: double bank entry => DUPLICATE_IN_BANK CERTAIN', () => {
  const r = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 100 }, { ref: 'A', date: '2026-01-01', amount: 100 }]));
  const f = r.findings.find(x => x.type === 'DUPLICATE_IN_BANK');
  assert.ok(f); assert.equal(f.count, 2); assert.equal(f.confidence, 'CERTAIN');
});

// 8. AMBIGUOUS: date outside tolerance => DATE_MISMATCH NEEDS_REVIEW; inside tolerance => matched
t('ambiguous: date tolerance boundary', () => {
  const within = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-03', amount: 100 }]), { dateToleranceDays: 2 });
  assert.equal(within.matchedCount, 1);
  const beyond = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-05', amount: 100 }]), { dateToleranceDays: 2 });
  assert.equal(beyond.findings.find(f => f.type === 'DATE_MISMATCH').confidence, 'NEEDS_REVIEW');
});

// 9. HIDDEN ANOMALY: a MISSING_IN_LEDGER that only shows from the bank side is still caught
t('hidden: bank-only entry => MISSING_IN_LEDGER', () => {
  const r = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 100 }, { ref: 'GHOST', date: '2026-01-02', amount: 50 }]));
  assert.ok(r.findings.find(f => f.type === 'MISSING_IN_LEDGER' && f.ref === 'GHOST'));
});

// 10. NO-FALSE-SUCCESS (falsified): drop a real finding from the report => verifier FAILs (recall<1)
t('falsified: dropped finding => verifier FAIL', () => {
  const sandbox = join(tmp, 'sbx1'); cpSync(here, sandbox, { recursive: true });
  runPipeline({ outDir: sandbox, ledgerPath: join(sandbox, 'ledger.csv'), bankPath: join(sandbox, 'bank.csv') });
  const rp = join(sandbox, 'reconciliation-report.json');
  const rep = JSON.parse(readFileSync(rp, 'utf8'));
  rep.findings = rep.findings.filter(f => f.type !== 'MISSING_IN_BANK'); // falsify: hide a discrepancy
  writeFileSync(rp, JSON.stringify(rep));
  const v = verify({ reportPath: rp, ledgerPath: join(sandbox, 'ledger.csv'), bankPath: join(sandbox, 'bank.csv') });
  assert.equal(v.verdict, 'FAIL'); assert.ok(v.recall < 1);
});

// 11. NO-FALSE-SUCCESS (inflated): add a spurious finding => verifier FAILs (precision<1)
t('inflated: spurious finding => verifier FAIL', () => {
  const sandbox = join(tmp, 'sbx2'); cpSync(here, sandbox, { recursive: true });
  runPipeline({ outDir: sandbox, ledgerPath: join(sandbox, 'ledger.csv'), bankPath: join(sandbox, 'bank.csv') });
  const rp = join(sandbox, 'reconciliation-report.json');
  const rep = JSON.parse(readFileSync(rp, 'utf8'));
  rep.findings.push({ type: 'MISSING_IN_BANK', ref: 'FAKE-999', amount: 1 }); // inflate
  writeFileSync(rp, JSON.stringify(rep));
  const v = verify({ reportPath: rp, ledgerPath: join(sandbox, 'ledger.csv'), bankPath: join(sandbox, 'bank.csv') });
  assert.equal(v.verdict, 'FAIL'); assert.ok(v.precision < 1);
});

// 12. IDEMPOTENT: two identical runs => byte-identical reports
t('idempotent: repeated run => identical report', () => {
  const a = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }, { ref: 'B', date: '2026-01-02', amount: 50 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 100 }]));
  const b = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }, { ref: 'B', date: '2026-01-02', amount: 50 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 100 }]));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// 13. ENGINE/VERIFIER SEPARATION: positive path => verifier PASS recall=1 precision=1 (separate module recomputes)
t('separation: honest run => verifier PASS', () => {
  const sandbox = join(tmp, 'sbx3'); cpSync(here, sandbox, { recursive: true });
  const r = runPipeline({ outDir: sandbox, ledgerPath: join(sandbox, 'ledger.csv'), bankPath: join(sandbox, 'bank.csv') });
  assert.equal(r.verify.verdict, 'PASS'); assert.equal(r.verify.recall, 1); assert.equal(r.verify.precision, 1);
});

// 14. TRACEABILITY: every finding carries provenance + explain
t('traceability: findings have provenance + explain', () => {
  const r = reconcileRows(L([{ ref: 'A', date: '2026-01-01', amount: 100 }]), Bk([{ ref: 'A', date: '2026-01-01', amount: 90 }]));
  for (const f of r.findings) { assert.ok(f.explain && f.explain.length > 0); assert.ok(f.provenance); }
});

// 15. EXTRACTOR STUB CONTRACT: pdf/ocr throw NotImplemented + cost estimate; substitute + text-fixed are deterministic
t('extractor: pdf-llm NOT_IMPLEMENTED with cost estimate', () => {
  try { getExtractor('pdf-llm').extract('x'); assert.fail('should throw'); }
  catch (e) { assert.ok(e instanceof NotImplementedExtractor); assert.ok(e.costEstimate && e.costEstimate.estPerPageEUR); }
});
t('extractor: ocr NOT_IMPLEMENTED with cost estimate', () => {
  try { getExtractor('ocr').extract('x'); assert.fail('should throw'); }
  catch (e) { assert.ok(e instanceof NotImplementedExtractor); assert.ok(e.costEstimate); }
});
t('extractor: substitute is deterministic + labelled synthetic', () => {
  const sub = makeSubstituteExtractor([{ ref: 'A', date: '2026-01-01', amount: '10' }]);
  assert.equal(sub.substitute, true);
  const rows = sub.extract(); assert.equal(rows[0]._src.file, 'SUBSTITUTE');
});
t('extractor: text-fixed parses key:value invoice blocks', () => {
  const p = w('inv.txt', 'ref: INV-1\ndate: 2026-01-01\namount: 100\n\nref: INV-2\ndate: 2026-01-02\namount: 200\n');
  const rows = textFixedExtractor.extract(p);
  assert.equal(rows.length, 2); assert.equal(rows[0].ref, 'INV-1'); assert.equal(rows[1].amount, '200');
});

rmSync(tmp, { recursive: true, force: true });
console.log(`PIPELINE COVERAGE: pass=${pass} fail=${fail}`);
if (fail) { console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
