/*
 * ODG5 INTEGRATION PROOF — the reality-gate is ACTUALLY CALLED on the governed execution path.
 * Spawns the REAL runtime/core/validation-engine.js in a throwaway git repo (same pattern as
 * validation-engine-recorded-noop.test.ts) and asserts the produced mission-report.json carries a
 * `realityProof` field classified by the reality-gate from the run's facts — NOT from the status label.
 *   - a SUCCESS run (validated, build+tsc green, DoD met) => ACCEPTANCE_VERIFIED
 *   - a BLOCKED run (RECORDED no-op => validated=false, exit 1) => only SOURCE_VERIFIED (NOT rubber-stamped)
 * A .ts file created without integration would NOT change the spawned engine's output — this proves invocation.
 * Run: node_modules/.bin/tsx runtime/core/reality-gate-integration.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");
let failures = 0;
function check(cond: boolean, label: string): void { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
const sh = (dir: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg5-rg-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  sh(dir, "git", ["init", "-q"]); sh(dir, "git", ["config", "user.email", "a@b.c"]); sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
  sh(dir, "git", ["add", "-A"]); sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    mission: "ODG5_RG", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
    objectives: [{ id: "OBJ1", goal: "do the thing", done_when: ["artifact produced"] }],
    definitionOfDone: ["Evidence generated"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    mission: "ODG5_RG", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
    patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }],
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}
function run(dir: string, executed: unknown[]): any {
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "ODG5_RG", executed }));
  const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  return { rep, exit: r.status ?? -1 };
}

console.log("ODG5 — REALITY-GATE INTEGRATION (governed validation-engine actually calls it)");

// SUCCESS path -> ACCEPTANCE_VERIFIED
{
  const dir = sandbox();
  const ev = path.join("runtime", "generated", "ev.json");
  fs.writeFileSync(path.join(dir, ev), JSON.stringify({ proof: true }));
  const { rep, exit } = run(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", evidence: ev }]);
  check(exit === 0 && rep.status === "SUCCESS", "SUCCESS run (precondition)");
  check(!!rep.realityProof && rep.realityProof.rule === "ODG5-REALITY-PROOF", "mission-report carries realityProof (gate was CALLED on the governed path)");
  check(rep.realityProof && rep.realityProof.state === "ACCEPTANCE_VERIFIED", "SUCCESS run classified ACCEPTANCE_VERIFIED from facts");
}
// BLOCKED path -> only SOURCE_VERIFIED (never rubber-stamped up the ladder)
{
  const dir = sandbox();
  const { rep, exit } = run(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }]);
  check(exit === 1 && rep.status === "BLOCKED", "BLOCKED run (precondition)");
  check(rep.realityProof && rep.realityProof.state === "SOURCE_VERIFIED", "BLOCKED run classified only SOURCE_VERIFIED (no false TEST/ACCEPTANCE)");
}

console.log(failures === 0 ? "ALL PASS — ODG5 reality-gate is integrated and invoked" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
