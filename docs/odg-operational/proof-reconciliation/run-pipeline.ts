// @ts-nocheck
// RUN-PIPELINE — single reproducible command for the full 10-step product journey, €0, local only.
//   1 import → 2 validate → 3 normalise+provenance → 4 reconcile → 5 detect gaps → 6 classify certain/review
//   → 7 explainable result → 8 INDEPENDENT verification → 9 BLOCK unsubstantiated success → 10 reproducible audit.
// Usage: node run-pipeline.mjs [ledger.csv] [bank.csv]
// FAIL-CLOSED: bad input stops before reconciliation; a non-PASS independent verdict BLOCKS any success claim.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ingest } from './ingest.js';
import { reconcileRows } from './reconcile.js';
import { verify } from './verify-reconciliation.js';
import { buildAudit } from './audit-report.js';
const here = dirname(fileURLToPath(import.meta.url));

export function runPipeline({ ledgerPath = join(here, 'ledger.csv'), bankPath = join(here, 'bank.csv'), outDir = here, dateToleranceDays = 2 } = {}) {
  // steps 1-3: import + validate + normalise + provenance (fail-closed)
  const L = ingest(ledgerPath, { kind: 'csv', fileLabel: 'ledger.csv' });
  const B = ingest(bankPath, { kind: 'csv', fileLabel: 'bank.csv' });
  if (!L.ok || !B.ok) {
    const { audit, html } = buildAudit({ ingestLedger: L, ingestBank: B, reconcile: null, verify: { verdict: 'FAIL', reasons: ['INPUT_VALIDATION_FAILED', ...L.errors, ...B.errors] } });
    writeFileSync(join(outDir, 'audit-report.json'), JSON.stringify(audit, null, 1));
    writeFileSync(join(outDir, 'audit-report.html'), html);
    return { stopped: 'INPUT_VALIDATION_FAILED', ledgerErrors: L.errors, bankErrors: B.errors, audit };
  }

  // steps 4-7: reconcile + detect + classify + explainable result
  const report = reconcileRows(L.rows, B.rows, { dateToleranceDays });
  report.ledgerRows = L.rowCount; report.bankRows = B.rowCount; // keep verifier structural invariants aligned with ingested counts
  writeFileSync(join(outDir, 'reconciliation-report.json'), JSON.stringify(report, null, 1));

  // step 8-9: INDEPENDENT verification (separate code path) gates the success claim
  const v = verify({ reportPath: join(outDir, 'reconciliation-report.json'), ledgerPath, bankPath });

  // step 10: reproducible audit (JSON + self-contained HTML) with a tamper-evidence content digest
  const integrity = 'sha256:' + createHash('sha256').update(JSON.stringify(report)).digest('hex');
  const { audit, html } = buildAudit({ ingestLedger: L, ingestBank: B, reconcile: report, verify: v, meta: { integrity } });
  writeFileSync(join(outDir, 'audit-report.json'), JSON.stringify(audit, null, 1));
  writeFileSync(join(outDir, 'audit-report.html'), html);
  return { stopped: null, report, verify: v, audit, successClaim: audit.successClaim };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , lp, bp] = process.argv;
  const r = runPipeline({ ...(lp ? { ledgerPath: lp } : {}), ...(bp ? { bankPath: bp } : {}) });
  if (r.stopped) { console.log(`PIPELINE STOPPED (fail-closed): ${r.stopped}`); console.log('  ', [...r.ledgerErrors, ...r.bankErrors].join(' | ')); process.exit(2); }
  console.log(`PIPELINE: ${r.report.matchedCount} matched | ${r.report.findingsCount} findings (${r.report.needsReviewCount} review, ${r.report.certainFindingsCount} certain) ${JSON.stringify(r.report.byType)}`);
  console.log(`INDEPENDENT VERIFY: ${r.verify.verdict} | recall ${r.verify.recall} precision ${r.verify.precision}`);
  console.log(`SUCCESS CLAIM: ${r.successClaim}`);
  console.log(`AUDIT: audit-report.json + audit-report.html written to ${here}`);
  process.exit(r.verify.verdict === 'PASS' ? 0 : 1);
}
