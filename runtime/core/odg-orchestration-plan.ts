#!/usr/bin/env node
"use strict";
/*
 * NATIVE ORCHESTRATION PLAN — turn a decomposed mission (task graph) into an executable multi-agent PLAN:
 * dependency layers → write-safe sub-waves → an agent-count decision (0..6, DERIVED) → per-task routing + contracts.
 * PURE, deterministic, fail-closed. COMPOSES the existing canonical mechanisms — NO second orchestrator, NO second
 * queue, NO tenth primitive (V324 §3/§7).
 *
 * Reuses: dep-planner.schedule (parallel layers), odg-writeset-contention.computeLayerContention (#739/#742 — write-set
 * isolation within a layer), odg-mission-orchestrator.delegationContract (per-task provider contract).
 *
 * HONESTY (V324 §2/§6/§7/§12 — do NOT overclaim autonomy):
 *   - This PRODUCES A PLAN. It does NOT execute, dispatch, track, or integrate anything (executed:false). It is the
 *     native PLANNING half of the loop; the EXECUTION half (running agents, collecting results, integrating) is a
 *     separate runtime step. NO native autonomy is claimed or counted here — none may be counted without real
 *     execution provenance (that is the autonomy-measure/actor-provenance path, not this planner).
 *   - The agent count is DERIVED from the write-safe parallelism (0..6), NEVER a fixed default: 0 when there is
 *     nothing to delegate concurrently; capped at 6 (the excess is serialized, disclosed).
 *   - Concurrency respects write-set isolation: two provider tasks that write overlapping paths are NEVER placed in
 *     the same wave (dependency-order ≠ write-set independence, via #739/#742).
 * No network/clock/randomness.
 */

const DEP = require("./dep-planner.js") as { schedule: (items: any[]) => any };
const WSC = require("./odg-writeset-contention.js") as { computeLayerContention: (layers: any, missions: any) => any };
const ORCH = require("./odg-mission-orchestrator.js") as { delegationContract: (m: any, authorizedFiles?: any) => any };

const MAX_AGENTS = 6; // V324 §3 — ODG coordinates up to six agents; chosen by value, never by obligation.
function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const BOUNDED_NATIVE = /smoke|diagnostic|classif|analysis|contract|reproduc|read-only|transform|trace/i;

// Route ONE task: ODG_NATIVE (ODG executes itself — no agent) / DELEGATE_PROVIDER (needs an agent under contract) /
// NOT_DISPATCHABLE (owner/external-gated). Honours an explicit task.route; else derives conservatively.
function routeTask(t: any): { route: string; reason: string } {
  if (t.ownerGated === true || t.blocked === true) return { route: "NOT_DISPATCHABLE", reason: "owner/external-gated — not dispatchable by a worker" };
  if (t.route === "ODG_NATIVE" || t.route === "DELEGATE_PROVIDER" || t.route === "NOT_DISPATCHABLE") return { route: t.route, reason: "explicit route" };
  if (t.readOnly === true) return { route: "ODG_NATIVE", reason: "read-only — ODG executes natively" };
  if (BOUNDED_NATIVE.test(String(t.objective || t.id || ""))) return { route: "ODG_NATIVE", reason: "bounded deterministic objective — ODG executes natively" };
  return { route: "DELEGATE_PROVIDER", reason: "beyond bounded native scope — delegate to an agent under contract" };
}

/**
 * planOrchestration(mission) -> { ok, missionId, taskCount, parallelSchedule, writeSafety, agentCount, agentRationale,
 *   assignments[], split, executed:false, note } | refusal.
 *   mission = { id?, tasks: [ { id, deps?: string[], authorizedPaths?: string[], readOnly?, route?, objective?,
 *               ownerGated?, blocked? } ] }.
 */
function planOrchestration(mission: any): any {
  if (!isObj(mission)) return freeze({ ok: false, code: "BAD_MISSION", detail: "mission must be an object" });
  const tasks = mission.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) return freeze({ ok: false, code: "NO_TASKS", detail: "mission.tasks must be a non-empty array" });
  if (!tasks.every((t: any) => isObj(t) && typeof t.id === "string" && t.id.length > 0)) return freeze({ ok: false, code: "BAD_TASK", detail: "every task must be an object with a non-empty string id" });
  const ids = new Set(tasks.map((t: any) => t.id));
  if (ids.size !== tasks.length) return freeze({ ok: false, code: "DUPLICATE_TASK_ID", detail: "task ids must be unique" });

  const byId: Record<string, any> = {};
  for (const t of tasks) byId[t.id] = t;
  const routed: Record<string, { route: string; reason: string }> = {};
  for (const t of tasks) routed[t.id] = routeTask(t);

  // dependency-layered schedule over the DISPATCHABLE tasks (native or delegable); deps intersected with the set.
  const dispatchable = tasks.filter((t: any) => routed[t.id].route === "ODG_NATIVE" || routed[t.id].route === "DELEGATE_PROVIDER");
  const dispatchableIds = new Set(dispatchable.map((t: any) => t.id));
  const items = dispatchable.map((t: any) => ({ id: t.id, deps: (Array.isArray(t.deps) ? t.deps : []).filter((d: string) => dispatchableIds.has(d)) }));
  let schedule: any;
  try { schedule = DEP.schedule(items); } catch (e: any) { schedule = { layerCount: 0, maxParallelism: 0, layers: [], error: String(e && e.message || e) }; }

  // write-safe sub-waves within each parallel layer (#739/#742): two tasks with overlapping write-sets never co-run.
  const layerIds = Array.isArray(schedule.layers) ? schedule.layers.map((l: any) => (Array.isArray(l.items) ? l.items : [])) : [];
  const contentionMissions = dispatchable.map((t: any) => ({ id: t.id, authorizedPaths: t.authorizedPaths || t.writeSet, readOnly: t.readOnly === true }));
  const writeSafety = WSC.computeLayerContention(layerIds, contentionMissions);

  // AGENT-COUNT DECISION (0..6): the max number of DELEGATE_PROVIDER tasks that are write-safe-concurrent in ANY
  // sub-wave (ODG-native tasks need no agent). Capped at MAX_AGENTS; excess serialized.
  let neededConcurrency = 0;
  const subWaves = writeSafety && writeSafety.ok === true ? writeSafety.layers.flatMap((l: any) => l.subWaves) : [];
  for (const wave of subWaves) {
    const providerInWave = wave.filter((id: string) => routed[id] && routed[id].route === "DELEGATE_PROVIDER").length;
    if (providerInWave > neededConcurrency) neededConcurrency = providerInWave;
  }
  const agentCount = Math.min(MAX_AGENTS, neededConcurrency);
  const agentRationale = neededConcurrency === 0
    ? "0 agents — no provider task is concurrently dispatchable (all native, sequential, or non-dispatchable)"
    : `${agentCount} agent(s) — the widest write-safe wave has ${neededConcurrency} concurrently-dispatchable provider task(s)${neededConcurrency > MAX_AGENTS ? ` (capped at ${MAX_AGENTS}; the excess ${neededConcurrency - MAX_AGENTS} serialize)` : ""}`;

  // per-task assignment: ODG-native (ODG does it) or a precise provider contract (reused from the orchestrator).
  const assignments = tasks.map((t: any) => {
    const r = routed[t.id];
    const base: any = { id: t.id, route: r.route, reason: r.reason };
    if (r.route === "DELEGATE_PROVIDER") base.contract = ORCH.delegationContract({ id: t.id, nextAction: t.objective }, Array.isArray(t.authorizedPaths) ? t.authorizedPaths : (Array.isArray(t.writeSet) ? t.writeSet : []));
    return freeze(base);
  });

  const nativeCount = assignments.filter((a: any) => a.route === "ODG_NATIVE").length;
  const delegatedCount = assignments.filter((a: any) => a.route === "DELEGATE_PROVIDER").length;
  const notDispatchable = assignments.filter((a: any) => a.route === "NOT_DISPATCHABLE").length;

  return freeze({
    ok: true,
    missionId: typeof mission.id === "string" ? mission.id : null,
    taskCount: tasks.length,
    parallelSchedule: freeze(schedule),
    writeSafety: freeze(writeSafety),
    agentCount,
    agentRationale,
    assignments: freeze(assignments),
    split: freeze({ nativeByODG: nativeCount, delegatedToAgents: delegatedCount, notDispatchable, maxWriteSafeParallelism: schedule.maxParallelism || 0 }),
    executed: false,
    note: "A PLAN, not an execution: ODG natively decides the decomposition layers, the write-safe waves, the agent count (0..6, derived — never fixed) and the per-task contracts. It executes/dispatches/integrates NOTHING (executed:false); the execution half (running agents, collecting results, integrating) is a separate runtime step and NO native autonomy is counted without real execution provenance. Concurrency respects write-set isolation (#739/#742): overlapping write-sets never co-run.",
  });
}

const ORCHESTRATION_PLAN_CONTRACT = Object.freeze({
  id: "NATIVE-ORCHESTRATION-PLAN",
  purpose: "turn a decomposed mission (task graph) into a native multi-agent PLAN — dependency layers + write-safe sub-waves + a derived agent-count (0..6) + per-task routing/contracts — composing dep-planner / odg-writeset-contention (#739/#742) / odg-mission-orchestrator.delegationContract (V324 §3/§7)",
  reuses: Object.freeze(["dep-planner.schedule", "odg-writeset-contention.computeLayerContention (#739/#742)", "odg-mission-orchestrator.delegationContract"]),
  invariants: Object.freeze([
    "PLAN, not execution: executed:false — dispatches/tracks/integrates NOTHING; NO native autonomy is claimed or counted here (that needs real execution provenance)",
    "the agent count is DERIVED from the write-safe parallelism (0..6), NEVER a fixed default: 0 when nothing is concurrently delegable; capped at 6 with the excess serialized (disclosed)",
    "concurrency respects write-set isolation (#739/#742): two provider tasks with overlapping write-sets are NEVER placed in the same wave (dependency-order ≠ write-set independence)",
    "every DELEGATE_PROVIDER task gets a precise contract (authorized files = its declared write-set, acceptance, prohibitions) reused from the orchestrator — an agent may not touch another task's files",
    "composes existing canonical mechanisms — NO second orchestrator, NO second queue, NO tenth primitive; fail-closed on bad input; PURE/deterministic/frozen",
  ]),
});

module.exports = { planOrchestration, routeTask, ORCHESTRATION_PLAN_CONTRACT };
export {};
