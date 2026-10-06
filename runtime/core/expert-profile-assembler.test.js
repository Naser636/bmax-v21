'use strict';

/**
 * Tests for EXPERT_PROFILE_ASSEMBLY_V1.
 * Run: node runtime/core/expert-profile-assembler.test.js
 *
 * Asserts the assembler binds the two profiles to REAL, existing components,
 * reports certification honestly, and never increases authority (§307).
 */

const assert = require('assert');
const {
  PROFILE_STATUS,
  loadProfile,
  verifyProfile,
  boundAuthority,
  compileInstance,
} = require('./expert-profile-assembler');

let passed = 0;
function ok(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${label}`);
}

// --- ENGINEERING ---------------------------------------------------------
const eng = loadProfile('runtime/profiles/engineering.json');
const engReport = verifyProfile(eng);

ok('engineering: every declared component file resolves on disk', () => {
  const all = engReport.capabilities.concat(engReport.validators);
  for (const c of all) assert.strictEqual(c.exists, true, `missing file for ${c.name}: ${c.file}`);
});

ok('engineering: status DEGRADED (two uncertified components flagged, not hidden)', () => {
  assert.strictEqual(engReport.status, PROFILE_STATUS.DEGRADED);
  assert.deepStrictEqual(engReport.uncertified.sort(), ['patch-executor', 'validation-engine']);
  assert.ok(engReport.flags.includes('UNCERTIFIED:patch-executor'));
  assert.ok(engReport.flags.includes('UNCERTIFIED:validation-engine'));
});

ok('engineering: no component silently claimed certified without a real test file', () => {
  const all = engReport.capabilities.concat(engReport.validators);
  for (const c of all) {
    if (c.certified) assert.ok(c.test, `${c.name} marked certified but has no test path`);
  }
});

// --- ECONOMIC ------------------------------------------------------------
const eco = loadProfile('runtime/profiles/economic.json');
const ecoReport = verifyProfile(eco);

ok('economic: every declared component file resolves on disk', () => {
  const all = ecoReport.capabilities.concat(ecoReport.validators);
  for (const c of all) assert.strictEqual(c.exists, true, `missing file for ${c.name}: ${c.file}`);
});

ok('economic: status CERTIFIED (all declared components have green tests)', () => {
  assert.strictEqual(ecoReport.status, PROFILE_STATUS.CERTIFIED);
  assert.strictEqual(ecoReport.uncertified.length, 0);
});

ok('economic: zero-rate catalog limitation is surfaced, not buried', () => {
  assert.ok(
    ecoReport.flags.some((f) => f.startsWith('LIMITATION:price-resolution')),
    'expected a price-resolution limitation flag',
  );
});

// --- §307 authority bound ------------------------------------------------
ok('boundAuthority: result is always a subset of mission authority', () => {
  const mission = ['read_repo', 'run_local_tests'];
  const profile = ['read_repo', 'run_local_tests', 'apply_patch_in_write_set'];
  const bound = boundAuthority(mission, profile);
  assert.deepStrictEqual(bound, ['read_repo', 'run_local_tests']); // 'apply_patch...' NOT granted
  for (const a of bound) assert.ok(mission.includes(a));
});

// --- §303 instance compilation ------------------------------------------
ok('compileInstance: engineering instance binds only certified capabilities', () => {
  const inst = compileInstance(eng, {
    mission_id: 'TEST_M1',
    objective_id: 'obj-1',
    authority: ['read_repo', 'run_local_tests', 'apply_patch_in_write_set', 'local_ff_git_integration'],
  });
  assert.strictEqual(inst.role, 'ENGINEERING_EXPERT');
  // patch-executor is uncertified -> must NOT be bound
  assert.ok(!inst.allowed_capabilities.includes('patch-executor'));
  assert.ok(inst.allowed_capabilities.includes('build-recovery'));
  // validation-engine uncertified -> not a bound validator
  assert.ok(!inst.validators.includes('validation-engine'));
  assert.ok(inst.validators.includes('mechanical-acceptance'));
});

ok('compileInstance: instance authority cannot exceed mission authority (§307)', () => {
  const inst = compileInstance(eng, {
    mission_id: 'TEST_M2',
    authority: ['read_repo'], // narrower than the profile permission scope
  });
  assert.deepStrictEqual(inst.authority_scope, ['read_repo']);
});

ok('compileInstance: carries the §303 hard invariant and required fields', () => {
  const inst = compileInstance(eco, { mission_id: 'TEST_M3', authority: ['read_repo'] });
  for (const field of [
    'mission_id', 'role', 'scope', 'allowed_capabilities', 'allowed_tools',
    'authority_scope', 'validators', 'expiration_condition', 'evidence_obligations',
  ]) {
    assert.ok(field in inst, `instance missing §303 field: ${field}`);
  }
  assert.deepStrictEqual(inst.cannot_modify,
    ['constitution', 'authority_model', 'final_governance', 'unrelated_missions']);
});

ok('compileInstance: requires a mission_id (no unscoped instance)', () => {
  assert.throws(() => compileInstance(eng, {}), /mission_id/);
});

console.log(`\nexpert-profile-assembler: ${passed} assertions passed`);
