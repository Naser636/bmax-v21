#!/usr/bin/env node
"use strict";

const P = require("./metier-parcours");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const allow = { canExecute: () => true };
const auditOK = () => ({ ok: true });
// a fully-specified clean dependency (synthetic fixture) ⇒ the real P3 guard ADMITs.
const CLEAN = { name: "left-pad", version: "1.3.0", license: "MIT", integrity: "sha512-abc" };
const TYPOSQUAT = { name: "reakt", version: "^1.0.0" };

// (A) FULL E2E on P3 with the REAL guard: clean dep ⇒ CLOSED/ADMIT; traceable; independent assurance reproduced.
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t", seenDigests: new Set() });
  check(out.stage === "CLOSED" && out.decision === "ADMIT" && out.admit === true, "A clean dep ⇒ CLOSED + ADMIT (full parcours via the real P3 guard)");
  check(out.assurance === "reproduced" && out.traceable === true, "A independent assurance reproduced + traceable");
  check(out.auditTrail.length >= 1, "A audit trail recorded");
}
// (B) FULL E2E on P3: a typosquat ⇒ CLOSED/REJECT (the parcours surfaces the guard's REJECT, still a governed closure).
{
  const out = P.runParcours({ metier: "P3", payload: TYPOSQUAT, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(out.stage === "CLOSED" && out.decision === "REJECT" && out.admit === false, "B typosquat/unpinned ⇒ CLOSED + REJECT");
}

// (C) RÉSILIENCE [§5] — permission refused (deny-by-default) ⇒ PERMISSION_REFUSED, guard never runs.
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: { canExecute: () => false }, audit: auditOK, now: "t" });
  check(out.stage === "PERMISSION_REFUSED", "C permission refused ⇒ PERMISSION_REFUSED");
}
check(P.runParcours({ metier: "P3", payload: CLEAN }, { audit: auditOK }).stage === "PERMISSION_REFUSED", "C no permission seam at all ⇒ deny-by-default");

// (D) RÉSILIENCE — capability unavailable (guard resolve throws) ⇒ CAPABILITY_UNAVAILABLE.
{
  const guards = { P3: { resolve: () => { throw new Error("module missing"); } } };
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { guards, permissions: allow, audit: auditOK });
  check(out.stage === "CAPABILITY_UNAVAILABLE", "D guard resolve throws ⇒ CAPABILITY_UNAVAILABLE");
}
// (E) RÉSILIENCE — unknown métier ⇒ UNKNOWN_METIER.
check(P.runParcours({ metier: "P99", payload: {} }, { permissions: allow, audit: auditOK }).stage === "UNKNOWN_METIER", "E unknown métier ⇒ UNKNOWN_METIER");
// (F) RÉSILIENCE — execution throws (guard that throws) ⇒ EXECUTION_FAILED.
{
  const guards = { PX: { resolve: () => () => { throw new Error("boom"); } } };
  check(P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK }).stage === "EXECUTION_FAILED", "F guard throws at run ⇒ EXECUTION_FAILED");
}
// (G) RÉSILIENCE — invalid result (guard returns no ADMIT/REJECT) ⇒ INVALID_RESULT.
{
  const guards = { PX: { resolve: () => () => ({ whatever: 1 }) } };
  check(P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK }).stage === "INVALID_RESULT", "G no ADMIT/REJECT ⇒ INVALID_RESULT");
}
// (H) RÉSILIENCE — assurance failure (decision does not reproduce / custom assurer fails) ⇒ ASSURANCE_FAILED.
{
  const guards = { PX: { resolve: () => () => ({ decision: "ADMIT" }) } };
  const out = P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK, assure: () => ({ ok: false, reason: "independent check disagreed" }) });
  check(out.stage === "ASSURANCE_FAILED", "H assurance fails ⇒ ASSURANCE_FAILED (not CLOSED)");
}
// (I) RÉSILIENCE — dedup: an identical request is DUPLICATE on the second run (idempotent).
{
  const seen = new Set();
  const first = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: auditOK, seenDigests: seen });
  const second = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: auditOK, seenDigests: seen });
  check(first.stage === "CLOSED" && second.stage === "DUPLICATE", "I identical request ⇒ first CLOSED, second DUPLICATE");
}
// (J) RÉSILIENCE — closure/traceability failure (audit persist fails) ⇒ CLOSURE_FAILED (fail-closed, no silent close).
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: () => ({ ok: false }), now: "t" });
  check(out.stage === "CLOSURE_FAILED" && out.traceable === false, "J audit persist failure ⇒ CLOSURE_FAILED (not CLOSED)");
}

// contract invariants.
check(/permission is deny-by-default/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: deny-by-default");
check(/independent assurance must pass/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: assurance before CLOSED");
check(/modifies no register|unblock nothing canonical/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: no canonical mutation");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 MÉTIER PARCOURS E2E\n");
process.exit(failures === 0 ? 0 : 1);

export {};
