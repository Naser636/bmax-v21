/*
 * Ledger record adapter — the single seam that lets the src/runtime LOCAL (migrated) route
 * hand its validated result to the EXISTING ledger writer runtime/core/mission-ledger.js
 * (recordMission), reused unchanged.
 *
 * It writes THIS mission's validation report (runtime/generated/mission-report.json) — the
 * artifact recordMission's proven-only gate reads — derived from the honest RuntimeReporter
 * verdict (ROOT CAUSE #2 gate), then calls the existing recordMission. No new engine, no
 * ledger logic duplicated, no cascade, no routing bypass: recordMission still REFUSES to
 * append any mission whose report is not validated (proven-only gate preserved).
 *
 * NOTE: the Mission Ledger lives under runtime/generated/ (git-ignored / ephemeral). Per
 * PHASE_0_CARNET P0-CURRENT-045 it is INSUFFICIENT as durable proof; this adapter only makes
 * the contract's ledger completion gate technically reachable — it is NOT a durable
 * certification of the mission.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** Record a single mission's validated outcome into the Mission Ledger via the existing writer. */
export type LedgerRecorder = (
  mission: string,
  validated: boolean,
  status: string,
) => unknown;

const GENERATED_DIR = path.join("runtime", "generated");
const MISSION_REPORT = path.join(GENERATED_DIR, "mission-report.json");

export const recordMissionToLedger: LedgerRecorder = (mission, validated, status) => {
  // Write the mission's validation REPORT (not the ledger) from the honest reporter verdict.
  // recordMission reads this file and refuses to append when validated !== true.
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(
    MISSION_REPORT,
    JSON.stringify({ mission, validated, status }, null, 2),
  );
  const require = createRequire(import.meta.url);
  const { recordMission } = require("../../runtime/core/mission-ledger.js") as {
    recordMission: (mission: string) => unknown;
  };
  return recordMission(mission);
};
