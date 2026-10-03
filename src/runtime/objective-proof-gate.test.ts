/*
 * Opt-in per-objective proof gate (ObjectiveSpec.proof consumption).
 *
 * BEFORE: an objective could declare `proof` (the NAME of a registered probe that independently
 * verifies that objective), but nothing consumed it as a gate — a declared proof that FAILED/was
 * absent was ignored and the objective still counted as executed (reproduced end-to-end: declared
 * proof "fleet-request-validated" failing ⇒ SUCCESS).
 *
 * FIX: capability-probes.evaluateObjectiveProofs runs each DECLARED objective proof through the SAME
 * registry/runner as the `verify` block; the Validation Engine ANDs objectiveProofsOk into `validated`.
 * Opt-in: an objective with no proof is skipped (legacy preserved). A declared proof that fails or
 * names an unregistered probe blocks the mission; objectivesAddressed/APPLIED/changedFiles never
 * substitute; done_when is never interpreted.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/objective-proof-gate.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");
const { evaluateObjectiveProofs } = require(path.join(REPO, "runtime", "core", "capability-probes.js")) as {
  evaluateObjectiveProofs: (
    objs: Array<{ id?: string; proof?: unknown }>,
    ctx: unknown,
    runner?: (name: string) => { ok?: boolean; detail?: string },
  ) => { ok: boolean; failing: Array<{ objective: string | null; proof: string }> };
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const pass = (n: string) => ({ ok: n === "good", detail: n });

console.log("OBJECTIVE-PROOF GATE (opt-in ObjectiveSpec.proof)");

// ---- Unit: evaluateObjectiveProofs (injected runner, deterministic) ----------------------------
check(evaluateObjectiveProofs([{ id: "O1" }], {}, pass).ok === true, "no declared proof ⇒ ok (opt-in: objective skipped)");
check(evaluateObjectiveProofs([{ id: "O1", proof: "good" }], {}, pass).ok === true, "declared proof passes ⇒ ok");
{
  const e = evaluateObjectiveProofs([{ id: "O1", proof: "bad" }], {}, pass);
  check(e.ok === false && e.failing[0].objective === "O1" && e.failing[0].proof === "bad", "declared proof fails ⇒ not ok, names the objective");
}
{
  const e = evaluateObjectiveProofs([{ id: "O1", proof: "good" }, { id: "O2", proof: "bad" }], {}, pass);
  check(e.ok === false && e.failing.length === 1 && e.failing[0].objective === "O2", "mixed ⇒ not ok; only the failing objective is listed (proof tied to its objective)");
}
check(evaluateObjectiveProofs([{ id: "O1", proof: "nope-unregistered" }], {}).ok === false, "unregistered probe (real runner) ⇒ not ok (missing proof blocks)");

// ---- End-to-end through the REAL validation-engine ---------------------------------------------
function validate(objectives: unknown[], opts: { fleetValidated?: boolean; executedStatus?: string } = {}): { status?: string; exit: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "objproof-"));
  try {
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["config", "user.email", "a@b.c"], { cwd: dir });
    spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "work", "d.js"), "module.exports={};\n");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
    const G = (n: string) => path.join(dir, "runtime", "generated", n);
    if (opts.fleetValidated) {
      fs.mkdirSync(path.join(dir, "runtime", "generated", "fleet", "requests"), { recursive: true });
      fs.writeFileSync(path.join(dir, "runtime", "generated", "fleet", "requests", "PROV-1.json"), JSON.stringify({ mission: "PROV", status: "VALIDATED" }));
    }
    const objs = objectives as Array<{ id: string }>;
    fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "PROV", mode: "IMPLEMENT", requiresEngineering: true, authorizedPaths: ["runtime/work/**"], objectives, definitionOfDone: ["x"], status: "READY_FOR_EXECUTION" }));
    fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "PROV", patches: objs.map((o) => ({ objective: o.id, objectiveId: o.id, files: ["runtime/work/d.js"] })) }));
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "PROV", executed: objs.map((o) => ({ action: o.id, objectiveId: o.id, status: opts.executedStatus || "APPLIED" })) }));
    fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
    const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
    return { status: rep.status, exit: r.status ?? -1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const FR = "fleet-request-validated";
// A — declared proof FAILS ⇒ BLOCKED.
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: FR }]).status === "BLOCKED", "A: declared proof failing ⇒ objective BLOCKED");
// (missing/unregistered proof ⇒ BLOCKED)
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: "nope-unregistered" }]).status === "BLOCKED", "declared proof names an unregistered probe ⇒ BLOCKED");
// B — declared proof PASSES ⇒ SUCCESS.
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: FR }], { fleetValidated: true }).status === "SUCCESS", "B: declared proof passing ⇒ objective accepted (SUCCESS)");
// C — no proof ⇒ legacy SUCCESS.
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"] }]).status === "SUCCESS", "C: no proof ⇒ legacy behavior preserved (SUCCESS)");
// D — two objectives, one proof passes + one fails ⇒ mission BLOCKED (not fully successful).
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: FR }, { id: "OBJ2", goal: "g", done_when: ["d"], proof: "nope-unregistered" }], { fleetValidated: true }).status === "BLOCKED", "D: mixed proof outcomes ⇒ mission BLOCKED (partial cannot masquerade as complete)");
// 6 — objectivesAddressed/APPLIED cannot override a failed objective proof (all APPLIED, proof fails).
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: FR }], { executedStatus: "APPLIED" }).status === "BLOCKED", "6: APPLIED (provider objectivesAddressed) cannot override a failed objective proof");
// 7 — changedFiles (in-scope commit exists) cannot substitute for a failed objective proof.
check(validate([{ id: "OBJ1", goal: "g", done_when: ["d"], proof: FR }]).status === "BLOCKED", "7: an in-scope changed file cannot substitute for a failed objective proof");

console.log(failures === 0 ? "ALL PASS — OBJECTIVE-PROOF GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
