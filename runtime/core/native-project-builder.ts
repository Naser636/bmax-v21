#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V28 Chantier 1 — NATIVE MULTI-FILE PROJECT BUILDER. PURE orchestration (the model generator + the
 * independent verifier are SEAMS). Governs the cycle SPEC → ARCHITECTURE → FILE GENERATION → WRITE-SET → APPLY → BUILD →
 * TEST → REPAIR → INDEPENDENT VERIFICATION → INTEGRATION for a multi-file project whose CODE is produced by ODG's LOCAL
 * models (the `generateFile` seam). It preserves inter-file relations: each file is generated with the CONTRACTS of the
 * files it depends on in context, and a file that references a not-yet-built symbol fails the build (fail-closed).
 *
 * ODG governs: write-set confinement, assembly, build, test, and the INDEPENDENT verifier is the sole acceptance arbiter;
 * a valid partial result is never lost on a later failure (each accepted file is retained). The ORCHESTRATOR is framework;
 * the PROJECT code is model-authored (native) — provenance is reported honestly per actor-provenance. Dual export.
 */

const RW = require("./repair-workflow.js");
const RF = require("./odg-repair-feedback.js"); // V327 §3: Self-Debugging/Reflexion execution-feedback repair hint
const RF_BE = require("./odg-bounded-exec.js"); // V327 §4/§7: timeboxed pre-guard against non-terminating generations
const NBS = require("./odg-native-build-sandbox.js"); // V15.9: OUTER-process isolation for model-written code (reuses provider-sandbox bwrap)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

/** assembleAndLoad(files) -> { ok, modules?, error? }. In-memory build: compile each file as a CommonJS module in
 *  dependency order; a reference to a missing symbol throws ⇒ ok:false (fail-closed, no silent partial). */
// GENERATED-CODE REQUIRE ALLOWLIST (V15.9 security): model-authored modules run in ODG's process, so their `require` must
// not reach the host. They may require (1) another GENERATED file of the same project, or (2) a PURE built-in from this
// list. Everything else — fs, child_process, net/http(s), worker_threads, vm, module, os, process bindings, and any
// relative/absolute path that is not a generated file (which previously resolved against runtime/core = ODG internals) —
// throws REQUIRE_DENIED ⇒ the build fails (fail-closed). It blocks ACCIDENTAL / NAIVE host requires only.
// HONEST LIMIT — NOT ISOLATION. Known in-process escapes (verified by independent inspection of #913) still reach the host:
// require.cache[..].require, module.constructor._load / .prototype.require / .createRequire(abs), process.mainModule.require,
// process.getBuiltinModule, Function("return process")(), dynamic import(), process.binding. Shadowing module/process or a
// vm context does not fix this (prototype/constructor chains). Real isolation of untrusted model code = an OUTER bwrap
// process — DONE in V15.9: buildProject runs model code in odg-native-build-sandbox (bwrap) by default; assembleAndLoad is
// now reached only via the explicit UNISOLATED_IN_PROCESS opt-in (and by corpus-soundness checks over TRUSTED reference code).
const GENERATED_REQUIRE_ALLOW: readonly string[] = Object.freeze(["assert", "assert/strict", "util", "events", "string_decoder"]);
function allowedBuiltin(req: string): boolean {
  const r = typeof req === "string" ? req.replace(/^node:/, "") : "";
  return GENERATED_REQUIRE_ALLOW.includes(r);
}
function assembleAndLoad(files: any): any {
  const registry: any = {};
  const make = (path: string, content: string) => {
    const m = new (module as any).constructor(path);
    m.require = (req: string) => {
      // resolve a relative import to another generated file by basename
      const key = Object.keys(files).find((k) => k === req || k.endsWith(req.replace(/^\.\//, "")) || req.endsWith(k.replace(/^.*\//, "").replace(/\.js$/, "")));
      if (key) { if (!registry[key]) registry[key] = make(key, files[key]); return registry[key].exports; }
      if (allowedBuiltin(req)) return require(String(req).replace(/^node:/, ""));
      throw new Error("REQUIRE_DENIED: '" + String(req) + "' — generated code may only require other generated files or pure built-ins (" + GENERATED_REQUIRE_ALLOW.join(", ") + ")");
    };
    m._compile(content, path);
    return m;
  };
  try { for (const p of Object.keys(files)) if (!registry[p]) registry[p] = make(p, files[p]); return { ok: true, modules: Object.fromEntries(Object.entries(registry).map(([k, v]: any) => [k, v.exports])) }; }
  catch (e: any) { return { ok: false, error: String((e && e.message) || e) }; }
}

/**
 * buildProject(spec, deps) -> outcome. spec: { name, architecture:[{path, role, contract, dependsOn?}], writeSet,
 * independentTest(modules)->bool }. deps: { generateFile(fileSpec, builtContracts)->Promise<{ok,content}>, maxRepair? }.
 * Governs generation (in dependency order, with prior contracts in context), write-set confinement, build, independent
 * test, and bounded per-file repair. FAIL-CLOSED: accepted ONLY on the independent test; accepted files are retained.
 */
async function buildProject(spec: any, deps: any = {}): Promise<any> {
  const s = isObj(spec) ? spec : {};
  const arch = Array.isArray(s.architecture) ? s.architecture : [];
  const guard = RW.makeWriteSetGuard(Array.isArray(s.writeSet) ? s.writeSet : arch.map((a: any) => a.path));
  const maxRepair = Number(deps.maxRepair) || 1;
  const files: any = {};
  const builtContracts: any = {};
  const fileStatus: any[] = [];

  // GENERATE each file in architecture (dependency) order, passing the already-built contracts as context.
  for (const fileSpec of arch) {
    if (!fileSpec || typeof fileSpec.path !== "string" || guard(fileSpec.path) !== true) { fileStatus.push({ path: fileSpec && fileSpec.path, stage: "WRITE_SET_VIOLATION" }); continue; }
    const g = fn(deps.generateFile) ? await deps.generateFile(fileSpec, builtContracts) : { ok: false };
    if (!g || g.ok !== true || typeof g.content !== "string") { fileStatus.push({ path: fileSpec.path, stage: "GENERATE_FAILED" }); continue; }
    files[fileSpec.path] = g.content;
    builtContracts[fileSpec.path] = fileSpec.contract || null;
    fileStatus.push({ path: fileSpec.path, stage: "GENERATED" });
  }

  // V15.9 ISOLATION — EXECUTION MODE. Model-written code is executed ONLY inside an OUTER isolated process
  // (odg-native-build-sandbox: provider-sandbox bwrap + RLIMIT_AS + null-prototype vm; JSON verdicts out, nonce-stamped)
  // whenever the spec carries a SERIALIZABLE test (independentTestSource | independentTestCases). A host-function
  // independentTest cannot cross a process boundary: it runs in-thread ONLY behind the explicit opt-in
  // UNISOLATED_IN_PROCESS (spec.unisolatedInProcess or deps.unisolatedInProcess) — otherwise it is REFUSED (never silently
  // executed in-process). Sandbox unavailable / probe failed ⇒ NOT_RUN (verified=null), never an in-process fallback.
  const testForm = NBS.serializableTest(s);
  const optIn = s.unisolatedInProcess === NBS.UNISOLATED_OPT_IN || deps.unisolatedInProcess === NBS.UNISOLATED_OPT_IN;
  const executionMode: string = testForm ? "SANDBOX" : (fn(s.independentTest) ? (optIn ? "UNISOLATED_IN_PROCESS" : "REFUSED_UNISOLATED") : "SANDBOX");
  const repairExs = Array.isArray(s.repairExamples) ? s.repairExamples.filter((e: any) => isObj(e) && Array.isArray(e.args)) : null;
  const entryPath = typeof s.entry === "string" ? s.entry : (arch.length ? arch[arch.length - 1].path : null);
  let executionStatus = "EXECUTED";
  let notRunReason: string | null = null;
  let isolation: any = executionMode === "UNISOLATED_IN_PROCESS"
    ? Object.freeze({ mechanism: "UNISOLATED — in-process module._compile (explicit opt-in; model code runs in ODG's process)", network: true, hostExecutesModelCode: true })
    : null;
  let sandboxWallMs = 0;
  if (executionMode !== "UNISOLATED_IN_PROCESS" && Object.keys(files).length > 0) {
    let probe: any;
    try { probe = typeof deps.sandboxProbe === "function" ? deps.sandboxProbe() : NBS.probeSandbox(deps.sandboxRunner); } catch (e: any) { probe = { ok: false, reason: String((e && e.message) || e) }; }
    if (!probe || probe.ok !== true) { executionStatus = "NOT_RUN"; notRunReason = "sandbox unavailable — " + String((probe && probe.reason) || "probe failed") + " — refusing in-process execution (fail-closed)"; }
  }

  // BUILD + INDEPENDENT VERIFICATION, with bounded repair on EITHER a build error OR a verify failure. V40 LOT M: a false
  // success (the project COMPILES but FAILS the independent test) previously got NO repair — now the test failure is fed
  // back to the generator, fail-closed. Acceptance is still decided ONLY by the independent test.
  let build: any = { ok: false, error: "not built" };
  let verifyErr: any = null;
  let verified = false as boolean;   // assigned inside evaluate() (closure) — widen so TS does not narrow to `false`
  let repairObs: any = null;
  // V327 §4/§7: bounded PRE-GUARD (UNISOLATED mode only) against a non-terminating generation. The in-thread
  // independentTest cannot interrupt an infinite loop; for a single-file spec with STRUCTURED repairExamples the candidate
  // first runs in a timeboxed CHILD (odg-bounded-exec, injectable via deps.boundedCheck). TIMEOUT ⇒ not-verified without
  // calling the in-thread test. In SANDBOX mode the sandbox's own step/process timeouts subsume this guard.
  const boundedCheck = typeof deps.boundedCheck === "function" ? deps.boundedCheck : (src: string, ex: any) => RF_BE.runExamplesBounded(src, ex, { timeoutMs: Number(deps.boundedTimeoutMs) || 3000 });
  const hangGuardTimedOut = (): boolean => {
    if (!(build.ok && arch.length === 1 && Array.isArray(s.repairExamples) && typeof files[arch[0].path] === "string")) return false;
    try { return boundedCheck(files[arch[0].path], s.repairExamples).verdict === "TIMEOUT"; } catch { return false; }
  };
  const evaluate = (): void => {
    verifyErr = null; repairObs = null;
    if (executionMode === "UNISOLATED_IN_PROCESS") {
      build = assembleAndLoad(files);
      if (hangGuardTimedOut()) { verifyErr = "bounded pre-guard TIMEOUT: candidate did not terminate — in-thread test skipped (fail-closed, cycle protected)"; verified = false; return; }
      if (build.ok && fn(s.independentTest)) { try { verified = s.independentTest(build.modules) === true; } catch (e: any) { verifyErr = String((e && e.message) || e); verified = false; } return; }
      verified = false; return;
    }
    if (executionStatus === "NOT_RUN") { build = { ok: false, error: "NOT_RUN: " + notRunReason }; verified = false; return; }
    const r = NBS.runIsolated(files, testForm || { kind: "none" }, { runner: deps.sandboxRunner, repair: repairExs && entryPath ? { entry: entryPath, examples: repairExs } : null, stepTimeoutMs: deps.sandboxStepTimeoutMs, processTimeoutMs: deps.sandboxProcessTimeoutMs });
    sandboxWallMs += Number(r.wallMs) || 0;
    isolation = r.isolation;
    if (r.status !== "EXECUTED") { executionStatus = "NOT_RUN"; notRunReason = r.reason; build = { ok: false, error: "NOT_RUN: " + r.reason }; verified = false; return; }
    build = { ok: r.buildOk === true, error: r.buildOk === true ? null : r.buildError };
    repairObs = r.repairObservations;
    if (executionMode === "REFUSED_UNISOLATED") { verified = false; verifyErr = "REFUSED_UNISOLATED: independentTest is a host function (cannot run isolated) and the UNISOLATED_IN_PROCESS opt-in is absent — supply independentTestSource/independentTestCases (fail-closed)"; return; }
    verified = r.verified === true; verifyErr = r.verifyError || null;
  };
  evaluate();
  const firstPass = Object.freeze({ buildOk: build.ok === true, verified: build.ok === true && verified === true, error: build.ok ? verifyErr : build.error });  // instrumentation: the pre-repair verdict (no behaviour change)
  let repairs = 0;
  // V15.0 §37.8 ANTI-LOOP: a repair round that regenerates EXACTLY the same files as the previous state carries no new
  // information — the next round would be an identical retry (same build, same verdict, another model call). Stop
  // instead of burning the remaining repair budget; the result stays fail-closed (not accepted) and records why.
  const snapshot = (): string => JSON.stringify(Object.keys(files).sort().map((k) => [k, files[k]]));
  let repairStopReason: string | null = null;
  if (executionStatus === "NOT_RUN") repairStopReason = "NOT_RUN_NO_SANDBOX";                 // no verdict ⇒ no blind repair
  else if (executionMode === "REFUSED_UNISOLATED") repairStopReason = "VERIFY_REFUSED_UNISOLATED"; // regeneration cannot fix a refused test
  while (repairStopReason === null && !(build.ok && verified) && repairs < maxRepair && fn(deps.generateFile)) {
    const before = snapshot();
    repairs++;
    // regenerate every file with the FAILURE in context: a build error, or a "builds-but-fails-the-test" verify failure.
    // V327 §3 (Self-Debugging/Reflexion): when the spec provides STRUCTURED repairExamples [{args,expect}], feed the
    // generator the SPECIFIC first failing case (input → expected vs actual) instead of the generic message. In SANDBOX
    // mode the examples were executed INSIDE the sandbox and the host only REPLAYS the observations (NBS.replayFn).
    let verifyHint = "the project BUILDS but FAILS the independent functional test — the logic does not satisfy the contract; fix the logic";
    if (build.ok && Array.isArray(s.repairExamples)) {
      let entryFn: any = null;
      if (executionMode === "UNISOLATED_IN_PROCESS") entryFn = build.modules && entryPath ? build.modules[entryPath] : null;
      else if (Array.isArray(repairObs) && repairExs && repairObs.length === repairExs.length) entryFn = NBS.replayFn(repairObs);
      try { const fb = RF.buildExecutionFeedback(executionMode === "UNISOLATED_IN_PROCESS" ? s.repairExamples : repairExs, entryFn); if (fb && fb.hasFailure === true && typeof fb.verifyError === "string") verifyHint = fb.verifyError; } catch { /* fail-closed to generic */ }
    }
    const hint = !build.ok ? { buildError: build.error } : { verifyError: verifyHint };
    let regenFailed = 0;   // a transient generate failure (e.g. model timeout) keeps the old content — NOT "no progress"
    for (const fileSpec of arch) { if (!files[fileSpec.path]) continue; const g = await deps.generateFile({ ...fileSpec, ...hint }, builtContracts); if (g && g.ok === true && typeof g.content === "string") files[fileSpec.path] = g.content; else regenFailed++; }
    // anti-loop: stop ONLY when every file regenerated successfully AND nothing changed (inspection MED: a failed generate
    // keeps old content and must keep its retry budget). Trade-off (stated): a sampled model fed the identical prompt could
    // still produce different output; at the default low temperature an identical round is treated as no new information. A timeout-based hang-guard
    // verdict is not re-run after an identical round (accepted risk: a spurious TIMEOUT then stands — still fail-closed).
    if (regenFailed === 0 && snapshot() === before) { repairStopReason = "NO_PROGRESS_IDENTICAL_REGENERATION"; break; }
    evaluate();
    if (executionStatus === "NOT_RUN") { repairStopReason = "NOT_RUN_NO_SANDBOX"; break; }
  }
  if (repairStopReason === null && !(build.ok && verified) && repairs >= maxRepair && maxRepair > 0) repairStopReason = "REPAIR_BUDGET_EXHAUSTED";

  const filesGenerated = Object.keys(files).length;
  const notRun = executionStatus === "NOT_RUN";
  return Object.freeze({
    project: s.name || "project",
    filesPlanned: arch.length,
    filesGenerated,
    buildOk: build.ok === true,
    buildError: build.ok ? null : build.error,
    repairs,
    repairStopReason,                                     // V15.0 anti-loop: why the repair loop stopped (null if accepted / no repair)
    verified: notRun ? null : (build.ok === true && verified === true),   // NOT_RUN ⇒ null (NOT_MEASURED, never a fabricated false/true)
    verifyError: notRun ? notRunReason : verifyErr,
    accepted: !notRun && build.ok === true && verified === true,     // native build accepted ONLY on independent verification
    firstPass,                                            // the pre-repair verdict (instrumentation for benchmarks)
    executionMode,                                        // V15.9: SANDBOX | UNISOLATED_IN_PROCESS (explicit opt-in) | REFUSED_UNISOLATED
    executionStatus,                                      // V15.9: EXECUTED | NOT_RUN (no sandbox ⇒ nothing executed, fail-closed)
    isolation,                                            // V15.9: how model code was executed (hostExecutesModelCode flag)
    sandboxWallMs: executionMode === "UNISOLATED_IN_PROCESS" ? null : sandboxWallMs,
    fileStatus: Object.freeze(fileStatus),
    files: Object.freeze({ ...files }),                    // retained (valid partial not lost)
  });
}

const NATIVE_PROJECT_BUILDER_CONTRACT = Object.freeze({
  id: "V124-NATIVE-PROJECT-BUILDER",
  source: "CTO V28 Chantier 1 — governed multi-file native construction cycle",
  reuses: Object.freeze(["repair-workflow.makeWriteSetGuard (write-set confinement)", "the local model generator (generateFile seam — ODG's native authoring)", "an INDEPENDENT verifier (sole acceptance arbiter)"]),
  notAuthority: "orchestrates SPEC→…→INTEGRATION; the PROJECT code is model-authored (native), this orchestrator is framework; accepts ONLY on the independent test",
  invariants: Object.freeze([
    "files are generated in dependency order, each with the prior files' contracts in context (inter-file relations preserved)",
    "a file outside the write-set is refused; a reference to a missing symbol fails the build (fail-closed, no silent partial)",
    "the project is accepted ONLY if it builds AND passes the INDEPENDENT test — never on the generator's claim",
    "bounded repair on a build error; accepted/valid files are retained (a later failure does not lose prior valid work)",
    "pure orchestration: the generator and verifier are seams; the quality gate is never lowered",
    "V15.9: model-written code executes ONLY in an OUTER isolated process (bwrap sandbox) when the spec has a serializable test; a host-function test runs in-process ONLY behind the explicit UNISOLATED_IN_PROCESS opt-in, otherwise REFUSED",
    "V15.9: no sandbox ⇒ NOT_RUN (verified=null, accepted=false) — never a silent in-process fallback",
  ]),
});

module.exports = { assembleAndLoad, buildProject, NATIVE_PROJECT_BUILDER_CONTRACT, GENERATED_REQUIRE_ALLOW };

if (require.main === module) { process.stdout.write(JSON.stringify(NATIVE_PROJECT_BUILDER_CONTRACT, null, 2) + "\n"); }

export {};
