#!/usr/bin/env node
"use strict";
/* IMP-P7-SLO-VIEW — SLO/error-budget from real events; fail-closed NOT_MEASURED; alerting NOT_MEASURED. */
const S = require("./odg-slo-error-budget-view.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = S.sloErrorBudget({ goodEvents: 995, totalEvents: 1000, sloTarget: 0.99 });
  check("SLI measured from real events (995/1000)", m.sli.status === "MEASURED" && m.sli.value === 0.995);
  check("error budget measured: allowedBad=10, actualBad=5, remaining 50%", m.errorBudget.status === "MEASURED" && m.errorBudget.allowedBad === 10 && m.errorBudget.actualBad === 5 && m.errorBudget.remainingFraction === 0.5 && m.errorBudget.exhausted === false);
  check("burn rate computed (5/10 = 0.5)", m.errorBudget.burnRate === 0.5);

  // exhausted budget
  const ex = S.sloErrorBudget({ goodEvents: 980, totalEvents: 1000, sloTarget: 0.99 });
  check("budget exhausted when actualBad ≥ allowedBad (20 ≥ 10)", ex.errorBudget.exhausted === true && ex.errorBudget.remainingFraction < 0);

  // fail-closed: no events ⇒ NOT_MEASURED (no fabricated SLI)
  const empty = S.sloErrorBudget({});
  check("no request events ⇒ SLI + error-budget NOT_MEASURED (no fabricated SLI)", empty.sli.status === "NOT_MEASURED" && empty.errorBudget.status === "NOT_MEASURED");
  check("invalid good>total ⇒ NOT_MEASURED", S.sloErrorBudget({ goodEvents: 10, totalEvents: 5, sloTarget: 0.99 }).sli.status === "NOT_MEASURED");
  check("no valid SLO target ⇒ error-budget NOT_MEASURED (SLI still measured)", (() => { const r = S.sloErrorBudget({ goodEvents: 9, totalEvents: 10 }); return r.sli.status === "MEASURED" && r.errorBudget.status === "NOT_MEASURED"; })());

  check("alerting is NOT_MEASURED (no fabricated alerting)", m.alerting.status === "NOT_MEASURED" && /real alerting/.test(m.alerting.reason));
  check("contract + honesty", /no fabricated SLI/.test(S.SLO_ERROR_BUDGET_CONTRACT.invariants[0]) && /never a fabricated SLI/.test(m.honesty));

  // V374 Lot 3 — eventBudgetAnalysis on timestamped events (same (1 − SLO) × total definition).
  {
    const E = (t: string, good: boolean, change?: string) => ({ t, good, change });
    const ev = [E("2026-11-01T10:00:00Z", true, "a"), E("2026-11-01T11:00:00Z", false, "b"), E("2026-11-01T11:20:00Z", true, "b"), E("2026-11-02T09:00:00Z", true, "a"),
      E("2026-11-03T09:00:00Z", false, "c"), E("2026-11-03T10:00:00Z", false, "c"), E("2026-11-04T09:00:00Z", true, "a"), E("2026-11-04T10:00:00Z", true, "a"), E("2026-11-04T11:00:00Z", true, "a"), E("2026-11-04T12:00:00Z", true, "a")];
    const r = S.eventBudgetAnalysis(ev, { sloTarget: 0.9, windowDays: 4, burnAlertFactor: 2 });
    check("events: allowedBad = (1 − SLO) × total = 1.0 for 10 events at 0.9; 3 bad ⇒ exhausted", r.status === "MEASURED" && r.errorBudget.allowedBad === 1 && r.errorBudget.actualBad === 3 && r.errorBudget.exhausted === true);
    check("events: early warning fires on the day the burn rate ≥ 2× (before/at exhaustion)", r.earlyWarning.firstAlertDay === "2026-11-01" && r.earlyWarning.alertBeforeExhaustion === true);
    check("events: incident↔change correlation + recovery = next success on the SAME change (b: 20 min; c: unrecovered)", r.incidents.count === 3 && r.incidents.byChange.c === 2 && r.incidents.recoveryMinutes.p50 === 20 && r.incidents.unrecovered === 2);
    check("events: no events / no window / no SLO ⇒ NOT_MEASURED (never fabricated)", S.eventBudgetAnalysis([], { sloTarget: 0.9, windowDays: 4 }).status === "NOT_MEASURED" && S.eventBudgetAnalysis(ev, { sloTarget: 0.9 }).status === "NOT_MEASURED" && S.eventBudgetAnalysis(ev, { windowDays: 4 }).status === "NOT_MEASURED");
    check("events: unordered input is analysed in time order (deterministic)", JSON.stringify(S.eventBudgetAnalysis(ev.slice().reverse(), { sloTarget: 0.9, windowDays: 4 })) === JSON.stringify(S.eventBudgetAnalysis(ev, { sloTarget: 0.9, windowDays: 4 })));
  }
  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — slo-error-budget-view (IMP-P7: SLI/error-budget from REAL events; no-events ⇒ NOT_MEASURED; alerting NOT_MEASURED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
