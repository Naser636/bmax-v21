/*
 * A3 lock — the Validation Engine must REFUSE a RECORDED no-op objective as sufficient coverage.
 *
 * Confirmed A3: patch-executor marks an unmapped objective `RECORDED` (no edit, no capability
 * executor, no evidence); the gate then accepted it as covered and reached SUCCESS/RELEASE without
 * producing the work the objective describes. The guard blocks the LITERAL no-op status only, so the
 * real-execution paths are preserved. This locks:
 *   1. RECORDED no-op (ENGINEERING)     → validation BLOCKED (validated=false, exit 1)
 *   2. EXECUTED + non-empty evidence    → still SUCCESS (not over-blocked)
 *   3. APPLIED (real file edits)        → still SUCCESS (not over-blocked)
 *   4. RECORDED no-op (AUDIT, read-only)→ still SUCCESS (guard scoped to engineering; M000x spared)
 *
 * Fully isolated: each case runs the real validation-engine.js in a throwaway git repo. The real repo
 * and its generated artifacts are never touched.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/validation-engine-recorded-noop.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const sh = (dir: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

/** Throwaway git repo with one committed in-scope file (so engineeringOk is satisfied independently). */
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-guard-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "a@b.c"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    mission: "A3_GUARD", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
    objectives: [{ id: "OBJ1", goal: "do the thing", done_when: ["artifact produced"] }],
    definitionOfDone: ["Evidence generated"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    mission: "A3_GUARD", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
    patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }],
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}

/** Throwaway AUDIT mission cwd: read-only (requiresEngineering:false, no authorized paths). */
function sandboxAudit(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-audit-"));
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    mission: "A3_AUDIT", mode: "AUDIT", requiresEngineering: false, authorizedPaths: [],
    objectives: [{ id: "OBJ1", goal: "audit the thing", done_when: ["inventory recorded"] }],
    definitionOfDone: ["Baseline established"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    mission: "A3_AUDIT", mode: "AUDIT", requiresEngineering: false, authorizedPaths: [],
    patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }],
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}

/** Engineering sandbox whose authorized scope has NO tracked file and NO change — so engineeringOk can be
 *  driven false (an executor that claims APPLIED while touching nothing in scope). A file is committed OUTSIDE
 *  the scope so the repo is non-empty (gitClean satisfiable) but `src/feature/**` stays empty. */
function sandboxEmptyScope(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1-eng-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "a@b.c"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "out-of-scope.js"), "module.exports={};\n"); // committed, but NOT in scope
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    mission: "ENG_SCOPE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["src/feature/**"],
    objectives: [{ id: "OBJ1", goal: "build the feature", done_when: ["feature code written"] }],
    definitionOfDone: ["Feature implemented in src/feature"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    mission: "ENG_SCOPE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["src/feature/**"],
    patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }],
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}

function runValidation(dir: string, executed: unknown[]): { status?: string; validated?: boolean; unmet?: string[]; checks?: any; exit: number } {
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "A3_GUARD", executed }));
  const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  return { status: rep.status, validated: rep.validated, unmet: rep.unmet, checks: rep.checks, exit: r.status ?? -1 };
}

console.log("A3 — VALIDATION REFUSES RECORDED NO-OP COVERAGE");

// 1 — RECORDED no-op ⇒ BLOCKED.
{
  const dir = sandbox();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }]);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "RECORDED no-op ⇒ BLOCKED (exit 1)");
  check((out.unmet || []).some((u) => u.includes("RECORDED")), "unmet names the RECORDED no-op objective");
}

// 2 — EXECUTED + non-empty evidence ⇒ still SUCCESS.
{
  const dir = sandbox();
  const ev = path.join("runtime", "generated", "ev.json");
  fs.writeFileSync(path.join(dir, ev), JSON.stringify({ proof: true }));
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", evidence: ev }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "EXECUTED + evidence ⇒ SUCCESS (not over-blocked)");
}

// 3 — APPLIED (real file edits) ⇒ still SUCCESS (proves the guard does not block real engineering).
{
  const dir = sandbox();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "APPLIED", files: [{ target: "runtime/keep.js", mode: "content" }] }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "APPLIED edits ⇒ SUCCESS (not over-blocked)");
}

// 4 — RECORDED no-op in a read-only AUDIT mission ⇒ still SUCCESS (guard scoped to engineering).
//     Proves M0000/M0001/M0002-class missions are NOT blocked by the A3 guard.
{
  const dir = sandboxAudit();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "AUDIT RECORDED no-op ⇒ SUCCESS (guard inert for read-only missions)");
}

// 5 — A FAILED execution entry ⇒ BLOCKED (invariant 2: "no FAILED actions"). The sandbox has exactly
//     one objective and one patch, so a single FAILED entry keeps coverage (1/1/1), engineering (seeded
//     committed in-scope file) and the build/tsc gates satisfied — isolating the FAILED-action gate as
//     the SOLE block reason, confirmed by the unmet message naming the failure.
{
  const dir = sandbox();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "FAILED" }]);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "FAILED action ⇒ BLOCKED (exit 1)");
  check((out.unmet || []).some((u) => u.includes("FAILED")), "unmet names the FAILED action (blocked for the right reason)");
}

// 6 — V2-F1: evidenceOk gate. An EXECUTED entry that NAMES a capability + an evidence artifact which is
//     MISSING/empty on disk ⇒ BLOCKED (no false SUCCESS from a capability "recorded as run" without proof).
//     Distinct from the RECORDED no-op (case 1): here the status is EXECUTED and an evidence path is claimed.
//     The sandbox seeds a committed in-scope file (engineeringOk ok) + coverage 1/1/1, isolating evidenceOk.
{
  const dir = sandbox();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", capability: "Some Capability", evidence: "runtime/generated/does-not-exist.json" }]);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "EXECUTED + MISSING evidence artifact ⇒ BLOCKED (exit 1)");
  check(out.checks?.evidenceIntegrity === false, "evidenceIntegrity check is false (right reason)");
  check((out.unmet || []).some((u) => u.includes("evidence")), "unmet names the missing evidence");
}
// 6b — not over-blocked: the SAME EXECUTED entry with a PRESENT, non-empty evidence artifact ⇒ SUCCESS.
{
  const dir = sandbox();
  const ev = path.join("runtime", "generated", "present.json");
  fs.writeFileSync(path.join(dir, ev), JSON.stringify({ proof: true }));
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", capability: "Some Capability", evidence: ev }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "EXECUTED + PRESENT evidence ⇒ SUCCESS (not over-blocked)");
}
// 7 — V2-F1: engineeringOk gate (last-line no-false-success defense). An ENGINEERING (write-scope) mission
//     whose executor claims APPLIED but produced NO change AND has NO tracked file inside authorized_paths ⇒
//     BLOCKED. This catches a provider/executor falsely reporting DONE without touching the authorized scope,
//     even when it is not a literal RECORDED no-op. engineeringOk is isolated (coverage 1/1/1, no failures,
//     not RECORDED, build/tsc green, no evidence claimed).
{
  const dir = sandboxEmptyScope();
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "APPLIED" }]);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "ENGINEERING mission, APPLIED but nothing in scope ⇒ BLOCKED (exit 1)");
  check(out.checks?.engineeringPerformed === false, "engineeringPerformed check is false (right reason)");
  check((out.unmet || []).some((u) => u.toLowerCase().includes("scope") || u.includes("changed nothing")), "unmet names the empty authorized scope");
}
// 7b — not over-blocked: the SAME engineering scope WITH a real, committed in-scope deliverable ⇒ SUCCESS.
//      (A tracked file inside authorized_paths — exactly the "already-committed deliverable" branch the real
//      patch-executor produces by git-adding applied files; untracked files are deliberately NOT a proof.)
{
  const dir = sandboxEmptyScope();
  fs.mkdirSync(path.join(dir, "src", "feature"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "feature", "impl.ts"), "export const x = 1;\n");
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "feature"]);
  const out = runValidation(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "APPLIED", files: [{ target: "src/feature/impl.ts", mode: "content" }] }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "ENGINEERING mission with a committed in-scope deliverable ⇒ SUCCESS (not over-blocked)");
}

console.log(failures === 0 ? "ALL PASS — A3 RECORDED NO-OP GUARD" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
