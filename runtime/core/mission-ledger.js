#!/usr/bin/env node

const fs = require("fs");
const { authorizeMission } = require("./governance-kernel");
const { computeLifecycle, markArchived } = require("./mission-lifecycle");

const LEDGER_FILE = "runtime/generated/mission-ledger.json";

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function recordMission(mission) {
  // Proven-only gate: never record a mission the Validation Engine explicitly marked NOT validated.
  // In the odg-run / mse path the Validation Engine writes mission-report.json for THIS mission and
  // exits non-zero when it is not proven (so this stage is not even reached). This check is the
  // defensive backstop: if a mission-report for this exact mission exists and is not validated, the
  // ledger refuses to append. (The autonomy provider path archives only after a Release Manager
  // RELEASE; there the report may be absent or for another mission, so it is not blocked here.)
  const report = readJsonSafe("runtime/generated/mission-report.json");
  if (report && report.mission === mission && report.validated !== true) {
    console.warn(`[MissionLedger] Refusing to record "${mission}": validation not proven (status=${report.status}).`);
    return { skipped: true, reason: "UNPROVEN", entry: { mission } };
  }

  const governance = authorizeMission(mission);

  const plan = readJsonSafe("runtime/generated/mission-plan.json") || {};
  // The authoritative mission identity is this function's argument — every caller passes it
  // (odg-run/mse, fleet dispatcher/collector, the LOCAL route adapter). mission-plan.json is a
  // GLOBAL artifact written only by the Mission Loader; the LOCAL route never regenerates it, so a
  // stale plan from a previous pipeline must not relabel this entry or lend it another mission's
  // objectives. Only trust plan-derived fields when the plan is coherent with the calling mission.
  const scopedPlan = plan && plan.mission === mission ? plan : {};
  const context = readJsonSafe("runtime/generated/runtime-context.json");

  // Governance lifecycle: advance the state machine from evidence, then archive (recording a proven
  // mission in this immutable ledger IS its archival). The recorded `state` is therefore the REAL
  // achieved governance state — no longer hardcoded to "CREATED". markArchived is a no-op unless the
  // lifecycle reached RELEASED and governance authorizes RELEASED → ARCHIVED.
  let lifecycle;
  try {
    computeLifecycle(mission);
    lifecycle = markArchived(mission);
  } catch (e) {
    lifecycle = null;
    console.warn("[MissionLedger] Lifecycle unavailable (recording CREATED):", e.message);
  }

  const entry = {
    recordedAt: new Date().toISOString(),
    mission: mission,
    state: lifecycle ? lifecycle.achieved : governance.currentState,
    authorized: governance.authorized,
    nextStates: governance.nextStates,
    lifecyclePath: lifecycle ? lifecycle.path : undefined,
    archived: lifecycle ? lifecycle.archived === true : undefined,
    constitutionVersion: governance.constitutionVersion,
    policyVersion: governance.policyVersion,
    strategy: governance.strategy,
    objectives: Array.isArray(scopedPlan.objectives) ? scopedPlan.objectives.length : 0,
    // Only proven executions reach this point (see the gate above), so every entry is proven.
    proven: true,
    validated: report && report.mission === mission ? report.validated === true : undefined
  };

  if (context && context.project) {
    entry.projectFiles = context.project.files;
    entry.projectDirectories = context.project.directories;
  }

  // Immutability: read existing entries, never rewrite past ones.
  let entries = [];
  if (fs.existsSync(LEDGER_FILE)) {
    const existing = readJsonSafe(LEDGER_FILE);
    if (existing === null) {
      // Corrupted / unreadable ledger: do NOT overwrite past evidence.
      console.warn("[MissionLedger] Existing ledger unreadable - skipping append to preserve evidence.");
      return { skipped: true, entry };
    }
    entries = Array.isArray(existing.entries) ? existing.entries : [];
  }

  entries.push(entry);

  fs.mkdirSync("runtime/generated", { recursive: true });
  fs.writeFileSync(
    LEDGER_FILE,
    JSON.stringify({ generatedAt: entry.recordedAt, count: entries.length, entries }, null, 2)
  );

  return { skipped: false, entry, count: entries.length };
}

module.exports = { recordMission };

if (require.main === module) {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  try {
    const result = recordMission(mission);
    console.log("======================================");
    console.log("MISSION LEDGER");
    console.log("======================================");
    console.log("Mission   :", result.entry.mission);
    console.log("State     :", result.entry.state);
    console.log("Recorded  :", result.skipped ? "SKIPPED" : "YES");
    if (!result.skipped) console.log("Entries   :", result.count);
    console.log("Output    :", LEDGER_FILE);
    console.log("======================================");
  } catch (err) {
    // Never break the pipeline: ledger is the last, non-blocking stage.
    console.warn("[MissionLedger] Non-blocking error:", err.message);
  }
  process.exit(0);
}
