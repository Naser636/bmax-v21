#!/usr/bin/env node

const fs = require("fs");
const { authorizeMission } = require("./governance-kernel");

const LEDGER_FILE = "runtime/generated/mission-ledger.json";

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function recordMission(mission) {
  const governance = authorizeMission(mission);

  const plan = readJsonSafe("runtime/generated/mission-plan.json") || {};
  const context = readJsonSafe("runtime/generated/runtime-context.json");

  const entry = {
    recordedAt: new Date().toISOString(),
    mission: plan.mission || mission,
    state: governance.currentState,
    authorized: governance.authorized,
    nextStates: governance.nextStates,
    constitutionVersion: governance.constitutionVersion,
    policyVersion: governance.policyVersion,
    strategy: governance.strategy,
    objectives: Array.isArray(plan.objectives) ? plan.objectives.length : 0
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
