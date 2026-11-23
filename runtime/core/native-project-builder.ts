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
// process (provider-sandbox) — separate work item; until then, run native builds only on trusted local models/specs.
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

  // BUILD + INDEPENDENT VERIFICATION, with bounded repair on EITHER a build error OR a verify failure. V40 LOT M: a false
  // success (the project COMPILES but FAILS the independent test) previously got NO repair — now the test failure is fed
  // back to the generator, fail-closed. Acceptance is still decided ONLY by the independent test.
  let build = assembleAndLoad(files);
  let verifyErr: any = null;
  // V327 §4/§7: bounded PRE-GUARD against a non-terminating generation. The in-thread independentTest below cannot
  // interrupt an infinite loop; so for a single-file spec that supplies STRUCTURED repairExamples, run the candidate
  // source in a timeboxed CHILD first (odg-bounded-exec, injectable via deps.boundedCheck). A TIMEOUT ⇒ the code hangs ⇒
  // treat as not-verified WITHOUT calling the (hang-prone) in-thread test. Opt-in (needs repairExamples + single file);
  // no repairExamples ⇒ unchanged behaviour. Fail-open to the normal path on any guard error (never a false accept).
  const boundedCheck = typeof deps.boundedCheck === "function" ? deps.boundedCheck : (src: string, ex: any) => RF_BE.runExamplesBounded(src, ex, { timeoutMs: Number(deps.boundedTimeoutMs) || 3000 });
  const hangGuardTimedOut = (): boolean => {
    if (!(build.ok && arch.length === 1 && Array.isArray(s.repairExamples) && typeof files[arch[0].path] === "string")) return false;
    try { return boundedCheck(files[arch[0].path], s.repairExamples).verdict === "TIMEOUT"; } catch { return false; }
  };
  const runVerify = (): boolean => { verifyErr = null; if (hangGuardTimedOut()) { verifyErr = "bounded pre-guard TIMEOUT: candidate did not terminate — in-thread test skipped (fail-closed, cycle protected)"; return false; } if (build.ok && fn(s.independentTest)) { try { return s.independentTest(build.modules) === true; } catch (e: any) { verifyErr = String((e && e.message) || e); return false; } } return false; };
  let verified = runVerify();
  const firstPass = Object.freeze({ buildOk: build.ok === true, verified: build.ok === true && verified === true, error: build.ok ? verifyErr : build.error });  // instrumentation: the pre-repair verdict (no behaviour change)
  let repairs = 0;
  // V15.0 §37.8 ANTI-LOOP: a repair round that regenerates EXACTLY the same files as the previous state carries no new
  // information — the next round would be an identical retry (same build, same verdict, another model call). Stop
  // instead of burning the remaining repair budget; the result stays fail-closed (not accepted) and records why.
  const snapshot = (): string => JSON.stringify(Object.keys(files).sort().map((k) => [k, files[k]]));
  let repairStopReason: string | null = null;
  while (!(build.ok && verified) && repairs < maxRepair && fn(deps.generateFile)) {
    const before = snapshot();
    repairs++;
    // regenerate every file with the FAILURE in context: a build error, or a "builds-but-fails-the-test" verify failure.
    // V327 §3 (Self-Debugging/Reflexion): when the spec provides STRUCTURED repairExamples [{args,expect}], feed the
    // generator the SPECIFIC first failing case (input → expected vs actual) instead of the generic message — the
    // world-reference execution-feedback technique. Backward-compatible: no repairExamples ⇒ the generic hint, unchanged.
    // Safe: the independent test already ran the modules in-thread above (no new hang surface); fail-closed to generic.
    let verifyHint = "the project BUILDS but FAILS the independent functional test — the logic does not satisfy the contract; fix the logic";
    if (build.ok && Array.isArray(s.repairExamples) && build.modules) {
      const entry = typeof s.entry === "string" ? s.entry : (arch.length ? arch[arch.length - 1].path : null);
      const entryFn = entry ? build.modules[entry] : null;
      try { const fb = RF.buildExecutionFeedback(s.repairExamples, entryFn); if (fb && fb.hasFailure === true && typeof fb.verifyError === "string") verifyHint = fb.verifyError; } catch { /* fail-closed to generic */ }
    }
    const hint = !build.ok ? { buildError: build.error } : { verifyError: verifyHint };
    let regenFailed = 0;   // a transient generate failure (e.g. model timeout) keeps the old content — NOT "no progress"
    for (const fileSpec of arch) { if (!files[fileSpec.path]) continue; const g = await deps.generateFile({ ...fileSpec, ...hint }, builtContracts); if (g && g.ok === true && typeof g.content === "string") files[fileSpec.path] = g.content; else regenFailed++; }
    // anti-loop: stop ONLY when every file regenerated successfully AND nothing changed (inspection MED: a failed generate
    // keeps old content and must keep its retry budget). Trade-off (stated): a sampled model fed the identical prompt could
    // still produce different output; at the default low temperature an identical round is treated as no new information. A timeout-based hang-guard
    // verdict is not re-run after an identical round (accepted risk: a spurious TIMEOUT then stands — still fail-closed).
    if (regenFailed === 0 && snapshot() === before) { repairStopReason = "NO_PROGRESS_IDENTICAL_REGENERATION"; break; }
    build = assembleAndLoad(files);
    verified = runVerify();
  }
  if (repairStopReason === null && !(build.ok && verified) && repairs >= maxRepair && maxRepair > 0) repairStopReason = "REPAIR_BUDGET_EXHAUSTED";

  const filesGenerated = Object.keys(files).length;
  return Object.freeze({
    project: s.name || "project",
    filesPlanned: arch.length,
    filesGenerated,
    buildOk: build.ok === true,
    buildError: build.ok ? null : build.error,
    repairs,
    repairStopReason,                                     // V15.0 anti-loop: why the repair loop stopped (null if accepted / no repair)
    verified: build.ok && verified,
    verifyError: verifyErr,
    accepted: build.ok === true && verified === true,     // native build accepted ONLY on independent verification
    firstPass,                                            // the pre-repair verdict (instrumentation for benchmarks)
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
  ]),
});

module.exports = { assembleAndLoad, buildProject, NATIVE_PROJECT_BUILDER_CONTRACT, GENERATED_REQUIRE_ALLOW };

if (require.main === module) { process.stdout.write(JSON.stringify(NATIVE_PROJECT_BUILDER_CONTRACT, null, 2) + "\n"); }

export {};
