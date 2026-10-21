// @ts-nocheck
/*
 * ODG-SCHEDULE-TICK — REAL built runner artifact, end-to-end (isolated sandboxes; no systemd, no host change).
 *
 * Spawns the ACTUAL compiled `runtime/dist/bin/odg-schedule-tick.js` (the service ExecStart target) in throwaway
 * git sandboxes and proves the production bin's behaviour — not a re-composition:
 *   A conforming + enforce + allowlisted READ-ONLY mission ⇒ dispatched to the governed pipeline, PASS (exit 0),
 *     enforcement reached the child (truth-lock.json enforce=true), zero consequential effect;
 *   B non-conforming + enforce ⇒ STARTUP_REFUSED (exit 2) BEFORE dispatch, no effect;
 *   C empty allowlist ⇒ IDLE (exit 0), no dispatch (safe default);
 *   D ODG_SCHEDULER_STOP ⇒ STOPPED (exit 1), no dispatch;
 *   E a non-allowlisted mutating mission present ⇒ never dispatched (deny-by-default), no effect;
 *   F dedup — re-tick after a proven mission ⇒ IDLE, no re-dispatch;
 *   (no provider is ever constructed; git stays clean in every case).
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/odg-schedule-tick.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;
function check(c, l) { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function git(cwd, a) { return execFileSync("git", ["-c", "user.email=b@l", "-c", "user.name=b", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
function roContract(m) {
  return { mission: m, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate transient git-ignored runtime artifacts (read-only).", done_when: ["scan lists candidates"], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm candidates covered by policy.", done_when: ["all git-ignored/archived"], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ], verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }], definition_of_done: ["Evidence generated", "Report generated"] };
}
function mutContract(m) { return { mission: m, version: "1.0", status: "AUTHORIZED", mode: "ENGINEERING", priority: "NORMAL", requires_engineering: true, authorized_paths: ["src/app"], objectives: [{ id: "I1", goal: "mutate", done_when: ["x"], authorization: { eligible: true, authorized: true } }], definition_of_done: ["x"] }; }
function sandbox(contracts, state: "conforming" | "wrong-branch" = "conforming") {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "sched-tick-")); sandboxes.push(sb);
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
const clean = (sb) => git(sb, ["status", "--porcelain"]) === "";
const BIN = "runtime/dist/bin/odg-schedule-tick.js";
function tick(sb, { allow = "", enforce = false, stop = false } = {}) {
  const env: any = { ...process.env };
  env.ODG_CANARY_ALLOWLIST = allow;
  if (enforce) env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete env.ODG_TRUTH_LOCK_ENFORCE;
  if (stop) env.ODG_SCHEDULER_STOP = "1"; else delete env.ODG_SCHEDULER_STOP;
  const r = spawnSync("node", [path.join(sb, BIN), ], { cwd: sb, encoding: "utf8", env });
  const out = (r.stdout || "") + (r.stderr || "");
  let report = null; try { report = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "mission-report.json"), "utf8")); } catch {}
  let tl = false; try { tl = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "truth-lock.json"), "utf8")).enforce === true; } catch {}
  return { exit: r.status, out, report, enforce: tl, dispatched: !!report };
}

console.log("ODG-SCHEDULE-TICK — real built artifact, end-to-end (isolated)\n");
console.log("prerequisite: dist bin present:", fs.existsSync(path.join(REPO, BIN)));

// A — conforming + enforce + allowlisted RO mission ⇒ PASS, enforcement reaches child, no effect.
{
  const sb = sandbox([roContract("TICK_RO")], "conforming");
  const r = tick(sb, { allow: "TICK_RO", enforce: true });
  check(r.exit === 0 && /\bPASS\b/.test(r.out), `A: conforming+enforce+allowlisted ⇒ PASS exit 0 (got exit ${r.exit})`);
  check(r.report && r.report.status === "SUCCESS", "A: the read-only mission ran through the governed pipeline (report SUCCESS)");
  check(r.enforce === true, "A: strict enforcement reached the real child (truth-lock.json enforce=true)");
  check(clean(sb), "A: no consequential effect (git clean)");
}
// B — non-conforming + enforce ⇒ STARTUP_REFUSED before dispatch, no effect.
{
  const sb = sandbox([roContract("TICK_RO")], "wrong-branch");
  const r = tick(sb, { allow: "TICK_RO", enforce: true });
  check(r.exit === 2 && /STARTUP_REFUSED/.test(r.out), `B: non-conforming+enforce ⇒ STARTUP_REFUSED exit 2 (got ${r.exit})`);
  check(!r.dispatched && clean(sb), "B: refused BEFORE dispatch — no mission report, git clean");
}
// C — empty allowlist ⇒ IDLE, no dispatch (safe default).
{
  const sb = sandbox([roContract("TICK_RO")], "conforming");
  const r = tick(sb, { allow: "", enforce: true });
  check(r.exit === 0 && /IDLE/.test(r.out) && !r.dispatched, "C: empty allowlist ⇒ IDLE exit 0, no dispatch (safe default)");
}
// D — stop signal ⇒ STOPPED, no dispatch.
{
  const sb = sandbox([roContract("TICK_RO")], "conforming");
  const r = tick(sb, { allow: "TICK_RO", enforce: true, stop: true });
  check(r.exit === 1 && /STOPPED/.test(r.out) && !r.dispatched, "D: ODG_SCHEDULER_STOP ⇒ STOPPED exit 1, no dispatch");
}
// E — a non-allowlisted mutating mission present ⇒ never dispatched (deny-by-default), no effect.
{
  const sb = sandbox([mutContract("TICK_MUT")], "conforming");
  const r = tick(sb, { allow: "", enforce: true }); // allowlist empty ⇒ mutating mission not queued
  check(r.exit === 0 && /IDLE/.test(r.out) && !r.dispatched && clean(sb), "E: non-allowlisted mutating mission ⇒ not dispatched (deny-by-default), no effect");
}
// F — dedup: re-tick after a proven mission ⇒ IDLE (no re-dispatch).
{
  const sb = sandbox([roContract("TICK_RO")], "conforming");
  const r1 = tick(sb, { allow: "TICK_RO", enforce: true });
  const r2 = tick(sb, { allow: "TICK_RO", enforce: true });
  check(r1.exit === 0 && /PASS/.test(r1.out), "F: first tick ⇒ PASS");
  check(r2.exit === 0 && /IDLE/.test(r2.out), "F: second tick (mission now proven in the ledger) ⇒ IDLE (deduped, no re-dispatch)");
}

for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} }
console.log(failures === 0 ? "\nALL PASS — odg-schedule-tick real artifact (isolated)" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);
