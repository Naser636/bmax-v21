#!/usr/bin/env node
"use strict";
/*
 * V159 (§3/§4) — ODG MISSION SCHEDULER bridge. PURE, deterministic, fail-closed. Makes the V158 REAL governed autonomy
 * journey CONSUMABLE by a canonical mission list: dependency-aware eligibility → execute eligible missions through the REAL
 * governed path (odg-real-autonomy-journey) → collect evidence → ODG close/reject/recover → continue. NO parallel queue,
 * NO hidden worker, NO second scheduler: it COMPOSES the real journey and is meant to feed / be driven by the existing
 * production orchestrators (campaign-controller.selectNextLot/advance, engineering-scheduler.schedule) — cited, not duplicated.
 *
 * HONEST: this scheduler SELECTS + SEQUENCES + runs the real governed journey and decides closure. It does not invent mission
 * state; ALREADY_COMPLETED / ALREADY_ACTIVE / DEPENDENCY_BLOCKED / AUTH_EXPIRED / OWNER_GATED / SECURITY_BLOCKED are honest
 * outcomes. No double execution (a completed/active mission is never re-run). Deterministic: expiry uses a supplied nowTick.
 */
const RJ = require("./odg-real-autonomy-journey.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const STATUS = Object.freeze({ READY: "READY", READY_GRANT: "READY_WITHIN_CAMPAIGN_GRANT", DEP_BLOCKED: "DEPENDENCY_BLOCKED", OWNER_GATED: "OWNER_GATED", DONE: "ALREADY_COMPLETED", ACTIVE: "ALREADY_ACTIVE", AUTH_EXPIRED: "AUTH_EXPIRED", SECURITY_BLOCKED: "SECURITY_BLOCKED", NOT_MEASURABLE: "NOT_MEASURABLE" });

// classify ONE mission against the current world (completed/active sets + nowTick). Deny-by-default on anything unsafe.
function classifyMission(mission: any, ctx?: any): any {
  const m = isObj(mission) ? mission : {};
  const c = isObj(ctx) ? ctx : {};
  const completed: Set<string> = c.completed instanceof Set ? c.completed : new Set(arr(c.completed).filter(isStr));
  const active: Set<string> = c.active instanceof Set ? c.active : new Set(arr(c.active).filter(isStr));
  const nowTick = Number.isSafeInteger(c.nowTick) ? c.nowTick : 0;
  if (!isStr(m.id)) return { status: STATUS.SECURITY_BLOCKED, reason: "mission has no id (fail-closed)" };
  if (completed.has(m.id)) return { status: STATUS.DONE, reason: "already completed (no re-run)" };
  if (active.has(m.id)) return { status: STATUS.ACTIVE, reason: "already active (no double execution)" };
  if (m.ownerGated === true) return { status: STATUS.OWNER_GATED, reason: "requires an owner-gated authorization" };
  if (m.measurable === false) return { status: STATUS.NOT_MEASURABLE, reason: "no measurable completion criterion" };
  const deps = arr(m.dependsOn).filter(isStr);
  const missingDeps = deps.filter((d: string) => !completed.has(d));
  if (missingDeps.length > 0) return { status: STATUS.DEP_BLOCKED, reason: `unmet dependencies: ${missingDeps.join(", ")}`, missingDeps };
  if (Number.isSafeInteger(m.authExpiryTick) && nowTick > m.authExpiryTick) return { status: STATUS.AUTH_EXPIRED, reason: `authorization expired (tick ${nowTick} > ${m.authExpiryTick})` };
  if (m.authorized === false) return { status: STATUS.SECURITY_BLOCKED, reason: "not authorized" };
  return { status: m.requiresGrant === true ? STATUS.READY_GRANT : STATUS.READY, reason: "eligible" };
}

// select the eligible, dependency-satisfied missions in a deterministic, dependency-aware order (topological-ish by dep count).
function scheduleEligible(missions: any, ctx?: any): any {
  const list = arr(missions).filter(isObj);
  const seenIds = new Set<string>(); const deduped: any[] = [];
  for (const m of list) { if (isStr(m.id) && !seenIds.has(m.id)) { seenIds.add(m.id); deduped.push(m); } }   // dedup by id (no duplicate missions)
  const classified = deduped.map((m: any) => ({ mission: m, ...classifyMission(m, ctx) }));
  const eligible = classified.filter((x: any) => x.status === STATUS.READY || (x.status === STATUS.READY_GRANT && isObj(ctx) && ctx.grantValid === true));
  // deterministic order: fewer dependencies first, then id — a dependency-aware sequence without a parallel scheduler.
  eligible.sort((a: any, b: any) => (arr(a.mission.dependsOn).length - arr(b.mission.dependsOn).length) || (a.mission.id < b.mission.id ? -1 : 1));
  return Object.freeze({ eligible: Object.freeze(eligible.map((x: any) => x.mission)), classified: Object.freeze(classified), duplicatesDropped: list.length - deduped.length });
}

// run ONE eligible mission through the REAL governed journey; decide closure. Bounded retry on a recoverable journey failure.
function runMission(mission: any, ctx?: any): any {
  const m = isObj(mission) ? mission : {};
  const cls = classifyMission(m, ctx);
  if (cls.status !== STATUS.READY && cls.status !== STATUS.READY_GRANT) return Object.freeze({ missionId: m.id, executed: false, status: cls.status, reason: cls.reason });
  const maxAttempts = Number.isSafeInteger(m.maxAttempts) && m.maxAttempts > 0 ? Math.min(m.maxAttempts, 3) : 2;
  let attempt = 0; let journey: any = null;
  while (attempt < maxAttempts) {
    attempt++;
    journey = RJ.runRealAutonomyJourney({ missionId: m.id });        // REAL governed path (Ed25519 sealed evidence + reproduction)
    if (journey.journeyComplete === true) break;                      // success ⇒ stop (no further attempts, no duplicate run)
  }
  const providerStep = journey.steps.find((s: any) => s.step === "J");
  const accepted = journey.journeyComplete === true && isObj(providerStep) && /ACCEPTED_BY_ODG/.test(providerStep.detail);
  return Object.freeze({
    missionId: m.id, executed: true, attempts: attempt,
    status: accepted ? "CLOSED_BY_ODG" : "REJECTED_BY_ODG",
    journeyComplete: journey.journeyComplete, providerRound: journey.providerRound,
    execId: providerStep ? providerStep.execId : null,
    evidence: { steps: journey.steps.length, executorSummary: journey.executorSummary },
    note: "executed via the REAL governed journey; closure decided by ODG after crypto chain + independent reproduction; bounded retry, no double execution of a completed mission.",
  });
}

// run the scheduler over a mission set: select eligible, run each, record outcomes, never re-run completed/active, continue.
function runScheduler(missions: any, ctx?: any): any {
  const c = isObj(ctx) ? { ...ctx } : {};
  const completed = new Set<string>(arr(c.completed).filter(isStr));
  const callerActive = new Set<string>(arr(c.active).filter(isStr));   // missions active in ANOTHER run ⇒ never double-run
  const attempted = new Set<string>();                                 // missions this scheduler already ran ⇒ no re-run
  const results: any[] = []; const blocked: any[] = [];
  let guard = 0; const MAX_ITER = 1000;                                 // runaway backstop (deny-by-default)
  while (guard++ < MAX_ITER) {
    const sel = scheduleEligible(missions, { ...c, completed, active: callerActive });
    for (const x of sel.classified) if (x.status !== STATUS.READY && x.status !== STATUS.READY_GRANT && x.status !== STATUS.DONE && !blocked.some((b: any) => b.missionId === x.mission.id)) blocked.push({ missionId: x.mission.id, status: x.status, reason: x.reason });
    const next = sel.eligible.find((m: any) => !completed.has(m.id) && !attempted.has(m.id));
    if (!next) break;                                                  // nothing eligible left ⇒ stop (no hidden loop)
    attempted.add(next.id);                                            // attempted ⇒ never re-selected (closed OR rejected)
    const r = runMission(next, { ...c, completed, active: callerActive }); // classify with caller-active only (not self)
    if (r.status === "CLOSED_BY_ODG") completed.add(next.id);          // dependency unlock for the next iteration
    results.push(r);
  }
  const ranIds = new Set(results.map((r: any) => r.missionId));
  const trueBlocked = blocked.filter((b: any) => !ranIds.has(b.missionId));   // a mission later run is NOT a residual blocker
  return Object.freeze({
    ok: true,
    closed: results.filter((r: any) => r.status === "CLOSED_BY_ODG").map((r: any) => r.missionId),
    rejected: results.filter((r: any) => r.status === "REJECTED_BY_ODG").map((r: any) => r.missionId),
    blocked: Object.freeze(trueBlocked),
    results: Object.freeze(results),
    completedCount: completed.size,
    note: "deterministic dependency-aware scheduling over the REAL governed journey; no parallel queue, no hidden worker, no double execution; blockers recorded with precise reasons; ODG decides every closure.",
  });
}

const MISSION_SCHEDULER_CONTRACT = Object.freeze({
  id: "V159-ODG-MISSION-SCHEDULER",
  purpose: "§3/§4 — make the V158 real governed journey consumable by a canonical mission list (eligibility, dependency, dedup, recovery, closure)",
  reuses: ["odg-real-autonomy-journey (REAL governed execution)", "campaign-controller.selectNextLot/advance (production lot lifecycle, cited)", "engineering-scheduler.schedule (resource/critical-path, cited)"],
  statuses: STATUS,
  invariants: Object.freeze([
    "runs each eligible mission through the REAL governed journey (Ed25519 sealed evidence + independent reproduction); ODG decides closure",
    "no double execution: a completed/active mission is never re-run; duplicate mission ids are deduped",
    "dependency-aware + deny-by-default: unmet deps ⇒ DEPENDENCY_BLOCKED, owner-gated ⇒ OWNER_GATED, expired ⇒ AUTH_EXPIRED, unauthorized ⇒ SECURITY_BLOCKED",
    "bounded retry on a recoverable journey failure (≤3); runaway backstop; no hidden worker / parallel queue / continuous polling",
    "no new primitive; composes existing engines; complements (does not replace) campaign-controller/engineering-scheduler",
  ]),
});
module.exports = { classifyMission, scheduleEligible, runMission, runScheduler, STATUS, MISSION_SCHEDULER_CONTRACT };
export {};
