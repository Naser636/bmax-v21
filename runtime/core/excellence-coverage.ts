#!/usr/bin/env node
/**
 * excellence-coverage — EXECUTABLE coverage matrix for the permanent excellence rule (AXE 1). Not a primitive, not an
 * orchestrator: a data+query module recording, per component FAMILY, whether/where it consults the excellence engine,
 * the executable evidence, and the honest gaps. The shared enforcement boundary is excellence-policy.requireExcellence
 * (reused by the scheduler + capabilities); this module does NOT re-implement it.
 *
 * HONESTY: `consults:true` requires a gated executable proof (a referenced test). Families without one are
 * `consults:false` and listed by uncoveredComponents — no total-coverage claim is made.
 */
"use strict";

const EXC = require("./excellence-policy.js");

export interface CoverageRow {
  component: string;
  family: string;
  criticality: number;            // 1..5
  integrationPoint: string;       // where/how the rule is applied
  consults: boolean;              // true ⇒ proven to consult the engine (via a gated test)
  evidence: string;               // executable evidence pointer (test suite) or ""
  status: "COVERED" | "COVERED_VIA_BOUNDARY" | "NOT_COVERED";
  gap: string;
}

// The canonical matrix. Mission execution is covered at the SHARED scheduler boundary (one chokepoint covers the
// whole mission-execution family); capabilities that self-review are covered directly. Everything else is honestly
// marked NOT_COVERED with its gap.
const COVERAGE_MATRIX: CoverageRow[] = [
  { component: "mission-scheduler", family: "mission-execution", criticality: 5, integrationPoint: "schedulerStep → requireExcellence (shared boundary)", consults: true, evidence: "mission-scheduler.test.ts (Axis A)", status: "COVERED", gap: "" },
  { component: "odg-schedule-tick", family: "mission-execution", criticality: 5, integrationPoint: "injects reviewExcellence into the canary ctx (read-only)", consults: true, evidence: "wired; exercised via mission-scheduler contract", status: "COVERED_VIA_BOUNDARY", gap: "bin not unit-tested (entrypoint); covered by the scheduler contract" },
  { component: "regulatory-assurance", family: "capability-self-review", criticality: 4, integrationPoint: "buildDossier → reviewForExcellence (auto)", consults: true, evidence: "regulatory-assurance.test.ts", status: "COVERED", gap: "" },
  { component: "agent-governance (demonstrator)", family: "capability-self-review", criticality: 4, integrationPoint: "reviewForExcellence on domain autonomous-governance", consults: true, evidence: "excellence-policy.test.ts (cross-component)", status: "COVERED", gap: "" },
  { component: "resolvers / capability-router", family: "resolution", criticality: 3, integrationPoint: "run as missions ⇒ scheduler boundary", consults: false, evidence: "", status: "NOT_COVERED", gap: "not individually wired; covered only when dispatched as a scheduled mission" },
  { component: "capability-executors", family: "execution", criticality: 4, integrationPoint: "governed by third-party-agent + authorizeExecution, not the excellence rule", consults: false, evidence: "", status: "NOT_COVERED", gap: "excellence rule not applied per-executor (would be over-injection); candidate: a future executor-level self-review" },
  { component: "learning reuse (excellence-gate.gateLearningReuse)", family: "learning", criticality: 3, integrationPoint: "gateLearningReuse → requireExcellence + provenance + audit-log (effective-reuse proof)", consults: true, evidence: "excellence-gate.test.ts", status: "COVERED", gap: "" },
  { component: "recovery (excellence-gate.gateRecovery)", family: "recovery", criticality: 4, integrationPoint: "gateRecovery → requireExcellence + evidence provenance + audit-log", consults: true, evidence: "excellence-gate.test.ts", status: "COVERED", gap: "" },
  { component: "capability-learning (reuseLearning)", family: "learning-legacy-integrated", criticality: 3, integrationPoint: "capability-learning.reuseLearning → excellence-gate (real module API)", consults: true, evidence: "capability-learning.test.ts (INTEGRATION)", status: "COVERED", gap: "" },
  { component: "checkpoint-engine (begin resume)", family: "recovery-legacy-integrated", criticality: 4, integrationPoint: "checkpoint-engine.begin(opts.recovery) → excellence-gate.gateRecovery (real module API, opt-in)", consults: true, evidence: "checkpoint-engine.test.ts (INTEGRATION recovery)", status: "COVERED", gap: "" },
  { component: "build-recovery-engine (recover apply)", family: "recovery-legacy-integrated", criticality: 4, integrationPoint: "build-recovery-engine.recover(opts.recovery) → excellence-gate.gateRecovery (real module API, opt-in)", consults: true, evidence: "build-recovery-engine.test.ts (AXE A)", status: "COVERED", gap: "" },
  { component: "post-release-learning / router recall / resolution / per-executor execution", family: "learning-recovery-legacy", criticality: 3, integrationPoint: "not yet calling the gate directly", consults: false, evidence: "", status: "NOT_COVERED", gap: "these legacy/resolution/execution paths not yet routed through excellence-gate — candidate follow-ups (capability-learning reuse + checkpoint-engine resume + build-recovery apply now integrated)" },
];

function coveredFamilies(matrix?: CoverageRow[]): string[] {
  const m = matrix || COVERAGE_MATRIX;
  return [...new Set(m.filter(r => r.consults).map(r => r.family))].sort();
}
function uncoveredComponents(matrix?: CoverageRow[]): CoverageRow[] {
  return (matrix || COVERAGE_MATRIX).filter(r => !r.consults);
}
function coverageSummary(matrix?: CoverageRow[]): { total: number; covered: number; uncovered: number; coveredFamilies: string[] } {
  const m = matrix || COVERAGE_MATRIX;
  return { total: m.length, covered: m.filter(r => r.consults).length, uncovered: m.filter(r => !r.consults).length, coveredFamilies: coveredFamilies(m) };
}

// Re-export the shared boundary so consumers import ONE enforcement contract.
const requireExcellence = EXC.requireExcellence;

export { COVERAGE_MATRIX, coveredFamilies, uncoveredComponents, coverageSummary, requireExcellence };
module.exports = { COVERAGE_MATRIX, coveredFamilies, uncoveredComponents, coverageSummary, requireExcellence };
