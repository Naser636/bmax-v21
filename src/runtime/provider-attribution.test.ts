/*
 * Provider-route objective attribution (Tier 2 — false execution attribution).
 *
 * BEFORE: writeProviderValidationEvidence built `executed` as objectives.map(o => ({status:"APPLIED"}))
 * — EVERY objective fabricated APPLIED regardless of what the provider did, so a provider that
 * addressed K of N objectives still presented N APPLIED entries and reached SUCCESS. Reproduced below
 * end-to-end against the REAL validation-engine.js (N=3, 1 addressed): all-APPLIED ⇒ SUCCESS.
 *
 * FIX: attributeProviderExecution() derives each entry from the provider's OWN objectivesAddressed —
 * APPLIED iff the provider reported addressing that objective, else the existing no-op status RECORDED
 * (which the A3 noRecordedNoOp gate blocks for engineering missions). No gate change, no invented
 * evidence, no done_when interpretation. A full provider run (all addressed) still yields all-APPLIED.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/provider-attribution.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { attributeProviderExecution } from "./autonomy-runtime-adapter";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const OBJS = [{ id: "OBJ1" }, { id: "OBJ2" }, { id: "OBJ3" }]; // N = 3

console.log("PROVIDER-ROUTE OBJECTIVE ATTRIBUTION");

// ---- Unit: the pure attribution helper ----------------------------------------------------------
// 1 — partial: provider addressed only OBJ1 ⇒ exactly 1 APPLIED, the other 2 RECORDED (not fabricated).
{
  const ex = attributeProviderExecution(OBJS, ["OBJ1"]);
  const applied = ex.filter((e) => e.status === "APPLIED").map((e) => e.action);
  const recorded = ex.filter((e) => e.status === "RECORDED").map((e) => e.action);
  check(applied.length === 1 && applied[0] === "OBJ1", "partial ⇒ only the addressed objective is APPLIED");
  check(recorded.sort().join(",") === "OBJ2,OBJ3", "partial ⇒ unaddressed objectives are RECORDED, never fabricated APPLIED");
  check(!ex.some((e) => e.status === "APPLIED" && !["OBJ1"].includes(e.action)), "no objective is fabricated as APPLIED");
}
// 2 — full: provider addressed all ⇒ all APPLIED (legitimate full execution preserved).
{
  const ex = attributeProviderExecution(OBJS, ["OBJ1", "OBJ2", "OBJ3"]);
  check(ex.every((e) => e.status === "APPLIED"), "full ⇒ all objectives APPLIED (legitimate execution preserved)");
}
// 3 — none addressed ⇒ none APPLIED.
{
  const ex = attributeProviderExecution(OBJS, []);
  check(ex.every((e) => e.status === "RECORDED"), "none addressed ⇒ none APPLIED");
}

// ---- End-to-end: attribution output through the REAL validation-engine (engineering mission) ------
function sandbox(): { dir: string; G: (n: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-attr-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "a@b.c"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "work", "deliverable.js"), "module.exports={};\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "seed in-scope deliverable"], { cwd: dir });
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    mission: "PROV", mode: "IMPLEMENT", requiresEngineering: true, authorizedPaths: ["runtime/work/**"],
    objectives: OBJS.map((o) => ({ id: o.id, goal: o.id, done_when: ["done"] })),
    definitionOfDone: ["x"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    mission: "PROV", patches: OBJS.map((o) => ({ objective: o.id, objectiveId: o.id, files: ["runtime/work/deliverable.js"] })),
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  return { dir, G };
}
function validate(executed: unknown[]): { status?: string; validated?: boolean; exit: number } {
  const { dir, G } = sandbox();
  try {
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "PROV", executed }));
    const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
    return { status: rep.status, validated: rep.validated, exit: r.status ?? -1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 4 — partial execution cannot masquerade as complete: 1 addressed ⇒ BLOCKED.
{
  const out = validate(attributeProviderExecution(OBJS, ["OBJ1"]));
  check(out.status === "BLOCKED" && out.validated === false && out.exit === 1,
    "partial provider execution ⇒ validation BLOCKED (cannot masquerade as complete)");
}
// 5 — reproduce the OLD false-success: all-APPLIED (the old fabrication) ⇒ SUCCESS.
{
  const oldAllApplied = OBJS.map((o) => ({ action: o.id, objectiveId: o.id, status: "APPLIED" }));
  const out = validate(oldAllApplied);
  check(out.status === "SUCCESS", "OLD all-APPLIED fabrication reached SUCCESS (reproduces the defect)");
}
// 6 — legitimate full provider execution stays green: all addressed ⇒ SUCCESS.
{
  const out = validate(attributeProviderExecution(OBJS, ["OBJ1", "OBJ2", "OBJ3"]));
  check(out.status === "SUCCESS" && out.validated === true && out.exit === 0,
    "full provider execution ⇒ validation SUCCESS (legitimate behavior preserved)");
}

console.log(failures === 0 ? "ALL PASS — PROVIDER-ROUTE OBJECTIVE ATTRIBUTION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
