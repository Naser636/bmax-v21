/*
 * ACTION_AUTHZ_PARTIAL — per-action authorization + partial progress (adversarial lock).
 *
 * Proves the repair for the CTO mission: authorization is evaluated PER ACTION, not as a global mission
 * blocker. A mission whose requested authorization/capability is UNAVAILABLE no longer collapses to a
 * total no-op/BLOCKED — its permitted independent actions execute and the mission reports an honest,
 * resumable PARTIAL (never a false DONE). Self-authorization, expired/cross-mission permission reuse, and
 * executor bypass stay HARD-blocked.
 *
 * Every case drives the REAL engines (runtime/core/action-gate.js, patch-action-contract.js,
 * patch-executor.js, validation-engine.js) in a throwaway git repo. The real repo is never touched.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/action-authorization-partial.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
const PE = path.join(REPO, "runtime", "core", "patch-executor.js");
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");
const { evaluateAction } = require_(path.join(REPO, "runtime", "core", "action-gate.js")) as {
  evaluateAction: (a: unknown, c?: unknown) => { decision: string; checks: Record<string, { ok: boolean; detail: string }> };
};
const { admitPatchEdit, classifyRefusal } = require_(path.join(REPO, "runtime", "core", "patch-action-contract.js")) as {
  admitPatchEdit: (p: unknown, e: unknown, plan: unknown, env?: unknown) => { decision: string; enforced: boolean; refusal: { refused: boolean; resumable: boolean; reason: string | null } };
  classifyRefusal: (g: unknown) => { refused: boolean; resumable: boolean; reason: string | null };
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const sh = (dir: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

// A valid C03 state transition so an Action Contract's STATE check passes (so authority can be isolated
// as the SOLE deficiency). Mirrors action-gate-live.test.js.
const VALID_TRANSITION = {
  state_before: { v: 1 }, action: { do: "write" }, observed_effect: { wrote: true },
  state_after: { v: 2 }, state_version_before: 1, state_version_after: 2,
  difference: { v: { before: 1, after: 2 } }, evidence_refs: [], verification_status: "RECORDED",
};
// A contract valid in every dimension EXCEPT authority — supply `authority` to grant, omit to withhold.
const CONTRACT_NO_AUTH = {
  contract: { id: "C-1" }, policy: "LOCAL_FIRST", reversibility: "R0",
  expectedTransition: VALID_TRANSITION, risk: "LOW",
};

/** Throwaway engineering git repo: one committed in-scope file (engineeringOk satisfied independently). */
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "authz-partial-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "a@b.c"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  fs.writeFileSync(path.join(dir, "runtime", "generated", "runtime-verify.json"),
    JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}

interface PlanShape { mission: string; objectives: { id: string; goal?: string; dependsOn?: string[] }[]; patches: unknown[]; now?: number; }

/** Write the mission/patch plans, run the REAL patch-executor then the REAL validation-engine. */
function runPipeline(dir: string, plan: PlanShape): { executed: { objectiveId?: string; action?: string; status: string }[]; report: Record<string, unknown>; veExit: number; wrote: (f: string) => boolean } {
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  const base = {
    mission: plan.mission, mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
  };
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    ...base, objectives: plan.objectives, definitionOfDone: ["Evidence generated"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    ...base, patches: plan.patches, ...(Number.isFinite(plan.now) ? { now: plan.now } : {}),
  }));
  spawnSync("node", [PE], { cwd: dir, encoding: "utf8" });
  const execution = JSON.parse(fs.readFileSync(G("patch-execution.json"), "utf8"));
  const ve = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const report = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  return {
    executed: execution.executed,
    report,
    veExit: ve.status ?? -1,
    wrote: (f: string) => fs.existsSync(path.join(dir, f)),
  };
}

// A real edit patch (legacy — OBSERVE mode — so it applies and is PROVEN progress).
const applyPatch = (id: string, file: string) => ({ action: id, objectiveId: id, edits: [{ target: `runtime/work/${file}`, content: `module.exports=${JSON.stringify(id)};\n` }] });
// An enforced WRITE whose authority is withheld (actionContract present ⇒ enforced; no `authority`).
const blockedOnAuthPatch = (id: string, file: string) => ({ action: id, objectiveId: id, actionContract: { ...CONTRACT_NO_AUTH }, edits: [{ target: `runtime/work/${file}`, content: "x" }] });

console.log("ACTION_AUTHZ_PARTIAL — PER-ACTION AUTHORIZATION + PARTIAL PROGRESS");

// === 1. Self-authorization is impossible: scope / identity never grant authority. ================
{
  // A consequential WRITE whose target is inside authorized_paths and declares a principal (identity)
  // but NO explicit authority ⇒ gate DENY. authorized_paths is SCOPE, never AUTHORITY.
  const g = evaluateAction({ principal: "odg-runtime", verb: "WRITE", target: "runtime/work/x.js", actionClass: "WRITE", ...CONTRACT_NO_AUTH, authority: undefined }, {});
  check(g.decision === "DENY" && g.checks.authority.ok === false, "self-authorization denied: scope+identity never grant authority (DENY)");
  // And through the live admission bridge with the target inside authorized_paths.
  const a = admitPatchEdit({ action: "O", actionContract: { ...CONTRACT_NO_AUTH } }, { target: "runtime/work/x.js" }, { mission: "M", authorizedPaths: ["runtime/work/**"] });
  check(a.decision === "DENY", "admitPatchEdit: target in authorized_paths does NOT self-authorize (DENY)");
}

// === 2. Expired permission reuse is HARD-denied (never resumable). ===============================
{
  const g = evaluateAction({ principal: "p", verb: "WRITE", target: "t", actionClass: "WRITE", ...CONTRACT_NO_AUTH, authority: { id: "A", expiresAt: 1000 } }, { now: 5000 });
  check(g.decision === "DENY" && /expired/.test(g.checks.authority.detail), "expired authority ⇒ DENY");
  const cls = classifyRefusal(g);
  check(cls.refused === true && cls.resumable === false, "expired authority ⇒ HARD refusal (not resumable)");
}

// === 3. Cross-mission permission reuse is HARD-denied. ===========================================
{
  const g = evaluateAction({ principal: "p", verb: "WRITE", target: "t", actionClass: "WRITE", ...CONTRACT_NO_AUTH, authority: { id: "A", mission: "MISSION_A" } }, { missionId: "MISSION_B" });
  check(g.decision === "DENY" && /cross-mission/.test(g.checks.authority.detail), "authority stamped for another mission ⇒ DENY (cross-mission)");
  check(classifyRefusal(g).resumable === false, "cross-mission reuse ⇒ HARD refusal (not resumable)");
  // Same authority, correct mission ⇒ valid again (proves it is a real mission binding, not a blanket block).
  const ok = evaluateAction({ principal: "p", verb: "WRITE", target: "t", actionClass: "WRITE", ...CONTRACT_NO_AUTH, authority: { id: "A", mission: "MISSION_A" } }, { missionId: "MISSION_A" });
  check(ok.decision === "ALLOW", "same authority under its OWN mission ⇒ ALLOW (binding is real, not a blanket deny)");
}

// === 4. Expired / cross-mission misuse in the LIVE executor ⇒ FAILED, zero mutation. ============
{
  const dir = sandbox();
  try {
    const r = runPipeline(dir, {
      mission: "THIS_MISSION",
      objectives: [{ id: "OBJ1" }],
      patches: [{ action: "OBJ1", objectiveId: "OBJ1", actionContract: { ...CONTRACT_NO_AUTH, authority: { id: "A", mission: "OTHER_MISSION" } }, edits: [{ target: "runtime/work/x.js", content: "x" }] }],
    });
    check(r.executed[0].status === "FAILED", "cross-mission authority in executor ⇒ FAILED (hard)");
    check(r.wrote("runtime/work/x.js") === false, "cross-mission authority ⇒ ZERO mutation (nothing written)");
    check(r.report.status === "BLOCKED", "a FAILED action ⇒ mission BLOCKED (never PARTIAL)");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 5. Executor bypass: a self-gating capability cannot forge success without authorization. ====
{
  const dir = sandbox();
  try {
    // External Research Acquisition asked to go LIVE (execute:true) WITHOUT authorization ⇒ fails closed.
    const r = runPipeline(dir, {
      mission: "RESEARCH",
      objectives: [{ id: "EXTERNAL_RESEARCH_1", goal: "acquire" }],
      patches: [{ action: "EXTERNAL_RESEARCH_1", objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: { execute: true, authorized: false, source_allowlist: ["https://example.com"] } }],
    });
    check(r.executed[0].status === "FAILED", "self-gating capability without authorization ⇒ FAILED (cannot bypass)");
    check(r.executed[0].status !== "EXECUTED" && r.executed[0].status !== "APPLIED", "bypass attempt never forges EXECUTED/APPLIED");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 6. Refusal WITH independent-action continuation ⇒ honest PARTIAL (no false DONE). ===========
{
  const dir = sandbox();
  try {
    const r = runPipeline(dir, {
      mission: "MIXED",
      objectives: [{ id: "OBJ1" }, { id: "OBJ2" }],
      patches: [applyPatch("OBJ1", "one.js"), blockedOnAuthPatch("OBJ2", "two.js")],
    });
    const byId = Object.fromEntries(r.executed.map((e) => [e.objectiveId, e.status]));
    check(byId.OBJ1 === "APPLIED", "independent permitted action still EXECUTES (OBJ1 APPLIED)");
    check(byId.OBJ2 === "BLOCKED", "action with withheld authority ⇒ per-action BLOCKED (not RECORDED, not FAILED)");
    check(r.wrote("runtime/work/one.js") === true, "permitted action's real effect is written");
    check(r.wrote("runtime/work/two.js") === false, "blocked action mutates nothing (zero mutation)");
    check(r.report.status === "PARTIAL" && r.report.validated === false, "mixed mission ⇒ PARTIAL, validated=false (no false DONE)");
    check(r.veExit !== 0, "PARTIAL exits non-zero (ledger never RELEASEs)");
    check(Array.isArray(r.report.completed) && (r.report.completed as string[]).includes("OBJ1"), "report lists OBJ1 as completed");
    check(Array.isArray(r.report.blocked) && (r.report.blocked as { objective: string }[]).some((b) => b.objective === "OBJ2"), "report lists OBJ2 as blocked (with what it needs)");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 7. Capability-unavailable (declared) ⇒ BLOCKED, not a silent RECORDED no-op. ================
{
  const dir = sandbox();
  try {
    const r = runPipeline(dir, {
      mission: "CAP",
      objectives: [{ id: "OBJ1" }, { id: "OBJ2" }],
      patches: [applyPatch("OBJ1", "one.js"), { action: "OBJ2", objectiveId: "OBJ2", requiresCapability: true, blockedReason: "requires the (unavailable) FooProvider capability" }],
    });
    const byId = Object.fromEntries(r.executed.map((e) => [e.objectiveId, e.status]));
    check(byId.OBJ2 === "BLOCKED", "objective declaring an unavailable capability ⇒ BLOCKED (not RECORDED)");
    check(r.report.status === "PARTIAL", "unavailable-capability + proven sibling ⇒ PARTIAL");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 8. No progress at all ⇒ BLOCKED, never PARTIAL (PARTIAL requires real proven work). =========
{
  const dir = sandbox();
  try {
    const r = runPipeline(dir, {
      mission: "ALLBLOCKED",
      objectives: [{ id: "OBJ1" }],
      patches: [blockedOnAuthPatch("OBJ1", "one.js")],
    });
    check(r.report.status === "BLOCKED", "a mission with zero proven actions ⇒ BLOCKED (not PARTIAL)");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 9. Dependency-aware: a proven action may NOT depend on a blocked prerequisite. ==============
{
  const dir = sandbox();
  try {
    // OBJ1 proven but DECLARES it depends on OBJ2 (blocked). Progress that rests on a blocked prerequisite
    // is not honest partial progress ⇒ the mission is BLOCKED, not PARTIAL.
    const r = runPipeline(dir, {
      mission: "DEP",
      objectives: [{ id: "OBJ1", dependsOn: ["OBJ2"] }, { id: "OBJ2" }],
      patches: [applyPatch("OBJ1", "one.js"), blockedOnAuthPatch("OBJ2", "two.js")],
    });
    check(r.report.status === "BLOCKED", "proven action depending on a blocked prerequisite ⇒ BLOCKED (dependency-aware)");
    check(Array.isArray((r.report.checks as { dependencyViolations?: string[] }).dependencyViolations) && ((r.report.checks as { dependencyViolations: string[] }).dependencyViolations).includes("OBJ1"), "dependency violation names OBJ1");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// === 10. Resume after authorization ⇒ the same mission reaches SUCCESS (no redo of completed). ===
{
  const dir = sandbox();
  try {
    // First run: OBJ2 blocked on withheld authority ⇒ PARTIAL.
    const r1 = runPipeline(dir, {
      mission: "RESUMABLE",
      objectives: [{ id: "OBJ1" }, { id: "OBJ2" }],
      patches: [applyPatch("OBJ1", "one.js"), blockedOnAuthPatch("OBJ2", "two.js")],
    });
    check(r1.report.status === "PARTIAL", "pre-authorization run ⇒ PARTIAL");
    // Grant the authorization for OBJ2 and re-run the SAME mission.
    const r2 = runPipeline(dir, {
      mission: "RESUMABLE",
      objectives: [{ id: "OBJ1" }, { id: "OBJ2" }],
      patches: [
        applyPatch("OBJ1", "one.js"),
        { action: "OBJ2", objectiveId: "OBJ2", actionContract: { ...CONTRACT_NO_AUTH, authority: { id: "AUTH-OBJ2" } }, edits: [{ target: "runtime/work/two.js", content: "x" }] },
      ],
    });
    const byId = Object.fromEntries(r2.executed.map((e) => [e.objectiveId, e.status]));
    check(byId.OBJ2 === "APPLIED", "after authorization, the previously-blocked action EXECUTES");
    check(r2.report.status === "SUCCESS" && r2.report.validated === true, "resume ⇒ mission reaches SUCCESS");
    check(r2.wrote("runtime/work/two.js") === true && r2.wrote("runtime/work/one.js") === true, "both actions' effects present (completed work preserved)");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(failures === 0 ? "ALL PASS — ACTION_AUTHZ_PARTIAL" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
