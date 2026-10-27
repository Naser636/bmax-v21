#!/usr/bin/env node
// @ts-nocheck — runs under tsx. PROVES the COMPILED validation-engine records the FAILED-mission reuse outcome
// (the path the Mission Ledger hook cannot reach — failed missions halt first). It SPAWNS the compiled
// runtime/dist/core/validation-engine.js (real production artifact, not source/tsx), and verifies attribution
// (only a reused precedent whose OWN objective failed is blamed), end-to-end de-selection, and the attribution unit.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.cwd();
const DIST = path.join(REPO, "runtime", "dist", "core");
const VE = path.join(DIST, "validation-engine.js");
if (!fs.existsSync(VE)) { console.error("dist not built — run npm run build:runtime"); process.exit(1); }
const PM = require(path.join(DIST, "patch-memory.js"));
const REC = require(path.join(DIST, "mission-reuse-recorder.js"));
const ROUTER = require(path.join(DIST, "capability-router.js"));

let pass = 0; const ok = (n, c) => { if (!c) { console.error("  FAIL -", n); process.exitCode = 1; } else { console.log("  ok -", n); pass++; } };

function sandbox(mission, { executed, decisionObjectives }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-reuse-"));
  const g = path.join(dir, "runtime", "generated"); fs.mkdirSync(g, { recursive: true });
  fs.writeFileSync(path.join(g, "mission-plan.json"), JSON.stringify({ mission, objectives: decisionObjectives.map(o => ({ id: o.id, goal: o.goal })) }));
  fs.writeFileSync(path.join(g, "patch-plan.json"), JSON.stringify({ mission, patches: decisionObjectives.map(o => ({ objectiveId: o.id })) }));
  fs.writeFileSync(path.join(g, "patch-execution.json"), JSON.stringify({ mission, executed }));
  fs.writeFileSync(path.join(g, "decision.json"), JSON.stringify({ mission, objectives: decisionObjectives }));
  return dir;
}
function runVE(dir) { try { execFileSync("node", [VE], { cwd: dir, stdio: "pipe" }); return 0; } catch (e) { return e.status || 1; } }
function ledger(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "autonomy", "reuse-ledger.json"), "utf8")); } catch { return null; } }

const reusedObj = { id: "OBJ-A", goal: "fix import", patch: [{ target: "a.ts", content: "x" }], authoredBy: "ODG_CAPABILITY" };
const sigA = PM.signature({ goal: "fix import", objectiveId: "OBJ-A" });

// (1) the COMPILED artifact carries the wiring.
ok("compiled validation-engine.js wires mission-reuse-recorder + failedObjectiveIds", (() => { const s = fs.readFileSync(VE, "utf8"); return s.includes("mission-reuse-recorder") && s.includes("failedObjectiveIds"); })());

// (2) COMPILED VE on a FAILED mission whose reused objective failed ⇒ REUSE_FAILED recorded + exit 1.
let dir = sandbox("VE_FAIL", { executed: [{ objectiveId: "OBJ-A", action: "OBJ-A", status: "FAILED" }], decisionObjectives: [reusedObj] });
const code2 = runVE(dir);
const l2 = ledger(dir);
ok("compiled VE exits non-zero on failed mission", code2 === 1);
ok("compiled VE recorded REUSE_FAILED for the failed reused precedent", l2 && l2.assets[sigA] && l2.assets[sigA].failed === 1 && l2.assets[sigA].usageHistory[0].outcome === "REUSE_FAILED");

// (3) ATTRIBUTION: when a DIFFERENT objective fails (not the reused one), the reused precedent is NOT blamed.
dir = sandbox("VE_ATTR", { executed: [{ objectiveId: "OBJ-B", action: "OBJ-B", status: "FAILED" }, { objectiveId: "OBJ-A", action: "OBJ-A", status: "APPLIED" }], decisionObjectives: [reusedObj, { id: "OBJ-B", goal: "other", patch: [{ target: "b.ts", content: "y" }], authoredBy: "CONTRACT" }] });
runVE(dir);
const l3 = ledger(dir);
ok("unrelated failure does NOT blame the reused precedent (no false REUSE_FAILED)", !l3 || !l3.assets[sigA]);

// (4) end-to-end: TWO compiled-VE failed runs ⇒ signature suppressed ⇒ compiled router de-selects it.
dir = sandbox("VE_SUPPRESS", { executed: [{ objectiveId: "OBJ-A", action: "OBJ-A", status: "FAILED" }], decisionObjectives: [reusedObj] });
runVE(dir); runVE(dir);
const lsup = ledger(dir);
ok("two compiled failed runs ⇒ suppressed in ledger", lsup.assets[sigA].failed === 2 && lsup.assets[sigA].suppressed === true);
const prev = process.cwd(); process.chdir(dir);
try {
  PM.record({ goal: "fix import", objectiveId: "OBJ-A", edits: [{ target: "a.ts", content: "x" }], authoredBy: "ODG_CAPABILITY", mission: "VE_SUPPRESS" });
  const routed = ROUTER.route({ goal: "fix import", objectiveId: "OBJ-A" });   // default store = sandbox ledger
  ok("compiled router DE-SELECTS the precedent the compiled VE failed", !(routed.chosen && routed.chosen.tier === "PATCH_MEMORY") && routed.reuse && routed.reuse.suppressed === true);
} finally { process.chdir(prev); }

// (5) compiled recorder attribution unit: failed obj ⇒ FAILED; non-failed reused obj (not validated) ⇒ skipped.
const st = (() => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; })();
const decision = { mission: "U", objectives: [reusedObj, { id: "OBJ-C", goal: "c", patch: [{ target: "c.ts", content: "z" }], authoredBy: "ODG" }] };
const r = REC.recordMissionReuseOutcomes("U", { decision, report: { mission: "U", validated: false }, failedObjectiveIds: ["OBJ-A"], at: "t" }, { store: st });
const rowA = r.results.find(x => x.objectiveId === "OBJ-A"); const rowC = r.results.find(x => x.objectiveId === "OBJ-C");
ok("attributed: failed objective ⇒ REUSE_FAILED; unrelated reused objective ⇒ skipped UNATTRIBUTABLE", rowA.outcome === "REUSE_FAILED" && rowC.skipped === "UNATTRIBUTABLE" && r.attributed === true);

console.log(`\nVALIDATION-ENGINE-REUSE-FEEDBACK suite — ${pass} assertions passed. (COMPILED VE records attributed REUSE_FAILED on failed missions; de-selection; no false blame)`);
