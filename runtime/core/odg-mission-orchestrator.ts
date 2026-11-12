#!/usr/bin/env node
"use strict";
/*
 * V167 Addendum-A (multi-worker orchestration — built AND used on the REAL roadmap, not a theoretical engine). PURE,
 * deterministic, fail-closed. COMPOSES ODG's existing canonical mechanisms — NO parallel engine, NO duplicate:
 *   - dep-planner.schedule            → dependency-layered parallel schedule (§3/§5/§11 — parallelisable layers + maxParallelism)
 *   - provider-capability-contract    → provider capability registry + least-privilege permission check (§8/§13/§19)
 *   - evaluator-independence.audit    → independent quality gate: producer ≠ validator, self-cert ⇒ COMPROMISED (§14/§15)
 *   - delegate-isolation.validateScope→ worker scope isolation / git-collision guard (§10/§12/§22)
 *   - odg-open-mission-recovery       → the REAL open-mission inventory it dispatches over (§2/§20 — used on canonical missions)
 *
 * It decides, for every REAL open mission, a DISPATCH ROUTE (ODG_NATIVE / DELEGATE_PROVIDER / SEQUENCED / NOT_DISPATCHABLE),
 * emits a precise delegation contract for provider tasks, and runs the parallel schedule over the genuinely-independent work.
 * It changes NO mission status and performs NO execution itself — it is the dispatcher/coordinator, and ODG alone accepts.
 */
const REC = require("./odg-open-mission-recovery.js");
const DEP = require("./dep-planner.js");
const PCC = require("./provider-capability-contract.js");
const INDEP = require("./evaluator-independence.js");
const DI = require("./delegate-isolation.js");

// ODG native capability registry (what ODG executes itself, §6) vs what is routed to a provider (§7). Conservative/honest:
// only bounded deterministic classes are native; anything owner/external-gated is NOT dispatchable at all.
const ODG_NATIVE_CAPS = Object.freeze(new Set(["read-only-analysis", "deterministic-transform", "ast-operation", "trace-emission", "register-classification"]));

/* routeMission(m) — decide the dispatch route for ONE classified open mission (from the recovery inventory). */
function routeMission(m: any): any {
  const klass = m && m.class;
  if (klass === "DEPENDENCY_BLOCKED") return { route: "SEQUENCED", reason: `waits on unmet dep(s): ${(m.unmetDeps || []).join(", ")}` };
  if (klass === "REALIZABLE_LOCAL") {
    // a realizable-local mission with a bounded deterministic next-action is ODG-native; otherwise delegate.
    const nextActionBounded = /smoke|diagnostic|classif|analysis|contract|reproduc|read-only/i.test(m.nextAction || "");
    return nextActionBounded ? { route: "ODG_NATIVE", reason: "bounded deterministic next-action — ODG executes natively" } : { route: "DELEGATE_PROVIDER", reason: "realizable but beyond native scope — delegate under contract" };
  }
  // OWNER_GATED / EXTERNAL_BLOCKED / DEFINITION_BLOCKED / UMBRELLA / UNSPECIFIED_IN_REGISTER ⇒ not dispatchable by a worker.
  return { route: "NOT_DISPATCHABLE", reason: `${klass}: ${m.blocker}` };
}

/* delegationContract(m, route) — precise provider delegation contract (§9/§11): scope, authorized files, acceptance,
 * evidence required, minimal permissions, prohibitions. Only meaningful for DELEGATE_PROVIDER. */
function delegationContract(m: any, authorizedFiles?: any): any {
  return Object.freeze({
    mission: m.id,
    objective: m.nextAction || "(none recorded)",
    authorizedFiles: Object.freeze(Array.isArray(authorizedFiles) ? authorizedFiles.slice() : []),
    minimalPermissions: Object.freeze(["read-source", "write-authorized-scope"]),
    acceptanceCriteria: Object.freeze(["deliverable reproduces independently", "evidence complete", "write-set respected (no out-of-scope change)"]),
    evidenceRequired: Object.freeze(["patch-execution or structured result", "independent verifier verdict"]),
    prohibitions: Object.freeze(["no status self-promotion/closure (ODG decides)", "no out-of-scope writes", "no governed-path edit", "no secret/credential fabrication"]),
  });
}

/* buildDispatchPlan(inventory?) — the orchestrator applied to the REAL open-mission inventory. Returns the per-mission
 * routes, the dependency-layered parallel schedule over the DISPATCHABLE work, and honest counts. Changes no status. */
function buildDispatchPlan(inventory?: any): any {
  const inv = inventory || REC.inventoryOpenMissions();
  const missions = Array.isArray(inv.missions) ? inv.missions : [];
  const routed = missions.map((m: any) => Object.freeze({ id: m.id, class: m.class, deps: m.deps, unmetDeps: m.unmetDeps, ...routeMission(m) }));

  // Dependency-layered schedule over the missions ODG can actually act on now (native or delegable). Deps are intersected
  // with this dispatchable set so dep-planner never references an out-of-set id.
  const actable = routed.filter((r: any) => r.route === "ODG_NATIVE" || r.route === "DELEGATE_PROVIDER");
  const actableIds = new Set(actable.map((r: any) => r.id));
  const items = actable.map((r: any) => ({ id: r.id, deps: (r.deps || []).filter((d: string) => actableIds.has(d)) }));
  let schedule: any;
  try { schedule = DEP.schedule(items); } catch (e: any) { schedule = { layerCount: 0, maxParallelism: 0, layers: [], error: String(e && e.message || e) }; }

  const byRoute: any = {}; for (const r of routed) byRoute[r.route] = (byRoute[r.route] || 0) + 1;
  return Object.freeze({
    totalOpen: routed.length,
    byRoute: Object.freeze(byRoute),
    routes: Object.freeze(routed),
    parallelSchedule: Object.freeze(schedule),
    dispatchableNow: actable.length,
    note: "orchestrator over the REAL open-mission inventory; routes each mission, schedules the dispatchable work into dependency layers. Changes NO status; executes nothing; ODG alone accepts deliverables.",
  });
}

/* independentQualityGate(deliverable, actors) — §14/§15: a producer can NEVER validate its own work. Reuses
 * evaluator-independence.auditIndependence (self-cert / shared-critical ⇒ COMPROMISED) AND requires complete evidence.
 * Returns ADMIT only if independence is INDEPENDENT/WEAK AND the required evidence is present. */
function independentQualityGate(deliverable: any, actors: any): any {
  const indep = INDEP.auditIndependence(actors);
  const evidence = deliverable && Array.isArray(deliverable.evidence) ? deliverable.evidence : [];
  const evidenceComplete = evidence.length > 0 && evidence.every((e: any) => e && (typeof e === "string" ? e.length > 0 : true));
  let decision: string, reason: string;
  if (indep.verdict === "INSUFFICIENT_DATA") { decision = "REJECT"; reason = "independence profiles missing"; }
  else if (indep.selfCertification || indep.verdict === "COMPROMISED") { decision = "REJECT"; reason = "producer validated its own work (self-certification / shared critical dependency) — COMPROMISED"; }
  else if (!evidenceComplete) { decision = "REJECT"; reason = "incomplete evidence"; }
  else decision = "ADMIT", reason = `independent (${indep.verdict}) + evidence complete`;
  return Object.freeze({ decision, reason, independence: indep.verdict, selfCertification: indep.selfCertification, evidenceComplete });
}

/* checkWorkerScope(changes, authorizedFiles) — §10/§12/§22 git-collision / scope-isolation guard. Reuses the canonical
 * delegate-isolation.validateScope: any out-of-scope change ⇒ REFUSE (prevents workers colliding on unowned files). */
function checkWorkerScope(changes: any, authorizedFiles: any): any {
  const scope = DI.validateScope(changes, authorizedFiles);
  return Object.freeze({ admitted: scope.ok === true, reason: scope.ok ? "all changes in authorized scope" : `OUT OF SCOPE — ${scope.detail || "collision/unowned write refused"}` });
}

/* checkPermission(providerDecl, requiredCapability, grantedPermissions) — §19 least-privilege: a provider may only use a
 * capability it was granted. Reuses provider-capability-contract.canUse (denies ungranted). */
function checkPermission(providerDecl: any, requiredCapability: any, grantedPermissions: any): any {
  return PCC.canUse(providerDecl, { requiredCapability, grantedPermissions });
}

/* aggregateEvidence(results) — §13 Evidence Aggregator: collect per-worker results into one bundle; a result is COUNTED
 * as accepted only if it passed the independent gate (ODG decides). */
function aggregateEvidence(results: any): any {
  const list = Array.isArray(results) ? results : [];
  const accepted = list.filter((r: any) => r && r.gate && r.gate.decision === "ADMIT");
  const rejected = list.filter((r: any) => r && r.gate && r.gate.decision === "REJECT");
  return Object.freeze({ total: list.length, accepted: accepted.length, rejected: rejected.length, acceptedIds: Object.freeze(accepted.map((r: any) => r.mission)), rejectedIds: Object.freeze(rejected.map((r: any) => r.mission)), note: "ODG-accepted count reflects the independent gate; a producer's self-claim is never counted." });
}

const MISSION_ORCHESTRATOR_CONTRACT = Object.freeze({
  id: "V167A-MISSION-ORCHESTRATOR",
  purpose: "Addendum-A — multi-worker dispatch/coordination over the REAL open-mission inventory, composing ODG's existing mechanisms (dep-planner / provider-capability-contract / evaluator-independence / delegate-isolation / recovery inventory)",
  reuses: Object.freeze(["dep-planner.schedule", "provider-capability-contract.canUse", "evaluator-independence.auditIndependence", "delegate-isolation.validateScope", "odg-open-mission-recovery.inventoryOpenMissions"]),
  invariants: Object.freeze([
    "composes existing canonical mechanisms — NO parallel engine, NO duplicate register/scheduler/validator",
    "routes every REAL open mission (ODG_NATIVE / DELEGATE_PROVIDER / SEQUENCED / NOT_DISPATCHABLE) grounded in the inventory classification",
    "independent quality gate: producer ≠ validator (self-certification ⇒ REJECT); incomplete evidence ⇒ REJECT",
    "worker scope isolation (delegate-isolation) + least-privilege permission (provider-capability-contract) enforced",
    "changes NO mission status, executes nothing, ODG alone accepts; deterministic + fail-closed",
  ]),
});
module.exports = { routeMission, delegationContract, buildDispatchPlan, independentQualityGate, checkWorkerScope, checkPermission, aggregateEvidence, ODG_NATIVE_CAPS, MISSION_ORCHESTRATOR_CONTRACT };
export {};
