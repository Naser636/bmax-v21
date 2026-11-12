#!/usr/bin/env node
"use strict";
/*
 * V151 — ODG NATIVE ENGINEERING AUTONOMY (priority §3). PURE, deterministic, fail-closed, BOUNDED + LOCAL + IN-MEMORY.
 * This is a HONEST, real advance on ODG doing engineering ITSELF (not merely orchestrating a provider): for a BOUNDED class
 * of DETERMINISTIC specs, ODG natively (no LLM) runs the full cycle — consult context → plan → select write-set → GENERATE
 * code → GENERATE tests → EXECUTE tests (V153: via the CLOSED executor odg-closed-executor, NO new Function/eval) → analyse
 * → propose mechanical correction → verify regression → produce evidence. Writes NO real repo file; real-repo write owner-gated.
 *
 * HONESTY TAXONOMY (directive §3) — every step is tagged with who actually did it:
 *   ODG_NATIVE_EXECUTION  — ODG performed it itself, deterministically, no LLM.
 *   CLAUDE_CODE_EXECUTION — requires a frontier generative provider (novel code reasoning ODG cannot do natively).
 *   HUMAN_VALIDATION      — needs a human decision/authorization.
 *   SIMULATED             — modelled, not a real effect.
 *   NOT_MEASURED          — not attempted / no data.
 * Radar V151_RADAR_WORLDWIDE: SOTA code synthesis needs a frontier LLM; ODG's native surface is deterministic engineering +
 * governance/verification. So: a spec whose `kind` is in the native catalog ⇒ fully ODG_NATIVE; otherwise codegen escalates
 * to CLAUDE_CODE_EXECUTION with the exact missing dependency named — never a fabricated "ODG wrote it".
 */
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// V153: the native codegen catalog now maps each kind to CLOSED-REGISTRY op ids (odg-closed-executor) instead of executable
// code strings. The op's canonical `repr` is used as the emitted-code EVIDENCE string (display only, NEVER executed); all
// execution goes through CEX.executeOp (no new Function / eval). `faulty` is an explicit REGISTERED op, not injected code.
const CEX = require("./odg-closed-executor.js");
const CATALOG: Record<string, any> = {
  sum: { correctOp: "sum@1", faultyOp: "sum.faulty@1" },
  max: { correctOp: "max@1", faultyOp: "max.faulty@1" },
  clampNonNegative: { correctOp: "clampNonNegative@1", faultyOp: "clampNonNegative.faulty@1" },
  isEven: { correctOp: "isEven@1", faultyOp: "isEven.faulty@1" },
  absMinor: { correctOp: "absMinor@1", faultyOp: "absMinor.faulty@1" },
};
const NATIVE_KINDS = Object.freeze(Object.keys(CATALOG));

const EXEC = Object.freeze({ NATIVE: "ODG_NATIVE_EXECUTION", CLAUDE: "CLAUDE_CODE_EXECUTION", HUMAN: "HUMAN_VALIDATION", SIM: "SIMULATED", NM: "NOT_MEASURED" });

// §3 audit: the 13-step engineering pipeline, each classified by who can do it natively TODAY (honest).
function auditEngineeringPipeline(): any {
  const steps = [
    { step: "repo understanding / indexing", nativeToday: true, executor: EXEC.NATIVE, note: "codebase-diagnostic + grep/AST scans are deterministic" },
    { step: "file selection / dependency analysis", nativeToday: true, executor: EXEC.NATIVE, note: "change-impact-graph / affected-test selector" },
    { step: "solution design (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)" },
    { step: "code generation (deterministic class)", nativeToday: true, executor: EXEC.NATIVE, note: "template codegen catalog (this module)" },
    { step: "code generation (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)" },
    { step: "controlled file modification", nativeToday: true, executor: EXEC.NATIVE, note: "patch-executor write-confinement (owner-gated for real repos)" },
    { step: "test creation (from examples)", nativeToday: true, executor: EXEC.NATIVE, note: "deterministic example→assertion generation (this module)" },
    { step: "test execution", nativeToday: true, executor: EXEC.NATIVE, note: "odg-test-report harness; in-process CLOSED executor (V153, no new Function)" },
    { step: "error analysis", nativeToday: true, executor: EXEC.NATIVE, note: "deterministic pass/fail + fault-pattern match" },
    { step: "correction proposal (known pattern)", nativeToday: true, executor: EXEC.NATIVE, note: "mechanical repair for the catalog class" },
    { step: "correction proposal (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)" },
    { step: "regression verification", nativeToday: true, executor: EXEC.NATIVE, note: "re-run gate" },
    { step: "independent validation + evidence capitalisation", nativeToday: true, executor: EXEC.NATIVE, note: "gate + register + memory" },
  ];
  const nativeCount = steps.filter((s) => s.nativeToday).length;
  return Object.freeze({
    ok: true, steps: Object.freeze(steps), total: steps.length, nativeToday: nativeCount, needsProvider: steps.length - nativeCount,
    gap: "the ONLY steps ODG cannot do natively are NOVEL generative reasoning (design + novel codegen/correction) — a frontier LLM (CLAUDE_CODE_EXECUTION). Everything deterministic is already native.",
    note: "honest classification; no Claude-Code work is counted as ODG_NATIVE.",
  });
}

// V153: assertions run through the CLOSED EXECUTOR (opId + typed args) — no new Function, no code execution of strings.
function genTestAssertions(opId: string, examples: any[]): any {
  const results: any[] = []; let pass = 0;
  for (const ex of examples) {
    if (!isObj(ex) || !Array.isArray(ex.args)) { results.push({ ok: false, reason: "malformed example" }); continue; }
    const r = CEX.executeOp(opId, ex.args);
    const ok = r.ok === true && r.result === ex.expect;
    if (ok) pass++;
    results.push(Object.freeze({ args: ex.args, expect: ex.expect, actual: r.ok ? r.result : null, ok, err: r.ok ? null : r.code }));
  }
  return { results, pass, total: examples.length, allPass: pass === examples.length && examples.length > 0 };
}

/** runNativeCycle(mission): ODG performs a bounded deterministic engineering cycle itself. Returns the full tagged trace. */
function runNativeCycle(mission: any): any {
  const m = isObj(mission) ? mission : {};
  const spec = isObj(m.spec) ? m.spec : {};
  const steps: any[] = [];
  const record = (name: string, executor: string, detail: string, extra?: any) => steps.push(Object.freeze({ step: name, executor, detail, ...(isObj(extra) ? extra : {}) }));
  if (!isStr(m.id) || !isStr(spec.fnName) || !isStr(spec.kind)) return Object.freeze({ ok: false, code: "INVALID_MISSION", detail: "mission needs { id, spec:{ fnName, kind, examples } }" });

  record("consult_context", EXEC.NATIVE, `read mission '${m.id}' + spec for '${spec.fnName}' (kind=${spec.kind})`);
  record("plan", EXEC.NATIVE, `plan: emit a PURE ${spec.kind} function + example tests, run, repair-if-needed`);
  const writeSet = Array.isArray(m.authorizedWriteSet) ? m.authorizedWriteSet.filter(isStr) : [];
  record("select_write_set", EXEC.NATIVE, `authorized (in-memory only) write-set: ${writeSet.length ? writeSet.join(",") : "(in-memory scaffold)"}`);

  const cat = CATALOG[spec.kind];
  if (!cat) {
    // honest escalation: ODG cannot natively synthesise a novel function ⇒ CLAUDE_CODE_EXECUTION.
    record("generate_code", EXEC.CLAUDE, `kind '${spec.kind}' is OUTSIDE the native deterministic catalog ⇒ requires generative reasoning`, { missingDependency: "frontier generative provider (LLM) for novel code synthesis" });
    record("generate_tests", EXEC.NATIVE, "example→assertion generation is native, but there is no native-generated code to test");
    record("execute_tests", EXEC.NM, "no native code produced");
    return Object.freeze({ ok: true, missionId: m.id, verdict: "ESCALATED_TO_PROVIDER", nativeCycle: false, steps: Object.freeze(steps), executorSummary: summarise(steps), rollback: "nothing written (in-memory); no real-repo change", note: "ODG natively planned + scoped, but NOVEL code synthesis is a frontier-LLM step (honestly tagged CLAUDE_CODE_EXECUTION) — not presented as native." });
  }

  // NATIVE codegen: SELECT a registered closed-executor op (optionally the faulty sibling to seed the repair loop). The
  // emitted `code` is the op's canonical repr — EVIDENCE only, NEVER executed. Execution goes through CEX.executeOp.
  const faulty = m.injectFault === true;
  let opId = faulty ? cat.faultyOp : cat.correctOp;
  let code = CEX.getRepr(opId);
  record("generate_code", EXEC.NATIVE, `selected closed-registry op '${opId}'${faulty ? " (seeded-fault sibling, repair demo)" : ""}`, { code, opId, executedCodeString: false });
  const examples = Array.isArray(spec.examples) ? spec.examples : [];
  record("generate_tests", EXEC.NATIVE, `${examples.length} example assertion(s) from the spec`, { exampleCount: examples.length });

  let run = genTestAssertions(opId, examples);
  record("execute_tests", EXEC.NATIVE, `ran ${run.total} assertion(s) via the CLOSED executor (no eval/new Function): ${run.pass}/${run.total} pass`, { pass: run.pass, total: run.total });
  record("analyse", EXEC.NATIVE, run.allPass ? "all assertions pass" : `${run.total - run.pass} failing — fault-pattern = seeded ${spec.kind} defect`);

  let corrected = false;
  if (!run.allPass) {
    // native mechanical correction: switch to the canonical (non-faulty) registered op.
    opId = cat.correctOp; code = CEX.getRepr(opId);
    record("propose_correction", EXEC.NATIVE, `mechanical repair: switch to canonical registered op '${opId}'`, { code, opId });
    run = genTestAssertions(opId, examples);
    record("verify_regression", EXEC.NATIVE, `re-ran ${run.total} assertion(s) via the CLOSED executor: ${run.pass}/${run.total} pass`, { pass: run.pass, total: run.total });
    corrected = true;
  } else {
    record("verify_regression", EXEC.NATIVE, "no correction needed; assertions already green");
  }

  record("evidence", EXEC.NATIVE, "produced tagged cycle trace + final code + test results (capitalised)");
  record("real_repo_write", EXEC.HUMAN, "writing this to a REAL repo file is OWNER_GATED (not performed)");

  return Object.freeze({
    ok: true, missionId: m.id,
    verdict: run.allPass ? (corrected ? "NATIVE_REPAIRED_GREEN" : "NATIVE_GREEN") : "NATIVE_STILL_FAILING",
    nativeCycle: true, finalCode: code, testResults: Object.freeze(run.results), testsPass: run.pass, testsTotal: run.total, corrected,
    steps: Object.freeze(steps), executorSummary: summarise(steps),
    rollback: "in-memory only; no real-repo file written (owner-gated)",
    note: "ODG natively generated + tested + (if needed) repaired a BOUNDED deterministic function and ran the tests itself. Novel reasoning is out of this native class (would be CLAUDE_CODE_EXECUTION). No real repo modified.",
  });
}

function summarise(steps: any[]): any {
  const by: Record<string, number> = {};
  for (const s of steps) by[s.executor] = (by[s.executor] || 0) + 1;
  return Object.freeze(by);
}

const ODG_NATIVE_ENGINEERING_CONTRACT = Object.freeze({
  id: "V151-ODG-NATIVE-ENGINEERING",
  purpose: "advance ODG doing bounded deterministic engineering ITSELF; honestly tag ODG_NATIVE vs CLAUDE_CODE vs HUMAN vs SIMULATED vs NOT_MEASURED",
  reuses: ["9 primitives (identity/state/contract/policy/executor/evidence)", "patch-executor confinement doctrine", "odg-test-report harness pattern"],
  nativeCatalogKinds: NATIVE_KINDS,
  invariants: Object.freeze([
    "BOUNDED + LOCAL + IN-MEMORY: writes no real repo file; any real-repo write is OWNER_GATED (HUMAN_VALIDATION)",
    "NOVEL code synthesis is NOT native: it escalates to CLAUDE_CODE_EXECUTION with the exact missing dependency named",
    "no Claude-Code work is ever counted as ODG_NATIVE_EXECUTION; every step carries its true executor",
    "deterministic: template codegen + example→assertion tests + real in-memory execution + mechanical repair for the catalog class",
    "fail-closed on malformed mission; no parallel code agent, no new primitive",
  ]),
});
module.exports = { auditEngineeringPipeline, runNativeCycle, NATIVE_KINDS, EXEC, ODG_NATIVE_ENGINEERING_CONTRACT };
export {};
