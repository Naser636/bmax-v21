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

// V284 §5: the honesty taxonomy gains ODG_LOCAL_MODEL_EXECUTION — a tier BETWEEN deterministic-native and the frontier
// provider. It names the now-PROVEN path where ODG's OWN local model (ollama-provider → generative-repair-adapter →
// repair-workflow, V283-B/C) authors novel code, whose UNTRUSTED output is applied in an isolated workspace, tested
// against real acceptance, rolled back exactly on failure, and independently validated. It is NOT deterministic-native
// (the model is probabilistic, output untrusted) and it is NOT the frontier provider — it is ODG's own local compute.
const EXEC = Object.freeze({ NATIVE: "ODG_NATIVE_EXECUTION", LOCAL: "ODG_LOCAL_MODEL_EXECUTION", CLAUDE: "CLAUDE_CODE_EXECUTION", HUMAN: "HUMAN_VALIDATION", SIM: "SIMULATED", NM: "NOT_MEASURED" });

// V284 §5: the ordered attribution ladder a codegen task climbs — each rung is a distinct, honestly-tagged executor.
const ATTRIBUTION_LADDER = Object.freeze([
  Object.freeze({ tier: EXEC.NATIVE, scope: "deterministic closed-op catalog — ODG itself, no model" }),
  Object.freeze({ tier: EXEC.LOCAL, scope: "novel code generation/repair via ODG's OWN local model; UNTRUSTED output ⇒ controlled apply in isolated workspace + real acceptance + exact rollback + independent validation (proven live V283-B/C)" }),
  Object.freeze({ tier: EXEC.CLAUDE, scope: "tasks beyond the local coder (novel design / hard synthesis) ⇒ frontier-provider escalation" }),
  Object.freeze({ tier: EXEC.HUMAN, scope: "real-repo write / final acceptance / OWNER_GATED decisions" }),
]);

/**
 * classifyCodegenAttribution(task): conservative, EVIDENCE-based tier for a codegen task (V284 §5). It does NOT
 * reclassify all novel tasks as local-doable: a novel task is attributed to ODG_LOCAL_MODEL_EXECUTION ONLY when the
 * caller asserts, from evidence, both that a local model is available AND that the task is within the local coder's
 * demonstrated ability. Otherwise it fails closed to the safer (frontier-provider) attribution. Pure + deterministic.
 */
function classifyCodegenAttribution(task: any): any {
  const t = isObj(task) ? task : {};
  const kind = isStr(t.kind) ? t.kind : "";
  if (kind && CATALOG[kind]) return Object.freeze({ tier: EXEC.NATIVE, reason: `kind '${kind}' is in the deterministic catalog`, controlledApplyRequired: false });
  const localAvailable = t.localModelAvailable === true;
  const withinAbility = t.taskWithinLocalModelAbility === true;   // caller must assert this from evidence, not hope
  if (localAvailable && withinAbility) return Object.freeze({ tier: EXEC.LOCAL, reason: "novel task declared within the local coder's demonstrated ability ⇒ route to ODG's local model under controlled apply + independent validation", controlledApplyRequired: true });
  return Object.freeze({ tier: EXEC.CLAUDE, reason: localAvailable ? "local model available but task NOT demonstrated within its ability ⇒ escalate (conservative, fail-closed)" : "no local model available ⇒ escalate", controlledApplyRequired: true });
}

// §3 audit: the 13-step engineering pipeline, each classified by who can do it natively TODAY (honest).
function auditEngineeringPipeline(): any {
  const steps = [
    { step: "repo understanding / indexing", nativeToday: true, executor: EXEC.NATIVE, note: "codebase-diagnostic + grep/AST scans are deterministic" },
    { step: "file selection / dependency analysis", nativeToday: true, executor: EXEC.NATIVE, note: "change-impact-graph / affected-test selector" },
    { step: "solution design (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)", localModelCapable: false, localModelNote: "novel design is beyond the small local coder's reliable ability ⇒ frontier provider or human" },
    { step: "code generation (deterministic class)", nativeToday: true, executor: EXEC.NATIVE, note: "template codegen catalog (this module)" },
    { step: "code generation (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)", localModelCapable: true, localModelTier: EXEC.LOCAL, localModelNote: "V283-B/C PROVEN LIVE: ODG's own local model (qwen2.5-coder via ollama-provider → generative-repair-adapter) authored novel code accepted under controlled apply + real tests + exact rollback; frontier provider only for tasks beyond the local coder" },
    { step: "controlled file modification", nativeToday: true, executor: EXEC.NATIVE, note: "patch-executor write-confinement (owner-gated for real repos)" },
    { step: "test creation (from examples)", nativeToday: true, executor: EXEC.NATIVE, note: "deterministic example→assertion generation (this module)" },
    { step: "test execution", nativeToday: true, executor: EXEC.NATIVE, note: "odg-test-report harness; in-process CLOSED executor (V153, no new Function)" },
    { step: "error analysis", nativeToday: true, executor: EXEC.NATIVE, note: "deterministic pass/fail + fault-pattern match" },
    { step: "correction proposal (known pattern)", nativeToday: true, executor: EXEC.NATIVE, note: "mechanical repair for the catalog class" },
    { step: "correction proposal (novel)", nativeToday: false, executor: EXEC.CLAUDE, missing: "generative reasoning (frontier LLM)", localModelCapable: true, localModelTier: EXEC.LOCAL, localModelNote: "V283-B/C: the local-model repair path (generate→apply→test→rollback) can propose novel corrections within the local coder's ability; frontier provider only beyond it" },
    { step: "regression verification", nativeToday: true, executor: EXEC.NATIVE, note: "re-run gate" },
    { step: "independent validation + evidence capitalisation", nativeToday: true, executor: EXEC.NATIVE, note: "gate + register + memory" },
  ];
  const nativeCount = steps.filter((s) => s.nativeToday).length;
  const localModelTierSteps = steps.filter((s: any) => s.localModelCapable === true).map((s: any) => s.step);
  return Object.freeze({
    ok: true, steps: Object.freeze(steps), total: steps.length, nativeToday: nativeCount, needsProvider: steps.length - nativeCount,
    gap: "the non-deterministic-native steps are NOVEL generative reasoning (design + novel codegen/correction). V284 §5 reconciliation: novel CODEGEN + CORRECTION can now route to ODG's OWN local model (ODG_LOCAL_MODEL_EXECUTION — proven live V283-B/C) for tasks within the local coder's ability; novel DESIGN and tasks beyond the local coder still need the frontier provider (CLAUDE_CODE_EXECUTION). Everything deterministic is already native.",
    localModelTier: Object.freeze({ tier: EXEC.LOCAL, steps: Object.freeze(localModelTierSteps), evidence: "V283-B/C #669 live: qwen2.5-coder authored an ACCEPTED novel patch via ollama-provider+generative-repair-adapter", caveat: "local-model output is UNTRUSTED + non-deterministic ⇒ always under controlled apply (isolated workspace) + real acceptance + exact rollback + independent validation; NOT counted as deterministic-native" }),
    note: "honest classification; no Claude-Code work is counted as ODG_NATIVE; the local-model tier is ODG's own compute, distinct from the frontier provider.",
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
  attributionLadder: ATTRIBUTION_LADDER,
  invariants: Object.freeze([
    "BOUNDED + LOCAL + IN-MEMORY: writes no real repo file; any real-repo write is OWNER_GATED (HUMAN_VALIDATION)",
    "NOVEL code synthesis is NOT deterministic-native: it is attributed to ODG_LOCAL_MODEL_EXECUTION (ODG's own local model, UNTRUSTED output ⇒ controlled apply + independent validation) for tasks within the local coder's ability, else it escalates to CLAUDE_CODE_EXECUTION — never a fabricated 'ODG wrote it' (V284 §5)",
    "runNativeCycle itself stays the pure deterministic surface: an out-of-catalog kind still returns ESCALATED_TO_PROVIDER (the local-model path lives in ollama-provider/generative-repair-adapter, invoked there, not inside this pure function) — V283-A scenario preserved",
    "classifyCodegenAttribution is EVIDENCE-based + fail-closed: a novel task is ODG_LOCAL_MODEL only when a local model is available AND the task is demonstrated within its ability; otherwise it escalates (never reclassify all novel as local)",
    "no Claude-Code work is ever counted as ODG_NATIVE_EXECUTION; every step carries its true executor",
    "deterministic: template codegen + example→assertion tests + real in-memory execution + mechanical repair for the catalog class",
    "fail-closed on malformed mission; no parallel code agent, no new primitive, no new scheduler/orchestrator",
  ]),
});
module.exports = { auditEngineeringPipeline, runNativeCycle, classifyCodegenAttribution, NATIVE_KINDS, EXEC, ATTRIBUTION_LADDER, ODG_NATIVE_ENGINEERING_CONTRACT };
export {};
