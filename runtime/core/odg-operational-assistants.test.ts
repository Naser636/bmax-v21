#!/usr/bin/env node
"use strict";
/* V277 §3 (P2 Lot 2) — Operations / Procurement / HR functional assistants. Asserts real domain computation (schedule state,
 * material reconciliation with NO fabricated prices, labour cost never-from-salary with COST_NOT_MEASURED), governed decision
 * ownership (Operations↔RESOLVE_OPS), prepare/recommend-only, UNKNOWN-surfacing, forbidden-action rails, PARTIAL maturity. SYNTHETIC. */
const O = require("./odg-operational-assistants.js");
const WORKFLOW = require("./odg-btp-project-workflow.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const tasks = [{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }];
  const scheduleResult = WORKFLOW.planSchedule(tasks);   // the dashboard's operations.schedule expects a planSchedule RESULT
  const input = {
    surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, operations: { schedule: scheduleResult }, odg: { missions: [{ id: "M1", status: "READY" }] } } },  // commercial absent ⇒ UNKNOWN; blocked task ⇒ DEC_BLOCKED (RESOLVE_OPS)
    schedule: tasks,
    materials: [{ id: "ciment", requiredQty: 100, orderedQty: 80, deliveredQty: 70, consumedQty: 50 }],   // under-ordered + short-delivery; NO price supplied
    labour: { entries: [{ id: "e1", status: "APPROVED", who: "w1", minutes: 60, dateMs: 1, startMin: 480, endMin: 540, loadedRateMinorPerHour: 4000 }, { id: "e2", status: "APPROVED", who: "w2", minutes: 60, dateMs: 1, startMin: 480, endMin: 540 }], workforce: { items: [{ id: "w1" }, { id: "w2" }] } },
  };

  const lot = O.runLot2(input);
  check("runLot2: 3 assistants (Operations/Procurement/HR), all ok, all PREPARE-only, NONE operational", lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false);

  const ops = O.runOperationalAssistant("OPERATIONS", input);
  check("Operations: real schedule computation (taskCount 2, blocked 1) via planSchedule; owns RESOLVE_OPS decision (DEC_BLOCKED)",
    ops.ok && ops.domainFindings.kind === "SCHEDULE" && ops.domainFindings.taskCount === 2 && ops.domainFindings.blocked === 1 && ops.ownedDecisions.some((d: any) => d.id === "DEC_BLOCKED" && d.thrust === "RESOLVE_OPS") && ops.executesNothing === true);
  check("Operations: forbidden to silently overwrite a schedule / reassign to an unqualified task", ops.forbiddenActions.some((x: string) => /silently overwrite a schedule/.test(x)) && ops.forbiddenActions.some((x: string) => /unqualified/.test(x)));

  const proc = O.runOperationalAssistant("PROCUREMENT", input);
  check("Procurement: real material reconciliation (1 shortage + 1 discrepancy) via reconcileMaterials; prices NOT fabricated",
    proc.ok && proc.domainFindings.kind === "MATERIALS" && proc.domainFindings.shortages === 1 && proc.domainFindings.discrepancies === 1 && proc.domainFindings.pricesFabricated === false && proc.domainFindings.pricesCarriedOnlyWhenSupplied === true);
  check("Procurement: owns NO decision (no procurement thrust in the engine — honest PARTIAL); forbidden to fabricate stock/prices or order autonomously",
    proc.ownedCount === 0 && proc.forbiddenActions.some((x: string) => /fabricate stock/.test(x)) && proc.forbiddenActions.some((x: string) => /place an order autonomously/.test(x)) && proc.maturity.status === "PARTIAL");

  const hr = O.runOperationalAssistant("HUMAN_RESOURCES", input);
  check("HR: real labour cost (total 4000 from e1@4000/h; e2 COST_NOT_MEASURED ⇒ measured 1 / notMeasured 1) — never from salary",
    hr.ok && hr.domainFindings.kind === "LABOUR" && hr.domainFindings.totalMinor === 4000 && hr.domainFindings.measured === 1 && hr.domainFindings.notMeasured === 1 && hr.domainFindings.costNeverFromSalary === true);
  check("HR: forbidden to derive employer cost from a salary / make a disciplinary decision / run payroll autonomously",
    hr.forbiddenActions.some((x: string) => /derive employer cost from a salary/.test(x)) && hr.forbiddenActions.some((x: string) => /disciplinary/.test(x)) && hr.forbiddenActions.some((x: string) => /payroll autonomously/.test(x)));

  // UNKNOWN ≠ 0 surfaced; everything prepare-only; maturity honest.
  check("UNKNOWN ≠ 0 surfaced (commercial absent ⇒ missingDataCount>0, decidable false)", ops.missingDataCount > 0 && ops.decidable === false && hr.missingDataCount > 0);
  check("every assistant: executesNothing true, maturity PARTIAL not operational", [ops, proc, hr].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));

  // fail-closed + determinism + contract.
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", O.runOperationalAssistant("LOGISTICS_XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(O.runOperationalAssistant("PROCUREMENT", input)) === JSON.stringify(proc) && Object.isFrozen(O.OPS_ASSISTANTS));
  check("contract: real domain computation + governed surface (reuse, no new engine); prepare-only; no fabricated price; labour never from salary; PARTIAL",
    O.OPERATIONAL_ASSISTANTS_CONTRACT.reuses.some((x: string) => /workforce-labour-engine/.test(x)) && O.OPERATIONAL_ASSISTANTS_CONTRACT.reuses.some((x: string) => /reconcileMaterials/.test(x)) && O.OPERATIONAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NEVER fabricates stock/.test(i)) && O.OPERATIONAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NEVER from a salary/.test(i)) && O.OPERATIONAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NO assistant claimed OPERATIONAL/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-operational-assistants (V277 P2 Lot 2: Operations [schedule state, RESOLVE_OPS] / Procurement [material reconciliation, NO fabricated prices] / HR [labour cost never-from-salary, COST_NOT_MEASURED surfaced] as functional assistants = real domain engine + governed surface; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; 6/20 domains across Lots 1-2; reuse — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
