'use strict';

/**
 * Tests for WIRE_EXPERT_PROFILE_ASSEMBLER_V1.
 * Run: node runtime/core/nl-objective-gateway.expert.test.js
 *
 * Proves the gateway's compile() attaches a mission-scoped §303 Expert Instance,
 * bounded by the mission authority passed in, selecting ENGINEERING vs ECONOMIC
 * from the EXISTING classifier, and that the gateway stays a side-effect-free dry-run.
 */

const assert = require('assert');
const gateway = require('./nl-objective-gateway');

let passed = 0;
function ok(label, fn) { fn(); passed += 1; console.log(`  ok - ${label}`); }

// Engineering-flavoured objective (no financial signal).
const eng = gateway.compile('implement and verify the runtime capability router fix for the team', {
  missionAuthority: ['read_repo', 'run_local_tests'],
});

ok('compile attaches an expert instance', () => {
  assert.ok(eng.expert && typeof eng.expert === 'object', 'no expert field');
  assert.ok(!eng.expert.error, `expert errored: ${eng.expert.error}`);
});

ok('non-financial objective binds the ENGINEERING profile', () => {
  assert.strictEqual(eng.expert.role, 'ENGINEERING_EXPERT');
  assert.strictEqual(eng.expert.scope, 'ENGINEERING');
});

ok('expert exposes §303 required fields + profile status/flags', () => {
  for (const f of ['mission_id', 'role', 'scope', 'allowed_capabilities',
    'allowed_tools', 'authority_scope', 'validators', 'expiration_condition',
    'evidence_obligations', 'profile_status', 'flags', 'cannot_modify']) {
    assert.ok(f in eng.expert, `missing §303 field: ${f}`);
  }
  assert.ok(eng.expert.flags.includes('UNCERTIFIED:validation-engine'));
});

ok('authority_scope ⊆ the mission authority passed in (§307, never increased)', () => {
  const passedAuth = ['read_repo', 'run_local_tests'];
  for (const a of eng.expert.authority_scope) assert.ok(passedAuth.includes(a), `leaked authority: ${a}`);
});

ok('no mission authority ⇒ empty authority_scope (never self-granted from the profile)', () => {
  const noAuth = gateway.compile('implement the runtime capability router fix for the team', {});
  assert.deepStrictEqual(noAuth.expert.authority_scope, []);
});

// Financial objective ⇒ ECONOMIC profile (existing classifier: externalEffect FINANCIAL).
const eco = gateway.compile('charge the customer and record the payment transaction for the invoice', {});
ok('financial objective binds the ECONOMIC profile', () => {
  assert.strictEqual(eco.expert.role, 'ECONOMIC_EXPERT');
  assert.strictEqual(eco.expert.scope, 'ECONOMIC');
});

ok('gateway remains a side-effect-free dry-run (no provider/external/write counters)', () => {
  assert.strictEqual(eng.mode, 'DRY_RUN');
  assert.strictEqual(eng.providerCalls, 0);
  assert.strictEqual(eng.externalCalls, 0);
  assert.strictEqual(eng.externalWrites, 0);
  assert.strictEqual(eng.evidence, 'NONE (dry-run)');
});

ok('determinism: identical objective ⇒ identical expert binding', () => {
  const a = gateway.compile('implement the router fix for the team', { missionAuthority: ['read_repo'] });
  const b = gateway.compile('implement the router fix for the team', { missionAuthority: ['read_repo'] });
  assert.deepStrictEqual(a.expert, b.expert);
});

console.log(`\nnl-objective-gateway.expert: ${passed} assertions passed`);
