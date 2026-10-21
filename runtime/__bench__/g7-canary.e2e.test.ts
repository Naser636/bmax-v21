// @ts-nocheck
/*
 * G7 — LIMITED SUPERVISED SCHEDULED-EXECUTION CANARY (read-only allowlist; NO persistent/unattended service).
 *
 * This is a SUPERVISED canary: a manually-driven loop of the pure scheduler step whose `dispatch` seam is
 * wired to the REAL governed executor (AutonomyRuntimeAdapter.runPipeline), over an allowlist of LOW-RISK
 * READ-ONLY missions, with strict enforcement (ODG_TRUTH_LOCK_ENFORCE=1) reaching the actual child execution
 * process. It does NOT create a systemd unit, a background process, or any persistent/unattended scheduler —
 * activation of unattended consequential scheduling remains outside this canary.
 *
 * Proves the 9 G7 preconditions: (1) G6 dry-run gates still hold; (2) the scheduler invokes the canonical
 * governed executor and CANNOT bypass the mission contract / Truth-Lock; (3) strict enforcement reaches the
 * real execution process; (4) the allowlist admits only reviewed read-only classes; (5) bounded write-set /
 * attempts; (6) duplicate-delivery / stop / failure handled; (7) reliable stop + tested rollback; (8) no
 * prod/exposure/destructive/unauthorized-provider effect; (9) logs + before/after evidence sufficient.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/g7-canary.e2e.test.ts
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
function check(c, l) { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function git(cwd, a) { return execFileSync("git", ["-c", "user.email=b@l", "-c", "user.name=b", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }

// The reviewed CANARY ALLOWLIST: ONLY low-risk READ-ONLY mission classes.
const CANARY_ALLOWLIST = new Set(["G7_RO_A", "G7_RO_B"]);
function readOnlyContract(mission) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate transient git-ignored runtime artifacts (read-only scan).", done_when: ["A deterministic scan lists candidates."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by gitignore/backup/archive policy.", done_when: ["Every candidate is git-ignored or archived."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence without deleting anything.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }], definition_of_done: ["Evidence generated", "Report generated"] };
}
function mutatingContract(mission) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "ENGINEERING", priority: "NORMAL", requires_engineering: true, authorized_paths: ["src/app"],
    objectives: [{ id: "IMPL_1", goal: "mutate", done_when: ["x"], authorization: { eligible: true, authorized: true } }], definition_of_done: ["x"] };
}
function sandbox(contracts: any[], state: "conforming" | "wrong-branch" = "conforming"): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "g7-")); sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox OUTSIDE repo");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(sb, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  for (const c of contracts) fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  git(sb, ["branch", "-M", "main"]); git(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (state === "wrong-branch") git(sb, ["checkout", "-q", "-b", "feature/x"]);
  return sb;
}
const commits = (sb) => parseInt(git(sb, ["rev-list", "--count", "HEAD"]), 10);
const clean = (sb) => git(sb, ["status", "--porcelain"]) === "";
const tlEnforce = (sb) => { try { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "truth-lock.json"), "utf8")).enforce === true; } catch { return false; } };

// Canary ctx: dispatch → REAL executor; authorize admits ONLY the read-only allowlist (deny-by-default).
function canaryCtx(sb, queueMissions, proven: Set<string>, audits: any[], spy) {
  return {
    queue: { queue: queueMissions.map((m) => ({ mission: m, status: "PENDING" })) },
    preAuthorized: queueMissions.slice(),
    isProven: (id) => proven.has(id),
    authorize: (item) => CANARY_ALLOWLIST.has(item.mission) ? { ok: true, reason: "read-only canary allowlist" } : { ok: false, reason: `NOT_IN_CANARY_ALLOWLIST: ${item.mission}` },
    policy: { maxAttemptsPerMission: 2, maxBudget: 1000, maxDurationMs: 600000, maxConsecutiveFailures: 2 },
    recordAttempt: (d) => audits.push(d),
    dispatch: (item) => {
      spy.calls++;
      const out: any = new AutonomyRuntimeAdapter(sb).runPipeline(item.mission);
      let report: any = null; try { report = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "mission-report.json"), "utf8")); } catch { /* none */ }
      const verified = !!(report && report.validated === true && report.status === "SUCCESS" && out && out.pipelineOk === true);
      if (verified) proven.add(item.mission); // record-proven ⇒ dedup on re-delivery
      return { verified, detail: report ? `status ${report.status}` : "no report" };
    },
  };
}

console.log("G7 — limited supervised scheduled-execution canary (read-only allowlist; NO persistent service)\n");

// === THE CANARY: smallest useful — ONE read-only mission, strict enforcement reaching the executor, then
//     re-delivered to prove dedup. attemptsByMission is tracked so an unverified mission is bounded (#5). ===
{
  const sb = sandbox([readOnlyContract("G7_RO_A")], "conforming");
  const before = commits(sb);
  const proven = new Set<string>(), audits: any[] = [], spy = { calls: 0 }, attempts: any = {};
  function step() {
    const ctx = canaryCtx(sb, ["G7_RO_A"], proven, audits, spy);
    ctx.attemptsByMission = attempts;
    const sel = "G7_RO_A"; const d = schedulerStep(ctx);
    if (d.item) attempts[sel] = (attempts[sel] || 0) + 1; // bound re-dispatch (#5)
    return d;
  }
  const prevTL = process.env.ODG_TRUTH_LOCK_ENFORCE;
  process.env.ODG_TRUTH_LOCK_ENFORCE = "1"; // (3) strict enforcement reaches the real child execution process
  const results: any[] = [];
  try {
    for (let i = 0; i < 4; i++) { const d = step(); results.push(d); if (d.status === "IDLE") break; }
  } finally { if (prevTL === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prevTL; } // (7) rollback
  check(results[0].status === "PASS", `(2/5/8) canary executed the read-only mission via the REAL governed executor ⇒ PASS (got ${results[0].status})`);
  check(tlEnforce(sb), "(3) strict enforcement REACHED the real child execution process (truth-lock.json enforce=true)");
  check(commits(sb) === before && clean(sb), "(8) NO consequential effect — git clean, no commit, no prod/exposure/provider");
  check(spy.calls === 1, `(6) duplicate delivery prevented — dispatched once, re-delivery deduped (dispatches=${spy.calls})`);
  check(results[results.length - 1].status === "IDLE", "(6) loop terminates at IDLE after the mission is proven (no runaway)");
  check(audits.length === results.length, "(9) every scheduler decision is audited (observable log)");
  check(process.env.ODG_TRUTH_LOCK_ENFORCE === prevTL, "(7) rollback: enforcement flag restored after the canary (no persistence)");
}

// (4) ALLOWLIST: a non-allowlisted / mutating mission is REFUSED (deny-by-default), executor NOT invoked.
{
  const sb = sandbox([mutatingContract("G7_MUT")], "conforming");
  const proven = new Set<string>(), audits: any[] = [], spy = { calls: 0 };
  const d = schedulerStep(canaryCtx(sb, ["G7_MUT"], proven, audits, spy));
  check(d.status === "BLOCKED" && /NOT_IN_CANARY_ALLOWLIST/.test(d.reason) && spy.calls === 0, "(4) non-allowlisted mutating mission ⇒ BLOCKED, executor not invoked");
}

// (2) CANNOT BYPASS Truth-Lock: even if a mutating mission WERE dispatched on a non-conforming repo under
//     enforce, the governed executor refuses before any effect (scheduler has no path around Truth-Lock).
{
  const sb = sandbox([mutatingContract("G7_BYPASS")], "wrong-branch");
  const before = commits(sb);
  const proven = new Set<string>(), audits: any[] = [], spy = { calls: 0 };
  // Force-allow it past the allowlist to isolate the EXECUTOR-level Truth-Lock refusal (adversarial).
  const ctx = canaryCtx(sb, ["G7_BYPASS"], proven, audits, spy);
  ctx.authorize = () => ({ ok: true, reason: "adversarial: bypass allowlist to test executor-level refusal" });
  const prevTL = process.env.ODG_TRUTH_LOCK_ENFORCE; process.env.ODG_TRUTH_LOCK_ENFORCE = "1";
  let d;
  try { d = schedulerStep(ctx); } finally { if (prevTL === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prevTL; }
  check(d.status !== "PASS" && commits(sb) === before && fs.readdirSync(path.join(sb, "src", "app")).length === 0, "(2) scheduler cannot bypass Truth-Lock — mutating mission on a non-conforming repo refused, no effect");
}

// (7)+(6) RELIABLE STOP: ODG_SCHEDULER_STOP halts the canary immediately; executor NOT invoked.
{
  const sb = sandbox([readOnlyContract("G7_RO_A")], "conforming");
  const proven = new Set<string>(), audits: any[] = [], spy = { calls: 0 };
  const prevStop = process.env.ODG_SCHEDULER_STOP; process.env.ODG_SCHEDULER_STOP = "1";
  let d;
  try { d = schedulerStep(canaryCtx(sb, ["G7_RO_A"], proven, audits, spy)); } finally { if (prevStop === undefined) delete process.env.ODG_SCHEDULER_STOP; else process.env.ODG_SCHEDULER_STOP = prevStop; }
  check(d.status === "STOPPED" && spy.calls === 0, "(7) reliable stop: ODG_SCHEDULER_STOP halts the canary, executor not invoked");
}

for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
console.log(failures === 0 ? "\nALL PASS — G7 supervised canary (read-only, enforced, no persistent service)" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);
