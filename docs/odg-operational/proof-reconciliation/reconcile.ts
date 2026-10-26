// @ts-nocheck
// Phase E DELIVERABLE — bank/ledger reconciliation engine (the "agent" work product). Reads ledger.csv + bank.csv,
// matches entries, classifies every discrepancy (AMOUNT_MISMATCH / MISSING_IN_BANK / MISSING_IN_LEDGER /
// DUPLICATE_IN_BANK / DATE_MISMATCH), and writes a structured reconciliation report. Pure, deterministic, €0.
// FAIL-CLOSED: malformed/missing input => throws with a reason (no silent partial result). Idempotent.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

function parseCsv(path, required) {
  if (!existsSync(path)) throw new Error('INPUT_MISSING: ' + path);
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  if (lines.length < 2) throw new Error('INPUT_EMPTY: ' + path);
  const cols = lines[0].split(',');
  for (const r of required) if (!cols.includes(r)) throw new Error(`INPUT_MALFORMED: ${path} missing column "${r}" (have ${cols.join(',')})`);
  return lines.slice(1).map((l, i) => {
    const v = l.split(',');
    if (v.length !== cols.length) throw new Error(`INPUT_MALFORMED: ${path} row ${i + 2} has ${v.length} fields, expected ${cols.length}`);
    const o = Object.fromEntries(cols.map((c, j) => [c, v[j]]));
    o.amount = Number(o.amount);
    if (Number.isNaN(o.amount)) throw new Error(`INPUT_MALFORMED: ${path} row ${i + 2} amount not numeric: "${v[cols.indexOf('amount')]}"`);
    return o;
  });
}
const daysBetween = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

// Classification policy: which finding types are CERTAIN vs need HUMAN REVIEW. Explainable + traceable.
const REVIEW_TYPES = new Set(['AMOUNT_MISMATCH', 'DATE_MISMATCH']); // ambiguous (typo? rounding? timing?) -> human
const EXPLAIN = {
  MISSING_IN_BANK: 'Booked in the ledger but no matching bank entry cleared (possible unpaid/uncleared).',
  MISSING_IN_LEDGER: 'Cleared in the bank but not booked in the ledger (possible unrecorded transaction).',
  DUPLICATE_IN_BANK: 'The same reference cleared more than once in the bank (possible double charge).',
  AMOUNT_MISMATCH: 'Reference matches but the amount differs (possible keying error / partial payment).',
  DATE_MISMATCH: 'Reference+amount match but the date is outside tolerance (timing difference).',
};

// Reconcile pre-ingested, normalised rows (each row may carry a `_src` provenance stamp). Pure, deterministic.
export function reconcileRows(ledger, bank, { dateToleranceDays = 2 } = {}) {
  const bankByRef = {}; for (const b of bank) (bankByRef[b.ref] ??= []).push(b);
  const ledgerRefs = new Set(ledger.map(l => l.ref));
  const findings = []; const matched = [];
  const stamp = (r) => r && r._src ? r._src : undefined;
  const add = (f, l, b) => findings.push({ ...f, confidence: REVIEW_TYPES.has(f.type) ? 'NEEDS_REVIEW' : 'CERTAIN', explain: EXPLAIN[f.type], provenance: { ledger: stamp(l), bank: stamp(b) } });

  for (const l of ledger) {
    const hits = bankByRef[l.ref] || [];
    if (hits.length === 0) { add({ type: 'MISSING_IN_BANK', ref: l.ref, amount: l.amount }, l); continue; }
    if (hits.length > 1) add({ type: 'DUPLICATE_IN_BANK', ref: l.ref, amount: hits[0].amount, count: hits.length }, l, hits[0]);
    const b = hits[0];
    if (Math.abs(b.amount - l.amount) > 0.005) { add({ type: 'AMOUNT_MISMATCH', ref: l.ref, ledgerAmount: l.amount, bankAmount: b.amount }, l, b); continue; }
    if (daysBetween(l.date, b.date) > dateToleranceDays) { add({ type: 'DATE_MISMATCH', ref: l.ref, ledgerDate: l.date, bankDate: b.date }, l, b); continue; }
    matched.push({ ref: l.ref, amount: l.amount, confidence: 'CERTAIN', provenance: { ledger: stamp(l), bank: stamp(b) } });
  }
  for (const b of bank) if (!ledgerRefs.has(b.ref)) add({ type: 'MISSING_IN_LEDGER', ref: b.ref, amount: b.amount }, null, b);

  return {
    generated: 'deterministic', ledgerRows: ledger.length, bankRows: bank.length, dateToleranceDays,
    matchedCount: matched.length, findingsCount: findings.length,
    needsReviewCount: findings.filter(f => f.confidence === 'NEEDS_REVIEW').length,
    certainFindingsCount: findings.filter(f => f.confidence === 'CERTAIN').length,
    byType: findings.reduce((a, f) => (a[f.type] = (a[f.type] || 0) + 1, a), {}),
    matched, findings,
    ledgerTotal: +ledger.reduce((a, l) => a + l.amount, 0).toFixed(2),
    bankTotal: +bank.reduce((a, b) => a + b.amount, 0).toFixed(2),
  };
}

export function reconcile({ ledgerPath = join(here, 'ledger.csv'), bankPath = join(here, 'bank.csv'), dateToleranceDays = 2 } = {}) {
  const ledger = parseCsv(ledgerPath, ['ref', 'date', 'amount']).map((r, i) => ({ ...r, _src: { file: 'ledger.csv', line: i + 2 } }));
  const bank = parseCsv(bankPath, ['ref', 'date', 'amount']).map((r, i) => ({ ...r, _src: { file: 'bank.csv', line: i + 2 } }));
  return reconcileRows(ledger, bank, { dateToleranceDays });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = reconcile();
  writeFileSync(join(here, 'reconciliation-report.json'), JSON.stringify(report, null, 1));
  console.log(`RECONCILE: ${report.matchedCount} matched | ${report.findingsCount} findings ${JSON.stringify(report.byType)} | ledgerΣ €${report.ledgerTotal} bankΣ €${report.bankTotal}`);
}
