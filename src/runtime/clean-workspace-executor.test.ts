/*
 * CLEAN_WORKSPACE executor — CLEAN_WORKSPACE_1/2/3 are really executed by the EXISTING capability
 * executor registry (no new engine/pipeline). Drives the real patch-executor.js over a patch-plan in
 * a throwaway git repo and asserts each CLEAN_WORKSPACE_* objective becomes status EXECUTED with a
 * non-empty evidence artifact (so it is NOT RECORDED and passes the A3 gate), while a non-CLEAN
 * objective is NOT captured by the new executor (stays RECORDED). Nothing is deleted.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/clean-workspace-executor.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const PE = path.join(REPO, "runtime", "core", "patch-executor.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const sh = (dir: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

/** Throwaway git repo: tracked keep.js + .gitignore, plus git-ignored transient artifacts under runtime/. */
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clean-ws-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "scratch"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "a@b.c"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, ".gitignore"), "runtime/generated/\nruntime/scratch/\n");
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");       // tracked / required
  sh(dir, "git", ["add", ".gitignore", "runtime/keep.js"]);
  sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  fs.writeFileSync(path.join(dir, "runtime", "scratch", "a.tmp"), "transient\n");         // ignored candidate
  fs.writeFileSync(path.join(dir, "runtime", "generated", "stale.json"), "{}\n");         // ignored candidate
  return dir;
}

const G = (dir: string, n: string) => path.join(dir, "runtime", "generated", n);

console.log("CLEAN_WORKSPACE EXECUTOR (via existing capability registry)");

{
  const dir = sandbox();
  fs.writeFileSync(G(dir, "patch-plan.json"), JSON.stringify({
    mission: "CLEAN_RUNTIME_WORKSPACE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
    patches: [
      { id: 1, action: "CLEAN_WORKSPACE_1", objectiveId: "CLEAN_WORKSPACE_1", goal: "enumerate", status: "PLANNED" },
      { id: 2, action: "CLEAN_WORKSPACE_2", objectiveId: "CLEAN_WORKSPACE_2", goal: "confirm", status: "PLANNED" },
      { id: 3, action: "CLEAN_WORKSPACE_3", objectiveId: "CLEAN_WORKSPACE_3", goal: "report", status: "PLANNED" },
      { id: 4, action: "AUDIT_SOMETHING_ELSE", objectiveId: "OTHER_1", goal: "unrelated objective", status: "PLANNED" },
    ],
  }));
  const r = sh(dir, "node", [PE]);
  check(r.status === 0, "patch-executor ran (exit 0)");
  const exec = JSON.parse(fs.readFileSync(G(dir, "patch-execution.json"), "utf8"));
  const byId: Record<string, { status?: string; evidence?: string; capability?: string }> = {};
  for (const e of exec.executed) byId[e.objectiveId] = e;

  for (const id of ["CLEAN_WORKSPACE_1", "CLEAN_WORKSPACE_2", "CLEAN_WORKSPACE_3"]) {
    const e = byId[id];
    const evOk = !!e && typeof e.evidence === "string" && fs.existsSync(path.join(dir, e.evidence)) && fs.statSync(path.join(dir, e.evidence)).size > 0;
    check(!!e && e.status === "EXECUTED" && e.capability === "Clean Workspace" && evOk, `${id} → EXECUTED + non-empty evidence (${e?.evidence})`);
  }

  // Non-CLEAN objective must NOT be captured by the new executor.
  check(byId["OTHER_1"]?.status === "RECORDED", "non-CLEAN objective (OTHER_1) NOT captured ⇒ RECORDED");

  // The scan evidence lists the ignored candidates and deletes nothing.
  const scan = JSON.parse(fs.readFileSync(G(dir, "clean-workspace-scan.json"), "utf8"));
  check(scan.candidates.includes("runtime/scratch/a.tmp") && scan.candidates.includes("runtime/generated/stale.json"), "scan lists the git-ignored transient candidates");
  check(scan.deleted === 0, "scan deleted nothing (read-only)");
  const report = JSON.parse(fs.readFileSync(G(dir, "clean-workspace-report.json"), "utf8"));
  check(report.deleted === 0 && Array.isArray(report.trackedRemoved) && report.trackedRemoved.length === 0, "report confirms no tracked/required artifact deleted");
  // keep.js (tracked) must still be present and NOT listed as a candidate.
  check(fs.existsSync(path.join(dir, "runtime", "keep.js")) && !scan.candidates.includes("runtime/keep.js"), "tracked file preserved and not a candidate");
}

console.log(failures === 0 ? "ALL PASS — CLEAN_WORKSPACE EXECUTOR" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
