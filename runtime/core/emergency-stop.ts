#!/usr/bin/env node
"use strict";

/*
 * V12.4 §65 — EMERGENCY STOP. PURE, deterministic. ODG can halt a mission / an agent / a class of actions / everything,
 * revoke permissions, preserve the state, restore from a verified checkpoint, and verify the restoration. The stop is
 * ISSUED BY AN EXTERNAL CONTROLLER — the mechanism does NOT depend on the agent it stops (an agent cannot block or
 * authorize its own stop). It composes the existing guards: a revoked authority is denied by action-gate (via
 * ctx.revokedAuthorities), and restoration is refused from an unverified state (root-of-trust discipline). No second
 * authorizer is created. Dual export.
 */

const AG = require("./action-gate");

const SCOPE = Object.freeze(["MISSION", "AGENT", "ACTION_CLASS", "ALL"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** stopControllerIndependent(controller, target) -> boolean. The stop controller must NOT be the stopped agent itself. */
function stopControllerIndependent(controller: any, target: any): boolean {
  return isStr(controller) && controller !== target && controller !== "self";
}

/**
 * emergencyStop(request, {state, now}) -> stop record. request: { controller, scope∈SCOPE, target, reason }. FAIL-CLOSED:
 * a stop issued by the target itself (or a missing/invalid scope) is REFUSED — the mechanism must not depend on the
 * agent it stops. On a valid stop it preserves the supplied state (a checkpoint ref) and marks revoked authorities.
 */
function emergencyStop(request: any, opts: any): any {
  const r = isObj(request) ? request : {};
  const now = isObj(opts) ? opts.now : null;
  if (!SCOPE.includes(r.scope)) return Object.freeze({ ok: false, stopped: false, reason: "scope ∈ " + SCOPE.join(",") });
  if (r.scope !== "ALL" && !isStr(r.target)) return Object.freeze({ ok: false, stopped: false, reason: "target required for scope " + r.scope });
  if (!stopControllerIndependent(r.controller, r.target)) return Object.freeze({ ok: false, stopped: false, reason: "BLOCKED: the stop controller must be INDEPENDENT of the stopped target (an agent cannot stop itself)" });
  const state = isObj(opts) && isObj(opts.state) ? opts.state : {};
  const preserved = Object.freeze({ snapshot: state, preservedAt: now, verified: state.verified === true });
  const revokedAuthorities = r.scope === "AGENT" ? [r.target] : (r.scope === "MISSION" ? ["mission:" + r.target] : (r.scope === "ACTION_CLASS" ? ["class:" + r.target] : ["*"]));
  return Object.freeze({
    ok: true, stopped: true, scope: r.scope, target: r.target || null, controller: r.controller,
    revokedAuthorities: Object.freeze(revokedAuthorities), preservedState: preserved,
    detectable: true, traceable: true,
    audit: Object.freeze({ controller: r.controller, scope: r.scope, target: r.target || null, reason: isStr(r.reason) ? r.reason : null, at: now }),
    note: "state preserved; permissions revoked; the sandboxed command / mission is halted; restoration requires a verified checkpoint",
  });
}

/** afterStopAdmission(action, revokedAuthorities) -> action-gate decision in the post-stop context. A revoked authority
 * ⇒ DENY (composes action-gate; no second authorizer). Proves the revocation actually blocks subsequent actions. */
function afterStopAdmission(action: any, revokedAuthorities: any): any {
  const ctx = { revokedAuthorities: Array.isArray(revokedAuthorities) ? revokedAuthorities : [] };
  return AG.evaluateAction(isObj(action) ? action : {}, ctx);
}

/** verifyRestoration(checkpoint) -> { ok, reason }. FAIL-CLOSED: restoration is allowed ONLY from a VERIFIED state. */
function verifyRestoration(checkpoint: any): any {
  const c = isObj(checkpoint) ? checkpoint : {};
  const verified = (isObj(c.preservedState) ? c.preservedState.verified === true : c.verified === true);
  return Object.freeze({ ok: verified, reason: verified ? "restoration from a verified checkpoint — allowed" : "BLOCKED: restoration refused from an UNVERIFIED state (post-restoration verification required)" });
}

const EMERGENCY_STOP_CONTRACT = Object.freeze({
  id: "V124-EMERGENCY-STOP",
  source: "V12.4 §65 — emergency stop (halt/revoke/preserve/restore/verify)",
  scopes: SCOPE,
  reuses: Object.freeze(["action-gate (revoked-authority denial)", "root-of-trust discipline (verified-restoration-only)"]),
  notAuthority: "halts and preserves; it creates no new authorizer; the stop controller is independent of the stopped agent",
  invariants: Object.freeze([
    "the stop mechanism does NOT depend on the agent it stops (controller ≠ target; self-stop refused)",
    "a valid stop preserves state, revokes authorities, is detectable + traceable",
    "a revoked authority is DENIED by action-gate afterwards (composition, no second authorizer)",
    "restoration is refused from an UNVERIFIED state (post-restoration verification required)",
    "pure/deterministic",
  ]),
});

module.exports = { SCOPE, EMERGENCY_STOP_CONTRACT, stopControllerIndependent, emergencyStop, afterStopAdmission, verifyRestoration };

if (require.main === module) { process.stdout.write(JSON.stringify(EMERGENCY_STOP_CONTRACT, null, 2) + "\n"); }

export {};
