// @ts-nocheck
// Phase E fixture generator — synthetic month-end BANK RECONCILIATION dataset with PLANTED discrepancies + an
// answer key (ground truth). Deterministic (no randomness) => reproducible. €0, no network. Represents a real,
// costly B2B process: matching an accounting LEDGER against a BANK statement and surfacing every discrepancy.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });

// LEDGER: what accounting expects (invoices booked). {ref,date,amount,vendor}
const ledger = [
  { ref: 'INV-1001', date: '2026-03-02', amount: 2450.00, vendor: 'Atlas Hosting' },
  { ref: 'INV-1002', date: '2026-03-03', amount: 780.50, vendor: 'Brightline SaaS' },
  { ref: 'INV-1003', date: '2026-03-05', amount: 12900.00, vendor: 'Corefab GmbH' },
  { ref: 'INV-1004', date: '2026-03-06', amount: 149.99, vendor: 'Deltamail' },
  { ref: 'INV-1005', date: '2026-03-08', amount: 1200.00, vendor: 'Evergreen Legal' },   // AMOUNT_MISMATCH (bank 1020.00)
  { ref: 'INV-1006', date: '2026-03-10', amount: 3300.00, vendor: 'Forge Logistics' },
  { ref: 'INV-1007', date: '2026-03-11', amount: 59.00, vendor: 'Gridpoint' },
  { ref: 'INV-1008', date: '2026-03-12', amount: 8450.75, vendor: 'Helios Energy' },
  { ref: 'INV-1009', date: '2026-03-14', amount: 420.00, vendor: 'Ionix Parts' },
  { ref: 'INV-1010', date: '2026-03-15', amount: 6700.00, vendor: 'Juno Consulting' },     // MISSING_IN_BANK (unpaid)
  { ref: 'INV-1011', date: '2026-03-17', amount: 230.25, vendor: 'Kestrel Office' },
  { ref: 'INV-1012', date: '2026-03-18', amount: 1540.00, vendor: 'Lumen Freight' },       // DATE_MISMATCH (bank 03-22)
  { ref: 'INV-1013', date: '2026-03-20', amount: 95.00, vendor: 'Mica Tools' },
  { ref: 'INV-1014', date: '2026-03-21', amount: 2750.00, vendor: 'Nimbus Cloud' },
  { ref: 'INV-1015', date: '2026-03-23', amount: 540.40, vendor: 'Oak & Pine' },
];

// BANK: what actually cleared. Most match; planted discrepancies below.
const bank = [
  { ref: 'INV-1001', date: '2026-03-02', amount: 2450.00, desc: 'Atlas Hosting' },
  { ref: 'INV-1002', date: '2026-03-03', amount: 780.50, desc: 'Brightline SaaS' },
  { ref: 'INV-1003', date: '2026-03-05', amount: 12900.00, desc: 'Corefab GmbH' },
  { ref: 'INV-1004', date: '2026-03-06', amount: 149.99, desc: 'Deltamail' },
  { ref: 'INV-1005', date: '2026-03-08', amount: 1020.00, desc: 'Evergreen Legal' },        // AMOUNT_MISMATCH (ledger 1200.00)
  { ref: 'INV-1006', date: '2026-03-10', amount: 3300.00, desc: 'Forge Logistics' },
  { ref: 'INV-1007', date: '2026-03-11', amount: 59.00, desc: 'Gridpoint' },
  { ref: 'INV-1008', date: '2026-03-12', amount: 8450.75, desc: 'Helios Energy' },
  { ref: 'INV-1008', date: '2026-03-12', amount: 8450.75, desc: 'Helios Energy' },           // DUPLICATE (double charge)
  { ref: 'INV-1009', date: '2026-03-14', amount: 420.00, desc: 'Ionix Parts' },
  { ref: 'INV-1011', date: '2026-03-17', amount: 230.25, desc: 'Kestrel Office' },
  { ref: 'INV-1012', date: '2026-03-22', amount: 1540.00, desc: 'Lumen Freight' },           // DATE_MISMATCH (ledger 03-18)
  { ref: 'INV-1013', date: '2026-03-20', amount: 95.00, desc: 'Mica Tools' },
  { ref: 'INV-1014', date: '2026-03-21', amount: 2750.00, desc: 'Nimbus Cloud' },
  { ref: 'INV-1015', date: '2026-03-23', amount: 540.40, desc: 'Oak & Pine' },
  { ref: 'TXN-9000', date: '2026-03-24', amount: 999.00, desc: 'Unknown Vendor Pmt' },       // MISSING_IN_LEDGER (unbooked)
];

// ANSWER KEY (ground truth) — the discrepancies an auditor would expect to be flagged.
const answerKey = {
  dateToleranceDays: 2,
  expectedFindings: [
    { type: 'AMOUNT_MISMATCH', ref: 'INV-1005', ledgerAmount: 1200.00, bankAmount: 1020.00 },
    { type: 'MISSING_IN_BANK', ref: 'INV-1010', amount: 6700.00 },
    { type: 'MISSING_IN_LEDGER', ref: 'TXN-9000', amount: 999.00 },
    { type: 'DUPLICATE_IN_BANK', ref: 'INV-1008', amount: 8450.75, count: 2 },
    { type: 'DATE_MISMATCH', ref: 'INV-1012', ledgerDate: '2026-03-18', bankDate: '2026-03-22' },
  ],
  expectedMatchedCount: 12, // 15 ledger refs − 3 discrepant (INV-1005 amount, INV-1010 missing, INV-1012 date); INV-1008 matches one of its duplicate pair
};

const toCsv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => r[c]).join(','))].join('\n') + '\n';
writeFileSync(join(here, 'ledger.csv'), toCsv(ledger, ['ref', 'date', 'amount', 'vendor']));
writeFileSync(join(here, 'bank.csv'), toCsv(bank, ['ref', 'date', 'amount', 'desc']));
writeFileSync(join(here, 'answer-key.json'), JSON.stringify(answerKey, null, 1));
console.log(`fixtures: ledger ${ledger.length} rows, bank ${bank.length} rows, ${answerKey.expectedFindings.length} planted findings`);
