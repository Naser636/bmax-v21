#!/usr/bin/env node
"use strict";
/* V288 Lot 2.A — DIRECT contract test for the canonical patch-engine (runtime/core/patch-engine.ts). patch-engine is a
 * STAGE SCRIPT (no exports): it reads runtime/generated/decision.json and WRITES runtime/generated/patch-plan.json
 * (deterministic — no wall-clock), exiting 1 if decision.json is missing/malformed. So it is tested the correct way:
 * run the REAL script as a subprocess in an ISOLATED temp cwd with a controlled decision.json, then assert the produced
 * patch-plan + exit code + stderr (same pattern as patch-executor.test.ts). NOT a mock of the component; NOT a test of
 * the distinct src/runtime/patch-engine.ts lineage. Does NOT duplicate patch-executor (which APPLIES edits; this only
 * PLANS). Covers: action→objective mapping, normalizeEdits (content/diff/path+file aliases, malformed dropped, non-object),
 * status READY_TO_APPLY vs PLANNED, passthroughs, authorizedPaths normalization, determinism, and the fail-closed guard. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = process.cwd();
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");
const ENGINE = path.join(REPO, "runtime", "core", "patch-engine.ts");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

/** run the REAL patch-engine script in an isolated temp cwd with the given decision (or none). Returns {status,stderr,plan,planRaw}. */
function runEngine(decision: any): any {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-patchengine-"));
  if (decision !== undefined) { fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true }); fs.writeFileSync(path.join(dir, "runtime", "generated", "decision.json"), typeof decision === "string" ? decision : JSON.stringify(decision)); }
  const r = spawnSync(TSX, [ENGINE], { cwd: dir, encoding: "utf8", timeout: 60000 });
  const planPath = path.join(dir, "runtime", "generated", "patch-plan.json");
  let plan: any = null, planRaw: string | null = null;
  try { planRaw = fs.readFileSync(planPath, "utf8"); plan = JSON.parse(planRaw as string); } catch { /* none */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return { status: r.status, stderr: String(r.stderr || ""), stdout: String(r.stdout || ""), plan, planRaw, hadPlan: planRaw !== null };
}

function main() {
  const decision = {
    mission: "M-2A", mode: "engineering", priority: "P1", requiresEngineering: true,
    authorizedPaths: ["runtime/core/"],
    research_acquisition: { topic: "x" },
    actions: ["OBJ_CONTENT", "OBJ_DIFF", "OBJ_PATHALIAS", "OBJ_FILEALIAS", "OBJ_BADEDIT", "OBJ_NONOBJ", "OBJ_PLAIN", "OBJ_ABSENT"],
    objectives: [
      { id: "OBJ_CONTENT", goal: "g1", done_when: ["d1"], patch: [{ target: "a.ts", content: "AAA" }], actionContract: { k: 1 }, git_branch_integration: { branch: "b" }, authoredBy: "ODG_CAPABILITY" },
      { id: "OBJ_DIFF", goal: "g2", patch: { target: "b.ts", diff: "--- d" } },
      { id: "OBJ_PATHALIAS", patch: [{ path: "p.ts", content: "P" }] },
      { id: "OBJ_FILEALIAS", patch: [{ file: "f.ts", diff: "D" }] },
      { id: "OBJ_BADEDIT", patch: [{ content: "no target here" }] },
      { id: "OBJ_NONOBJ", patch: "not-an-object" },
      { id: "OBJ_PLAIN", goal: "g7" },
    ],
  };
  const r = runEngine(decision);
  check("valid decision ⇒ exit 0, patch-plan.json written, top-level status READY", r.status === 0 && r.hadPlan && r.plan.status === "READY" && r.plan.mission === "M-2A");
  const byId = (id: string) => r.plan.patches.find((p: any) => p.objectiveId === id);
  check("one patch per ACTION (8), ids are 1..n in action order", r.plan.patches.length === 8 && r.plan.patches[0].id === 1 && r.plan.patches[7].id === 8 && r.plan.patches[0].objectiveId === "OBJ_CONTENT");
  check("summary: objectives counts the objectives array (7), plannedPatches counts actions (8)", r.plan.summary.objectives === 7 && r.plan.summary.plannedPatches === 8);
  check("edit {target,content} ⇒ READY_TO_APPLY with that edit", byId("OBJ_CONTENT").status === "READY_TO_APPLY" && byId("OBJ_CONTENT").edits.length === 1 && byId("OBJ_CONTENT").edits[0].content === "AAA" && byId("OBJ_CONTENT").edits[0].target === "a.ts");
  check("edit {target,diff} (single object patch) ⇒ diff edit", byId("OBJ_DIFF").status === "READY_TO_APPLY" && byId("OBJ_DIFF").edits[0].diff === "--- d" && byId("OBJ_DIFF").edits[0].target === "b.ts");
  check("alias {path} ⇒ target=path; alias {file} ⇒ target=file", byId("OBJ_PATHALIAS").edits[0].target === "p.ts" && byId("OBJ_FILEALIAS").edits[0].target === "f.ts");
  check("malformed edit (no target) ⇒ dropped ⇒ PLANNED, no edits key", byId("OBJ_BADEDIT").status === "PLANNED" && byId("OBJ_BADEDIT").edits === undefined);
  check("non-object patch ⇒ no edits ⇒ PLANNED", byId("OBJ_NONOBJ").status === "PLANNED" && byId("OBJ_NONOBJ").edits === undefined);
  check("objective without patch ⇒ PLANNED", byId("OBJ_PLAIN").status === "PLANNED");
  check("action with NO matching objective ⇒ still planned, goal '' , PLANNED", byId("OBJ_ABSENT").status === "PLANNED" && byId("OBJ_ABSENT").goal === "");
  check("passthrough ONLY when present+typed: actionContract/git_branch_integration/authoredBy on OBJ_CONTENT, absent on OBJ_DIFF", byId("OBJ_CONTENT").actionContract && byId("OBJ_CONTENT").git_branch_integration && byId("OBJ_CONTENT").authoredBy === "ODG_CAPABILITY" && byId("OBJ_DIFF").actionContract === undefined && byId("OBJ_DIFF").authoredBy === undefined);
  check("research_acquisition passed through onto patches when present on the decision", byId("OBJ_CONTENT").research_acquisition && byId("OBJ_PLAIN").research_acquisition);
  check("authorizedPaths passed through as-is (array)", JSON.stringify(r.plan.authorizedPaths) === JSON.stringify(["runtime/core/"]) && r.plan.requiresEngineering === true);

  // determinism: identical decision ⇒ byte-identical patch-plan.json (no wall-clock stamp).
  const r2 = runEngine(decision);
  check("deterministic: identical mission ⇒ byte-identical patch-plan.json", r2.planRaw === r.planRaw);

  // authorizedPaths normalization: non-array ⇒ [].
  const rNoPaths = runEngine({ mission: "M", priority: "P", actions: [], objectives: [], authorizedPaths: "oops" });
  check("authorizedPaths non-array ⇒ normalized to [] (fail-safe)", rNoPaths.status === 0 && JSON.stringify(rNoPaths.plan.authorizedPaths) === "[]");

  // fail-closed guards.
  const rMissing = runEngine(undefined);
  check("missing decision.json ⇒ exit 1, STOP stderr, NO patch-plan written (fail-closed)", rMissing.status === 1 && /STOP: decision\.json missing or malformed/.test(rMissing.stderr) && rMissing.hadPlan === false);
  const rMalformed = runEngine({ mission: "M", actions: [] });   // no objectives[] ⇒ malformed
  check("malformed decision (no objectives[]) ⇒ exit 1, no patch-plan (fail-closed)", rMalformed.status === 1 && rMalformed.hadPlan === false);
  const rBadJson = runEngine("{not valid json");
  check("unparseable decision.json ⇒ exit 1, no patch-plan (fail-closed)", rBadJson.status === 1 && rBadJson.hadPlan === false);

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — patch-engine (V288 Lot 2.A: real stage-script run in isolated temp cwd — action→objective mapping, normalizeEdits [content/diff/path+file aliases, malformed dropped, non-object], READY_TO_APPLY vs PLANNED, typed passthroughs, authorizedPaths normalization, determinism, fail-closed on missing/malformed/unparseable decision; no mocks; distinct from patch-executor which APPLIES)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
