#!/usr/bin/env node
/*
 * odg diagnose — autonomous-engineering AUDIT entry point (TS port → runtime/dist/bin/odg-diagnose.js,
 * DEFAULT; runtime/bin/odg-diagnose.js is the ODG_RUNTIME=js rollback). Read-only single bounded pass;
 * no network; grants nothing. Exit 0 when no divergence, 1 when an incident is open/frozen. The
 * `../core/*` requires resolve to the compiled dist/core siblings from runtime/dist/bin (parity-safe).
 */
"use strict";

const diag = require("../core/self-diagnostic");

const result = diag.audit({});
const inc = result.incident;
const plan = result.repairPlan;

let recurrence: any = { verdict: "NONE", summary: { total: 0, recurring: 0, frozen: 0, topRecurring: [] } };
try { recurrence = require("../core/incident-recurrence").loadRecurrence({}); } catch { /* best-effort, read-only */ }

console.log("======================================");
console.log("ODG DIAGNOSE (autonomous audit)");
console.log("======================================");
console.log("Mission     :", result.mission || "(none loaded)");
console.log("Expected    :", result.expected.objectives.length, "objective(s),", result.expected.requiredProofs.length, "required proof(s)");
console.log("Observed    :", result.observed.executedOrder.join(", ") || "(none)");
console.log("Divergences :", result.divergences.length);
for (const d of result.divergences) console.log(`  - ${d.category} @ ${d.firstDifferenceAt} (${d.severity})`);
console.log("Recurrence  :", `${recurrence.verdict} (${recurrence.summary.recurring} recurring, ${recurrence.summary.frozen} frozen of ${recurrence.summary.total}; max attempts ${recurrence.summary.maxAttempts || 0})`);
for (const t of recurrence.summary.topRecurring || []) console.log(`  - ${t.id} ×${t.attempts} (${t.status})`);

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
console.log("  AUTO (prepared) :", plan.autoRepairable.map((s: any) => `${s.category}→${s.mechanism}`).join(" | ") || "none");
console.log("  HUMAN_APPROVAL  :", plan.humanApprovalRequired.map((s: any) => s.category).join(", ") || "none");
console.log("  apply allowed   :", plan.applyAllowed, plan.note ? `(${plan.note})` : "");
console.log("Report      :", diag.REPORT_FILE);
console.log("Incident ledger: runtime/generated/autonomy/" + diag.INCIDENTS_FILE + ".json");
console.log("======================================");
process.exit(1);

export {};
