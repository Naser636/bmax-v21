/**
 * front-door-attempt — §2 (ODG_LIVE_AUTONOMY_WEB_TO_MARKET_V1). Records EVERY real run of the DIRECT
 * front-door (runtime/bin/odg-local-pipeline.sh) into the EXISTING attempt-log (mission-attempt-log). The
 * autonomy-loop route already feeds that log (src/runtime adapter + deriveRunAttempt); the direct human door
 * did not — this closes that gap by REUSING mission-attempt-log, no new log format.
 *
 * Honest outcome (mirrors src/runtime deriveRunAttempt, which lives OUT of the runtime/ tree and is
 * unreachable here): a clean exit with a validated SUCCESS report for THIS mission ⇒ RECORDED; a signal ⇒
 * INTERRUPTED; a governed block ⇒ VALIDATION_BLOCKED; else the report status / UNVERIFIED. NEVER a fabricated
 * success. IDEMPOTENT by (mission, runId): a second record for the same run is refused — no double-count.
 */
const AL = require("./mission-attempt-log.js");
const fs = require("fs");
const path = require("path");

function deriveOutcome(pipelineOk: boolean, ctx: any): any {
  const c = ctx || {};
  if (pipelineOk) {
    const validated = c.reportValidated === true && c.reportStatus === "SUCCESS";
    return { validated, status: c.reportStatus || (validated ? "SUCCESS" : "UNVERIFIED") };
  }
  const status = c.signal ? "INTERRUPTED" : c.governedBlock ? "VALIDATION_BLOCKED" : (c.reportStatus || "FAILED");
  return { validated: false, status };
}

function parseStages(runLogText: any): any {
  const executed: string[] = [], failed: string[] = [];
  for (const l of String(runLogText || "").split("\n")) {
    let m = l.match(/^>>>\s+(.+?)\s+(OK|FAIL)\b/);
    if (m) { executed.push(m[1].trim()); if (m[2] === "FAIL") failed.push(m[1].trim()); continue; }
    m = l.match(/>>>\s+(.+?)\s+\(exit\s+(-?\d+)\)/);
    if (m) { const name = m[1].trim(); executed.push(name); if (Number(m[2]) !== 0) failed.push(name); }
  }
  return { executed, failed };
}

function recordFrontDoorAttempt(opts: any): any {
  const o = opts || {};
  const io = o.io || fs;
  const repoRoot = o.repoRoot || process.cwd();
  const mission = o.mission;
  if (typeof mission !== "string" || !mission) return { written: false, reason: "mission required" };
  const logPath = o.logPath || process.env.ODG_ATTEMPTS_LOG || path.join(repoRoot, "runtime", "generated", "mission-attempts.jsonl");
  const runId = String(o.runId || o.startedAtMs || "");

  let report: any = null;
  try { report = JSON.parse((io.readFileSync || fs.readFileSync)(path.join(repoRoot, "runtime", "generated", "mission-report.json"), "utf8")); } catch { report = null; }
  const reportForMission = report && report.mission === mission ? report : null;

  const pipelineOk = o.exitCode === 0 && !o.signal;
  const oc = deriveOutcome(pipelineOk, {
    reportValidated: reportForMission && reportForMission.validated,
    reportStatus: reportForMission && reportForMission.status,
    signal: o.signal || null,
    governedBlock: o.governedBlock === true,
  });

  const existing = AL.readAttempts(logPath, { io });
  if (runId && existing.some((a: any) => a && a.mission === mission && a.runId === runId)) {
    return { written: false, reason: "duplicate (mission, runId) — not double-recorded", runId };
  }

  const startedAt = o.startedAt || (o.startedAtMs ? new Date(o.startedAtMs).toISOString() : undefined);
  const endedAt = o.endedAt || (o.endedAtMs ? new Date(o.endedAtMs).toISOString() : undefined);
  const recordedAt = endedAt || new Date().toISOString();

  const base: any = AL.attemptFromLedgerResult(mission, { skipped: !oc.validated, reason: oc.validated ? null : oc.status }, recordedAt,
    { runId: runId || undefined, category: o.category || "front-door", startedAt, endedAt });
  base.attemptId = `${mission}#${runId || recordedAt}`;
  base.source = "front-door:odg-local-pipeline.sh";
  base.finalStatus = oc.status;
  base.provenance = reportForMission ? ["runtime/generated/mission-report.json"] : [];
  base.retries = 0;
  base.recovery = null;
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
export {};
