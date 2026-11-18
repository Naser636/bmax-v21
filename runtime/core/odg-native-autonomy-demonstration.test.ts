#!/usr/bin/env node
"use strict";
/* V283-A — ODG native engineering autonomy DEMONSTRATION. Asserts the REAL native cycle runs (clean NATIVE_GREEN, seeded repair
 * corrected, novel ESCALATED_TO_PROVIDER), scheduler-based selection, honest §9 A-H mapping, and the honesty crux: deterministic
 * class native / novel codegen provider-dependent / ratio NOT_MEASURED / this module authored by Claude Code (not native). */
const D = require("./odg-native-autonomy-demonstration.js");
const NE = require("./odg-native-engineering.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const r = D.demonstrateNativeAutonomy();
  check("ODG SELECTS the mission via its own scheduler (not dictated); ≥1 eligible", r.ok && r.selection.selectedByOdgScheduler === true && r.selection.eligibleCount >= 1 && typeof r.selection.selectedMissionId === "string");
  check("clean native cycle ⇒ NATIVE_GREEN, nativeCycle true (ODG deterministic authorship + closed-executor tests)", r.cleanCycle.verdict === "NATIVE_GREEN" && r.cleanCycle.nativeCycle === true && r.cleanCycle.executorSummary.ODG_NATIVE_EXECUTION >= 1);
  check("repair cycle ⇒ corrected true on a SEEDED fault (labelled; not a real-defect claim)", r.repairCycle.corrected === true && r.repairCycle.seededFault === true && /REPAIRED/.test(r.repairCycle.verdict));
  check("novel codegen HONESTLY escalates ⇒ ESCALATED_TO_PROVIDER, nativeCycle false, providerDependent true (never faked native)",
    r.novelEscalation.verdict === "ESCALATED_TO_PROVIDER" && r.novelEscalation.nativeCycle === false && r.novelEscalation.providerDependent === true);
  check("pipeline audit: native vs provider steps reported honestly (nativeToday + needsProvider = total)", r.pipelineAudit.nativeToday >= 1 && r.pipelineAudit.needsProvider >= 1 && (r.pipelineAudit.nativeToday + r.pipelineAudit.needsProvider) === r.pipelineAudit.totalSteps);

  // §9 criteria honest mapping.
  const crit = (id: string) => r.criteria.find((c: any) => c.id === id);
  check("§9 A (selection) + E (execute tests) SATISFIED_NATIVE; both have evidence", crit("A").status === "SATISFIED_NATIVE" && crit("E").status === "SATISFIED_NATIVE");
  check("§9 C (ODG authors code) SATISFIED_NATIVE but with honest caveat: deterministic op-catalog, NOT free-form synthesis", crit("C").status === "SATISFIED_NATIVE" && /NOT free-form/.test(crit("C").caveat));
  check("§9 F (defect correction) is SATISFIED_SEEDED_DEMO with caveat (seeded fault, no real defect claimed)", crit("F").status === "SATISFIED_SEEDED_DEMO" && /SEEDED fault/.test(crit("F").caveat) && /not claimed/.test(crit("F").caveat));

  // honesty crux: ratio NOT_MEASURED; module authored by Claude Code (not native).
  check("native-autonomy RATIO NOT_MEASURED; THIS module authored by CLAUDE_CODE (not claimed native)", r.nativeAutonomyRatio === "NOT_MEASURED" && r.thisModuleAuthoredBy === "CLAUDE_CODE" && /does NOT claim ODG authored arbitrary code/.test(r.note));

  // assessment roll-up.
  const a = D.nativeAutonomyAssessment();
  check("assessment: deterministic class ODG_NATIVE, novel synthesis PROVIDER_DEPENDENT, ratio NOT_MEASURED (not conflated with step count)",
    /ODG_NATIVE/.test(a.deterministicClass) && /PROVIDER_DEPENDENT/.test(a.novelCodeSynthesis) && a.nativeAutonomyRatio === "NOT_MEASURED" && /NOT a general-autonomy ratio/.test(a.whyNotMeasured));

  // reuse / no 2nd engine: the demo calls the EXISTING runNativeCycle (same verdicts when called directly).
  const direct = NE.runNativeCycle({ id: "X", spec: { fnName: "sum", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] } });
  check("reuses the EXISTING odg-native-engineering.runNativeCycle (direct call also NATIVE_GREEN) — no 2nd engine", direct.verdict === "NATIVE_GREEN");

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(D.demonstrateNativeAutonomy()) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(D.CRITERION_STATUS));
  check("contract: cycle already exists (demonstrated not rebuilt); novel escalates; seeded repair; ratio NOT_MEASURED; provider-authored demo",
    D.NATIVE_AUTONOMY_DEMONSTRATION_CONTRACT.invariants.some((i: string) => /ALREADY EXISTS/.test(i)) && D.NATIVE_AUTONOMY_DEMONSTRATION_CONTRACT.invariants.some((i: string) => /honestly ESCALATES/.test(i)) && D.NATIVE_AUTONOMY_DEMONSTRATION_CONTRACT.invariants.some((i: string) => /RATIO is NOT_MEASURED/.test(i)) && D.NATIVE_AUTONOMY_DEMONSTRATION_CONTRACT.invariants.some((i: string) => /authored by Claude Code/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-native-autonomy-demonstration (V283-A: demonstrates the EXISTING native engineering cycle [clean NATIVE_GREEN, seeded repair corrected, novel ESCALATED_TO_PROVIDER]; ODG-scheduler selection; honest §9 A-H [C native=deterministic-catalog-only, F seeded-demo, novel provider-dependent]; native-autonomy ratio NOT_MEASURED; THIS module provider-authored not native; reuses V151 — no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
