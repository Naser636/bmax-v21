// @ts-nocheck
// CROSS-DOMAIN INTEGRATION / NON-REGRESSION HARNESS (§9) — runs every A/B/C + shared-core suite and demonstrator
// and asserts each exits 0. This is the contract test that proves a change to the SHARED CORE (dep-planner /
// eval-metrics) breaks no domain. Reproducible, €0, no network. Run: node integration-test.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['SHARED-CORE  tests', 'shared-core/shared-core.test.mjs'],
  ['SHARED-CORE  v2 (retry/regress/lesson/otel)', 'shared-core/shared-core-v2.test.mjs'],
  ['GOVERNANCE   ODG5 reality-gate', 'shared-core/reality-gate.test.mjs'],
  ['SHARED-CORE  demo-A orchestration', 'shared-core/demo-orchestration.mjs'],
  ['SHARED-CORE  demo-B eval', 'shared-core/demo-eval.mjs'],
  ['DOMAIN-C     reconcile proof', 'proof-reconciliation/reconcile.test.mjs'],
  ['DOMAIN-C     pipeline coverage', 'proof-reconciliation/pipeline.test.mjs'],
  ['DOMAIN-C     extraction+normalize', 'proof-reconciliation/extraction-contract.test.mjs'],
  ['DOMAIN-C     run-pipeline (e2e)', 'proof-reconciliation/run-pipeline.mjs'],
  ['CROSS-DOMAIN contract (A+B+C)', 'cross-domain.test.mjs'],
];

let fail = 0; const lines = [];
for (const [label, rel] of SUITES) {
  const r = spawnSync('node', [join(here, rel)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) fail++;
  const last = (r.stdout || '').trim().split('\n').pop() || (r.stderr || '').trim().split('\n').pop() || '';
  lines.push(`  ${ok ? '✓' : '✗'} ${label.padEnd(36)} exit=${r.status}  ${last.slice(0, 80)}`);
}
console.log('CROSS-DOMAIN INTEGRATION (A/B/C + shared core):');
console.log(lines.join('\n'));
console.log(fail === 0 ? `INTEGRATION: PASS (${SUITES.length}/${SUITES.length} suites green)` : `INTEGRATION: FAIL (${fail} suite(s) red)`);
process.exit(fail === 0 ? 0 : 1);
