#!/usr/bin/env node
"use strict";
/* V151 — ODG native-engineering battery. Proves ODG natively (no LLM) runs a BOUNDED deterministic engineering cycle:
 * generate code → generate tests → EXECUTE tests → analyse → mechanical repair → verify, with HONEST executor tagging
 * (ODG_NATIVE vs CLAUDE_CODE vs HUMAN vs NOT_MEASURED). Novel synthesis escalates (never faked as native). Real-repo write
 * stays owner-gated (HUMAN). In-memory only; fail-closed. */
const N = require("./odg-native-engineering.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- §3 pipeline audit ----
  const a = N.auditEngineeringPipeline();
  check("pipeline audit: 13 steps, deterministic native, novel needs provider", a.total === 13 && a.nativeToday === 10 && a.needsProvider === 3);
  check("audit is honest: the only non-native steps are NOVEL generative reasoning", a.steps.filter((s: any) => !s.nativeToday).every((s: any) => /generative reasoning/.test(s.missing)));

  // ---- native GREEN cycle ----
  const sum = N.runNativeCycle({ id: "M1", spec: { fnName: "sum", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [-1, 1], expect: 0 }] } });
  check("native GREEN: all steps ODG_NATIVE except the owner-gated real write", sum.verdict === "NATIVE_GREEN" && sum.nativeCycle === true && sum.testsPass === 2 && sum.executorSummary.ODG_NATIVE_EXECUTION >= 8);
  check("native cycle actually EXECUTED the generated code (real assertions ran)", sum.testResults.length === 2 && sum.testResults.every((r: any) => r.ok === true && typeof r.actual === "number"));
  check("real-repo write is HUMAN_VALIDATION (owner-gated), not performed", sum.executorSummary.HUMAN_VALIDATION === 1 && /in-memory only/.test(sum.rollback));

  // ---- native REPAIR cycle (seeded fault → mechanical fix → green) ----
  const rep = N.runNativeCycle({ id: "M2", spec: { fnName: "max", kind: "max", examples: [{ args: [2, 3], expect: 3 }, { args: [5, 1], expect: 5 }] }, injectFault: true });
  check("native REPAIR: seeded fault detected + mechanically corrected + re-verified green", rep.verdict === "NATIVE_REPAIRED_GREEN" && rep.corrected === true && rep.testsPass === 2);
  check("repair steps present: analyse → propose_correction → verify_regression (all native)", rep.steps.some((s: any) => s.step === "propose_correction" && s.executor === "ODG_NATIVE_EXECUTION") && rep.steps.some((s: any) => s.step === "verify_regression"));
  check("other catalog kinds repair too (isEven, clampNonNegative, absMinor)", ["isEven", "clampNonNegative", "absMinor"].every((k: string) => {
    const ex = k === "isEven" ? [{ args: [4], expect: true }, { args: [3], expect: false }] : (k === "clampNonNegative" ? [{ args: [-2], expect: 0 }, { args: [9], expect: 9 }] : [{ args: [-7], expect: 7 }, { args: [3], expect: 3 }]);
    return N.runNativeCycle({ id: "K", spec: { fnName: k, kind: k, examples: ex }, injectFault: true }).verdict === "NATIVE_REPAIRED_GREEN";
  }));

  // ---- HONEST escalation for novel kinds ----
  const esc = N.runNativeCycle({ id: "M3", spec: { fnName: "parseInvoiceXML", kind: "xmlParse", examples: [] } });
  check("novel kind ⇒ ESCALATED_TO_PROVIDER, nativeCycle false (never faked as native)", esc.verdict === "ESCALATED_TO_PROVIDER" && esc.nativeCycle === false);
  check("escalation names the exact missing dependency (frontier LLM)", esc.steps.some((s: any) => s.executor === "CLAUDE_CODE_EXECUTION" && /frontier generative provider/.test(s.missingDependency)));
  check("no Claude-Code work is counted as ODG_NATIVE (the generate_code step is CLAUDE_CODE)", esc.steps.find((s: any) => s.step === "generate_code").executor === "CLAUDE_CODE_EXECUTION");

  // ---- executor taxonomy present ----
  check("executor taxonomy exposes all 5 honesty states", N.EXEC.NATIVE === "ODG_NATIVE_EXECUTION" && N.EXEC.CLAUDE === "CLAUDE_CODE_EXECUTION" && N.EXEC.HUMAN === "HUMAN_VALIDATION" && N.EXEC.SIM === "SIMULATED" && N.EXEC.NM === "NOT_MEASURED");

  // ---- fail-closed ----
  check("malformed mission ⇒ INVALID_MISSION (no throw)", N.runNativeCycle({ id: "X" }).code === "INVALID_MISSION" && N.runNativeCycle(null).code === "INVALID_MISSION");
  check("green cycle with a wrong example ⇒ NATIVE_STILL_FAILING (honest, no false green)", (() => { const r = N.runNativeCycle({ id: "W", spec: { fnName: "sum", kind: "sum", examples: [{ args: [2, 2], expect: 99 }] } }); return r.verdict === "NATIVE_STILL_FAILING" && r.testsPass === 0; })());

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-native-engineering (native deterministic generate→test→execute→repair cycle; honest ODG_NATIVE/CLAUDE_CODE/HUMAN tagging; novel synthesis escalates; real-repo write owner-gated; in-memory; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
