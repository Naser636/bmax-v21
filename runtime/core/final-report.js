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

function main() {
  const mission = process.argv[2] || "BUILD_RUNTIME";

  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json")) || {};
  const report = readJsonSafe(path.join(GENERATED_DIR, "mission-report.json")) || {};
  const lifecycle = readJsonSafe(path.join(GENERATED_DIR, "mission-lifecycle.json")) || {};
  const checks = report.checks || {};

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

try {
  main();
} catch (e) {
  console.warn("[FinalReport] Non-blocking error:", e.message);
}
process.exit(0);
