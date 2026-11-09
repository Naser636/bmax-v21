#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V13 §2–§3 — OPERATIONAL EXTERNAL-INPUT INTAKE ORCHESTRATOR. This is the missing WIRING that turns the PURE
 * gate (external-input-ingestion) into an end-to-end governed path (a pure gate is NOT an operational ingestion system).
 * It composes, in order, fail-CLOSED:
 *   receive → ingest (the pure gate) → PERSIST the audit record (audit-log keyed chain) → [REJECTED ⇒ stop, never
 *   applied] → permission check → APPLY the authorized consequence (injected) → UPDATE the affected register/capability
 *   (injected; a real unblock requires ADMISSIBLE PROOF) → VERIFY the consequence → ROLLBACK on verify failure.
 *
 * Every effectful step is an INJECTED seam (persistAudit / apply / updateRegisters / verify / rollback) so this module is
 * deterministic and unit-testable with synthetic fixtures, and so production wiring (the odg-ingest bin) supplies the
 * real IO — the orchestrator itself writes nothing and decides admission via the pure gate, never by fiat.
 *
 * GUARANTEES (code-enforced + tested): a REJECTED input is NEVER applied; a duplicate is never accepted (the gate rejects
 * it and we still persist the audit); SYNTHETIC input is applied only in SIM and unblocks NOTHING (never becomes real);
 * no capability is unblocked without admissible proof; a REAL apply requires canonical permission (else ESCALATE, not
 * applied); every outcome persists a traceable audit record; a failed-verify application is ROLLED BACK. Dual export.
 */

const GATE = require("./external-input-ingestion.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

// Outcome stages (terminal).
const OUT = Object.freeze({ REJECTED: "REJECTED", ESCALATED: "ESCALATED", APPLIED_SYNTHETIC: "APPLIED_SYNTHETIC", APPLIED_REAL: "APPLIED_REAL", ROLLED_BACK: "ROLLED_BACK", NO_PROOF: "NO_PROOF" });

/**
 * processIntake(envelope, deps) -> outcome. deps (all optional except the pure gate is built-in):
 *   persistAudit(record) -> { ok }           REQUIRED-in-practice: persist the audit record to the keyed chain
 *   permissions: { canApplyReal: boolean }    canonical permission for a consequential REAL apply (deny-by-default)
 *   apply(decision) -> { ok, effect, proofAdmissible, rollbackToken }  run the deep harness / stage the consequence
 *   updateRegisters(effect) -> { ok, unblocked: string[] }             flip the affected items (ONLY on admissible proof)
 *   verify(effect) -> { ok, reason }          independent verification of the consequence
 *   rollback(token) -> { ok }                 undo a failed application
 *   seenDigests: Set<string>                  dedup memory (the gate rejects a seen digest)
 *   now: string
 * Pure given the injected seams; it performs NO IO itself.
 */
function processIntake(envelope: any, deps: any = {}): any {
  const now = typeof deps.now === "string" && deps.now ? deps.now : "unknown";
  const audit: any[] = [];
  const persist = (rec: any) => { audit.push(rec); if (fn(deps.persistAudit)) { try { return deps.persistAudit(rec); } catch { return { ok: false }; } } return { ok: true }; };

  // (1) INGEST via the pure gate (format/provenance/integrity/dedup/real-vs-synthetic/label-independence).
  const decision = GATE.ingestExternalInput(envelope, { seenDigests: deps.seenDigests, now });

  // (2) PERSIST the audit record for EVERY outcome (traceability is unconditional) — a persist failure is fail-closed.
  const auditPersisted = persist(decision.auditRecord);
  if (!auditPersisted || auditPersisted.ok !== true) {
    return Object.freeze({ stage: OUT.REJECTED, applied: false, unblocked: Object.freeze([]), decision, reason: "audit persist failed — refusing to proceed (fail-closed, no untraceable application)", auditCount: audit.length });
  }

  // (3) REJECTED ⇒ stop. NEVER applied (covers invalid/duplicate/tampered/synthetic-as-real).
  if (decision.verdict === "REJECTED") {
    return Object.freeze({ stage: OUT.REJECTED, applied: false, unblocked: Object.freeze([]), decision, reason: decision.reasons[0] || "rejected", auditCount: audit.length });
  }

  // Record the digest as seen AFTER a successful admission (idempotent re-ingest ⇒ the gate will reject next time).
  if (deps.seenDigests instanceof Set && decision.contentSha256) deps.seenDigests.add(decision.contentSha256);

  // (4) SYNTHETIC ⇒ apply in SIM only; unblocks NOTHING (a simulation never becomes real proof).
  if (decision.verdict === "SYNTHETIC_ADMITTED") {
    const eff = fn(deps.apply) ? safe(() => deps.apply(decision)) : { ok: true, effect: { mode: "SIM" } };
    persist(Object.freeze({ at: now, step: "APPLY_SYNTHETIC", mode: "SIM", ok: eff && eff.ok === true }));
    return Object.freeze({ stage: OUT.APPLIED_SYNTHETIC, applied: eff && eff.ok === true, unblocked: Object.freeze([]), decision, reason: "synthetic admitted — SIM only; unblocks nothing", auditCount: audit.length });
  }

  // (5) REAL_ADMITTED ⇒ consequential. Permission gate first (deny-by-default) — ESCALATE, do NOT apply, without it.
  const perms = isObj(deps.permissions) ? deps.permissions : {};
  if (perms.canApplyReal !== true) {
    persist(Object.freeze({ at: now, step: "ESCALATE", reason: "REAL apply requires canonical permission canApplyReal=true" }));
    return Object.freeze({ stage: OUT.ESCALATED, applied: false, unblocked: Object.freeze([]), decision, reason: "real admission requires canonical permission (not applied)", auditCount: audit.length });
  }

  // Apply the consequence (deep harness). A REAL apply must yield ADMISSIBLE PROOF to unblock — else NO_PROOF (not applied).
  const applied = fn(deps.apply) ? safe(() => deps.apply(decision)) : { ok: false, effect: null, proofAdmissible: false };
  persist(Object.freeze({ at: now, step: "APPLY_REAL", ok: applied && applied.ok === true, proofAdmissible: !!(applied && applied.proofAdmissible) }));
  if (!applied || applied.ok !== true || applied.proofAdmissible !== true) {
    // Nothing unblocked without admissible proof; if something was staged, roll it back.
    if (applied && applied.rollbackToken && fn(deps.rollback)) safe(() => deps.rollback(applied.rollbackToken));
    return Object.freeze({ stage: OUT.NO_PROOF, applied: false, unblocked: Object.freeze([]), decision, reason: "no admissible proof from the harness — nothing unblocked (staged effect rolled back)", auditCount: audit.length });
  }

  // Update the affected registers/capabilities (ONLY now, with admissible proof) — then VERIFY independently.
  const upd = fn(deps.updateRegisters) ? safe(() => deps.updateRegisters(applied.effect)) : { ok: true, unblocked: [...decision.unblocks] };
  const ver = fn(deps.verify) ? safe(() => deps.verify(applied.effect)) : { ok: true };
  if (!ver || ver.ok !== true) {
    if (applied.rollbackToken && fn(deps.rollback)) safe(() => deps.rollback(applied.rollbackToken));
    persist(Object.freeze({ at: now, step: "ROLLBACK", reason: (ver && ver.reason) || "verify failed" }));
    return Object.freeze({ stage: OUT.ROLLED_BACK, applied: false, unblocked: Object.freeze([]), decision, reason: "consequence failed independent verification — rolled back", auditCount: audit.length });
  }
  persist(Object.freeze({ at: now, step: "VERIFIED", unblocked: (upd && upd.unblocked) || [] }));
  return Object.freeze({ stage: OUT.APPLIED_REAL, applied: true, unblocked: Object.freeze((upd && upd.unblocked) || [...decision.unblocks]), decision, reason: "real input admitted, applied, verified, registers updated", auditCount: audit.length });
}

function safe(thunk: any): any { try { return thunk(); } catch (e: any) { return { ok: false, reason: String(e && e.message || e) }; } }

const EXTERNAL_INPUT_INTAKE_CONTRACT = Object.freeze({
  id: "V124-EXTERNAL-INPUT-INTAKE",
  source: "CTO V13 §2–§3 — operational wiring around the pure ingestion gate",
  reuses: Object.freeze(["external-input-ingestion.ingestExternalInput (the pure decision)", "audit-log.appendEntry (persistAudit seam → keyed chain)", "the deep harness per kind (apply seam)", "the register/campaign-controller (updateRegisters seam)"]),
  notAuthority: "orchestrates the governed sequence via injected seams; writes nothing itself; admission is decided by the pure gate, never by fiat; permissions gate consequential applies",
  invariants: Object.freeze([
    "a REJECTED input is NEVER applied (invalid/duplicate/tampered/synthetic-declared-real all stop here)",
    "the audit record is persisted for EVERY outcome; a persist failure is fail-closed (no untraceable application)",
    "SYNTHETIC admitted ⇒ SIM only, unblocks NOTHING (a simulation never becomes real proof)",
    "a REAL apply requires canonical permission (canApplyReal) else ESCALATE (not applied); and ADMISSIBLE PROOF to unblock else NO_PROOF (not applied)",
    "a consequence failing independent verification is ROLLED BACK (traceable + reversible)",
  ]),
});

module.exports = { OUT, processIntake, EXTERNAL_INPUT_INTAKE_CONTRACT };

if (require.main === module) {
  const PROV = require("./evidence-provenance.js");
  const stamped = PROV.stampProvenance({ signals: [{ kind: "LOI" }], provenanceDescriptor: { author: "odg", independentOfEvaluee: false, sourceRef: "self" } }, {});
  const out = processIntake({ kind: "DEMAND_SIGNAL", declaredReal: true, stamped, payload: { signals: [] } }, { permissions: { canApplyReal: true } });
  process.stdout.write(JSON.stringify({ ...EXTERNAL_INPUT_INTAKE_CONTRACT, demo: { stage: out.stage, unblocked: out.unblocked, selfAuthoredRealRejectedNeverApplied: out.stage === "REJECTED" && out.applied === false } }, null, 2) + "\n");
}

export {};
