/**
 * front-door-attempt — §2 (ODG_LIVE_AUTONOMY_WEB_TO_MARKET_V1). Records EVERY real run of the DIRECT
 * front-door (runtime/bin/odg-local-pipeline.sh) into the EXISTING attempt-log (mission-attempt-log). The
 * autonomy-loop route already feeds that log (src/runtime adapter + deriveRunAttempt); the direct human door
 * did not — this closes that gap by REUSING mission-attempt-log, no new log format.
 *
 * Honest outcome (mirrors src/runtime deriveRunAttempt, which lives OUT of the runtime/ tree and is
 * unreachable here): a clean exit with a validated SUCCESS report for THIS mission ⇒ RECORDED; a signal ⇒
 * INTERRUPTED; a governed block ⇒ VALIDATION_BLOCKED; else the report status / UNVERIFIED. NEVER a fabricated
 * success (an absent/foreign report is UNVERIFIED, not RECORDED). IDEMPOTENT by (mission, runId): a second
 * record for the same run is refused — no double-count. Pure except the injected `io` (fs) — fully testable.
 */
const AL = require("./mission-attempt-log.js");
const fs = require("fs");
const path = require("path");

// Mirror of deriveRunAttempt (src/runtime/ledger-record-adapter) — kept identical in spirit; a report must
// belong to THIS mission (identity guard) before it can validate a success.
function deriveOutcome(pipelineOk, ctx) {
  const c = ctx || {};
  if (pipelineOk) {
    const validated = c.reportValidated === true && c.reportStatus === "SUCCESS";
    return { validated, status: c.reportStatus || (validated ? "SUCCESS" : "UNVERIFIED") };
  }
  const status = c.signal ? "INTERRUPTED" : c.governedBlock ? "VALIDATION_BLOCKED" : (c.reportStatus || "FAILED");
  return { validated: false, status };
}

// Parse the pipeline's stage markers into executed / failed stage names. Handles BOTH real formats:
//   A (shell summary): ">>> Mission Interpreter  OK   (203ms)"
//   B (run.log file):  "===== >>> Mission Interpreter (exit 0) =====" (exit != 0 ⇒ failed)
function parseStages(runLogText) {
  const executed = [], failed = [];
  for (const l of String(runLogText || "").split("\n")) {
    let m = l.match(/^>>>\s+(.+?)\s+(OK|FAIL)\b/);
    if (m) { executed.push(m[1].trim()); if (m[2] === "FAIL") failed.push(m[1].trim()); continue; }
    m = l.match(/>>>\s+(.+?)\s+\(exit\s+(-?\d+)\)/);
    if (m) { const name = m[1].trim(); executed.push(name); if (Number(m[2]) !== 0) failed.push(name); }
  }
  return { executed, failed };
}

function recordFrontDoorAttempt(opts) {
  const o = opts || {};
  const io = o.io || fs;
  const repoRoot = o.repoRoot || process.cwd();
  const mission = o.mission;
  if (typeof mission !== "string" || !mission) return { written: false, reason: "mission required" };
  const logPath = o.logPath || process.env.ODG_ATTEMPTS_LOG || path.join(repoRoot, "runtime", "generated", "mission-attempts.jsonl");
  const runId = String(o.runId || o.startedAtMs || "");

  // Read THIS run's report (provenance + honest outcome). A report for another mission is ignored (identity guard).
  let report = null;
  try { report = JSON.parse((io.readFileSync || fs.readFileSync)(path.join(repoRoot, "runtime", "generated", "mission-report.json"), "utf8")); } catch { report = null; }
  const reportForMission = report && report.mission === mission ? report : null;

  const pipelineOk = o.exitCode === 0 && !o.signal;
  const oc = deriveOutcome(pipelineOk, {
    reportValidated: reportForMission && reportForMission.validated,
    reportStatus: reportForMission && reportForMission.status,
    signal: o.signal || null,
    governedBlock: o.governedBlock === true,
  });

  // IDEMPOTENCY — refuse a second attempt for the same (mission, runId). Prevents the double-recording §2 warns of.
  const existing = AL.readAttempts(logPath, { io });
  if (runId && existing.some((a) => a && a.mission === mission && a.runId === runId)) {
    return { written: false, reason: "duplicate (mission, runId) — not double-recorded", runId };
  }

  const startedAt = o.startedAt || (o.startedAtMs ? new Date(o.startedAtMs).toISOString() : undefined);
  const endedAt = o.endedAt || (o.endedAtMs ? new Date(o.endedAtMs).toISOString() : undefined);
  const recordedAt = endedAt || new Date().toISOString();

  // REUSE the existing mechanism to build the base record (outcome/reason/timing), then augment with the §2 fields.
  const base = AL.attemptFromLedgerResult(mission, { skipped: !oc.validated, reason: oc.validated ? null : oc.status }, recordedAt,
    { runId: runId || undefined, category: o.category || "front-door", startedAt, endedAt });
  base.attemptId = `${mission}#${runId || recordedAt}`;
  base.source = "front-door:odg-local-pipeline.sh";
  base.finalStatus = oc.status;
  base.provenance = reportForMission ? ["runtime/generated/mission-report.json"] : [];
  base.retries = 0;        // the direct pipeline is single-pass (no in-run retry loop)
  base.recovery = null;    // recovery is a distinct mechanism (odg-recover); absent here unless observed
  let runLogText = o.runLogText;
  if (runLogText === undefined && o.runLogPath) { try { runLogText = (io.readFileSync || fs.readFileSync)(o.runLogPath, "utf8"); } catch { runLogText = ""; } }
  if (typeof runLogText === "string" && runLogText) {
    const st = parseStages(runLogText);
    base.stagesExecuted = st.executed;
    base.stagesFailed = st.failed;
  }
  return AL.recordAttempt(logPath, base, { io });
}

module.exports = { recordFrontDoorAttempt, deriveOutcome, parseStages };
