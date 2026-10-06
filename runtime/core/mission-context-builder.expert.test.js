'use strict';

/**
 * Tests for ATTACH_EXPERT_INSTANCE_TO_MISSION_CONTEXT_V1.
 * Run: node runtime/core/mission-context-builder.expert.test.js
 *
 * Proves buildMissionContext() attaches a declarative, mission-scoped §303 Expert Instance,
 * selected from the EXISTING mission signal, with authority_scope [] (no invented authority),
 * while leaving every pre-existing MissionContext field intact (inert / additive).
 */

const assert = require('assert');
const { buildMissionContext } = require('./mission-context-builder');

let passed = 0;
function ok(label, fn) { fn(); passed += 1; console.log(`  ok - ${label}`); }

// Deterministic stub plan + no runtime scan (injected loaders — no disk, no spawn).
function build(planOverrides) {
  const plan = Object.assign({
    mission: 'TEST_MISSION',
    mode: 'SEQUENTIAL',
    requiresEngineering: true,
    authorizedPaths: ['runtime/core/**'],
    objectives: [{ id: 'obj-1', goal: 'do the thing' }, { id: 'obj-2', goal: 'and the other' }],
    nextObjective: 'obj-1',
    definitionOfDone: ['tests green'],
    completion: [],
  }, planOverrides || {});
  return buildMissionContext('TEST_MISSION', {
    loadPlan: () => plan,
    loadRuntime: () => null,
  });
}

const eng = build();

ok('attaches an expertInstance', () => {
  assert.ok(eng.expertInstance && typeof eng.expertInstance === 'object', 'no expertInstance');
});

ok('requiresEngineering ⇒ ENGINEERING profile, bound to the mission', () => {
  assert.strictEqual(eng.expertInstance.role, 'ENGINEERING_EXPERT');
  assert.strictEqual(eng.expertInstance.mission_id, 'TEST_MISSION');
  assert.strictEqual(eng.expertInstance.objective_id, 'obj-1');
});

ok('authority_scope is [] (no authority vocabulary invented, §307)', () => {
  assert.deepStrictEqual(eng.expertInstance.authority_scope, []);
});

ok('explicit plan.expertProfile=ECONOMIC ⇒ ECONOMIC profile', () => {
  const eco = build({ expertProfile: 'ECONOMIC', requiresEngineering: false });
  assert.strictEqual(eco.expertInstance.role, 'ECONOMIC_EXPERT');
  assert.strictEqual(eco.expertInstance.profile_status, 'CERTIFIED');
});

ok('default (no signal) ⇒ ENGINEERING', () => {
  const def = build({ requiresEngineering: false });
  assert.strictEqual(def.expertInstance.role, 'ENGINEERING_EXPERT');
});

ok('field is additive — every pre-existing MissionContext field intact', () => {
  for (const f of ['version', 'source', 'mission', 'mode', 'priority', 'requiresEngineering',
    'authorizedPaths', 'objectives', 'nextObjective', 'definitionOfDone', 'completion',
    'contract', 'runtime', 'runtimeComplete', 'results', 'logs', 'errors']) {
    assert.ok(f in eng, `missing pre-existing field: ${f}`);
  }
  assert.strictEqual(eng.objectives.length, 2);
  assert.deepStrictEqual(eng.definitionOfDone, ['tests green']);
});

ok('determinism: identical plan ⇒ identical expertInstance', () => {
  assert.deepStrictEqual(build().expertInstance, build().expertInstance);
});

ok('carries §303 invariant', () => {
  assert.deepStrictEqual(eng.expertInstance.cannot_modify,
    ['constitution', 'authority_model', 'final_governance', 'unrelated_missions']);
});

console.log(`\nmission-context-builder.expert: ${passed} assertions passed`);
