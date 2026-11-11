#!/usr/bin/env node
"use strict";
/* V139 — CONTROLLED FAULT-INJECTION harness. Drives the 10 named fault scenarios through ODG's REAL canonical FDIR engine
 * (fdir-engine: DETECT→CLASSIFY→ISOLATE→DECIDE→RECOVER→INDEPENDENT-VERIFY→EVIDENCE) with INJECTED recovery/verify deps, plus
 * an unpermitted-recovery case and an evidence-integrity case (audit-log tamper-evidence). Each scenario asserts a SAFETY
 * INVARIANT (not just a happy path): recovery is PASS only if permitted + executed + independently verified; a failed restore
 * is NEVER declared operational; incoherent state without a verified reference ⇒ SAFE_MODE; repeated failure ⇒ bounded breaker
 * (no loop); unpermitted recovery ⇒ ESCALATE. Hermetic (no real disk/network/process). Reuses canonical mechanisms only. */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const FDIR = require(path.join(ROOT, "runtime", "core", "fdir-engine.js"));
const AUDIT = require(path.join(ROOT, "runtime", "core", "audit-log.js"));

const okRecover = (action: string) => ({ ok: true, stateRef: "ref-" + action });
const failRecover = () => ({ ok: false });
const okVerify = () => ({ ok: true });
const failVerify = () => ({ ok: false });

// Each scenario: a fault signal + deps + the SAFETY invariant it must satisfy (predicate over the fdir outcome `o`).
const SCENARIOS: any[] = [
  { id: "disk-exhaustion", fault: "RESOURCE_ANOMALY", signal: { type: "RESOURCE_ANOMALY", severity: 6 }, deps: { permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.status === "RECOVERED" && o.verified === true && o.operational === true, expect: "bounded retry, recovered ONLY after independent verify" },
  { id: "provider-outage", fault: "SERVICE_DOWN", signal: { type: "SERVICE_DOWN", severity: 7 }, deps: { permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "CIRCUIT_BREAK" && o.operational === true, expect: "dependency down ⇒ circuit-break (bounded), recover+verify" },
  { id: "model-timeout", fault: "TIMEOUT", signal: { type: "TIMEOUT", severity: 5 }, deps: { ctx: { maxRetries: 2 }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "BOUNDED_RETRY" && o.operational === true, expect: "transient timeout ⇒ bounded retry (≤max)" },
  { id: "interrupted-mission", fault: "STATE_INCOHERENCE", signal: { type: "STATE_INCOHERENCE", severity: 6 }, deps: { ctx: { hasVerifiedReference: true }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "VERIFIED_ROLLBACK" && o.operational === true, expect: "incoherent state + verified reference ⇒ verified rollback" },
  { id: "partial-execution", fault: "STATE_INCOHERENCE", signal: { type: "STATE_INCOHERENCE", severity: 6 }, deps: { ctx: { hasVerifiedReference: false }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.status === "SAFE_MODE" && o.operational === false, expect: "incoherent state with NO verified reference ⇒ SAFE_MODE (no blind rollback)" },
  { id: "stale-corrupted-evidence", fault: "DATA_CORRUPTION", signal: { type: "DATA_CORRUPTION", severity: 6 }, deps: { ctx: { hasVerifiedReference: true }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "VERIFIED_ROLLBACK" && o.operational === true, expect: "corrupt evidence ⇒ rollback to the verified reference (corrupt data never trusted)" },
  { id: "network-interruption", fault: "SERVICE_DOWN", signal: { type: "SERVICE_DOWN", severity: 5 }, deps: { permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "CIRCUIT_BREAK" && o.operational === true, expect: "network down ⇒ circuit-break + reconnect (bounded)" },
  { id: "repeated-recovery-failure", fault: "REPEATED_FAILURE", signal: { type: "REPEATED_FAILURE", severity: 6 }, deps: { history: { priorFailures: 3 }, permissions: { canRecover: true }, recover: failRecover, verify: okVerify }, safety: (o: any) => o.status === "RECOVERY_FAILED" && o.operational === false, expect: "persistent + recovery fails ⇒ RECOVERY_FAILED, NOT operational (no loop, fail-closed)" },
  { id: "restart-storm", fault: "REPEATED_FAILURE", signal: { type: "REPEATED_FAILURE", severity: 7 }, deps: { history: { priorFailures: 5 }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.action === "CIRCUIT_BREAK" && o.operational === true, expect: "restart storm (persistent) ⇒ breaker opens (bounded); cf. odg-recover.sh attempt-cap + unit StartLimitBurst" },
  { id: "failed-backup-restoration", fault: "STATE_INCOHERENCE", signal: { type: "STATE_INCOHERENCE", severity: 6 }, deps: { ctx: { hasVerifiedReference: true }, permissions: { canRecover: true }, recover: failRecover, verify: okVerify }, safety: (o: any) => o.status === "RECOVERY_FAILED" && o.operational === false, expect: "backup RESTORE FAILS ⇒ RECOVERY_FAILED, NEVER declared operational (the critical safety property)" },
  // additional safety cases
  { id: "unpermitted-recovery", fault: "RESOURCE_ANOMALY", signal: { type: "RESOURCE_ANOMALY", severity: 6 }, deps: { permissions: { canRecover: false }, recover: okRecover, verify: okVerify }, safety: (o: any) => o.status === "ESCALATED" && o.operational === false, expect: "consequential recovery WITHOUT permission ⇒ ESCALATE (no self-authorized recovery)" },
  { id: "unverified-recovery", fault: "TIMEOUT", signal: { type: "TIMEOUT", severity: 5 }, deps: { permissions: { canRecover: true }, recover: okRecover, verify: failVerify }, safety: (o: any) => o.status === "UNVERIFIED" && o.operational === false, expect: "recovery runs but INDEPENDENT verify FAILS ⇒ UNVERIFIED, NOT operational (verify is the sole arbiter)" },
];

function runScenarios(): any {
  const results = SCENARIOS.map((sc) => {
    let o: any, err: string | null = null;
    try { o = FDIR.runFdir(sc.signal, sc.deps); } catch (e: any) { err = (e && e.message) || String(e); o = {}; }
    let safe = false; try { safe = !err && !!sc.safety(o); } catch { safe = false; }
    return { id: sc.id, fault: sc.fault, status: o.status, action: o.action, operational: o.operational, safetyHeld: safe, expect: sc.expect, trailSteps: Array.isArray(o.trail) ? o.trail.length : 0 };
  });

  // Evidence integrity — a recovery trail sealed into the canonical tamper-evident audit chain is verifiable, and ANY tamper
  // is detected (recovery evidence cannot be silently altered). This is the DATA-integrity half of resilience.
  const sample = FDIR.runFdir({ type: "STATE_INCOHERENCE", severity: 6 }, { ctx: { hasVerifiedReference: true }, permissions: { canRecover: true }, recover: okRecover, verify: okVerify });
  let chain: any[] = [];
  for (const step of sample.trail) chain = AUDIT.appendEntry(chain, step);
  const intact = AUDIT.verifyChain(chain).ok === true;
  const tampered = chain.map((e: any, i: number) => (i === 1 ? { ...e, payload: { ...e.payload, step: "TAMPERED" } } : e));
  const tamperDetected = AUDIT.verifyChain(tampered).ok === false;
  const evidenceIntegrity = { sealed: chain.length, intactVerified: intact, tamperDetected };

  const allSafe = results.every((r) => r.safetyHeld) && intact && tamperDetected;
  return { results, evidenceIntegrity, summary: { scenarios: results.length, safetyHeld: results.filter((r) => r.safetyHeld).length, allSafe } };
}

if (require.main === module) {
  const out = runScenarios();
  const dossier = {
    "//": "V139 controlled fault-injection — 10 named fault scenarios + unpermitted/unverified recovery + evidence-integrity, driven through the canonical fdir-engine (hermetic, injected deps). Each asserts a SAFETY INVARIANT: recovery PASS only if permitted+executed+independently-verified; failed restore never operational; incoherent state w/o verified reference ⇒ safe mode; persistent ⇒ bounded breaker; tamper-evident recovery evidence. Reuses canonical mechanisms only.",
    ...out,
    honesty: "SYNTHETIC injected faults against the REAL fdir-engine + audit-log (no real disk/network/process mutation; no production recovery path touched). Proves fail-closed resilience LOCALLY; real production telemetry (E5) remains owner-gated NOT_RUN.",
  };
  fs.writeFileSync(path.join(ROOT, "docs", "odg", "V139_FAULT_INJECTION.json"), JSON.stringify(dossier, null, 2) + "\n");
  process.stdout.write(JSON.stringify(out.summary) + " evidenceIntegrity=" + JSON.stringify(out.evidenceIntegrity) + "\n");
}
module.exports = { runScenarios, SCENARIOS };
export {};
