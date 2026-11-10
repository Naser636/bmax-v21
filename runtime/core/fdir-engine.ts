#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V32 Program B — FDIR (Fault Detection, Isolation & Recovery). PURE, deterministic, fail-closed. Adapts the
 * aerospace FDIR discipline to ODG by COMPOSING existing canonical mechanisms (safety-fmea severity, recovery-drill
 * checkpoints, p12 circuit-breaker, bounded repair-retry, permissions) — it builds no parallel system. The cycle:
 *   DETECT → CLASSIFY → ISOLATE → DECIDE RECOVERY → (AUTHORIZED) RECOVER → INDEPENDENT VERIFY → EVIDENCE → STATE.
 *
 * The 10 safety invariants are code-enforced: no detected fault is silently cleared; an UNKNOWN fault is NEVER benign; no
 * unbounded retry; no rollback without a verified reference; no recovery PASS without an INDEPENDENT verifier; recovery is
 * write-set/permission gated; Truth Lock is never bypassed; no destructive restart; an uncertain state is never
 * OPERATIONAL; every step is traceable. CRITICAL severity stays top-priority regardless of the RPN (RPN alone is never a
 * safety decision). Dual export.
 */

const FMEA = require("./safety-fmea.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

const FAULT = Object.freeze(["TIMEOUT", "SERVICE_DOWN", "CONTRACT_ERROR", "STATE_INCOHERENCE", "DATA_CORRUPTION", "REPEATED_FAILURE", "RESOURCE_ANOMALY", "UNKNOWN"]);
const CLASS = Object.freeze(["TRANSIENT", "PERSISTENT", "CRITICAL", "UNKNOWN", "DEPENDENCY_UNAVAILABLE", "INCOHERENT_STATE", "UNSAFE_RECOVERY"]);
const RECOVERY = Object.freeze(["BOUNDED_RETRY", "CIRCUIT_BREAK", "RECONNECT", "RESUME_CHECKPOINT", "VERIFIED_ROLLBACK", "DEGRADED_MODE", "SAFE_MODE", "ESCALATE"]);

/** detectFault(signal) -> { detected, type, severity, evidence }. A signal that does not map to a known fault but is
 *  non-nominal is UNKNOWN (never dropped). Fail-closed: a missing/garbled signal ⇒ UNKNOWN (never "no fault"). */
function detectFault(signal: any): any {
  const s = isObj(signal) ? signal : null;
  if (!s) return Object.freeze({ detected: true, type: "UNKNOWN", severity: 10, evidence: "no/garbled signal — treated as a fault (never 'no fault')" });
  if (s.nominal === true && FAULT.indexOf(s.type) === -1) return Object.freeze({ detected: false, type: null, severity: 0, evidence: "nominal" });
  const type = FAULT.indexOf(s.type) >= 0 ? s.type : "UNKNOWN";
  const sev = type === "DATA_CORRUPTION" || type === "STATE_INCOHERENCE" ? 9 : type === "UNKNOWN" ? 8 : (Number.isFinite(Number(s.severity)) ? FMEA.factor(s.severity) : 6);
  return Object.freeze({ detected: true, type, severity: sev, evidence: s.evidence || `detected ${type}` });
}

/** classifyFault(fault, history?) -> { class, severity, benign }. UNKNOWN ⇒ never benign. Repeated ⇒ PERSISTENT. */
function classifyFault(fault: any, history: any = {}): any {
  const f = isObj(fault) ? fault : {};
  const prior = Number((history && history.priorFailures) || 0);
  let cls: string;
  if (f.type === "UNKNOWN") cls = "UNKNOWN";
  else if (f.type === "DATA_CORRUPTION" || f.type === "STATE_INCOHERENCE") cls = "INCOHERENT_STATE";
  else if (f.type === "SERVICE_DOWN") cls = "DEPENDENCY_UNAVAILABLE";
  else if (f.severity >= 9) cls = "CRITICAL";
  else if (prior >= 2 || f.type === "REPEATED_FAILURE") cls = "PERSISTENT";
  else cls = "TRANSIENT";
  // a CRITICAL severity escalates regardless of class; UNKNOWN/INCOHERENT are never benign.
  const benign = false; // fail-closed: a detected fault is never benign
  return Object.freeze({ class: cls, severity: f.severity, benign, critical: f.severity >= 9 || cls === "CRITICAL" || cls === "INCOHERENT_STATE" });
}

/**
 * decideRecovery(classified, ctx) -> { action, bounded, reason }. Fail-closed mapping; no unbounded retry; UNKNOWN /
 * INCOHERENT_STATE / UNSAFE ⇒ SAFE_MODE or ESCALATE (never auto-recover blindly). A VERIFIED_ROLLBACK is chosen only if a
 * verified reference is available (ctx.hasVerifiedReference); else ESCALATE.
 */
function decideRecovery(classified: any, ctx: any = {}): any {
  const c = isObj(classified) ? classified : {};
  const maxRetries = Math.max(0, Math.min(5, Number(ctx.maxRetries) || 2));
  if (c.class === "UNKNOWN") return Object.freeze({ action: "SAFE_MODE", bounded: true, reason: "UNKNOWN fault is never benign — enter safe mode + escalate (no blind recovery)" });
  if (c.class === "INCOHERENT_STATE") return ctx.hasVerifiedReference === true ? Object.freeze({ action: "VERIFIED_ROLLBACK", bounded: true, reason: "incoherent state ⇒ rollback to the verified reference" }) : Object.freeze({ action: "SAFE_MODE", bounded: true, reason: "incoherent state with NO verified reference ⇒ safe mode (no rollback without a verifiable reference)" });
  if (c.class === "CRITICAL") return Object.freeze({ action: "ESCALATE", bounded: true, reason: "CRITICAL severity ⇒ escalate (not auto-recovered); RPN alone is never a safety decision" });
  if (c.class === "DEPENDENCY_UNAVAILABLE") return Object.freeze({ action: "CIRCUIT_BREAK", bounded: true, reason: "dependency down ⇒ open the breaker (bounded), optionally reconnect" });
  if (c.class === "PERSISTENT") return Object.freeze({ action: "CIRCUIT_BREAK", bounded: true, reason: "persistent failure ⇒ stop retrying, open the breaker" });
  // TRANSIENT ⇒ a BOUNDED retry (never unbounded).
  return Object.freeze({ action: "BOUNDED_RETRY", bounded: true, maxRetries, reason: `transient ⇒ bounded retry (≤ ${maxRetries})` });
}

/**
 * runFdir(signal, deps) -> outcome. deps: { history?, ctx?, recover(action)->{ok, stateRef?}, verify(stateRef)->{ok},
 * permissions:{ canRecover:bool }, audit(rec)->void }. Executes the cycle fail-closed: a recovery is PASS only if it was
 * permitted, executed, AND an INDEPENDENT verify confirms it; otherwise the state is reported as NOT operational.
 */
function runFdir(signal: any, deps: any = {}): any {
  const trail: any[] = [];
  const log = (rec: any) => { trail.push(rec); if (fn(deps.audit)) { try { deps.audit(rec); } catch { /* best-effort */ } } };

  const fault = detectFault(signal);
  log({ step: "DETECT", fault });
  if (!fault.detected) return Object.freeze({ status: "NOMINAL", recovered: false, verified: false, operational: true, trail: Object.freeze(trail) });

  const cls = classifyFault(fault, deps.history || {});
  log({ step: "CLASSIFY", class: cls.class, critical: cls.critical });

  const decision = decideRecovery(cls, deps.ctx || {});
  log({ step: "DECIDE", action: decision.action, reason: decision.reason });

  // Isolation + permission gate: a consequential recovery requires permission; ESCALATE/SAFE_MODE need none (they contain).
  const needsPermission = decision.action !== "ESCALATE" && decision.action !== "SAFE_MODE";
  const perms = isObj(deps.permissions) ? deps.permissions : {};
  if (needsPermission && perms.canRecover !== true) { log({ step: "ESCALATE", reason: "recovery requires permission" }); return Object.freeze({ status: "ESCALATED", action: decision.action, recovered: false, verified: false, operational: false, reason: "recovery not permitted — escalated (fail-closed, state NOT declared operational)", trail: Object.freeze(trail) }); }
  if (decision.action === "ESCALATE" || decision.action === "SAFE_MODE") { log({ step: decision.action }); return Object.freeze({ status: decision.action, recovered: false, verified: false, operational: false, reason: decision.reason, trail: Object.freeze(trail) }); }

  // Execute the authorized recovery.
  const rec = fn(deps.recover) ? safe(() => deps.recover(decision.action)) : { ok: false };
  log({ step: "RECOVER", action: decision.action, ok: !!(rec && rec.ok) });
  if (!rec || rec.ok !== true) return Object.freeze({ status: "RECOVERY_FAILED", action: decision.action, recovered: false, verified: false, operational: false, reason: "recovery action failed", trail: Object.freeze(trail) });

  // INDEPENDENT verification — the sole arbiter of a successful recovery.
  const ver = fn(deps.verify) ? safe(() => deps.verify(rec.stateRef)) : { ok: false };
  log({ step: "VERIFY", ok: !!(ver && ver.ok) });
  const verified = !!(ver && ver.ok === true);
  return Object.freeze({
    status: verified ? "RECOVERED" : "UNVERIFIED",
    action: decision.action, recovered: verified, verified,
    operational: verified,                             // uncertain/unverified state is NEVER operational
    reason: verified ? "recovery independently verified" : "recovery NOT independently verified — state not declared operational (fail-closed)",
    trail: Object.freeze(trail),
  });
}
function safe(t: any): any { try { return t(); } catch (e: any) { return { ok: false, reason: String((e && e.message) || e) }; } }

const FDIR_ENGINE_CONTRACT = Object.freeze({
  id: "V124-FDIR-ENGINE",
  source: "CTO V32 Program B — native FDIR composing existing canonical mechanisms",
  reuses: Object.freeze(["safety-fmea (severity/worst-case)", "recovery-drill (checkpoints/verified reference)", "p12 circuit-breaker", "repair-retry (bounded)", "permissions/authorization", "STATE/EVIDENCE/Truth Lock"]),
  notAuthority: "detects/classifies/isolates and decides a recovery; a consequential recovery requires permission; success requires an INDEPENDENT verifier; it grants no authority and bypasses no control",
  invariants: Object.freeze([
    "no detected fault is silently cleared; an UNKNOWN fault is NEVER classified benign",
    "no unbounded retry; no rollback without a verified reference (else SAFE_MODE/ESCALATE)",
    "a recovery is RECOVERED/operational ONLY if permitted, executed, AND independently verified — an uncertain state is never operational",
    "CRITICAL severity escalates regardless of RPN (RPN alone is never a safety decision)",
    "consequential recovery is permission-gated; Truth Lock is never bypassed; every step is traceable",
  ]),
});

module.exports = { FAULT, CLASS, RECOVERY, detectFault, classifyFault, decideRecovery, runFdir, FDIR_ENGINE_CONTRACT };

if (require.main === module) {
  const unknown = runFdir({ type: "WEIRD", evidence: "unmapped" }, { permissions: { canRecover: true }, recover: () => ({ ok: true }), verify: () => ({ ok: true }) });
  process.stdout.write(JSON.stringify({ ...FDIR_ENGINE_CONTRACT, demo: { unknownFaultSafeModed: unknown.status === "SAFE_MODE", operational: unknown.operational } }, null, 2) + "\n");
}

export {};
