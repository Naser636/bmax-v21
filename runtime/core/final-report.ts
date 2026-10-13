#!/usr/bin/env node

/*
 * Final Report — last pipeline stage.
 *
 * Summarises the run's PROVEN evidence into a single human-readable report
 * (runtime/generated/reports/<MISSION>.final-report.md), satisfying the "Final report generated"
 * Definition-of-Done item. It only reads already-generated artifacts and never fails the pipeline
 * (best-effort, exit 0): the authoritative verdict is the Validation Engine's, which has already run
 * and gated the pipeline before this stage is reached.
 */

import * as fs from "fs";
import * as path from "path";
const { attributeObjectives }: any = require("./objective-attribution");
const { fromExecution, measureAutonomy, describeExecution, eligibilityFromObjectives }: any = require("./autonomy-measure");

const GENERATED_DIR = "runtime/generated";
const REPORTS_DIR = path.join(GENERATED_DIR, "reports");

function readJsonSafe(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * summarizeC03(lifecycle) -> { total, validated, verified }
 *
 * Consumes the ADDITIVE c03Transitions the Mission Lifecycle now produces (P0-071) — read-only, and
 * tolerant of older lifecycle objects that predate the field (treated as zero). `validated` counts
 * records the real C03 validator accepted (ok === true); `verified` counts those whose observed
 * verification_status is VERIFIED. Pure: no I/O, no clock — a deterministic function of its input.
 */
function summarizeC03(lifecycle: any): any {
  const recs =
    lifecycle && Array.isArray(lifecycle.c03Transitions) ? lifecycle.c03Transitions : [];
  const total = recs.length;
  const validated = recs.filter((r: any) => r && r.ok === true).length;
  const verified = recs.filter(
    (r: any) => r && r.record && r.record.verification_status === "VERIFIED",
  ).length;
  return { total, validated, verified };
}

/**
 * attributionSection(plan, patch, execution, evidenceProbe) -> string[]  (markdown lines)
 *
 * Stage-6 (Evaluation/Regression) first increment — PER-OBJECTIVE ATTRIBUTION as read-only
 * OBSERVABILITY. Surfaces the per-objective verdicts the existing objective-attribution analyzer
 * already computes (EVIDENCED / RECORDED-NO-EVIDENCE / FAILED / UNMATCHED / INCONSISTENT) alongside
 * the bare counts the report printed before. It changes NO gate and asserts NO done_when satisfaction
 * (doneWhenEvaluated stays false), exactly as the analyzer's invariants require.
 *
 * Pure: a deterministic function of its inputs + the injected evidenceProbe (no clock, and no probe
 * execution — declared-proof OBSERVATION is deliberately disabled here via no-op probe injectables, so
 * the report stage reads the three artifacts without running anything). When patch-plan.json or
 * patch-execution.json was not produced this run, it renders an explicit "not available" line rather
 * than a fabricated zero-objective result.
 */
function attributionSection(plan: any, patch: any, execution: any, evidenceProbe: any): any {
  const lines = ["## Per-objective attribution"];
  if (!patch || !execution) {
    lines.push("- (not available — patch-plan.json / patch-execution.json not produced this run)");
    return lines;
  }
  // No-op proof injectables: never run a probe from the report stage (observe nothing, no side effect).
  const noProbeKnown = () => false;
  const noProbeRun = () => ({});
  const { objectives, summary } = attributeObjectives(
    plan,
    patch,
    execution,
    typeof evidenceProbe === "function" ? evidenceProbe : () => false,
    noProbeRun,
    noProbeKnown,
    {},
  );
  lines.push(
    `- Evidenced: ${summary.evidenced} · Recorded (no evidence): ${summary.recordedNoEvidence} · ` +
      `Failed: ${summary.failed} · Unmatched: ${summary.unmatched} · Inconsistent: ${summary.inconsistent} ` +
      `(done_when NOT evaluated)`,
  );
  if (objectives.length === 0) {
    lines.push("- (no per-objective patches to attribute)");
  } else {
    for (const o of objectives) {
      lines.push(`- ${o.objectiveId === null ? "(no objectiveId)" : o.objectiveId}: **${o.verdict}** — ${o.reason}`);
    }
  }
  return lines;
}

/**
 * autonomySection(plan, patchPlan, patchExecution, checks, evidenceProbe) -> string[]  (markdown lines)
 *
 * NON-AUTHORITATIVE autonomy measurement appended to the final report (Phase-03). It reuses the EXISTING
 * measurer and NEVER mutates any artifact or verdict (pure — returns lines). The GLOBAL per-mission % is
 * GATED: emitted ONLY when a PROVEN per-objective eligibility+authorization source exists. No such explicit
 * source exists in the runtime today — mission-level authorized_paths is NOT per-objective proof and MUST
 * NOT be used — so the % is reported NON_MEASURABLE and only the DESCRIPTIVE category ventilation is shown.
 * `coverageOk` is consumed ONLY as the runComplete signal (its demonstrated semantics), never as eligibility.
 * Pure: a deterministic function of its inputs (the injected probe is only used to observe evidence files).
 */
function autonomySection(plan: any, patchPlan: any, patchExecution: any, checks: any, evidenceProbe: any): any {
  const lines = ["## Autonomy (measured — non-authoritative)"];
  if (!patchExecution || !Array.isArray(patchExecution.executed)) {
    lines.push("- (not available — patch-execution.json not produced this run)");
    return lines;
  }
  const probe = typeof evidenceProbe === "function" ? evidenceProbe : () => false;
  // Reuse the evidence verdicts already computed by the existing analyzer (no probe execution).
  const attribution = attributeObjectives(plan || {}, patchPlan, patchExecution, probe, () => ({}), () => false, {});
  const hasCoverage = !!(checks && "objectiveCoverage" in checks);
  const coverageOk = !!(checks && checks.objectiveCoverage === true); // runComplete signal ONLY

  // Denominator = EXPLICIT per-objective eligibility+authorization declarations ONLY (never fabricated from
  // authorizedPaths / requiresEngineering / executor identity / status). If any objective lacks a valid
  // declaration, the denominator is incomplete ⇒ NON_MEASURABLE (no % is ever shown on an unproven base).
  const planObjectives = Array.isArray(plan && plan.objectives) ? plan.objectives : [];
  const { map: eligibilityByObjective, complete, missing } = eligibilityFromObjectives(planObjectives);
  const measured = complete
    ? measureAutonomy(fromExecution(patchExecution, attribution, eligibilityByObjective, { runComplete: coverageOk }))
    : { measurable: false };

  if (!complete) {
    lines.push(`- Autonomy %: **NON_MEASURABLE** — ${missing.length} objective(s) lack a valid explicit `
      + `eligibility+authorization declaration (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}). `
      + "A contract DECLARATION is required; mission-level authorized_paths is NOT per-objective proof. Breakdown below is descriptive.");
  } else if (measured.measurable) {
    lines.push(`- Autonomy %: **${measured.autonomyPercent}%** (ODG-executed+verified ${measured.numerator}/${measured.denominator}, denominator proven)`);
  } else {
    lines.push("- Autonomy %: **NON_MEASURABLE** — declarations complete but the run is not fully classifiable "
      + "(incomplete coverage, ambiguous join, or unproven author/applicator/verification). Breakdown below is descriptive.");
  }
  lines.push("- Run coverage (runComplete signal): "
    + (hasCoverage ? (coverageOk ? "complete" : "INCOMPLETE — absent objectives are NOT assumed non-executed") : "absent (no coverage signal this run)"));
  const c = describeExecution(patchExecution, attribution);
  const k = c.counts;
  lines.push("- Descriptive breakdown (events observed, NOT a denominator): "
    + `ODG-executed+verified ${k.odgExecutedVerified} · external ${k.external} · blocked/refused/failed ${k.blockedFailed} · `
    + `human-mandatory ${k.humanMandatory} · not-executed ${k.notExecuted} · unknown/unverified ${k.unknownOrUnverified}`
    + (c.inconsistent ? ` · inconsistent-join ${c.inconsistent}` : ""));
  return lines;
}

function main(): any {
  const mission = process.argv[2] || "BUILD_RUNTIME";

  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json")) || {};
  const report = readJsonSafe(path.join(GENERATED_DIR, "mission-report.json")) || {};
  const lifecycle = readJsonSafe(path.join(GENERATED_DIR, "mission-lifecycle.json")) || {};
  const checks = report.checks || {};

  // Stage-6 per-objective attribution (read-only observability). Null when a stage did not produce it.
  const patchPlan = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json"));
  const patchExecution = readJsonSafe(path.join(GENERATED_DIR, "patch-execution.json"));
  const evidenceProbe = (p: any) => {
    try { return typeof p === "string" && p.length > 0 && fs.statSync(p).size > 0; } catch { return false; }
  };
  const attribution = attributionSection(plan, patchPlan, patchExecution, evidenceProbe);
  // Phase-03 additive, non-authoritative autonomy measurement (gated %: NON_MEASURABLE without explicit
  // per-objective eligibility; descriptive breakdown always). Reads checks.objectiveCoverage as runComplete.
  const autonomy = autonomySection(plan, patchPlan, patchExecution, checks, evidenceProbe);

  const c03 = summarizeC03(lifecycle);
  const caps = Array.isArray(checks.capabilities) ? checks.capabilities : [];
  const capLines = caps.length
    ? caps.map((c: any) => `- ${c.ok ? "✅" : "❌"} **${c.capability}** — ${c.detail}`).join("\n")
    : "- (no capability probes declared)";

  const md = [
    `# Final Report — ${mission}`,
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Status: **${report.status || "UNKNOWN"}**`,
    `- Validated: **${report.validated === true}**`,
    `- Governance state: **${lifecycle.achieved || "CREATED"}**` +
      (lifecycle.path ? ` (path: ${lifecycle.path.join(" → ")})` : ""),
    `- Archived: **${lifecycle.archived === true}**`,
    `- C03 transitions: **${c03.validated}/${c03.total} C03-valid** (${c03.verified} VERIFIED)`,
    "",
    "## Objectives",
    `- Declared: ${checks.objectives ?? (Array.isArray(plan.objectives) ? plan.objectives.length : 0)}`,
    `- Planned patches: ${checks.planned ?? 0}`,
    `- Executed: ${checks.executed ?? 0}`,
    `- Failed: ${checks.failed ?? 0}`,
    "",
    ...attribution,
    "",
    ...autonomy,
    "",
    "## Capability proofs",
    capLines,
    "",
    "## Definition of Done",
    ...(Array.isArray(plan.definitionOfDone) && plan.definitionOfDone.length
      ? plan.definitionOfDone.map((d: any) => `- ${d}`)
      : ["- (none declared)"]),
    "",
  ].join("\n");

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const out = path.join(REPORTS_DIR, `${mission}.final-report.md`);
  fs.writeFileSync(out, md);

  console.log("======================================");
  console.log("FINAL REPORT");
  console.log("======================================");
  console.log("Mission  :", mission);
  console.log("State    :", lifecycle.achieved || "CREATED");
  console.log("Status   :", report.status || "UNKNOWN");
  console.log("Output   :", out);
  console.log("======================================");
}

module.exports = { summarizeC03, attributionSection, autonomySection };

// Only auto-run (and exit) when invoked as a script — the pipeline spawns `node final-report.js`, so
// this is identical to before. `require()` (the test) imports summarizeC03 without side effects.
if (require.main === module) {
  try {
    main();
  } catch (e: any) {
    console.warn("[FinalReport] Non-blocking error:", e.message);
  }
  process.exit(0);
}
