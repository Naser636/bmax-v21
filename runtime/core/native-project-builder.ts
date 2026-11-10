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

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

/** assembleAndLoad(files) -> { ok, modules?, error? }. In-memory build: compile each file as a CommonJS module in
 *  dependency order; a reference to a missing symbol throws ⇒ ok:false (fail-closed, no silent partial). */
function assembleAndLoad(files: any): any {
  const registry: any = {};
  const make = (path: string, content: string) => {
    const m = new (module as any).constructor(path);
    m.require = (req: string) => {
      // resolve a relative import to another generated file by basename
      const key = Object.keys(files).find((k) => k === req || k.endsWith(req.replace(/^\.\//, "")) || req.endsWith(k.replace(/^.*\//, "").replace(/\.js$/, "")));
      if (key) { if (!registry[key]) registry[key] = make(key, files[key]); return registry[key].exports; }
      return require(req);
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
  const runVerify = (): boolean => { verifyErr = null; if (build.ok && fn(s.independentTest)) { try { return s.independentTest(build.modules) === true; } catch (e: any) { verifyErr = String((e && e.message) || e); return false; } } return false; };
  let verified = runVerify();
  let repairs = 0;
  while (!(build.ok && verified) && repairs < maxRepair && fn(deps.generateFile)) {
    repairs++;
    // regenerate every file with the FAILURE in context: a build error, or a "builds-but-fails-the-test" verify failure.
    const hint = !build.ok ? { buildError: build.error } : { verifyError: "the project BUILDS but FAILS the independent functional test — the logic does not satisfy the contract; fix the logic" };
    for (const fileSpec of arch) { if (!files[fileSpec.path]) continue; const g = await deps.generateFile({ ...fileSpec, ...hint }, builtContracts); if (g && g.ok === true && typeof g.content === "string") files[fileSpec.path] = g.content; }
    build = assembleAndLoad(files);
    verified = runVerify();
  }

  const filesGenerated = Object.keys(files).length;
  return Object.freeze({
    project: s.name || "project",
    filesPlanned: arch.length,
    filesGenerated,
    buildOk: build.ok === true,
    buildError: build.ok ? null : build.error,
    repairs,
    verified: build.ok && verified,
    verifyError: verifyErr,
    accepted: build.ok === true && verified === true,     // native build accepted ONLY on independent verification
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

module.exports = { assembleAndLoad, buildProject, NATIVE_PROJECT_BUILDER_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(NATIVE_PROJECT_BUILDER_CONTRACT, null, 2) + "\n"); }

export {};
