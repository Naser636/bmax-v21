#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE WAVE-2 — TARGETED-VERIFY PLANNER (the integration core behind `odg verify
 * --targeted`). PURE, deterministic. Wraps validation-selector with the two hard rules of §1: (a) a CERTIFICATION
 * point ALWAYS imposes a FULL run (never a targeted subset); (b) governance / critical contracts / HIGH risk / an
 * undeterminable impact impose FULL, and a suite NOT executed is NEVER PASS (NOT_RUN). It produces the honest plan +
 * a one-line summary the CLI prints; the CLI (odg-targeted-verify) computes the impacted suites via change-impact-graph
 * and runs the selected subset. It plans; it runs no test and certifies nothing. Dual export.
 */

const SELECTOR = require("./validation-selector");     // selectValidation — the honest targeted/full decision

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * planTargetedVerify({ changedFiles, impactedSuites, allSuites, riskLevel, certification }) -> plan + summary.
 * §1: certification === true ⇒ FULL (a certification point never runs a targeted subset).
 */
function planTargetedVerify(input: any): any {
  const o = isObj(input) ? input : {};
  // a certification point imposes FULL — force it by routing through the selector's FULL path (HIGH risk).
  const certification = o.certification === true;
  const sel = SELECTOR.selectValidation({
    changedFiles: o.changedFiles,
    impactedSuites: o.impactedSuites,
    allSuites: o.allSuites,
    riskLevel: certification ? "HIGH" : o.riskLevel,
  });
  const reasons = certification ? ["certification point ⇒ FULL (a certification never runs a targeted subset)", ...arr(sel.reasons)] : sel.reasons;
  const summary = sel.mode === "FULL"
    ? `FULL validation: ${sel.selectedCount} suites (mandatory gate).`
    : `TARGETED validation: ${sel.selectedCount} impacted suite(s) RUN; ${sel.unrunCount} suite(s) NOT_RUN (NOT PASS). FULL gate still required at certification.`;
  return Object.freeze({
    mode: sel.mode,
    selected: sel.selected, unrun: sel.unrun,
    selectedCount: sel.selectedCount, unrunCount: sel.unrunCount,
    coverage: sel.coverage,
    certificationStillRequired: sel.mode === "TARGETED",   // a targeted run never certifies
    certification,
    reasons: Object.freeze(reasons),
    summary,
  });
}

const TARGETED_VERIFY_CONTRACT = Object.freeze({
  id: "V5-E-TARGETED-VERIFY",
  source: "ODG Engineering Intelligence wave-2 — `odg verify --targeted` integration (§1)",
  reuses: Object.freeze(["validation-selector.selectValidation", "change-impact-graph (impacted suites, via the CLI)", "odg-test-report (runs the selected subset, via the CLI)"]),
  notAuthority: "a planning layer for targeted verification; it runs no test and certifies nothing",
  invariants: Object.freeze([
    "a CERTIFICATION point always imposes a FULL run — a certification never runs a targeted subset",
    "governance / critical contracts / HIGH risk / undeterminable impact ⇒ FULL (uncertainty widens validation)",
    "a suite NOT executed is NEVER PASS — unrun suites are NOT_RUN, and a TARGETED run never certifies",
    "pure/deterministic: delegates the honest decision to validation-selector; no clock/random/network; runs nothing",
  ]),
});

module.exports = { planTargetedVerify, TARGETED_VERIFY_CONTRACT };

if (require.main === module) {
  const t = planTargetedVerify({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts"], allSuites: ["a.test.ts", "b.test.ts"], riskLevel: "LOW" });
  const cert = planTargetedVerify({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts"], allSuites: ["a.test.ts", "b.test.ts"], certification: true });
  process.stdout.write(JSON.stringify({ ...TARGETED_VERIFY_CONTRACT, demo: { targeted: t.mode, certificationForcesFull: cert.mode } }, null, 2) + "\n");
}

export {};
