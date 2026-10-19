/**
 * mission-attempt-log — an ATTEMPT-level outcome log, the telemetry the proven-only mission-ledger cannot be
 * (CTO continuation §1). mission-ledger.recordMission is default-deny: it appends ONLY proven+validated missions
 * and REFUSES everything else ({skipped, reason}). That is correct for a status-of-record, but it means the
 * ledger structurally cannot represent a failed mission — so it is NOT a valid denominator for a success RATE
 * (see slo-collector survivorship guard). This module records EVERY attempt outcome (recorded OR skipped+reason)
 * WITHOUT touching the ledger or any of its gates: the adapter maps a recordMission RETURN VALUE — which the
 * caller already holds — into an append-only attempt record. No require() is added to the ledger closure.
 *
 * Because this log DOES record failures (SKIPPED attempts), absence of failures in it is genuine, not
 * survivorship — making it the correct source for MISSION_SUCCESS_VERIFIED / FIRST_ATTEMPT once populated.
 *
 * Honesty: fabricates nothing. A missing timestamp/mission is refused. Durations are only emitted when the
 * caller supplies a real startedAt/endedAt pair (the ledger provides none, so latency stays absent here too).
 */

const fs = require("fs");

// Map a mission-ledger.recordMission(...) return value to an attempt record. `recordedAt` MUST be supplied by
// the caller (the ledger's own wall-clock, or the caller's) — never invented here.
function attemptFromLedgerResult(mission: any, result: any, recordedAt: any, extra: any = {}): any {
  const r = result && typeof result === "object" ? result : {};
  const outcome = r.skipped === false ? "RECORDED" : "SKIPPED";
  const rec: any = {
    mission: typeof mission === "string" ? mission : (r.entry && r.entry.mission) || null,
    outcome,
    reason: outcome === "RECORDED" ? null : (r.reason || "UNKNOWN"),
    recordedAt: typeof recordedAt === "string" ? recordedAt : null,
  };
  if (r.verdict !== undefined) rec.verdict = r.verdict;
  if (extra && typeof extra === "object") {
    if (typeof extra.runId === "string") rec.runId = extra.runId;
    if (typeof extra.category === "string") rec.category = extra.category;
    if (typeof extra.startedAt === "string" && typeof extra.endedAt === "string") {
      rec.startedAt = extra.startedAt; rec.endedAt = extra.endedAt;
      const ms = Date.parse(extra.endedAt) - Date.parse(extra.startedAt);
      if (Number.isFinite(ms) && ms >= 0) rec.durationMs = ms;
    }
  }
  return rec;
}

// Append-only JSONL. Refuses to persist an invalid record (no mission or no recordedAt) rather than write junk.
function recordAttempt(logPath: any, record: any, deps: any = {}): any {
  if (!record || !record.mission || !record.recordedAt) return { written: false, reason: "invalid record (mission + recordedAt required)" };
  const io = deps.io || fs;
  const line = JSON.stringify(record) + "\n";
  (io.appendFileSync || fs.appendFileSync)(logPath, line);
  return { written: true, record };
}

function readAttempts(logPath: any, deps: any = {}): any {
  const io = deps.io || fs;
  let raw = "";
  try { raw = (io.readFileSync || fs.readFileSync)(logPath, "utf8"); } catch { return []; }
  return String(raw).split("\n").filter(Boolean).map((l: any) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * Summarize attempts into SLIs for the rate SLOs. Groups by mission; orders each mission's attempts by recordedAt.
 *  - MISSION_SUCCESS_VERIFIED: denominator = distinct missions in window; numerator = missions with >=1 RECORDED.
 *  - MISSION_SUCCESS_FIRST_ATTEMPT: numerator = missions whose CHRONOLOGICALLY FIRST attempt is RECORDED.
 * Both carry failuresRepresentable=true when any SKIPPED exists (this log CAN record failure, so a 100% here is
 * genuine). Below minSampleN ⇒ measurable:false (sample too small) — never coerced.
 */
function summarizeAttempts(attempts: any, opts: any = {}): any {
  const list = Array.isArray(attempts) ? attempts.filter((a) => a && a.mission && a.recordedAt) : [];
  const minSampleN = typeof opts.minSampleN === "number" ? opts.minSampleN : 20;
  const from = typeof opts.windowFrom === "string" ? opts.windowFrom : null;
  const to = typeof opts.windowTo === "string" ? opts.windowTo : null;
  const inWin = (ts: any) => (!from || ts >= from) && (!to || ts <= to);

  const byM: any = {};
  for (const a of list) if (inWin(a.recordedAt)) (byM[a.mission] = byM[a.mission] || []).push(a);
  const missions = Object.keys(byM);
  const anySkipped = list.some((a) => a.outcome === "SKIPPED");

  let verified = 0, firstOk = 0;
  for (const m of missions) {
    const seq = byM[m].slice().sort((x: any, y: any) => String(x.recordedAt).localeCompare(String(y.recordedAt)));
    if (seq.some((a: any) => a.outcome === "RECORDED")) verified++;
    if (seq[0].outcome === "RECORDED") firstOk++;
  }
  const den = missions.length;
  const mk = (num: any) => den < minSampleN
    ? { measurable: false, numerator: num, denominator: den, reason: `sample N=${den} below minimum ${minSampleN}` }
    : { measurable: true, numerator: num, denominator: den, reason: null };

  return {
    window: { from, to },
    distinctMissions: den,
    failuresRepresentable: anySkipped,
    slis: { MISSION_SUCCESS_VERIFIED: mk(verified), MISSION_SUCCESS_FIRST_ATTEMPT: mk(firstOk) },
  };
}

/**
 * Group REAL per-attempt durations (ms) by category, for the MISSION_LATENCY measurement
 * (feed the result to latency-measure.summarizeLatencyByCategory). Only attempts that carry a
 * validated `durationMs` (both timestamps present/ordered/finite) contribute — fabricated nothing.
 * Attempts without a category group under "uncategorized".
 */
function durationsByCategory(attempts: any): any {
  const list = Array.isArray(attempts) ? attempts : [];
  const out: any = {};
  for (const a of list) {
    if (!a || typeof a.durationMs !== "number" || !Number.isFinite(a.durationMs) || a.durationMs < 0) continue;
    const cat = typeof a.category === "string" && a.category ? a.category : "uncategorized";
    (out[cat] = out[cat] || []).push(a.durationMs);
  }
  return out;
}

/**
 * Unified metrics snapshot (§15) — the single COUNTER + rate view over real attempts. REUSES summarizeAttempts
 * (no parallel counter): adds totalAttempts + an outcome breakdown (RECORDED/SKIPPED by reason). Rates stay
 * measurable:false below minSampleN (INSUFFICIENT_EVIDENCE) — never a fabricated percentage. Retries stay attached
 * to their mission (distinctMissions counts missions, not attempts), so retries never inflate the mission count.
 */
function metricsSnapshot(attempts: any, opts: any = {}): any {
  const list = Array.isArray(attempts) ? attempts.filter((a) => a && a.mission && a.recordedAt) : [];
  const s = summarizeAttempts(list, opts);
  const outcomes: any = {};
  for (const a of list) { const k = a.outcome === "RECORDED" ? "RECORDED" : `SKIPPED:${a.reason || "UNKNOWN"}`; outcomes[k] = (outcomes[k] || 0) + 1; }
  const withDuration = list.filter((a) => typeof a.durationMs === "number" && Number.isFinite(a.durationMs) && a.durationMs >= 0).length;
  return {
    window: s.window,
    totalAttempts: list.length,
    distinctMissions: s.distinctMissions,
    failuresRepresentable: s.failuresRepresentable,
    verified: { numerator: s.slis.MISSION_SUCCESS_VERIFIED.numerator, denominator: s.slis.MISSION_SUCCESS_VERIFIED.denominator, measurable: s.slis.MISSION_SUCCESS_VERIFIED.measurable, reason: s.slis.MISSION_SUCCESS_VERIFIED.reason },
    firstAttempt: { numerator: s.slis.MISSION_SUCCESS_FIRST_ATTEMPT.numerator, denominator: s.slis.MISSION_SUCCESS_FIRST_ATTEMPT.denominator, measurable: s.slis.MISSION_SUCCESS_FIRST_ATTEMPT.measurable, reason: s.slis.MISSION_SUCCESS_FIRST_ATTEMPT.reason },
    outcomes,
    attemptsWithDuration: withDuration,
  };
}

module.exports = { attemptFromLedgerResult, recordAttempt, readAttempts, summarizeAttempts, durationsByCategory, metricsSnapshot };
export {};
