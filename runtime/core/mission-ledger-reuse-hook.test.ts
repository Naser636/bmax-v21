#!/usr/bin/env node
// @ts-nocheck — runs under tsx. PROVES THE COMPILED production pipeline auto-populates the learning loop: it drives
// the COMPILED runtime/dist/core/mission-ledger.js recordMission() (NOT the source) in an isolated cwd, and shows that
// a proven mission which reused a patch-memory precedent writes a reuse-ledger outcome. Honest: proven missions reach
// this hook, so the auto outcome is validated+unmeasured ⇒ REUSE_INCONCLUSIVE (never auto-VALIDATED / auto-FAILED).
// Also proves: CONTRACT patches are not counted, the (mission,runId) gate prevents replay double-recording, a
// recorder error/absent-decision never breaks the mission record, and empty-ledger behaviour is preserved.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const DIST = path.join(REPO, "runtime", "dist", "core");
if (!fs.existsSync(path.join(DIST, "mission-ledger.js"))) { console.error("dist not built — run npm run build:runtime"); process.exit(1); }
const { recordMission } = require(path.join(DIST, "mission-ledger.js"));          // COMPILED production module
const PM = require(path.join(DIST, "patch-memory.js"));                            // compiled, for the signature

let pass = 0; const ok = (n, c) => { if (!c) { console.error("  FAIL -", n); process.exitCode = 1; } else { console.log("  ok -", n); pass++; } };

const GOV = [path.join("runtime", "constitution", "runtime-constitution.json"), path.join("runtime", "policies", "runtime-policies.json"), path.join("runtime", "governance", "state-machine.json")];
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reuse-hook-"));
  for (const rel of GOV) { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel)); }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}
const G = (dir, n) => path.join(dir, "runtime", "generated", n);
function seed(dir, mission, { validated = true, decision, checkpoint } = {}) {
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status: validated ? "SUCCESS" : "FAILED" }));
  fs.writeFileSync(G(dir, "mission-plan.json"), JSON.stringify({ mission, objectives: (decision && decision.objectives) || [] }));
  if (decision !== undefined) fs.writeFileSync(G(dir, "decision.json"), JSON.stringify(decision));
  if (checkpoint) fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify(checkpoint));
}
function readLedger(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "autonomy", "reuse-ledger.json"), "utf8")); } catch { return null; } }
function run(dir, mission) { const prev = process.cwd(); process.chdir(dir); try { return recordMission(mission); } finally { process.chdir(prev); } }

const MISSION = "REUSE_HOOK_TEST";
const decision = {
  mission: MISSION, objectives: [
    { id: "OBJ-A", goal: "fix the import", patch: [{ target: "a.ts", content: "x" }], authoredBy: "ODG_CAPABILITY" }, // REUSED precedent
    { id: "OBJ-B", goal: "contract work", patch: [{ target: "b.ts", content: "y" }], authoredBy: "CONTRACT" },        // NOT reuse
  ],
};
const sigA = PM.signature({ goal: "fix the import", objectiveId: "OBJ-A" });

// (1) proven mission that reused a precedent ⇒ compiled ledger appends AND the reuse-ledger is populated.
let dir = sandbox();
seed(dir, MISSION, { validated: true, decision });
const r1 = run(dir, MISSION);
ok("compiled recordMission appended the proven mission", r1 && r1.skipped === false && r1.count === 1);
const led = readLedger(dir);
ok("COMPILED pipeline invoked the recorder ⇒ reuse-ledger written", led && led.assets && led.assets[sigA]);
ok("auto outcome = REUSE_INCONCLUSIVE (validated+unmeasured; never auto-VALIDATED)", led.assets[sigA].inconclusive === 1 && led.assets[sigA].validated === 0 && led.assets[sigA].failed === 0 && led.assets[sigA].suppressed === false);
ok("CONTRACT-authored objective was NOT recorded as reuse", Object.keys(led.assets).length === 1);

// (2) idempotency: a duplicate (mission,runId) run is skipped BEFORE the hook ⇒ no second usageHistory entry.
dir = sandbox();
seed(dir, MISSION, { validated: true, decision, checkpoint: { mission: MISSION, startedAt: "RUN-1" } });
const a = run(dir, MISSION);
const b = run(dir, MISSION); // same runId ⇒ DUPLICATE_RUN
ok("duplicate (mission,runId) run is skipped", a.skipped === false && b.skipped === true && b.reason === "DUPLICATE_RUN");
ok("replay does NOT double-record the reuse outcome", readLedger(dir).assets[sigA].usageHistory.length === 1);

// (3) a proven mission with NO reuse ⇒ ledger appends, reuse-ledger stays empty (nothing invented).
dir = sandbox();
seed(dir, MISSION, { validated: true, decision: { mission: MISSION, objectives: [{ id: "X", goal: "g" }] } });
const r3 = run(dir, MISSION);
ok("no reuse ⇒ mission still recorded, reuse-ledger not created", r3.skipped === false && readLedger(dir) === null);

// (4) fail-closed: a recorder failure (absent decision.json) NEVER breaks the mission record.
dir = sandbox();
seed(dir, MISSION, { validated: true }); // no decision.json
const r4 = run(dir, MISSION);
ok("absent decision ⇒ mission recorded, no crash, no reuse-ledger", r4.skipped === false && readLedger(dir) === null);

// (5) unproven mission ⇒ ledger refuses AND the hook never runs (empty-ledger behaviour preserved).
dir = sandbox();
seed(dir, MISSION, { validated: false, decision });
const r5 = run(dir, MISSION);
ok("unproven mission ⇒ UNPROVEN skip, no reuse recorded (hook never runs)", r5.skipped === true && readLedger(dir) === null);

console.log(`\nMISSION-LEDGER-REUSE-HOOK suite — ${pass} assertions passed. (COMPILED pipeline auto-populates reuse-ledger; INCONCLUSIVE-only; idempotent; fail-closed)`);
