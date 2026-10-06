'use strict';

/**
 * Expert Profile Assembler (EXPERT_PROFILE_ASSEMBLY_V1)
 *
 * Makes the canonical ODG model operational over components that ALREADY exist.
 * Canon: docs/odg-master-v5/source/ODG_FINAL_MASTER_V5_FICHE_05.md
 *   §302 Expert Profile  = Knowledge + Skills + Tools + Constraints + Validators
 *                          + Performance History + Failure Knowledge + Permission Scope (DURABLE)
 *   §303 Expert Instance = Profile + Mission Context + Temporary State (EPHEMERAL),
 *                          mission-scoped, authority-bounded, evidence-producing, auto-expiring.
 *                          "An Expert cannot modify the Constitution, authority model,
 *                           final governance, or unrelated missions."
 *   §307 Expert Assembly Compiler: "The compiler cannot increase authority inherited
 *                          from the mission."
 *   §308 Profile lifecycle: CANDIDATE -> TESTED -> CERTIFIED -> ACTIVE ...
 *
 * This module is PURE and READ-ONLY with respect to the repository:
 *   - it never writes, spawns, executes capabilities, or grants authority;
 *   - it resolves each declared component against the real tree and reports whether it
 *     exists and is certified (a sibling *.test.js present);
 *   - it binds a mission-scoped §303 instance whose authority is the INTERSECTION of the
 *     mission authority and the profile permission scope (never a superset).
 *
 * It creates no new primitive, kernel, agent runtime, or governance mechanism.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Canonical profile lifecycle (§308), restricted to the states this assembler can assert.
const PROFILE_STATUS = Object.freeze({
  CERTIFIED: 'CERTIFIED', // every declared capability+validator resolves and is certified
  DEGRADED: 'DEGRADED',   // resolves, but at least one declared component is uncertified
  BROKEN: 'BROKEN',       // at least one declared component file is missing
});

function resolveComponent(component) {
  const rel = component.file;
  const abs = path.resolve(REPO_ROOT, rel);
  const exists = fs.existsSync(abs) && fs.statSync(abs).size > 0;
  let certified = false;
  let testPath = null;
  if (component.test) {
    testPath = component.test;
    const tabs = path.resolve(REPO_ROOT, component.test);
    certified = fs.existsSync(tabs) && fs.statSync(tabs).size > 0;
  }
  return {
    name: component.name,
    role: component.role || null,
    file: rel,
    exists,
    certified,
    test: testPath,
    limitation: component.limitation || null,
  };
}

function loadProfile(profilePath) {
  const abs = path.resolve(REPO_ROOT, profilePath);
  const raw = fs.readFileSync(abs, 'utf8');
  const profile = JSON.parse(raw);
  if (!profile || typeof profile !== 'object') {
    throw new Error(`invalid profile: ${profilePath}`);
  }
  for (const key of ['id', 'canon', 'permission_scope']) {
    if (!(key in profile)) throw new Error(`profile ${profilePath} missing "${key}"`);
  }
  return profile;
}

/**
 * Verify a durable §302 profile against the real tree. Pure; returns a report.
 */
function verifyProfile(profile) {
  const capabilities = (profile.capabilities || []).map(resolveComponent);
  const validators = (profile.validators || []).map(resolveComponent);
  const all = capabilities.concat(validators);

  const missing = all.filter((c) => !c.exists).map((c) => c.name);
  const uncertified = all.filter((c) => c.exists && !c.certified).map((c) => c.name);
  const limitations = all.filter((c) => c.limitation)
    .map((c) => ({ name: c.name, limitation: c.limitation }));

  let status;
  if (missing.length > 0) status = PROFILE_STATUS.BROKEN;
  else if (uncertified.length > 0) status = PROFILE_STATUS.DEGRADED;
  else status = PROFILE_STATUS.CERTIFIED;

  const flags = [];
  for (const n of missing) flags.push(`MISSING:${n}`);
  for (const n of uncertified) flags.push(`UNCERTIFIED:${n}`);
  for (const l of limitations) flags.push(`LIMITATION:${l.name}:${l.limitation}`);

  return {
    id: profile.id,
    canon: profile.canon,
    status,
    capabilities,
    validators,
    missing,
    uncertified,
    limitations,
    flags,
  };
}

/**
 * Intersect two authority scopes. The result is always a SUBSET of `mission`
 * (§307: the compiler cannot increase authority inherited from the mission).
 */
function boundAuthority(missionAuthority, profileAuthority) {
  const mission = Array.isArray(missionAuthority) ? missionAuthority : [];
  const profile = Array.isArray(profileAuthority) ? profileAuthority : [];
  const profileSet = new Set(profile);
  // Grant only what the mission already carries AND the profile is permitted to use.
  return mission.filter((a) => profileSet.has(a));
}

/**
 * Compile a mission-scoped §303 Expert Instance from a durable profile.
 * Produces a data record only; it executes nothing and grants no new authority.
 *
 * @param {object} profile   durable §302 profile (as loaded)
 * @param {object} mission   { mission_id, objective_id, authority:[], budget, expiration }
 */
function compileInstance(profile, mission) {
  if (!mission || !mission.mission_id) throw new Error('compileInstance requires mission.mission_id');
  const report = verifyProfile(profile);

  const authority = boundAuthority(mission.authority, (profile.permission_scope || {}).authority);
  // Instance may bind only components that actually resolve and are certified.
  const boundCapabilities = report.capabilities.filter((c) => c.exists && c.certified).map((c) => c.name);
  const boundValidators = report.validators.filter((c) => c.exists && c.certified).map((c) => c.name);

  return {
    // §303 required fields
    mission_id: mission.mission_id,
    objective_id: mission.objective_id || null,
    role: `${profile.id}_EXPERT`,
    scope: profile.id,
    allowed_capabilities: boundCapabilities,
    allowed_tools: profile.tools || [],
    data_scope: (profile.permission_scope || {}).data_scope || 'mission',
    authority_scope: authority,            // SUBSET of mission.authority (never a superset)
    policy_scope: (profile.permission_scope || {}).policy_scope || 'inherit',
    expected_output: mission.expected_output || null,
    validators: boundValidators,
    budget: mission.budget || null,
    stop_conditions: profile.constraints || [],
    expiration_condition: mission.expiration || 'mission_end',
    evidence_obligations: profile.evidence_obligations || [],
    // binding context
    profile_status: report.status,
    flags: report.flags,
    // §303 hard invariant, asserted explicitly
    cannot_modify: ['constitution', 'authority_model', 'final_governance', 'unrelated_missions'],
  };
}

module.exports = {
  PROFILE_STATUS,
  REPO_ROOT,
  resolveComponent,
  loadProfile,
  verifyProfile,
  boundAuthority,
  compileInstance,
};
