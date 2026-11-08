#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — VALIDATION SELECTOR (E08 Adaptive Validation Budget + E09 Test Topology +
 * Validation Economics). PURE, deterministic. Given a change-set and the set of suites impacted by it (computed by
 * change-impact-graph / affected-tests and INJECTED), it selects the minimal HONEST validation set for a TARGETED
 * run — and declares which suites are NOT_RUN. It enforces the §4 quality guardrail that makes acceleration safe:
 *   - a suite NOT executed is NEVER declared PASS (unrun is NOT_RUN);
 *   - a change touching governance / contracts / Truth-Lock / the register, OR a HIGH risk level, OR an
 *     undeterminable impact, FORCES a FULL validation — "uncertainty WIDENS validation, it never reduces it";
 *   - TARGETED validation ALWAYS still requires the FULL mandatory gate at its certification point.
 * It selects/decides; it runs nothing and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const MODE = Object.freeze(["TARGETED", "FULL"]);
// paths whose change forces a FULL validation (critical/governance surface — uncertainty widens validation).
const CRITICAL_RE = /governance|constitution|policies|ODG_AUTONOMOUS_WORK_PROTOCOL|truth-lock|root-of-trust|action-gate|campaign-controller|closure-register|master-program-integration|\.github\/workflows|package\.json|tsconfig/i;

function touchesCritical(changedFiles: any[]): any { return arr(changedFiles).filter((f) => typeof f === "string" && CRITICAL_RE.test(f)); }

/**
 * selectValidation({ changedFiles, impactedSuites, allSuites, riskLevel }) ->
 *   { mode, selected, unrun, selectedCount, unrunCount, coverage, certificationStillRequired, reasons }.
 * Fail-closed: HIGH risk / critical-path change / undeterminable impact ⇒ FULL. Unrun suites are NOT_RUN, never PASS.
 */
function selectValidation(input: any): any {
  const o = isObj(input) ? input : {};
  const allSuites = arr(o.allSuites).filter((s) => typeof s === "string");
  const changedFiles = arr(o.changedFiles);
  const critical = touchesCritical(changedFiles);
  const reasons: string[] = [];

  // FORCE FULL on any uncertainty or critical/governance surface (§4).
  const impactUnknown = o.impactedSuites === undefined || o.impactedSuites === null;
  if (o.riskLevel === "HIGH") reasons.push("risk level HIGH ⇒ FULL");
  if (critical.length > 0) reasons.push(`change touches critical/governance surface (${critical.slice(0, 3).join(", ")}${critical.length > 3 ? "…" : ""}) ⇒ FULL`);
  if (impactUnknown) reasons.push("impacted suites undeterminable ⇒ FULL (uncertainty widens validation, fail-closed)");
  if (o.riskLevel === "HIGH" || critical.length > 0 || impactUnknown) {
    return Object.freeze({ mode: "FULL", selected: Object.freeze(allSuites), unrun: Object.freeze([]), selectedCount: allSuites.length, unrunCount: 0, coverage: 1, certificationStillRequired: false, reasons: Object.freeze(reasons), note: "FULL validation — all suites run; mandatory gate satisfied" });
  }

  // TARGETED: run the impacted subset; everything else is NOT_RUN (never PASS).
  const impacted = new Set(arr(o.impactedSuites).filter((s) => typeof s === "string"));
  const selected = allSuites.filter((s) => impacted.has(s));
  const unrun = allSuites.filter((s) => !impacted.has(s));
  reasons.push(`TARGETED: ${selected.length} impacted suite(s) selected; ${unrun.length} suite(s) NOT_RUN (not PASS)`);
  return Object.freeze({
    mode: "TARGETED",
    selected: Object.freeze(selected), unrun: Object.freeze(unrun),
    selectedCount: selected.length, unrunCount: unrun.length,
    coverage: allSuites.length > 0 ? Number((selected.length / allSuites.length).toFixed(4)) : 0,
    certificationStillRequired: true,   // a TARGETED run never certifies — the FULL gate is mandatory at cert
    reasons: Object.freeze(reasons),
    note: "TARGETED validation — unrun suites are NOT_RUN (never PASS); the FULL mandatory gate is still required at certification",
  });
}

const VALIDATION_SELECTOR_CONTRACT = Object.freeze({
  id: "V5-E-VALIDATION-SELECTOR",
  source: "ODG Engineering Intelligence — E08 Adaptive Validation Budget / E09 Test Topology / Validation Economics",
  modes: MODE,
  reuses: Object.freeze(["change-impact-graph.impactOf / affected-tests (injected impacted-suite set)", "odg-test-report runs the selected subset"]),
  notAuthority: "selects the honest validation set; it runs no test, certifies nothing, and grants no authority",
  invariants: Object.freeze([
    "a suite NOT executed is NEVER declared PASS — unrun suites are NOT_RUN",
    "HIGH risk / a change to governance·contracts·Truth-Lock·register·CI·tsconfig / an undeterminable impact ⇒ FULL (uncertainty WIDENS validation, fail-closed)",
    "a TARGETED run never certifies: the FULL mandatory gate is still required at the certification point",
    "TARGETED selects only the injected impacted suites; coverage is reported honestly",
    "pure/deterministic: change-set + impacted set + suites in → selection out; no clock/random/network; runs nothing",
  ]),
});

module.exports = { touchesCritical, selectValidation, VALIDATION_SELECTOR_CONTRACT };

if (require.main === module) {
  const all = ["a.test.ts", "b.test.ts", "c.test.ts"];
  const targeted = selectValidation({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts"], allSuites: all, riskLevel: "LOW" });
  const forced = selectValidation({ changedFiles: ["runtime/core/campaign-controller.ts"], impactedSuites: ["a.test.ts"], allSuites: all });
  process.stdout.write(JSON.stringify({ ...VALIDATION_SELECTOR_CONTRACT, demo: { targeted: { mode: targeted.mode, run: targeted.selectedCount, notRun: targeted.unrunCount }, criticalForced: forced.mode } }, null, 2) + "\n");
}

export {};
