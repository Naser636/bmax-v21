/*
 * DEF-GAMMA lock — the Validation Engine must REFUSE a false success for an objective that EXPLICITLY
 * declares required execution (`requiresExecution: true`, the CTO DEC-009 / OD-4 signal) yet is satisfied
 * only by a RECORDED no-op (no edit, no capability, no evidence) — even in a declared observation mode.
 *
 * This is the one case the A1+ audit-spare (noRecordedNoOp, scoped to non-engineering observation modes)
 * would otherwise permit, which is exactly DEF-GAMMA ("read-only RECORDED no-op reaches validated=true").
 * Locks the four DEC-009 criteria:
 *   1 COVERAGE   : requiresExecution + EXECUTED + evidence  → SUCCESS (not over-blocked).
 *   2 FALSE-SUCC : requiresExecution + RECORDED no-op       → validated=false, BLOCKED, exit 1 (the fix).
 *   3 LEGIT AUDIT: NO signal + RECORDED no-op (AUDIT mode)  → SUCCESS (M000x-class spared, unchanged).
 *   4 APPLIED    : requiresExecution + APPLIED real edit    → SUCCESS (real work passes).
 *
 * Fully isolated: runs the real validation-engine.js in a throwaway dir; the real repo is never touched.
 * Run: node_modules/.bin/tsx src/runtime/validation-engine-gamma.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** AUDIT (read-only) mission cwd; `requiresExecution` on the objective is the only variable under test. */
function auditSandbox(requiresExecution: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gamma-"));
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  const obj: any = { id: "OBJ1", goal: "do the thing", done_when: ["artifact produced"] };
  if (requiresExecution) obj.requiresExecution = true;
  const plan = {
    mission: "GAMMA_T", mode: "AUDIT", requiresEngineering: false, authorizedPaths: [],
    objectives: [obj], definitionOfDone: ["Evidence generated"], status: "READY_FOR_EXECUTION",
  };
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify(plan));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "GAMMA_T", mode: "AUDIT", requiresEngineering: false, authorizedPaths: [], patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }] }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return dir;
}
function run(dir: string, executed: unknown[]): { status?: string; validated?: boolean; unmet?: string[]; checks?: any; exit: number } {
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "GAMMA_T", executed }));
  const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  return { status: rep.status, validated: rep.validated, unmet: rep.unmet, checks: rep.checks, exit: r.status ?? -1 };
}

console.log("DEF-GAMMA — VALIDATION REFUSES A FALSE SUCCESS FOR requiresExecution OBJECTIVES");

// 2 — THE FIX / reproduction: signal + RECORDED no-op ⇒ validated=false, BLOCKED, exit 1.
{
  const out = run(auditSandbox(true), [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }]);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "requiresExecution + RECORDED no-op ⇒ BLOCKED (DEF-GAMMA closed)");
  check(out.checks && out.checks.noGammaFalseSuccess === false, "check noGammaFalseSuccess=false surfaced");
  check((out.unmet || []).some((u) => u.includes("DEF-GAMMA") && u.includes("OBJ1")), "unmet names the DEF-GAMMA objective + reason");
}
// 3 — LEGIT AUDIT (no signal): SAME RECORDED no-op, but WITHOUT requiresExecution ⇒ still SUCCESS (unchanged).
{
  const out = run(auditSandbox(false), [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "no signal + RECORDED no-op (AUDIT) ⇒ SUCCESS (M000x spared; criterion 3)");
  check(out.checks && out.checks.noGammaFalseSuccess === true, "check noGammaFalseSuccess=true when no signal present");
}
// 1 — COVERAGE (ALPHA/BETA): signal + EXECUTED + non-empty evidence ⇒ SUCCESS (not over-blocked).
{
  const dir = auditSandbox(true);
  const ev = path.join("runtime", "generated", "ev.json");
  fs.writeFileSync(path.join(dir, ev), JSON.stringify({ proof: true }));
  const out = run(dir, [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", evidence: ev }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "requiresExecution + EXECUTED+evidence ⇒ SUCCESS (criterion 1)");
}
// 4 — APPLIED real edit (recorded as a real action) ⇒ SUCCESS (real work passes).
{
  const out = run(auditSandbox(true), [{ action: "OBJ1", objectiveId: "OBJ1", status: "APPLIED", files: [{ target: "runtime/generated/x.json", mode: "content" }] }]);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "requiresExecution + APPLIED ⇒ SUCCESS (real work not over-blocked)");
}

console.log(`\nDEF-GAMMA lock — ${failures === 0 ? "ALL PASS" : failures + " FAILED"}.`);
process.exit(failures === 0 ? 0 : 1);
