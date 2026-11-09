#!/usr/bin/env node
"use strict";

// NOTE: ALL inputs here are SYNTHETIC technical fixtures — never real evidence. The "independent-looking" provenance is a
// fixture to exercise the REAL-admission path mechanically; it unblocks nothing in the canonical register (seams are mocks).
const T = require("./external-input-intake");
const PROV = require("./evidence-provenance.js");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

function stamp(payload: any, descriptor: any): any { return PROV.stampProvenance({ ...payload, provenanceDescriptor: descriptor }, {}); }
const INDEP = { author: "acme-labs", independentOfEvaluee: true, sourceRef: "https://acme/x", labellingMethod: "human-third-party", devValidationSeparated: true };
const SELF = { author: "odg", independentOfEvaluee: false, sourceRef: "self", labellingMethod: "odg-self" };

// a deps builder with recording mock seams.
function mkDeps(over: any = {}): any {
  const rec: any = { audit: [], applied: 0, updated: 0, verified: 0, rolledBack: 0 };
  const d: any = {
    persistAudit: (r: any) => { rec.audit.push(r); return { ok: true }; },
    permissions: { canApplyReal: over.canApplyReal !== false },
    apply: over.apply || ((dec: any) => { rec.applied++; return { ok: true, effect: { kind: dec.kind }, proofAdmissible: over.proofAdmissible !== false, rollbackToken: "RB1" }; }),
    updateRegisters: (eff: any) => { rec.updated++; return { ok: true, unblocked: ["<mock-unblocked>"] }; },
    verify: over.verify || (() => { rec.verified++; return { ok: over.verifyOk !== false }; }),
    rollback: (t: any) => { rec.rolledBack++; return { ok: true }; },
    seenDigests: over.seenDigests || new Set(),
    now: "2026-11-09",
  };
  return { d, rec };
}

// (1) REAL admission with permission + admissible proof + verify ok ⇒ APPLIED_REAL, registers updated, audit persisted.
{
  const { d, rec } = mkDeps();
  const out = T.processIntake({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "c1" }] }, INDEP), payload: { cases: [{ id: "c1" }] } }, d);
  check(out.stage === T.OUT.APPLIED_REAL && out.applied === true, "real+perm+proof+verify ⇒ APPLIED_REAL");
  check(out.unblocked.length > 0 && rec.updated === 1 && rec.verified === 1, "registers updated + independently verified");
  check(rec.audit.length >= 1, "audit persisted for the real application");
}

// (2) REJECTED (self-authored declared real) ⇒ NEVER applied, but audit STILL persisted.
{
  const { d, rec } = mkDeps();
  const out = T.processIntake({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "c1" }] }, SELF), payload: { cases: [{ id: "c1" }] } }, d);
  check(out.stage === T.OUT.REJECTED && out.applied === false, "self-authored declared-real ⇒ REJECTED, not applied");
  check(rec.applied === 0 && rec.updated === 0, "a rejected input triggers NO apply / NO register update");
  check(rec.audit.length >= 1, "audit persisted even for a REJECTED input (traceability unconditional)");
}

// (3) SYNTHETIC admitted ⇒ SIM only, unblocks NOTHING, no register update.
{
  const { d, rec } = mkDeps();
  const out = T.processIntake({ kind: "DEMAND_SIGNAL", declaredReal: false, stamped: stamp({ signals: [{ kind: "LOI" }] }, INDEP), payload: { signals: [{ kind: "LOI" }] } }, d);
  check(out.stage === T.OUT.APPLIED_SYNTHETIC && out.unblocked.length === 0, "synthetic ⇒ APPLIED_SYNTHETIC, unblocks nothing");
  check(rec.updated === 0, "synthetic never updates a real register item");
}

// (4) REAL admission WITHOUT permission ⇒ ESCALATED, not applied (audit persisted).
{
  const { d, rec } = mkDeps({ canApplyReal: false });
  const out = T.processIntake({ kind: "BILLING_PROOF", declaredReal: true, stamped: stamp({ transactions: [{ amount: 1 }] }, INDEP), payload: { transactions: [{ amount: 1 }] } }, d);
  check(out.stage === T.OUT.ESCALATED && out.applied === false && rec.applied === 0, "real without permission ⇒ ESCALATED, not applied");
}

// (5) REAL admission but harness yields NO admissible proof ⇒ NO_PROOF, nothing unblocked, staged effect rolled back.
{
  const { d, rec } = mkDeps({ proofAdmissible: false });
  const out = T.processIntake({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "c1" }] }, INDEP), payload: { cases: [{ id: "c1" }] } }, d);
  check(out.stage === T.OUT.NO_PROOF && out.unblocked.length === 0, "no admissible proof ⇒ NO_PROOF, nothing unblocked");
  check(rec.updated === 0 && rec.rolledBack === 1, "no register update; staged effect rolled back");
}

// (6) REAL admission applied but independent VERIFY fails ⇒ ROLLED_BACK.
{
  const { d, rec } = mkDeps({ verifyOk: false });
  const out = T.processIntake({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "c1" }] }, INDEP), payload: { cases: [{ id: "c1" }] } }, d);
  check(out.stage === T.OUT.ROLLED_BACK && out.applied === false, "verify failure ⇒ ROLLED_BACK");
  check(rec.rolledBack === 1, "rollback invoked on verify failure (reversible)");
}

// (7) DUPLICATE: re-ingesting the same content ⇒ REJECTED the second time (dedup across the shared seen-set).
{
  const seen = new Set();
  const { d: d1 } = mkDeps({ seenDigests: seen });
  const env = { kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "dup" }] }, INDEP), payload: { cases: [{ id: "dup" }] } };
  const first = T.processIntake(env, d1);
  const { d: d2 } = mkDeps({ seenDigests: seen });
  const second = T.processIntake(env, d2);
  check(first.stage === T.OUT.APPLIED_REAL && second.stage === T.OUT.REJECTED, "idempotent: first APPLIED, second (same digest) REJECTED");
}

// (8) audit-persist failure ⇒ fail-closed, not applied (no untraceable application).
{
  const d: any = { persistAudit: () => ({ ok: false }), permissions: { canApplyReal: true }, apply: () => ({ ok: true, proofAdmissible: true }), seenDigests: new Set(), now: "t" };
  const out = T.processIntake({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({ cases: [{ id: "c1" }] }, INDEP), payload: { cases: [{ id: "c1" }] } }, d);
  check(out.stage === T.OUT.REJECTED && out.applied === false, "audit persist failure ⇒ fail-closed (not applied)");
}

// contract invariants present.
check(/REJECTED input is NEVER applied/i.test(JSON.stringify(T.EXTERNAL_INPUT_INTAKE_CONTRACT.invariants)), "contract: rejected never applied");
check(/simulation never becomes real proof/i.test(JSON.stringify(T.EXTERNAL_INPUT_INTAKE_CONTRACT.invariants)), "contract: synthetic never real");
check(/ROLLED BACK|rolled back/i.test(JSON.stringify(T.EXTERNAL_INPUT_INTAKE_CONTRACT.invariants)), "contract: failed-verify rolled back");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 EXTERNAL-INPUT INTAKE (operational wiring, synthetic fixtures)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
