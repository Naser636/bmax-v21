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
  const { recordMission } = require("../../runtime/dist/core/mission-ledger.js") as {
    recordMission: (mission: string) => unknown;
  };
  return recordMission(mission);
};

/**
 * Attempt-level telemetry recorder — the honest SLO denominator source (CTO continuation §1). The proven-only
 * mission-ledger refuses any non-validated mission, so it structurally cannot represent a failure. This records
 * EVERY run's real outcome (RECORDED | SKIPPED+reason) to an append-only log, so failures ARE representable.
 * Non-blocking (never affects the mission path), and it records the HONEST verdict just computed — no fabrication.
 */
export type AttemptRecorder = (mission: string, validated: boolean, status: string) => void;

const ATTEMPTS_LOG = path.join(GENERATED_DIR, "mission-attempts.jsonl");

export const recordMissionAttempt: AttemptRecorder = (mission, validated, status) => {
  try {
    const require = createRequire(import.meta.url);
    // Source .js port (always present; parity-tested). It is a pure leaf module, NOT part of the dist runtime
    // closure, so it is not emitted to runtime/dist/core — require the committed source port directly.
    const { attemptFromLedgerResult, recordAttempt } = require("../../runtime/core/mission-attempt-log.js") as {
      attemptFromLedgerResult: (m: string, r: unknown, ts: string) => unknown;
      recordAttempt: (p: string, rec: unknown) => unknown;
    };
    // Map the honest verdict to a recordMission-shaped result so the attempt mirrors the ledger's own vocabulary.
    const rec = attemptFromLedgerResult(mission, { skipped: !validated, reason: validated ? null : status }, new Date().toISOString());
    recordAttempt(ATTEMPTS_LOG, rec);
  } catch {
    /* non-blocking telemetry — a logging failure must never affect the mission */
  }
};
