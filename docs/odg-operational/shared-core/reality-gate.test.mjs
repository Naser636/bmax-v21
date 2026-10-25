// ODG5 REALITY GATE regression tests — prove the gate REJECTS false claims (the amendment's §6 required list).
// Each test asserts a known false-success path is denied. Pure, deterministic, €0, Node>=18.
import assert from 'node:assert';
import { gate, assertComplete, classify, STATES } from './reality-gate.mjs';

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; failures.push(`${name}: ${e.message}`); } };

const SOURCE = { sourceInspected: true, files: ['x.mjs'] };
const TESTED = { ...SOURCE, testRun: true, exitCode: 0 };
const INTEGRATED = { ...TESTED, integrationRun: true, integrationExitCode: 0 };
const DEPLOYED = { ...INTEGRATED, deployRecord: 'rec', deployedVersion: 'v1', intendedVersion: 'v1' };
const RUNNING = { ...DEPLOYED, serviceHealthy: true, smokeTestPassed: true };
const ACCEPTED = { ...RUNNING, acceptanceCriteria: [{ id: 'c1', met: true }], independentChecksPassed: true, negativeTestsPassed: true };

// 1. a report alone cannot satisfy a verification gate
t('§6.1 report-only cannot reach TEST_VERIFIED', () => {
  const g = gate('TEST_VERIFIED', { ...SOURCE, reportOnly: true });
  assert.equal(g.granted, false); assert.match(g.reasons.join(), /report\/claim is not a test/);
});
// 2. skipped or failed tests cannot be reported as PASS
t('§6.2a skipped tests denied', () => { assert.equal(gate('TEST_VERIFIED', { ...SOURCE, testRun: true, skipped: true, exitCode: 0 }).granted, false); });
t('§6.2b non-zero exit denied', () => { assert.equal(gate('TEST_VERIFIED', { ...SOURCE, testRun: true, exitCode: 1 }).granted, false); });
t('§6.2c dependency-failed test denied', () => { assert.equal(gate('TEST_VERIFIED', { ...SOURCE, testRun: true, exitCode: 0, dependencyFailed: true }).granted, false); });
// 3. local success cannot be reported as VPS deployment
t('§6.3 TEST/INTEGRATION pass does NOT grant DEPLOYMENT', () => {
  const g = gate('DEPLOYMENT_VERIFIED', INTEGRATED); // no deployRecord
  assert.equal(g.granted, false); assert.equal(g.awarded, 'INTEGRATION_VERIFIED'); assert.match(g.reasons.join(), /local success is NOT deployment/);
});
// 4. deployment success cannot substitute for runtime behavior verification
t('§6.4 healthy DEPLOYMENT does NOT grant RUNTIME without a smoke test', () => {
  const g = gate('RUNTIME_VERIFIED', { ...DEPLOYED, serviceHealthy: true }); // healthy, but no smoke test
  assert.equal(g.granted, false); assert.equal(g.awarded, 'DEPLOYMENT_VERIFIED'); assert.match(g.reasons.join(), /smoke test/);
});
// 5. a version mismatch prevents deployment acceptance
t('§6.5 version mismatch blocks DEPLOYMENT', () => {
  const g = gate('DEPLOYMENT_VERIFIED', { ...INTEGRATED, deployRecord: 'r', deployedVersion: 'v0', intendedVersion: 'v1' });
  assert.equal(g.granted, false); assert.match(g.reasons.join(), /version mismatch/);
});
// 6. missing or contradictory evidence => NOT VERIFIED or BLOCKED
t('§6.6a contradictory evidence => BLOCKED', () => {
  const g = gate('TEST_VERIFIED', { ...TESTED, contradiction: true });
  assert.equal(g.blocked, true); assert.equal(g.awarded, 'BLOCKED');
});
t('§6.6b no evidence => classify NOT_VERIFIED', () => { assert.equal(classify({}).state, 'NOT_VERIFIED'); });
// 7. a completion claim is rejected when mandatory acceptance criteria remain unmet
t('§6.7a completion rejected with unmet acceptance criteria', () => {
  const g = assertComplete({ ...RUNNING, acceptanceCriteria: [{ id: 'c1', met: false }], independentChecksPassed: true, negativeTestsPassed: true });
  assert.equal(g.complete, false); assert.match(g.reasons.join(), /unmet/);
});
t('§6.7b completion rejected without negative tests', () => {
  const g = assertComplete({ ...RUNNING, acceptanceCriteria: [{ id: 'c1', met: true }], independentChecksPassed: true, negativeTestsPassed: false });
  assert.equal(g.complete, false);
});

// POSITIVE ladder: each full-evidence level grants exactly its state (no over/under-award)
t('positive: full evidence grants ACCEPTANCE_VERIFIED', () => { assert.equal(assertComplete(ACCEPTED).complete, true); });
t('positive: classify returns the highest evidenced rung', () => {
  assert.equal(classify(TESTED).state, 'TEST_VERIFIED');
  assert.equal(classify(DEPLOYED).state, 'DEPLOYMENT_VERIFIED');
  assert.equal(classify(RUNNING).state, 'RUNTIME_VERIFIED');
});
t('ladder: SOURCE evidence alone never awards TEST', () => {
  assert.equal(gate('TEST_VERIFIED', SOURCE).granted, false);
  assert.equal(gate('SOURCE_VERIFIED', SOURCE).granted, true);
});

console.log(`REALITY-GATE TESTS: pass=${pass} fail=${fail}`);
if (fail) { console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
