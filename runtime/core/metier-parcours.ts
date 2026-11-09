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

// Métier → real canonical guard registry. Each entry RESOLVES an EXISTING guard (lazy require — no new logic) and
// declares the LEGITIMATE per-métier variations (§6): `decisionOf` maps the guard's NATIVE verdict → ADMIT/REJECT, and
// `assure` is a GENUINELY INDEPENDENT verifier (a necessary-condition cross-check via a DIFFERENT code path than the
// guard's own verdict — not a re-run of the same guard, which would only prove reproducibility). A métier without its
// own `assure` falls back to the reproducibility default (weaker — honestly a lower assurance level).
// Extensible per §4; P3 (supply-chain) + P8 (release/semver) are wired + demonstrated E2E.
const P8_RANK: any = Object.freeze({ none: 0, patch: 1, minor: 2, major: 3, downgrade: -1, invalid: -2 });
const METIER_GUARDS: any = Object.freeze({
  P3: Object.freeze({
    metier: "P3", domain: "security / supply-chain",
    resolve: () => require("./p3-dependency-trust-gate.js").vetDependency,
    inputNote: "payload = a dependency { name, version, license, integrity }",
    decisionOf: (v: any) => (v && v.decision) || null,
    // INDEPENDENT: an ADMIT must satisfy the necessary safety conditions, recomputed via the guard module's OTHER
    // exports (isExactPin / typosquatOf) — a different path than vetDependency's aggregate verdict. REJECT is always safe.
    assure: (v: any, payload: any) => {
      if (!v || v.decision !== "ADMIT") return { ok: true, reason: "REJECT is safe (no assurance burden)" };
      const G = require("./p3-dependency-trust-gate.js"); const p = payload || {};
      const ok = G.isExactPin(p.version) && !G.typosquatOf(p.name) && typeof p.integrity === "string" && p.integrity.length > 0;
      return { ok, reason: ok ? "ADMIT satisfies independent necessary conditions (pinned, not typosquat, has integrity)" : "ADMIT contradicts a necessary safety condition (unpinned / typosquat / no integrity) — independent assurance FAILED" };
    },
  }),
  P8: Object.freeze({
    metier: "P8", domain: "release / SemVer governance",
    resolve: () => require("./p8-semver-enforcement.js").enforce,
    inputNote: "payload = { oldContract, newContract } (versions carried inside the contracts)",
    decisionOf: (v: any) => (v && v.ok === true ? "ADMIT" : (v && (v.verdict === "SEMVER_VIOLATION" || v.verdict === "INVALID_VERSION") ? "REJECT" : null)),
    // INDEPENDENT: an ADMIT (compliant bump) must satisfy rank(actualBump) >= rank(requiredBump), recomputed via the
    // module's requiredBump/actualBump exports — a DIFFERENT path than enforce's own verdict branch.
    assure: (v: any, payload: any) => {
      if (!v || v.ok !== true) return { ok: true, reason: "REJECT/violation is safe (no assurance burden)" };
      const G = require("./p8-semver-enforcement.js"); const p = payload || {};
      const req = G.requiredBump(p.oldContract, p.newContract);
      const act = G.actualBump(p.oldContract && p.oldContract.version, p.newContract && p.newContract.version);
      const ok = (P8_RANK[act] || -2) >= (P8_RANK[req] || 0) && P8_RANK[act] > 0;
      return { ok, reason: ok ? `ADMIT independently confirmed: actual ${act} ≥ required ${req}` : `ADMIT contradicts the independent bump check (actual ${act} < required ${req}) — assurance FAILED` };
    },
  }),
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

  // (7) RÉSULTAT — map the guard's NATIVE verdict → ADMIT/REJECT via the métier's decisionOf (default: v.decision).
  const decisionOf = fn(entry.decisionOf) ? entry.decisionOf : (v: any) => (v && v.decision) || null;
  const decision = isObj(verdict) ? decisionOf(verdict) : null;
  if (decision !== "ADMIT" && decision !== "REJECT") return done(STAGE.INVALID_RESULT, { reason: "guard verdict did not map to an ADMIT/REJECT decision" });

  // (8) ASSURANCE INDÉPENDANTE — prefer (a) an explicit injected deps.assure, else (b) the métier's own INDEPENDENT
  //     assurer (necessary-condition cross-check via a different code path), else (c) the reproducibility default
  //     (weaker — honestly labelled). Any failure ⇒ fail-closed, never CLOSED.
  const reproDefault = (v: any) => { const again = safe(() => guard(request.payload)); return { ok: again.ok && isObj(again.value) && decisionOf(again.value) === decision, reason: again.ok ? "decision reproduced" : `re-run threw: ${again.error}`, level: "reproducibility" }; };
  const chosen = fn(deps.assure) ? deps.assure : (fn(entry.assure) ? entry.assure : reproDefault);
  const assuranceLevel = fn(deps.assure) ? "injected" : (fn(entry.assure) ? "independent" : "reproducibility");
  const assured = safe(() => chosen(verdict, request.payload, decision));
  if (!assured.ok || !assured.value || assured.value.ok !== true) return done(STAGE.ASSURANCE_FAILED, { reason: (assured.value && assured.value.reason) || "independent assurance failed", decision });

  // (9) DÉCISION / CLÔTURE — record the audit; dedup-mark; return the decision. (Read-only parcours: no state to roll
  //     back; a closure whose audit cannot persist is CLOSURE_FAILED, fail-closed.)
  if (deps.seenDigests instanceof Set && digest != null) deps.seenDigests.add(digest);
  return done(STAGE.CLOSED, { decision, admit: decision === "ADMIT", verdict, assurance: assuranceLevel, digest, synthetic: request.declaredSynthetic === true });
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
