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

const fs = require("fs");
const path = require("path");

const GENERATED_DIR = "runtime/generated";
const REPORTS_DIR = path.join(GENERATED_DIR, "reports");

function readJsonSafe(file) {
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
function summarizeC03(lifecycle) {
  const recs =
    lifecycle && Array.isArray(lifecycle.c03Transitions) ? lifecycle.c03Transitions : [];
  const total = recs.length;
  const validated = recs.filter((r) => r && r.ok === true).length;
  const verified = recs.filter(
    (r) => r && r.record && r.record.verification_status === "VERIFIED",
  ).length;
  return { total, validated, verified };
}

function main() {
  const mission = process.argv[2] || "BUILD_RUNTIME";

  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json")) || {};
  const report = readJsonSafe(path.join(GENERATED_DIR, "mission-report.json")) || {};
  const lifecycle = readJsonSafe(path.join(GENERATED_DIR, "mission-lifecycle.json")) || {};
  const checks = report.checks || {};

  const c03 = summarizeC03(lifecycle);
  const caps = Array.isArray(checks.capabilities) ? checks.capabilities : [];
  const capLines = caps.length
    ? caps.map((c) => `- ${c.ok ? "✅" : "❌"} **${c.capability}** — ${c.detail}`).join("\n")
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
    "## Capability proofs",
    capLines,
    "",
    "## Definition of Done",
    ...(Array.isArray(plan.definitionOfDone) && plan.definitionOfDone.length
      ? plan.definitionOfDone.map((d) => `- ${d}`)
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

module.exports = { summarizeC03 };

// Only auto-run (and exit) when invoked as a script — the pipeline spawns `node final-report.js`, so
// this is identical to before. `require()` (the test) imports summarizeC03 without side effects.
if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.warn("[FinalReport] Non-blocking error:", e.message);
  }
  process.exit(0);
}
