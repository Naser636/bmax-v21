#!/usr/bin/env node
/**
 * mission-fidelity-verdict — V48 Lot E (register G-01 applied): APPLIES objective-fidelity to the REAL mission cycle.
 * It maps the canonical artifacts (mission-plan.json's definitionOfDone/objectives + mission-report.json's status /
 * unmet / evidence-gate checks) onto an objective-fidelity contract + evidence-bearing deliverables, and returns the
 * fidelity verdict. The final-report close stage invokes this (best-effort, exit 0) and persists fidelity-verdict.json
 * — so objective-fidelity is exercised on the real path, not only by its own tests.
 *
 * It CANNOT let a mission read COMPLETE when: a required DoD outcome is missing or in `unmet`; a mandatory evidence
 * gate failed; or the report claims validated while outcomes are unverified. A genuinely validated mission is ACCEPTed.
 * Non-authoritative by design (the Validation Engine remains the pipeline gate); this is an explicit fidelity
 * cross-check surfaced at close. Pure + fail-closed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const FIDELITY = require("./objective-fidelity.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Evidence gates that, when present and false, mean a DoD item is NOT credibly satisfied.
const MANDATORY_GATES = ["buildGate", "typescriptGate", "objectiveCoverage", "noFailedActions", "evidenceIntegrity", "noGammaFalseSuccess"];

/**
 * assessMissionFidelity(plan, report): build the contract + deliverables from the canonical artifacts and evaluate.
 * Returns { ok, decision, verdict, unsatisfied, carryForward, gateFailures, claimedComplete }.
 */
function assessMissionFidelity(plan: any, report: any): any {
  if (!isObj(plan)) return { ok: false, code: "INVALID_INPUT", reason: "mission-plan required" };
  if (!isObj(report)) return { ok: false, code: "INVALID_INPUT", reason: "mission-report required" };

  const dod: string[] = Array.isArray(plan.definitionOfDone) ? plan.definitionOfDone : [];
  const objectives: any[] = Array.isArray(plan.objectives) ? plan.objectives : [];
  const requiredOutcomes = dod.length
    ? dod.map((d: any, i: number) => ({ id: `dod-${i + 1}`, acceptance: typeof d === "string" ? d : `criterion ${i + 1}` }))
    : objectives.map((o: any, i: number) => ({ id: (o && o.id) || `obj-${i + 1}`, acceptance: (o && (o.done_when || o.goal)) || `objective ${i + 1}` }));
  if (requiredOutcomes.length === 0) requiredOutcomes.push({ id: "default", acceptance: "mission objective satisfied" });

  const unmet = new Set((Array.isArray(report.unmet) ? report.unmet : []).map((u: any) => typeof u === "string" ? u : (u && (u.id || u.text))));
  const checks = isObj(report.checks) ? report.checks : {};
  const gateFailures = MANDATORY_GATES.filter((g) => g in checks && checks[g] === false);
  const reportValidated = report.validated === true || String(report.status || "").toUpperCase() === "VALIDATED" || report.completed === true;
  // If any mandatory gate failed, NO outcome can be credibly VERIFIED (the run's evidence is not trustworthy).
  const evidenceTrustworthy = gateFailures.length === 0;

  // Map each required outcome to an evidence-bearing deliverable.
  const dodTexts: string[] = dod.map((d: any) => typeof d === "string" ? d : "");
  const deliverables = requiredOutcomes.map((o: any, i: number) => {
    const text = dodTexts[i] || o.acceptance;
    const isUnmet = unmet.has(text) || unmet.has(o.id);
    const satisfied = reportValidated && evidenceTrustworthy && !isUnmet;
    return {
      outcomeId: o.id,
      state: satisfied ? "VERIFIED" : (isUnmet ? "NOT_STARTED" : (!evidenceTrustworthy ? "BLOCKED" : "IMPLEMENTED_UNVERIFIED")),
      evidence: satisfied ? `mission-report validated; gates pass; not in unmet` : "",
      unblock: isUnmet ? "satisfy the unmet definition-of-done item" : (!evidenceTrustworthy ? `fix failed gates: ${gateFailures.join(", ")}` : "supply verified evidence"),
    };
  });

  const contract = { objectiveId: report.mission || plan.mission || "MISSION", statement: `Mission completion fidelity for ${report.mission || plan.mission || "MISSION"}`, requiredOutcomes };
  const claim = { status: reportValidated ? "COMPLETE" : (report.status || "IN_PROGRESS"), deliverables };
  const evaluated = FIDELITY.evaluateCompletionClaim(contract, claim);
  if (!evaluated.ok) return evaluated;

  return {
    ok: true,
    decision: evaluated.decision,                 // ACCEPT | REJECT_FALSE_COMPLETION | ACKNOWLEDGE_INCOMPLETE
    verdict: evaluated.verdict,                    // COMPLETE | INCOMPLETE
    claimedComplete: reportValidated,
    gateFailures,
    unsatisfied: evaluated.unsatisfied || [],
    carryForward: evaluated.carryForward || [],
    note: "Applied objective-fidelity cross-check at mission close (non-authoritative; the Validation Engine is the gate). A report cannot read COMPLETE while a required DoD item is unmet, a mandatory evidence gate failed, or outcomes are unverified.",
  };
}

// Coding routes that are NOT a successful execution and must never be stamped SUCCESS (mandate B.3).
const NON_SUCCESS_ROUTES = ["ROUTE_UNSUPPORTED", "ABSTAIN", "BLOCKED"];

/**
 * codingFidelityGate(codingResolution, opts?): the HARD-GATE condition the Validation Engine ANDs into its final
 * acceptance. Returns { block, reason, route? }. A coding mission routed ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED cannot be
 * a success. Absent artifact ⇒ no block (non-coding / pre-integration missions unaffected — zero regression). A
 * PRESENT-but-malformed artifact ⇒ block (fail-closed: never grant success on an unreadable fidelity signal).
 */
function codingFidelityGate(codingResolution: any, opts: any = {}): any {
  const existed = opts.fileExisted === true || (codingResolution !== null && codingResolution !== undefined);
  if (!existed) return { block: false, reason: "no coding-resolution artifact (non-coding or pre-integration mission)" };
  if (!isObj(codingResolution)) return { block: true, reason: "coding-resolution.json present but malformed — fail-closed (no false success)" };
  if (codingResolution.executed === true) return { block: false, reason: "coding-resolution marks executed (handled upstream)" };
  if (codingResolution.codingMission === true && NON_SUCCESS_ROUTES.includes(codingResolution.route)) {
    return { block: true, route: codingResolution.route, reason: `coding mission routed ${codingResolution.route} — not a successful execution (cannot be stamped SUCCESS)` };
  }
  return { block: false, route: codingResolution.route || null, reason: `coding route ${codingResolution.route || "n/a"} does not block acceptance` };
}

/** writeVerdict(cwd, verdict): persist runtime/generated/fidelity-verdict.json (best-effort). */
function writeVerdict(cwd: string, verdict: any): boolean {
  try {
    const out = path.join(cwd, "runtime", "generated", "fidelity-verdict.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(verdict, null, 2));
    return true;
  } catch { return false; }
}

export { assessMissionFidelity, writeVerdict, codingFidelityGate, MANDATORY_GATES, NON_SUCCESS_ROUTES };
module.exports = { assessMissionFidelity, writeVerdict, codingFidelityGate, MANDATORY_GATES, NON_SUCCESS_ROUTES };
