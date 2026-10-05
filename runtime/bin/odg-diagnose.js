#!/usr/bin/env node

/*
 * odg diagnose — the autonomous-engineering AUDIT entry point.
 *
 * Reuses the EXISTING CLI architecture (one `runtime/bin/odg-*.js` per `odg <cmd>` case) and the
 * EXISTING self-diagnostic seam (runtime/core/self-diagnostic.js). It starts from the latest valid
 * checkpoint/plan (runtime/generated/mission-plan.json — the same artifact the live pipeline leaves),
 * compares EXPECTED vs OBSERVED, raises/updates an INCIDENT, and PREPARES (does not apply) a bounded
 * repair plan that routes to the existing repair/rollback engines. Read-only; single bounded pass; no
 * network; grants nothing. Exit code: 0 when no divergence, 1 when an incident is open/frozen — so it
 * is usable as a gate or a post-event trigger without any new scheduler.
 */

"use strict";

const diag = require("../core/self-diagnostic");

const result = diag.audit({});
const inc = result.incident;
const plan = result.repairPlan;

console.log("======================================");
console.log("ODG DIAGNOSE (autonomous audit)");
console.log("======================================");
console.log("Mission     :", result.mission || "(none loaded)");
console.log("Expected    :", result.expected.objectives.length, "objective(s),", result.expected.requiredProofs.length, "required proof(s)");
console.log("Observed    :", result.observed.executedOrder.join(", ") || "(none)");
console.log("Divergences :", result.divergences.length);
for (const d of result.divergences) console.log(`  - ${d.category} @ ${d.firstDifferenceAt} (${d.severity})`);

if (!inc) {
  console.log("Incident    : none");
  console.log("Summary     : NO_DIVERGENCE — system matches expected state.");
  console.log("Report      :", diag.REPORT_FILE);
  console.log("======================================");
  process.exit(0);
}

console.log("Incident    :", `${inc.id} ${inc.status} (attempt ${inc.attempts}/${inc.maxAttempts})`);
console.log("Mode        :", result.mode);
console.log("Repair plan :");
console.log("  AUTO (prepared) :", plan.autoRepairable.map((s) => `${s.category}→${s.mechanism}`).join(" | ") || "none");
console.log("  HUMAN_APPROVAL  :", plan.humanApprovalRequired.map((s) => s.category).join(", ") || "none");
console.log("  apply allowed   :", plan.applyAllowed, plan.note ? `(${plan.note})` : "");
console.log("Report      :", diag.REPORT_FILE);
console.log("Incident ledger: runtime/generated/autonomy/" + diag.INCIDENTS_FILE + ".json");
console.log("======================================");
process.exit(1);
