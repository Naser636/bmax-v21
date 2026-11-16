#!/usr/bin/env node
"use strict";

/*
 * V241 Phase-2/3 — RESIDENT DRIVER (minimal adapter), L0 OBSERVE. PURE, deterministic (state injected). The thin
 * adapter that lets ODG stay AVAILABLE on the private VPS but WORK ONLY when authorized work exists. It is NOT a second
 * scheduler/orchestrator/registry/recovery engine/memory: it COMPOSES the canonical mechanisms — it reads program state
 * via odg-program-continuity.buildDossier (reconciliation + proof validity, V235/V236), honours emergency-stop, and
 * reports an explicit lifecycle. It has NO strategic authority: it cannot create missions, change contracts, grant
 * permissions, or change a mission status.
 *
 * L0 OBSERVE is the ONLY operational level in this checkpoint. In L0 the driver reads and reports ONLY — it NEVER
 * executes/accepts/rejects a mission, NEVER writes a canonical register / source / config, NEVER calls a provider. The
 * no-write guarantee is structural: observe() performs NO fs/registry mutation (it returns a record; it mutates nothing).
 * L1 SIMULATE is prepared (decisions simulated, zero persistence) and provably cannot trigger L2. L2 CONTROLLED_LOCAL is
 * a DECLARED contract only — NOT activated here; no level self-promotes. L3 SENSITIVE/PRODUCTION is disabled. Dual export.
 */

const PC = require("./odg-program-continuity.js");   // read-only program state (reconciliation + proof validity)
const ES = require("./emergency-stop.js");           // canonical emergency-stop — its SIGNAL is read by the resident wrapper and INJECTED here (no I/O in the pure L0 core)

const LEVELS = Object.freeze(["L0_OBSERVE", "L1_SIMULATE", "L2_CONTROLLED_LOCAL", "L3_SENSITIVE"]);
const STATES = Object.freeze(["STARTING", "OBSERVING", "IDLE", "BLOCKED", "STOPPING", "STOPPED", "ERROR"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/*
 * observe(input) -> ONE L0 cycle record. input: { program, context, emergencyStopEngaged?, level? }.
 * Read-only: builds the continuity dossier and reports; mutates nothing. Any level other than L0_OBSERVE is REFUSED here
 * (no auto-escalation). Bounded single pass (no loop). Returns the lifecycle, the observed work, and the no-write proof.
 */
function observe(input: any): any {
  const i = isObj(input) ? input : {};
  const level = typeof i.level === "string" ? i.level : "L0_OBSERVE";
  const lifecycle: string[] = ["STARTING"];
  const refuse = (reason: string) => Object.freeze({ level, state: "ERROR", lifecycle: Object.freeze([...lifecycle, "ERROR"]), error: reason, modifiedBusinessState: false, writes: Object.freeze([]), executionPermittedAtThisLevel: false });

  if (level !== "L0_OBSERVE") return refuse("V241 activates L0_OBSERVE only; '" + level + "' is not operational (no auto-escalation)");

  // emergency stop dominates — stop cleanly, observe nothing further.
  if (i.emergencyStopEngaged === true) {
    return Object.freeze({ level, state: "STOPPED", lifecycle: Object.freeze([...lifecycle, "STOPPING", "STOPPED"]), reason: "emergency-stop engaged ⇒ clean stop (no observation, no work)", emergencyStopHonoured: true, modifiedBusinessState: false, writes: Object.freeze([]), executionPermittedAtThisLevel: false });
  }

  lifecycle.push("OBSERVING");
  // fail-closed: a driver cannot observe without a readable program (a mission set). Absent/invalid ⇒ ERROR, never IDLE.
  if (!isObj(i.program) || !Array.isArray(i.program.missions)) return refuse("unreadable program (missions array required) — cannot observe");
  let dossier: any;
  try { dossier = PC.buildDossier(i.program, i.context); }
  catch (e: any) { return refuse("could not read program state: " + String(e && e.message || e)); }

  const eligible = typeof dossier.nextEligible === "string" ? dossier.nextEligible : null;
  const blocked = Array.isArray(dossier.blocked) ? dossier.blocked.map((b: any) => b.id) : [];
  const mustRevalidate = Array.isArray(dossier.mustRevalidate) ? dossier.mustRevalidate.map((m: any) => m.id) : [];

  // L0 decision: report state; NEVER execute. Work-available in L0 ⇒ still IDLE for the engine (observe-only),
  // but the observation flags that authorized work exists for a HIGHER level to act on (not this one).
  const hasAuthorizedWork = eligible !== null;
  const state = hasAuthorizedWork || blocked.length > 0 ? (hasAuthorizedWork ? "IDLE" : "BLOCKED") : "IDLE";
  lifecycle.push(state, "STOPPING", "STOPPED");

  return Object.freeze({
    level, state, lifecycle: Object.freeze(lifecycle),
    observation: Object.freeze({
      workAvailable: hasAuthorizedWork, nextEligible: eligible, blocked: Object.freeze(blocked), mustRevalidate: Object.freeze(mustRevalidate),
      done: Array.isArray(dossier.done) ? dossier.done.length : 0, missionsTotal: dossier.missionsTotal || 0,
    }),
    // L0 guarantees — the whole point of OBSERVE: no business-state mutation, no execution, no provider call.
    modifiedBusinessState: false, writes: Object.freeze([]), executedMission: false, changedMissionStatus: false, calledProvider: false,
    executionPermittedAtThisLevel: false,
    note: hasAuthorizedWork
      ? "L0 OBSERVE: authorized work exists (" + eligible + ") — the driver REPORTS it and returns to standby; L0 executes NOTHING (execution is a higher level, owner-gated)"
      : "L0 OBSERVE: no authorized READY work ⇒ IDLE; the driver returns to standby without consuming resources",
  });
}

/* simulate(input) -> L1: prepares/simulates the decision over the SAME read-only observation, with ZERO persistence,
 * and proves L1 cannot trigger L2. It does not execute. */
function simulate(input: any): any {
  const obs = observe(Object.assign({}, isObj(input) ? input : {}, { level: "L0_OBSERVE" }));
  return Object.freeze({
    level: "L1_SIMULATE", basedOnObservation: obs.observation || null,
    simulatedDecision: obs.observation && obs.observation.workAvailable ? { wouldSelect: obs.observation.nextEligible, wouldCheckPermissionsAndFreshness: true, wouldExecute: false } : { wouldSelect: null, idle: true },
    persisted: false, modifiedBusinessState: false, canTriggerL2: false,
    note: "L1 SIMULATE: decisions are prepared with NO persistence and NO execution; L1 can NEVER auto-trigger L2 (level transition is owner-gated + independently validated)",
  });
}

/* l2Contract() -> the DECLARED (not activated) L2 CONTROLLED_LOCAL contract for a future owner-authorized transition. */
function l2Contract(): any {
  return Object.freeze({
    level: "L2_CONTROLLED_LOCAL", activated: false,
    requires: Object.freeze(["explicit owner authorization", "independent validation of L0+L1", "all gates green"]),
    scope: Object.freeze({ authorizedFiles: "explicit write-set only", operations: "local deterministic reversible only", externalCalls: 0, production: false }),
    protections: Object.freeze(["single-instance lock (dedicated lock file, NOT a business registry)", "backup/checkpoint before any change", "tests after each operation", "rollback plan", "CPU/RAM/duration quotas", "max attempts + backoff", "per-mission timeout", "emergency-stop honoured", "no ACCEPTED re-execution"]),
    note: "DECLARED for a future decision; V241 does NOT activate L2. No level self-promotes.",
  });
}

const RESIDENT_DRIVER_CONTRACT = Object.freeze({
  id: "V241-RESIDENT-DRIVER",
  purpose: "Phase-2/3 — minimal resident-driver adapter, L0 OBSERVE (read-only); composes odg-program-continuity + emergency-stop; no 2nd scheduler/orchestrator/registry/recovery/memory",
  levels: LEVELS, states: STATES,
  invariants: Object.freeze([
    "L0 OBSERVE is read-only: NO mission executed/accepted/rejected, NO register/source/config write, NO provider call, NO mission-status change",
    "the driver has NO strategic authority (cannot create missions / change contracts / grant permissions); it reports and returns to standby",
    "composes odg-program-continuity (state); honours the canonical emergency-stop (EMERGENCY_STOP_CONTRACT: " + ES.EMERGENCY_STOP_CONTRACT.id + ") whose engaged SIGNAL the resident wrapper reads and INJECTS (pure L0 core does no I/O) — builds NO second stop system, scheduler, orchestrator, registry, recovery or memory, no 10th primitive",
    "no level self-promotes: any level other than L0_OBSERVE is REFUSED here; L1 SIMULATE never triggers L2; L2 is a declared contract only; L3 disabled",
  ]),
});

module.exports = { observe, simulate, l2Contract, LEVELS, STATES, RESIDENT_DRIVER_CONTRACT };
export {};
