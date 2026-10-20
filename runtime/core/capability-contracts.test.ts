#!/usr/bin/env node
// @ts-nocheck — L5 bulk test convention (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/* V2-C1 — CAPABILITY CONTRACTS conformance test.
 *
 * Proves the Autonomous Engineering OS has a machine-readable, COMPLETE, and FAITHFUL per-capability contract
 * SSOT (CAPABILITY_EFFECT), not a prose description. Specifically:
 *  - every dispatchable executor has a contract (no DANGLING executor), and every contract maps to a real
 *    executor (no ORPHAN / dead declaration) — a strict 1:1;
 *  - every contract is COMPLETE + well-typed on the required V2 dimensions
 *    (effect, control, purpose, idempotent, failureClass, evidence);
 *  - every contract is BACKED BY A REAL executable matcher+runner — i.e. it describes a capability that can
 *    actually run, not an aspirational declaration (NON_EXECUTABLE check);
 *  - the deny-by-default governance verdict is preserved (unregistered ⇒ refused; registered ⇒ allowed).
 *
 * Pure + deterministic: no network, no filesystem writes, no clock/random. */

"use strict";

const assert = require("assert");
const { EXECUTORS, CAPABILITY_EFFECT, contractConformance, effectRegistryVerdict } = require("./capability-executors.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// 1 — the whole contract map conforms: no dangling/orphan, complete fields, backed by real executors.
{
  const violations = contractConformance(EXECUTORS, CAPABILITY_EFFECT);
  ok(`contractConformance clean (violations: ${JSON.stringify(violations)})`, Array.isArray(violations) && violations.length === 0);
}

// 2 — strict 1:1 between executors and contracts (set equality on capability name).
{
  const execNames = new Set(EXECUTORS.map((e) => e.capability));
  const contractNames = new Set(Object.keys(CAPABILITY_EFFECT));
  const sameSize = execNames.size === contractNames.size && execNames.size === EXECUTORS.length;
  let subset = true;
  for (const n of execNames) if (!contractNames.has(n)) subset = false;
  for (const n of contractNames) if (!execNames.has(n)) subset = false;
  ok("executors <-> contracts are a strict 1:1 (no dangling, no orphan, no dup)", sameSize && subset);
}

// 3 — every contract is backed by a REAL executable matcher+runner (not a non-executable declaration).
{
  let allExecutable = true;
  for (const n of Object.keys(CAPABILITY_EFFECT)) {
    const e = EXECUTORS.find((x) => x.capability === n);
    if (!e || typeof e.matches !== "function" || typeof e.run !== "function") allExecutable = false;
  }
  ok("every contract is backed by a matches()+run() executor", allExecutable);
}

// 4 — every contract declares the required V2 machine-readable dimensions, well-typed and non-empty.
{
  let complete = true;
  for (const c of Object.values(CAPABILITY_EFFECT)) {
    if (c.effect !== "consequential" && c.effect !== "observational") complete = false;
    if (typeof c.idempotent !== "boolean") complete = false;
    for (const f of ["control", "purpose", "failureClass", "evidence"]) {
      if (typeof c[f] !== "string" || !c[f].trim()) complete = false;
    }
  }
  ok("every contract has complete+typed {effect,control,purpose,idempotent,failureClass,evidence}", complete);
}

// 5 — every consequential capability names a non-empty governing control (the authz precondition).
{
  let governed = true;
  for (const [n, c] of Object.entries(CAPABILITY_EFFECT)) {
    if (c.effect === "consequential" && (!c.control || !c.control.trim())) { governed = false; void n; }
  }
  ok("every consequential capability declares a governing control", governed);
}

// 6 — contractConformance DETECTS a dangling executor (an executor with no contract).
{
  const fakeExec = EXECUTORS.concat([{ capability: "Ungoverned New Cap", matches: () => false, run: () => ({}) }]);
  const violations = contractConformance(fakeExec, CAPABILITY_EFFECT);
  ok("detects DANGLING_EXECUTOR (executor without a contract)", violations.some((v) => /DANGLING_EXECUTOR.*Ungoverned New Cap/.test(v)));
}

// 7 — contractConformance DETECTS an orphan contract (a contract with no executor).
{
  const fakeContracts = Object.assign({}, CAPABILITY_EFFECT, { "Dead Declaration": { effect: "observational", control: "x", purpose: "x", idempotent: true, failureClass: "x", evidence: "x" } });
  const violations = contractConformance(EXECUTORS, fakeContracts);
  ok("detects ORPHAN_CONTRACT (contract without an executor)", violations.some((v) => /ORPHAN_CONTRACT.*Dead Declaration/.test(v)));
}

// 8 — contractConformance DETECTS an incomplete contract (missing a required field).
{
  const bad = Object.assign({}, CAPABILITY_EFFECT, { "Connectivity Audit": { effect: "observational", control: "x", purpose: "", idempotent: true, failureClass: "x", evidence: "x" } });
  const violations = contractConformance(EXECUTORS, bad);
  ok("detects INCOMPLETE_CONTRACT (empty required field)", violations.some((v) => /INCOMPLETE_CONTRACT.*purpose/.test(v)));
}

// 9 — governance preserved: an unregistered capability is refused (deny-by-default); a registered one is allowed.
{
  const refused = effectRegistryVerdict("No Such Capability");
  const allowed = effectRegistryVerdict("Connectivity Audit");
  ok("deny-by-default: unregistered ⇒ refused; registered ⇒ allowed",
    refused && refused.ok === false && /UNREGISTERED_CAPABILITY/.test(refused.reason) && allowed && allowed.ok === true);
}

console.log(`\ncapability-contracts — ${passed} assertions passed.`);
