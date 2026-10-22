// @ts-nocheck — spawn-based test of the validation-engine CROSS-MISSION OWNERSHIP GUARD (CTO V4 §B).
/*
 * Proves the authoritative verdict refuses a SUCCESS when mission-plan.json and patch-execution.json belong to
 * DIFFERENT missions (interrupted/stale cross-mission artifacts) — fail-closed BLOCKED. Covers: the reproduced
 * false-success (cross-mission), same-mission non-regression, legacy-unstamped backward-compat, and dual-port
 * parity (historical runtime/core/validation-engine.js ≡ compiled runtime/dist/core/validation-engine.js).
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const JS = path.join(REPO, "runtime", "core", "validation-engine.js");
const DIST = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");

// Run a validation-engine binary in a temp cwd seeded with the given artifacts; return the parsed report.
function runVE(engine, { planMission, execMission, objId }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-xm-"));
  const G = (n) => path.join(dir, "runtime", "generated", n);
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: planMission, mode: "READ_ONLY", requiresEngineering: false, authorizedPaths: [], objectives: [{ id: objId }], definitionOfDone: ["x"] }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: planMission, patches: [{ id: 1, action: objId, objectiveId: objId, status: "PLANNED" }] }));
  const exec = { executed: [{ objectiveId: objId, action: objId, status: "EXECUTED", evidence: "runtime/generated/e.json" }] };
  if (execMission !== undefined) exec.mission = execMission; // omit ⇒ legacy unstamped
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify(exec));
  fs.writeFileSync(G("e.json"), JSON.stringify({ x: 1 }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
  const r = spawnSync("node", [engine], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return { exit: r.status ?? -1, status: rep.status, validated: rep.validated, unmet: rep.unmet || [], checks: rep.checks || {} };
}

console.log("VALIDATION-ENGINE — CROSS-MISSION OWNERSHIP GUARD (§B)");
ok("prerequisite: compiled dist validation-engine present", fs.existsSync(DIST));

// 1 — CROSS-MISSION (plan=B, execution=A): must be BLOCKED (was SUCCESS before the fix — the reproduced defect).
const xm = runVE(JS, { planMission: "MISSION_B", execMission: "MISSION_A", objId: "OBJ_B" });
ok("cross-mission ⇒ BLOCKED validated=false (false-success refused)", xm.validated === false && xm.status === "BLOCKED" && xm.exit === 1);
ok("cross-mission ⇒ explicit unmet names both missions", xm.unmet.some((u) => /MISSION_B/.test(u) && /MISSION_A/.test(u) && /cross-mission|mismatched/i.test(u)));
ok("cross-mission ⇒ checks.crossMissionOk=false", xm.checks.crossMissionOk === false);

// 2 — SAME-MISSION (plan=B, execution=B): unchanged ⇒ SUCCESS (non-regression).
const same = runVE(JS, { planMission: "MISSION_B", execMission: "MISSION_B", objId: "OBJ_B" });
ok("same-mission ⇒ SUCCESS validated=true (no regression)", same.validated === true && same.status === "SUCCESS" && same.exit === 0 && same.checks.crossMissionOk === true);

// 3 — LEGACY unstamped execution (no mission field): backward compatible ⇒ unchanged (SUCCESS, guard inert).
const legacy = runVE(JS, { planMission: "MISSION_B", execMission: undefined, objId: "OBJ_B" });
ok("legacy unstamped execution ⇒ unchanged SUCCESS (guard inert, backward compatible)", legacy.validated === true && legacy.status === "SUCCESS" && legacy.checks.crossMissionOk === true);

// 4 — DUAL-PORT PARITY: historical .js ≡ compiled dist .js on the cross-mission case.
const xmDist = runVE(DIST, { planMission: "MISSION_B", execMission: "MISSION_A", objId: "OBJ_B" });
ok("dual-port parity: dist verdict == historical on cross-mission (BLOCKED)", xmDist.validated === xm.validated && xmDist.status === xm.status && xmDist.checks.crossMissionOk === xm.checks.crossMissionOk);

console.log(`\nVALIDATION-ENGINE CROSS-MISSION GUARD — ${passed} assertions passed.`);
