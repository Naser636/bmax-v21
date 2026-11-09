#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V17 §2–§4 — MÉTIER PARCOURS E2E ORCHESTRATOR. PURE, deterministic, fail-closed. The 15 trades are VERIFIED
 * as guards (parity 15/15 via metier-benchmark-multidim) but the full OPERATIONAL parcours was never demonstrated
 * end-to-end: réception → identification → résolution de capacité → permission → exécution → résultat → assurance
 * indépendante → décision/clôture → traçabilité, with fail-closed récupération at each step. This orchestrator COMPOSES
 * the EXISTING métier guards (no new business logic, no parallel architecture) behind one governed parcours. It mutates
 * no canonical register and performs no commercial activity — a run yields a guard verdict + an audit record only.
 *
 * Fail-closed terminal stages (each traceable): INVALID_REQUEST / UNKNOWN_METIER / PERMISSION_REFUSED /
 * CAPABILITY_UNAVAILABLE / DUPLICATE / EXECUTION_FAILED / INVALID_RESULT / ASSURANCE_FAILED / CLOSURE_FAILED, and the
 * success terminal CLOSED (carrying the guard's ADMIT/REJECT decision). Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function fn(v: any): boolean { return typeof v === "function"; }

// Métier → real canonical guard registry. Each entry RESOLVES an EXISTING guard (lazy require — no new logic). Extensible
// per §4 ("start with one métier, extend per observed gaps"); P3 (supply-chain dependency trust) is wired + demonstrated.
const METIER_GUARDS: any = Object.freeze({
  P3: Object.freeze({ metier: "P3", domain: "security / supply-chain", resolve: () => require("./p3-dependency-trust-gate.js").vetDependency, inputNote: "payload = a dependency { name, version, license, integrity }" }),
});

const STAGE = Object.freeze({ INVALID_REQUEST: "INVALID_REQUEST", UNKNOWN_METIER: "UNKNOWN_METIER", PERMISSION_REFUSED: "PERMISSION_REFUSED", CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE", DUPLICATE: "DUPLICATE", EXECUTION_FAILED: "EXECUTION_FAILED", INVALID_RESULT: "INVALID_RESULT", ASSURANCE_FAILED: "ASSURANCE_FAILED", CLOSURE_FAILED: "CLOSURE_FAILED", CLOSED: "CLOSED" });

function safe(thunk: any): any { try { return { ok: true, value: thunk() }; } catch (e: any) { return { ok: false, error: String((e && e.message) || e) }; } }

/**
 * runParcours(request, deps) -> outcome. request = { metier, payload, requestId?, declaredSynthetic? }.
 * deps: { guards? (registry override for tests), permissions:{ canExecute(metier)->bool }, assure?(verdict,metier)->{ok,reason},
 *         seenDigests?:Set, digest?(request)->string, audit?(record)->{ok}, now? }.
 * The default digest is a stable JSON of {metier,payload}. The default assurance re-runs the resolved guard and requires
 * an identical decision (independent-of-the-first-run reproducibility check). Pure given the injected seams.
 */
function runParcours(request: any, deps: any = {}): any {
  const now = isStr(deps.now) ? deps.now : "unknown";
  const trail: any[] = [];
  const audit = (rec: any) => { trail.push(rec); if (fn(deps.audit)) { const r = safe(() => deps.audit(rec)); return r.ok && r.value && r.value.ok === true; } return true; };
  const done = (stage: string, extra: any = {}) => { const rec = Object.freeze({ at: now, stage, metier: (request && request.metier) || null, ...extra }); const persisted = audit(rec); return Object.freeze({ stage: persisted ? stage : STAGE.CLOSURE_FAILED, metier: (request && request.metier) || null, ...extra, traceable: persisted, auditTrail: Object.freeze(trail.slice()) }); };

  // (1) RÉCEPTION — well-formed request.
  if (!isObj(request) || !isStr(request.metier) || !isObj(request.payload)) return done(STAGE.INVALID_REQUEST, { reason: "request must be { metier:string, payload:object }" });

  // (2) IDENTIFICATION — known métier in the guard registry.
  const registry = isObj(deps.guards) ? deps.guards : METIER_GUARDS;
  const entry = registry[request.metier];
  if (!entry) return done(STAGE.UNKNOWN_METIER, { reason: `no canonical guard registered for métier ${request.metier}` });

  // (3) PERMISSION — deny-by-default.
  const canExec = deps.permissions && fn(deps.permissions.canExecute) ? safe(() => deps.permissions.canExecute(request.metier)) : { ok: true, value: false };
  if (!canExec.ok || canExec.value !== true) return done(STAGE.PERMISSION_REFUSED, { reason: "métier execution not permitted (deny-by-default)" });

  // (4) RÉSOLUTION DE CAPACITÉ — resolve the real guard fn (absent / throw ⇒ unavailable).
  const resolved = safe(() => entry.resolve());
  if (!resolved.ok || !fn(resolved.value)) return done(STAGE.CAPABILITY_UNAVAILABLE, { reason: `guard for ${request.metier} could not be resolved${resolved.ok ? "" : ": " + resolved.error}` });
  const guard = resolved.value;

  // (5) DÉDUPLICATION — stable digest of {metier,payload}.
  const digest = fn(deps.digest) ? safe(() => deps.digest(request)).value : JSON.stringify({ m: request.metier, p: request.payload });
  if (deps.seenDigests instanceof Set && digest != null && deps.seenDigests.has(digest)) return done(STAGE.DUPLICATE, { reason: "identical request already processed (idempotent)", digest });

  // (6) EXÉCUTION — run the real guard (partial/throw ⇒ fail-closed).
  const exec = safe(() => guard(request.payload));
  if (!exec.ok) return done(STAGE.EXECUTION_FAILED, { reason: `guard threw: ${exec.error}` });
  const verdict = exec.value;

  // (7) RÉSULTAT — well-formed verdict (ADMIT/REJECT).
  if (!isObj(verdict) || (verdict.decision !== "ADMIT" && verdict.decision !== "REJECT")) return done(STAGE.INVALID_RESULT, { reason: "guard returned no ADMIT/REJECT decision" });

  // (8) ASSURANCE INDÉPENDANTE — default: re-run the guard and require an identical decision (reproducibility). A custom
  //     assurer may apply a stronger independent check. Any failure ⇒ fail-closed.
  const assurer = fn(deps.assure) ? deps.assure : (v: any) => { const again = safe(() => guard(request.payload)); return { ok: again.ok && isObj(again.value) && again.value.decision === v.decision, reason: again.ok ? "decision reproduced" : `re-run threw: ${again.error}` }; };
  const assured = safe(() => assurer(verdict, request.metier));
  if (!assured.ok || !assured.value || assured.value.ok !== true) return done(STAGE.ASSURANCE_FAILED, { reason: (assured.value && assured.value.reason) || "independent assurance failed", decision: verdict.decision });

  // (9) DÉCISION / CLÔTURE — record the audit; dedup-mark; return the guard decision. (Read-only parcours: no state to
  //     roll back; a closure whose audit cannot persist is CLOSURE_FAILED, fail-closed.)
  if (deps.seenDigests instanceof Set && digest != null) deps.seenDigests.add(digest);
  return done(STAGE.CLOSED, { decision: verdict.decision, admit: verdict.decision === "ADMIT", verdict, assurance: "reproduced", digest, synthetic: request.declaredSynthetic === true });
}

const METIER_PARCOURS_CONTRACT = Object.freeze({
  id: "V124-METIER-PARCOURS",
  source: "CTO V17 §2–§4 — end-to-end métier parcours over the existing guards",
  reuses: Object.freeze(["the existing métier guards (p3-dependency-trust-gate.vetDependency, …) — composes, adds no business logic", "a permission seam (deny-by-default)", "independent assurance (default: reproduce the decision)", "an audit seam (traceability)"]),
  notAuthority: "runs ONE governed parcours over a real guard; mutates no canonical register; performs no commercial activity; a run yields a guard verdict + audit record only",
  invariants: Object.freeze([
    "fail-closed terminal stages: invalid request / unknown métier / permission refused / capability unavailable / duplicate / execution failed / invalid result / assurance failed / closure failed — each traceable",
    "permission is deny-by-default (no canExecute ⇒ refused)",
    "independent assurance must pass (default: the guard decision reproduces) before CLOSED",
    "idempotent: an identical {métier,payload} request is DUPLICATE, not re-executed",
    "pure/read-only parcours: composes existing guards, modifies no register, invents no data; synthetic requests are flagged and unblock nothing canonical",
  ]),
});

module.exports = { METIER_GUARDS, STAGE, runParcours, METIER_PARCOURS_CONTRACT };

if (require.main === module) {
  const clean = { name: "left-pad", version: "1.3.0", license: "MIT", integrity: "sha512-abc" };
  const bad = { name: "reakt", version: "^1.0.0" };
  const perms = { canExecute: () => true };
  const okRun = runParcours({ metier: "P3", payload: clean, declaredSynthetic: true }, { permissions: perms, now: "demo" });
  const badRun = runParcours({ metier: "P3", payload: bad, declaredSynthetic: true }, { permissions: perms, now: "demo" });
  process.stdout.write(JSON.stringify({ ...METIER_PARCOURS_CONTRACT, demo: { clean: { stage: okRun.stage, decision: okRun.decision }, typosquat: { stage: badRun.stage, decision: badRun.decision } } }, null, 2) + "\n");
}

export {};
