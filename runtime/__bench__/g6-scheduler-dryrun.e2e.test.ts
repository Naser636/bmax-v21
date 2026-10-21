// @ts-nocheck
/*
 * G6 — SCHEDULER DRY-RUN VALIDATION, connected to the CANONICAL governed executor (non-executing of
 * consequential work).
 *
 * The mission-scheduler is a PURE dependency-injected driver (order: stop → bounds → select → authorize →
 * dedup → dispatch → classify → audit); its decision logic is already proven in isolation by
 * runtime/core/mission-scheduler.test.ts (23 assertions, double dispatch). This bench closes the remaining
 * G6 gap: it wires the scheduler's `dispatch` seam to the REAL governed executor
 * (AutonomyRuntimeAdapter.runPipeline) for a single READ-ONLY mission in an isolated sandbox — proving the
 * integration is bounded and safe — and proves every gate (stop / bounds / authorization / dedup /
 * eligibility / fail-closed classification / observability) PREVENTS dispatch so NO consequential work runs.
 * The scheduler is NOT activated: there is no loop, no process, no persistent wiring; activation of
 * consequential scheduled execution remains the separate G7 decision.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/g6-scheduler-dryrun.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { schedulerStep } = require(path.join(REPO, "runtime", "core", "mission-scheduler.js"));

const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
function git(cwd, args) { return execFileSync("git", ["-c", "user.email=b@l", "-c", "user.name=b", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }

function cleanContract(mission) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).", done_when: ["A deterministic scan lists every candidate path."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by gitignore/backup/archive policy.", done_when: ["Every candidate is git-ignored or archived."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence without deleting anything.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }], definition_of_done: ["Evidence generated", "Report generated"] };
}
function sandbox(mission): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "g6-")); sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must be OUTSIDE repo");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(cleanContract(mission), null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
const commits = (sb) => parseInt(git(sb, ["rev-list", "--count", "HEAD"]), 10);

// Build a scheduler ctx; `spy` counts REAL dispatches. The dispatch runs the REAL governed executor on a
// READ-ONLY mission (no consequential effect) and maps its independent-verifier verdict to the scheduler's
// classifier contract (verified === validated && status===SUCCESS).
function makeCtx(sb, mission, over: any = {}) {
  const audits: any[] = [];
  const spy = { calls: 0 };
  const ctx: any = {
    queue: { queue: [{ mission, status: "PENDING" }] },
    preAuthorized: [mission],
    isProven: () => false,
    attemptsByMission: {},
    authorize: () => ({ ok: true, reason: "pre-authorized read-only canary" }),
    policy: { maxAttemptsPerMission: 3, maxBudget: 1000, maxDurationMs: 600000, maxConsecutiveFailures: 3 },
    recordAttempt: (d) => audits.push(d),
    dispatch: (item) => {
      spy.calls++;
      const out: any = new AutonomyRuntimeAdapter(sb).runPipeline(item.mission);
      let report: any = null; try { report = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "mission-report.json"), "utf8")); } catch { /* none */ }
      const verified = !!(report && report.validated === true && report.status === "SUCCESS" && out && out.pipelineOk === true);
      return { verified, detail: report ? `report status ${report.status}` : "no report" };
    },
    ...over,
  };
  return { ctx, audits, spy };
}

console.log("G6 — scheduler dry-run, connected to the canonical governed executor (non-executing)\n");

// 1 — CONNECTED happy path: eligible + authorized + not-proven ⇒ dispatch the REAL executor (read-only) ⇒ PASS, no effect.
{
  const sb = sandbox("G6_CANARY");
  const before = commits(sb);
  const { ctx, audits, spy } = makeCtx(sb, "G6_CANARY");
  const d = schedulerStep(ctx);
  check(spy.calls === 1, "connected: scheduler dispatched to the REAL governed executor exactly once");
  check(d.status === "PASS", `connected: read-only canary verified by the independent Validation Engine ⇒ PASS (got ${d.status})`);
  check(commits(sb) === before && git(sb, ["status", "--porcelain"]) === "", "connected: NO consequential effect (git clean, no commit)");
  check(audits.length === 1, "observability: the decision was audited (recordAttempt)");
}

// 2 — DEDUP at the step-5 dispatch re-check: eligibility passes, then the proven-gate blocks before dispatch.
{
  const sb = sandbox("G6_DEDUP");
  let n = 0; // false at eligibility (selection), true at the dispatch re-check ⇒ exercises step-5 dedup
  const { ctx, spy } = makeCtx(sb, "G6_DEDUP", { isProven: () => n++ > 0 });
  const d = schedulerStep(ctx);
  check(d.status === "BLOCKED" && /dedup|proven/i.test(d.reason) && spy.calls === 0, "dedup: proven-at-dispatch ⇒ BLOCKED, executor not invoked");
}
// 2b — eligibility-level dedup: a mission proven BEFORE selection is simply not eligible (IDLE), never dispatched.
{
  const sb = sandbox("G6_DEDUP2");
  const { ctx, spy } = makeCtx(sb, "G6_DEDUP2", { isProven: () => true });
  const d = schedulerStep(ctx);
  check(d.status === "IDLE" && spy.calls === 0, "dedup: proven-before-selection ⇒ IDLE (not eligible), executor not invoked");
}

// 3 — AUTHORIZATION denied (deny-by-default) ⇒ BLOCKED, executor NEVER invoked.
{
  const sb = sandbox("G6_AUTHZ");
  const { ctx, spy } = makeCtx(sb, "G6_AUTHZ", { authorize: () => ({ ok: false, reason: "not authorized" }) });
  const d = schedulerStep(ctx);
  check(d.status === "BLOCKED" && /AUTHORIZATION_DENIED/.test(d.reason) && spy.calls === 0, "authz: deny-by-default ⇒ BLOCKED, executor not invoked");
}
// 3b — no authorizer injected ⇒ still BLOCKED (scheduler never self-authorizes).
{
  const sb = sandbox("G6_NOAUTHZ");
  const { ctx, spy } = makeCtx(sb, "G6_NOAUTHZ", { authorize: undefined });
  const d = schedulerStep(ctx);
  check(d.status === "BLOCKED" && spy.calls === 0, "authz: no authorizer injected ⇒ BLOCKED (no self-authorization)");
}

// 4 — EMERGENCY STOP ⇒ STOPPED, executor NEVER invoked.
{
  const sb = sandbox("G6_STOP");
  const prev = process.env.ODG_SCHEDULER_STOP; process.env.ODG_SCHEDULER_STOP = "1";
  let d, spy;
  try { const m = makeCtx(sb, "G6_STOP"); spy = m.spy; d = schedulerStep(m.ctx); }
  finally { if (prev === undefined) delete process.env.ODG_SCHEDULER_STOP; else process.env.ODG_SCHEDULER_STOP = prev; }
  check(d.status === "STOPPED" && spy.calls === 0, "stop: ODG_SCHEDULER_STOP ⇒ STOPPED, executor not invoked");
}

// 5 — NOT PRE-AUTHORIZED ⇒ IDLE (not eligible), executor NEVER invoked.
{
  const sb = sandbox("G6_UNAUTH");
  const { ctx, spy } = makeCtx(sb, "G6_UNAUTH", { preAuthorized: [] });
  const d = schedulerStep(ctx);
  check(d.status === "IDLE" && spy.calls === 0, "eligibility: non-pre-authorized ⇒ IDLE, executor not invoked");
}

// 6 — BOUNDS: consecutive-failure cap ⇒ BLOCKED, executor NEVER invoked.
{
  const sb = sandbox("G6_BOUNDS");
  const { ctx, spy } = makeCtx(sb, "G6_BOUNDS", { consecutiveFailures: 3 });
  const d = schedulerStep(ctx);
  check(d.status === "BLOCKED" && /consecutive-failure/.test(d.reason) && spy.calls === 0, "bounds: consecutive-failure cap ⇒ BLOCKED, executor not invoked");
}

// 7 — FAIL-CLOSED classification: an unobservable dispatch result ⇒ NOT_MEASURABLE (never silent PASS).
{
  const sb = sandbox("G6_FAILCLOSED");
  const { ctx } = makeCtx(sb, "G6_FAILCLOSED", { dispatch: () => ({}) });
  const d = schedulerStep(ctx);
  check(d.status === "NOT_MEASURABLE", "fail-closed: unobservable dispatch result ⇒ NOT_MEASURABLE (never silent PASS)");
}

for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
console.log(failures === 0 ? "\nALL PASS — G6 scheduler dry-run (connected, non-executing)" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);
