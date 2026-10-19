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
/** Real execution timing for one attempt (optional; both ISO strings, from the same run). */
export interface AttemptTiming { startedAt?: string; endedAt?: string; category?: string }
export type AttemptRecorder = (mission: string, validated: boolean, status: string, timing?: AttemptTiming) => void;

const ATTEMPTS_LOG = path.join(GENERATED_DIR, "mission-attempts.jsonl");

/**
 * Derive the honest attempt outcome of an odg-run.js pipeline run (Phase 3 — the autonomy-loop route that the
 * LOCAL mission-cli recordMissionAttempt seam does not see). PURE + testable. A clean pipeline exit is RECORDED
 * only when the mission-report verdict is genuinely validated SUCCESS; anything else is a non-success attempt
 * with an honest status (never fabricated). No fabrication: an absent report ⇒ UNVERIFIED (not a false success).
 */
export function deriveRunAttempt(
  pipelineOk: boolean,
  ctx: { reportValidated?: boolean; reportStatus?: string; signal?: string | null; governedBlock?: boolean },
): { validated: boolean; status: string } {
  if (pipelineOk) {
    const validated = ctx.reportValidated === true && ctx.reportStatus === "SUCCESS";
    return { validated, status: ctx.reportStatus || (validated ? "SUCCESS" : "UNVERIFIED") };
  }
  const status = ctx.signal ? "INTERRUPTED" : ctx.governedBlock ? "VALIDATION_BLOCKED" : "FAILED";
  return { validated: false, status };
}

export const recordMissionAttempt: AttemptRecorder = (mission, validated, status, timing) => {
  try {
    const require = createRequire(import.meta.url);
    // Source .js port (always present; parity-tested). It is a pure leaf module, NOT part of the dist runtime
    // closure, so it is not emitted to runtime/dist/core — require the committed source port directly.
    const { attemptFromLedgerResult, recordAttempt } = require("../../runtime/core/mission-attempt-log.js") as {
      attemptFromLedgerResult: (m: string, r: unknown, ts: string, extra?: unknown) => unknown;
      recordAttempt: (p: string, rec: unknown) => unknown;
    };
    // recordedAt = the completion timestamp (endedAt) when the runner supplied real timing; otherwise a wall-clock
    // fallback (so callers without timing still produce a valid record). startedAt/endedAt/category pass through;
    // the attempt module validates the pair (both present, ordered, finite) before emitting durationMs.
    const t: AttemptTiming = timing || {};
    const recordedAt = typeof t.endedAt === "string" ? t.endedAt : new Date().toISOString();
    const extra: Record<string, unknown> = {};
    if (typeof t.startedAt === "string") extra.startedAt = t.startedAt;
    if (typeof t.endedAt === "string") extra.endedAt = t.endedAt;
    if (typeof t.category === "string") extra.category = t.category;
    const rec = attemptFromLedgerResult(mission, { skipped: !validated, reason: validated ? null : status }, recordedAt, extra);
    recordAttempt(ATTEMPTS_LOG, rec);
  } catch {
    /* non-blocking telemetry — a logging failure must never affect the mission */
  }
};
