#!/usr/bin/env node

"use strict";

/*
 * C03 state-transition contract — targeted test (P0-CURRENT-069 C03-contract).
 *
 * Proves the contract + validator of runtime/core/state-transition.js: a well-formed transition is
 * accepted; every C03 invariant rejects a malformed transition; proof-requiring statuses demand
 * evidence; behaviour is deterministic; and the contract composes with an existing-surface state
 * snapshot (runtime-model-shaped objects) without importing or mutating it. Pure/hermetic: no I/O,
 * no git, no clock.
 */

const assert = require("assert");
const st = require("./state-transition");

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log("  ok -", name);
  passed += 1;
}

// A canonical, well-formed C03 transition fixture (reused and mutated per case).
function validTransition() {
  return {
    state_before: { phase: "P0", missions_open: 2 },
    action: { type: "RECORD_TRANSITION", by: "C03-contract" },
    observed_effect: { missions_open: 1, note: "one mission closed" },
    state_after: { phase: "P0", missions_open: 1 },
    state_version_before: 7,
    state_version_after: 8,
    difference: { missions_open: { before: 2, after: 1 } },
    evidence_refs: ["evidence/p0-069/transition.json"],
    verification_status: st.VERIFICATION_STATUS.VERIFIED,
  };
}

// ---- contract descriptor -----------------------------------------------------------------------
console.log("C03 contract descriptor");
ok("exposes the STATE_before -> ACTION -> OBSERVED_EFFECT -> STATE_after shape",
  st.C03_CONTRACT.shape === "STATE_before -> ACTION -> OBSERVED_EFFECT -> STATE_after");
ok("required fields cover versions, difference, evidence_refs and verification_status",
  ["state_before", "action", "observed_effect", "state_after", "state_version_before",
   "state_version_after", "difference", "evidence_refs", "verification_status"]
    .every((f) => st.REQUIRED_FIELDS.includes(f)));
ok("proof-requiring statuses are VERIFIED and REJECTED only",
  st.PROOF_REQUIRING.length === 2 &&
  st.PROOF_REQUIRING.includes("VERIFIED") && st.PROOF_REQUIRING.includes("REJECTED"));

// ---- a valid transition is accepted ------------------------------------------------------------
console.log("valid transition accepted");
{
  const r = st.validateStateTransition(validTransition());
  ok("well-formed transition ⇒ ok", r.ok === true);
  ok("no errors on a well-formed transition", r.errors.length === 0);
  ok("returns a normalized frozen record", r.record !== null && Object.isFrozen(r.record));
  ok("RECORDED status with no evidence is also accepted (not proof-requiring)", (() => {
    const t = validTransition();
    t.verification_status = st.VERIFICATION_STATUS.RECORDED;
    t.evidence_refs = [];
    return st.validateStateTransition(t).ok === true;
  })());
  ok("UNVERIFIED status with no evidence is accepted (not proof-requiring)", (() => {
    const t = validTransition();
    t.verification_status = st.VERIFICATION_STATUS.UNVERIFIED;
    t.evidence_refs = [];
    return st.validateStateTransition(t).ok === true;
  })());
}

// ---- malformed transitions rejected ------------------------------------------------------------
console.log("malformed transition rejected");
ok("non-object record ⇒ rejected", st.validateStateTransition(null).ok === false &&
  st.validateStateTransition("x").ok === false && st.validateStateTransition([]).ok === false);
for (const f of ["state_before", "state_after", "action", "observed_effect", "difference"]) {
  ok("missing " + f + " ⇒ rejected", (() => {
    const t = validTransition();
    delete t[f];
    const r = st.validateStateTransition(t);
    return r.ok === false && r.errors.some((e) => e.startsWith(f + ":"));
  })());
}
ok("empty action object ⇒ rejected", (() => {
  const t = validTransition(); t.action = {};
  return st.validateStateTransition(t).ok === false;
})());
ok("empty observed_effect string ⇒ rejected", (() => {
  const t = validTransition(); t.observed_effect = "   ";
  return st.validateStateTransition(t).ok === false;
})());

// ---- I2: strict version advance ----------------------------------------------------------------
console.log("state_version strict monotonic advance");
ok("after > before ⇒ accepted", st.validateStateTransition(validTransition()).ok === true);
ok("after == before ⇒ rejected", (() => {
  const t = validTransition(); t.state_version_after = t.state_version_before;
  const r = st.validateStateTransition(t);
  return r.ok === false && r.errors.some((e) => e.includes("strictly greater"));
})());
ok("after < before ⇒ rejected", (() => {
  const t = validTransition(); t.state_version_after = t.state_version_before - 1;
  return st.validateStateTransition(t).ok === false;
})());
ok("non-integer / negative versions ⇒ rejected", (() => {
  const t1 = validTransition(); t1.state_version_before = -1;
  const t2 = validTransition(); t2.state_version_after = 8.5;
  const t3 = validTransition(); t3.state_version_before = "7";
  return [t1, t2, t3].every((t) => st.validateStateTransition(t).ok === false);
})());

// ---- I3: evidence_refs controlled --------------------------------------------------------------
console.log("evidence_refs controlled");
ok("non-array evidence_refs ⇒ rejected", (() => {
  const t = validTransition(); t.evidence_refs = "evidence/x.json";
  return st.validateStateTransition(t).ok === false;
})());
ok("array with a non-string element ⇒ rejected", (() => {
  const t = validTransition(); t.evidence_refs = ["ok.json", 42];
  return st.validateStateTransition(t).ok === false;
})());

// ---- I4: verification_status controlled --------------------------------------------------------
console.log("verification_status controlled");
ok("unknown status ⇒ rejected", (() => {
  const t = validTransition(); t.verification_status = "MAYBE";
  const r = st.validateStateTransition(t);
  return r.ok === false && r.errors.some((e) => e.startsWith("verification_status:"));
})());
ok("missing status ⇒ rejected", (() => {
  const t = validTransition(); delete t.verification_status;
  return st.validateStateTransition(t).ok === false;
})());

// ---- I5: proof-requiring statuses demand evidence ----------------------------------------------
console.log("proof-requiring statuses demand evidence");
for (const s of ["VERIFIED", "REJECTED"]) {
  ok(s + " with empty evidence_refs ⇒ rejected", (() => {
    const t = validTransition(); t.verification_status = s; t.evidence_refs = [];
    const r = st.validateStateTransition(t);
    return r.ok === false && r.errors.some((e) => e.includes("requires at least one evidence_ref"));
  })());
  ok(s + " with >=1 evidence_ref ⇒ accepted", (() => {
    const t = validTransition(); t.verification_status = s; t.evidence_refs = ["e.json"];
    return st.validateStateTransition(t).ok === true;
  })());
}

// ---- I6: version advance implies a real change -------------------------------------------------
console.log("version advance implies a real change");
ok("identical state_before/state_after while version advances ⇒ rejected", (() => {
  const t = validTransition();
  t.state_after = { phase: "P0", missions_open: 2 }; // identical to state_before
  const r = st.validateStateTransition(t);
  return r.ok === false && r.errors.some((e) => e.includes("no observed change"));
})());
ok("key-order difference alone is NOT a real change (canonical equality) ⇒ rejected", (() => {
  const t = validTransition();
  t.state_before = { a: 1, b: 2 };
  t.state_after = { b: 2, a: 1 };
  return st.validateStateTransition(t).ok === false;
})());

// ---- I7: deterministic -------------------------------------------------------------------------
console.log("deterministic behaviour");
ok("same input ⇒ identical ok/errors across repeated calls", (() => {
  const bad = validTransition(); delete bad.state_after; bad.verification_status = "NOPE";
  const r1 = st.validateStateTransition(bad);
  const r2 = st.validateStateTransition(bad);
  return r1.ok === r2.ok && JSON.stringify(r1.errors) === JSON.stringify(r2.errors);
})());
ok("canonicalize is order-independent", st.canonicalize({ a: 1, b: 2 }) === st.canonicalize({ b: 2, a: 1 }));
ok("computeDifference is deterministic and reports only changed keys", (() => {
  const d1 = st.computeDifference({ x: 1, y: 2 }, { x: 1, y: 9 });
  const d2 = st.computeDifference({ y: 2, x: 1 }, { y: 9, x: 1 });
  return JSON.stringify(d1) === JSON.stringify(d2) &&
    Object.keys(d1).length === 1 && d1.y && d1.y.before === 2 && d1.y.after === 9;
})());
ok("validator performs no mutation of its input", (() => {
  const t = validTransition();
  const snapshot = JSON.stringify(t);
  st.validateStateTransition(t);
  return JSON.stringify(t) === snapshot;
})());

// ---- compatibility with existing surfaces ------------------------------------------------------
console.log("compatibility with existing surfaces");
ok("a runtime-model-shaped snapshot fits state_before/state_after unchanged", (() => {
  // Shape mirrors runtime/core/runtime-model.js snapshots (opaque nested objects) — accepted as-is.
  const t = validTransition();
  t.state_before = { dashboard: { missions: 4, proven: 2 }, queue: ["m1", "m2"] };
  t.state_after = { dashboard: { missions: 4, proven: 3 }, queue: ["m2"] };
  t.difference = st.computeDifference(t.state_before, t.state_after);
  const r = st.validateStateTransition(t);
  return r.ok === true && Object.keys(t.difference).length > 0;
})());
ok("verification_status vocabulary never claims done_when / SUCCESS",
  st.C03_CONTRACT.verificationStatuses.every((s) => !/SUCCESS|DONE_WHEN|PROVEN/i.test(s)));

console.log("\nC03 STATE-TRANSITION — " + passed + " assertions passed.");
