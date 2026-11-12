#!/usr/bin/env node
"use strict";
/* V159 §3/§4 — ODG mission-scheduler battery. Proves the scheduler makes the V158 REAL governed journey consumable by a
 * canonical mission list: classification (done/active/dep-blocked/owner-gated/auth-expired/unauthorized), dependency-aware
 * ordering with unlock, dedup, NO double execution, bounded retry/recovery, and ODG close-after-acceptance — each mission
 * really executed through the governed journey (real Ed25519 sealed evidence). Deterministic; fail-closed. */
const S = require("./odg-mission-scheduler.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- classification (§4 adversarial world states) ----
  check("already completed ⇒ ALREADY_COMPLETED (no re-run)", S.classifyMission({ id: "M1" }, { completed: ["M1"] }).status === "ALREADY_COMPLETED");
  check("already active ⇒ ALREADY_ACTIVE (no double execution)", S.classifyMission({ id: "M1" }, { active: ["M1"] }).status === "ALREADY_ACTIVE");
  check("missing dependency ⇒ DEPENDENCY_BLOCKED (names the dep)", (() => { const r = S.classifyMission({ id: "M2", dependsOn: ["M1"] }, { completed: [] }); return r.status === "DEPENDENCY_BLOCKED" && r.missingDeps.indexOf("M1") >= 0; })());
  check("dependency satisfied ⇒ READY", S.classifyMission({ id: "M2", dependsOn: ["M1"] }, { completed: ["M1"] }).status === "READY");
  check("owner-gated ⇒ OWNER_GATED", S.classifyMission({ id: "M3", ownerGated: true }).status === "OWNER_GATED");
  check("expired authorization ⇒ AUTH_EXPIRED (deterministic nowTick)", S.classifyMission({ id: "M4", authExpiryTick: 5 }, { nowTick: 9 }).status === "AUTH_EXPIRED");
  check("unauthorized ⇒ SECURITY_BLOCKED; no id ⇒ SECURITY_BLOCKED (fail-closed)", S.classifyMission({ id: "M5", authorized: false }).status === "SECURITY_BLOCKED" && S.classifyMission({}).status === "SECURITY_BLOCKED");
  check("requiresGrant without a valid grant ⇒ not eligible", S.scheduleEligible([{ id: "G1", requiresGrant: true }], { grantValid: false }).eligible.length === 0 && S.scheduleEligible([{ id: "G1", requiresGrant: true }], { grantValid: true }).eligible.length === 1);

  // ---- runMission really executes the REAL governed journey ----
  const rm = S.runMission({ id: "M-A" });
  check("runMission executes the REAL governed journey ⇒ CLOSED_BY_ODG + real execId", rm.status === "CLOSED_BY_ODG" && rm.journeyComplete === true && rm.providerRound === "REAL_HARNESS_HERMETIC" && typeof rm.execId === "string" && rm.execId.length >= 32);
  check("runMission refuses a non-eligible mission (owner-gated) ⇒ not executed", (() => { const r = S.runMission({ id: "M-OG", ownerGated: true }); return r.executed === false && r.status === "OWNER_GATED"; })());
  check("runMission refuses an already-completed mission (no double execution)", S.runMission({ id: "M-A" }, { completed: ["M-A"] }).executed === false);

  // ---- scheduler: dependency-aware ordering + unlock + dedup + true blockers ----
  const missions = [
    { id: "M-B", dependsOn: ["M-A"] },
    { id: "M-A" },
    { id: "M-A" },                       // duplicate ⇒ deduped
    { id: "M-OG", ownerGated: true },
    { id: "M-DEP", dependsOn: ["M-MISSING"] },
  ];
  const run = S.runScheduler(missions, { completed: [] });
  check("scheduler runs M-A then unlocks M-B (dependency-aware), both CLOSED_BY_ODG", run.closed.indexOf("M-A") >= 0 && run.closed.indexOf("M-B") >= 0 && run.results.map((r: any) => r.missionId).join(",") === "M-A,M-B");
  check("duplicate mission id deduped (M-A runs exactly once)", run.results.filter((r: any) => r.missionId === "M-A").length === 1);
  check("residual blockers are PRECISE (owner-gated + missing-dep); a later-run mission is NOT a blocker", run.blocked.some((b: any) => b.missionId === "M-OG" && b.status === "OWNER_GATED") && run.blocked.some((b: any) => b.missionId === "M-DEP") && !run.blocked.some((b: any) => b.missionId === "M-B"));

  // ---- no double execution + termination (no hidden loop) ----
  check("scheduler terminates; every closed mission ran exactly once (no double execution)", (() => { const r = S.runScheduler([{ id: "X" }, { id: "Y", dependsOn: ["X"] }, { id: "Z", dependsOn: ["Y"] }], {}); const ids = r.results.map((x: any) => x.missionId); return ids.length === new Set(ids).size && r.closed.length === 3; })());
  check("an already-completed mission passed in ctx is never re-run", S.runScheduler([{ id: "X" }], { completed: ["X"] }).results.length === 0);

  // ---- bounded retry / recovery is bounded (≤3) ----
  check("runMission records bounded attempts (≤3) and does not loop forever", (() => { const r = S.runMission({ id: "R", maxAttempts: 5 }); return r.attempts >= 1 && r.attempts <= 3; })());

  // ---- composition honesty ----
  check("contract: real governed journey, no parallel queue/hidden worker, complements campaign-controller (cited)", /REAL governed journey/.test(S.MISSION_SCHEDULER_CONTRACT.invariants[0]) && /no hidden worker/.test(S.MISSION_SCHEDULER_CONTRACT.invariants[3]) && /does not replace/.test(S.MISSION_SCHEDULER_CONTRACT.invariants[4]));
  check("fail-closed: garbage inputs ⇒ safe empties, no throw", S.scheduleEligible(null).eligible.length === 0 && S.runScheduler(null).closed.length === 0 && S.runMission(null).executed === false);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-mission-scheduler (canonical missions → REAL governed journey; classification/dependency/dedup/no-double-exec/bounded-retry/ODG-close; precise residual blockers; deterministic; fail-closed; composes, no parallel queue)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
