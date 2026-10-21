// @ts-nocheck
/*
 * MISSION-RUNNER SERVICE CONTRACT (isolated; NO host/systemd change).
 *
 * A persistent unattended mission-runner, IF later authorized, is NOT a new orchestrator: it is a thin
 * periodic driver = { startup Truth-Lock precondition } + { one bounded scheduler TICK } composed ENTIRELY
 * from existing governed primitives — the canonical Truth-Lock gate (truth-lock-gate.js), the pure
 * mission-scheduler step (mission-scheduler.js), and the real governed executor
 * (AutonomyRuntimeAdapter.runPipeline). This bench proves that service CONTRACT is realizable and fail-closed
 * from those pieces, WITHOUT creating any bin, unit, process, or persistent configuration.
 *
 * Proven: (A) SAFE STARTUP — the runner refuses to tick on a non-conforming repo under enforcement (startup
 * Truth-Lock precondition), and refuses when the stop signal is set; (B) BOUNDED TICK — a single tick
 * dispatches at most one allowlisted read-only mission to the real executor with enforcement reaching the
 * child, then returns (no long-running loop); (C) IDLE — an empty / fully-proven queue ticks to no effect;
 * (D) STOP + ROLLBACK — ODG_SCHEDULER_STOP halts, and clearing enforcement restores record-only (no
 * persistence). No consequential effect; no provider; no systemd.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/mission-runner-service-contract.e2e.test.ts
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
const { truthLockGate } = require(path.join(REPO, "runtime", "core", "truth-lock-gate.js"));
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;
function check(c, l) { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function git(cwd, a) { return execFileSync("git", ["-c", "user.email=b@l", "-c", "user.name=b", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
const CANARY_ALLOWLIST = new Set(["RUNNER_RO"]);
function roContract(mission) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate transient git-ignored runtime artifacts (read-only).", done_when: ["scan lists candidates"], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm candidates covered by policy.", done_when: ["all git-ignored/archived"], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }], definition_of_done: ["Evidence generated", "Report generated"] };
}
function sandbox(state: "conforming" | "wrong-branch"): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "runner-")); sandboxes.push(sb);
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  fs.writeFileSync(path.join(sb, "runtime", "missions", "RUNNER_RO.json"), JSON.stringify(roContract("RUNNER_RO"), null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  git(sb, ["branch", "-M", "main"]); git(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (state === "wrong-branch") git(sb, ["checkout", "-q", "-b", "feature/x"]);
  return sb;
}
const clean = (sb) => git(sb, ["status", "--porcelain"]) === "";

// The RUNNER CONTRACT, composed from existing primitives — no new orchestrator.
function runnerTick(sb, queue, proven) {
  // (A) STARTUP PRECONDITION: canonical Truth-Lock repo-safety BEFORE scheduling (fail-closed under enforce).
  const exec = (args) => { try { return String(execFileSync("git", args, { cwd: sb, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } };
  const enforce = process.env.ODG_TRUTH_LOCK_ENFORCE === "1";
  if (enforce) { const tl = truthLockGate({ mutating: true, enforce: true, exec }); if (tl.blocked) return { status: "STARTUP_REFUSED", reason: tl.verdict.detail, dispatched: 0 }; }
  // (B) ONE BOUNDED scheduler step wired to the REAL governed executor (read-only allowlist only).
  const spy = { calls: 0 }; const audits = [];
  const ctx = {
    queue: { queue: queue.map((m) => ({ mission: m, status: "PENDING" })) },
    preAuthorized: queue.slice(), isProven: (id) => proven.has(id),
    authorize: (item) => CANARY_ALLOWLIST.has(item.mission) ? { ok: true, reason: "ro allowlist" } : { ok: false, reason: "not allowlisted" },
    policy: { maxAttemptsPerMission: 2, maxBudget: 1000, maxDurationMs: 600000, maxConsecutiveFailures: 2 },
    recordAttempt: (d) => audits.push(d),
    dispatch: (item) => { spy.calls++; const out = new AutonomyRuntimeAdapter(sb).runPipeline(item.mission); let r = null; try { r = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "mission-report.json"), "utf8")); } catch {} const v = !!(r && r.validated === true && r.status === "SUCCESS" && out && out.pipelineOk === true); if (v) proven.add(item.mission); return { verified: v, detail: r ? r.status : "no report" }; },
  };
  const d = schedulerStep(ctx);
  return { status: d.status, reason: d.reason, dispatched: spy.calls, audits: audits.length };
}

console.log("MISSION-RUNNER SERVICE CONTRACT (isolated; no systemd, no persistence)\n");

// A — SAFE STARTUP: non-conforming repo + enforce ⇒ the runner REFUSES to tick (no scheduling, no dispatch).
{
  const sb = sandbox("wrong-branch");
  const prev = process.env.ODG_TRUTH_LOCK_ENFORCE; process.env.ODG_TRUTH_LOCK_ENFORCE = "1";
  let r; try { r = runnerTick(sb, ["RUNNER_RO"], new Set()); } finally { if (prev === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prev; }
  check(r.status === "STARTUP_REFUSED" && r.dispatched === 0 && clean(sb), "A: non-conforming repo + enforce ⇒ startup REFUSED, no scheduling, no effect (fail-closed)");
}
// B — BOUNDED TICK: conforming + enforce ⇒ one read-only mission dispatched to the REAL executor, then returns.
{
  const sb = sandbox("conforming");
  const proven = new Set();
  const prev = process.env.ODG_TRUTH_LOCK_ENFORCE; process.env.ODG_TRUTH_LOCK_ENFORCE = "1";
  let r; try { r = runnerTick(sb, ["RUNNER_RO"], proven); } finally { if (prev === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prev; }
  const enf = (() => { try { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "truth-lock.json"), "utf8")).enforce === true; } catch { return false; } })();
  check(r.status === "PASS" && r.dispatched === 1, `B: conforming + enforce ⇒ bounded tick dispatches the read-only mission ⇒ PASS (got ${r.status})`);
  check(enf && clean(sb), "B: enforcement reached the child + NO consequential effect (git clean)");
}
// C — IDLE: all-proven queue ⇒ tick does nothing (no dispatch, no effect).
{
  const sb = sandbox("conforming");
  const r = runnerTick(sb, ["RUNNER_RO"], new Set(["RUNNER_RO"]));
  check(r.status === "IDLE" && r.dispatched === 0, "C: fully-proven queue ⇒ IDLE tick, no dispatch");
}
// D — STOP + ROLLBACK: stop signal halts the tick; clearing enforce restores record-only (no persistence).
{
  const sb = sandbox("conforming");
  const prevStop = process.env.ODG_SCHEDULER_STOP; process.env.ODG_SCHEDULER_STOP = "1";
  let r; try { r = runnerTick(sb, ["RUNNER_RO"], new Set()); } finally { if (prevStop === undefined) delete process.env.ODG_SCHEDULER_STOP; else process.env.ODG_SCHEDULER_STOP = prevStop; }
  check(r.status === "STOPPED" && r.dispatched === 0, "D: ODG_SCHEDULER_STOP ⇒ tick STOPPED, no dispatch");
  check(process.env.ODG_TRUTH_LOCK_ENFORCE === undefined, "D: rollback — no enforcement flag persists after the ticks");
}

for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} }
console.log(failures === 0 ? "\nALL PASS — mission-runner service contract realizable + fail-closed (isolated)" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);
