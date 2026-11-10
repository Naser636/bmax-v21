#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V36 — MISSION OUTCOME RECORDER. PURE, deterministic, fail-closed. The canonical per-attempt verdict is the
 * governed pipeline's `mission-report.json` ({ mission, validated, status }) — produced by the Validation Engine (the
 * INDEPENDENT verifier), which DOES emit real FAILUREs (validated:false / status:"FAILED"), unlike the closure-register.
 * This adapter DERIVES a mission-outcome entry from that canonical report + its execution provenance (actor-provenance)
 * and records it into the EXISTING mission-outcome-ledger — the real, UNBIASED calibration source. It is the raccordement
 * (§3) between the mission lifecycle and the outcome ledger; it creates no parallel memory and no estimate.
 *
 * Mapping (fail-closed): validated===true AND status "SUCCESS" ⇒ SUCCESS; status "FAILED"/"FAIL" or validated===false ⇒
 * FAILURE; status "BLOCKED" ⇒ BLOCKED; "CANCELLED"/"SKIPPED" ⇒ CANCELLED; "DEFERRED" ⇒ DEFERRED; anything else/absent ⇒
 * UNKNOWN (never a silent success). independentlyVerified = the verdict came from the governed pipeline (validated is a
 * boolean), NOT the generator's self-report. Dual export.
 */

const LEDGER = require("./mission-outcome-ledger.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** deriveOutcome(report) -> { outcome, independentlyVerified, reason }. Fail-closed over the canonical report shape. */
function deriveOutcome(report: any): any {
  const r = isObj(report) ? report : {};
  const status = isStr(r.status) ? r.status.toUpperCase().trim() : "";
  const validatedBool = r.validated === true || r.validated === false;   // a boolean verdict ⇒ an independent check ran
  let outcome: string;
  if (r.validated === true && (status === "SUCCESS" || status === "OK" || status === "PASSED")) outcome = "SUCCESS";
  else if (status === "FAILED" || status === "FAIL" || r.validated === false) outcome = "FAILURE";
  else if (status === "BLOCKED") outcome = "BLOCKED";
  else if (status === "CANCELLED" || status === "SKIPPED") outcome = "CANCELLED";
  else if (status === "DEFERRED") outcome = "DEFERRED";
  else outcome = "UNKNOWN";
  return Object.freeze({ outcome, independentlyVerified: validatedBool && (outcome === "SUCCESS" || outcome === "FAILURE"), reason: `status=${status || "(none)"} validated=${r.validated}` });
}

/**
 * recordFromReport(outcomes, report, meta) -> { ok, outcomes, recorded }. Composes deriveOutcome + the mission-outcome-
 * ledger. meta: { attempt?, metier?, type?, at?, provenanceActor?, evidence?, componentVersion? }. Append-only + deduped
 * by (missionId, attempt); a report without a mission id is rejected (fail-closed). Records real SUCCESS and FAILURE alike.
 */
function recordFromReport(outcomes: any, report: any, meta: any = {}): any {
  const r = isObj(report) ? report : {};
  const missionId = isStr(r.mission) ? r.mission : (isStr(meta.missionId) ? meta.missionId : null);
  if (!missionId) return Object.freeze({ ok: false, reason: "report has no mission id — not recorded (fail-closed)", outcomes: Array.isArray(outcomes) ? outcomes : [] });
  const d = deriveOutcome(r);
  const res = LEDGER.recordOutcome(outcomes, {
    missionId, attempt: meta.attempt, metier: meta.metier, type: meta.type || r.type,
    outcome: d.outcome, at: meta.at, independentlyVerified: d.independentlyVerified,
    evidence: isStr(meta.evidence) ? meta.evidence : "mission-report.json verdict",
    provenance: meta.provenanceActor || null, componentVersion: meta.componentVersion || null,
  });
  return Object.freeze({ ok: res.ok === true, deduped: res.deduped === true, outcome: d.outcome, outcomes: res.outcomes, recorded: res.ok === true && res.deduped !== true });
}

const MISSION_OUTCOME_RECORDER_CONTRACT = Object.freeze({
  id: "V124-MISSION-OUTCOME-RECORDER",
  source: "CTO V36 — raccordement: canonical mission-report verdict → mission-outcome-ledger",
  reuses: Object.freeze(["mission-report.json (the governed Validation-Engine verdict — the INDEPENDENT, failure-inclusive source)", "mission-outcome-ledger.recordOutcome", "actor-provenance (execution provenance)"]),
  notAuthority: "derives one outcome from a canonical verdict and records it; it estimates nothing and authorizes nothing",
  invariants: Object.freeze([
    "the outcome source is the governed Validation-Engine verdict (validated boolean), NOT the generator's self-report — independentlyVerified for SUCCESS/FAILURE",
    "status FAILED / validated:false ⇒ FAILURE (real failures are recorded, un-biasing calibration); BLOCKED ⇒ not a technical failure",
    "unknown/absent status ⇒ UNKNOWN, never a silent success; a report without a mission id is rejected",
    "append-only + deduped by (missionId, attempt) via the existing ledger; no parallel memory; it never rewrites history",
    "pure/deterministic; it produces no estimate and no authorization",
  ]),
});

module.exports = { deriveOutcome, recordFromReport, MISSION_OUTCOME_RECORDER_CONTRACT };

if (require.main === module) {
  const failRun = recordFromReport([], { mission: "M_FAIL", validated: false, status: "FAILED" });
  const okRun = recordFromReport(failRun.outcomes, { mission: "M_OK", validated: true, status: "SUCCESS" });
  process.stdout.write(JSON.stringify({ ...MISSION_OUTCOME_RECORDER_CONTRACT, demo: { failRecorded: failRun.outcome === "FAILURE", successRecorded: okRun.outcome === "SUCCESS", total: okRun.outcomes.length } }, null, 2) + "\n");
}

export {};
