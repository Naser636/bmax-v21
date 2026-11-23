#!/usr/bin/env node
"use strict";

/*
 * V15.9 — NATIVE BUILD ISOLATION PARITY BENCH (evidence producer for docs/odg/evidence/V159_NATIVE_BUILD_ISOLATION.json).
 * Compares the legacy IN-PROCESS evaluation (assembleAndLoad + host-function test) with the ISOLATED evaluation
 * (odg-native-build-sandbox: bwrap + RLIMIT_AS + null-prototype vm; test serialized via testSourceFromFn) on the SAME code:
 *   A) deterministic: every corpus task's REFERENCE implementation + a BROKEN variant (entry returns null) — 40 tasks × 2;
 *   B) real model code: buildProject (isolated, default path) with a LIVE local model (Ollama loopback) over the selected
 *      corpora; every generated file is recorded, then the FIRST-PASS files and the FINAL files are re-evaluated by BOTH
 *      paths. Equal verdicts expected; any divergence is listed with both verdicts/errors.
 *   C) the 7 in-process escapes from generated source: observed result inside the sandbox + host marker presence.
 * The in-process re-evaluation of model code in (B) is the explicit UNISOLATED comparison arm (local trusted model only).
 * Run: npx tsx runtime/bin/odg-v159-native-isolation-bench.ts <model|none> <corpora: hard,complex,calibrate> <out.json> [maxTasksPerCorpus]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const B = require(path.join(ROOT, "runtime", "core", "native-project-builder.js"));
const NBS = require(path.join(ROOT, "runtime", "core", "odg-native-build-sandbox.js"));
const GEN = require(path.join(ROOT, "runtime", "core", "local-model-generator.js"));
const { HARD_TASKS, HARD_TEST_PRELUDE } = require(path.join(ROOT, "runtime", "bin", "native-hard-corpus.js"));
const { COMPLEX_TASKS } = require(path.join(ROOT, "runtime", "bin", "native-complex-corpus.js"));
const { SIMPLE_TASKS } = require(path.join(ROOT, "runtime", "bin", "native-calibrate-corpus.js"));

const MODEL = process.argv[2] || "none";
const CORPORA = String(process.argv[3] || "hard,complex,calibrate").split(",").filter(Boolean);
const OUT = process.argv[4] || path.join(ROOT, "docs", "odg", "evidence", "V159_NATIVE_BUILD_ISOLATION.json");
const MAX_TASKS = Number.isFinite(parseInt(process.argv[5], 10)) ? parseInt(process.argv[5], 10) : Infinity;

// uniform corpus view: { corpus, id, entry, prelude, test, arch:[{path, role, contract, dependsOn}], ref:{path:src} }
function corpusTasks(name: string): any[] {
  if (name === "hard") return HARD_TASKS.map((t: any) => ({ corpus: "hard", id: t.id, entry: "report.js", prelude: HARD_TEST_PRELUDE, test: t.test, arch: t.files.map((f: any) => ({ path: f.path, role: f.path.replace(/\.js$/, ""), contract: f.contract, dependsOn: f.dependsOn || [] })), ref: Object.fromEntries(t.files.map((f: any) => [f.path, f.ref])) }));
  if (name === "complex") return COMPLEX_TASKS.map((t: any) => ({ corpus: "complex", id: t.id, entry: "report.js", prelude: "", test: t.test,
    arch: [{ path: "parse.js", role: "parse the input", contract: t.parse }, { path: "a.js", role: "metric A", contract: t.a, dependsOn: ["parse.js"] }, { path: "b.js", role: "metric B", contract: t.b, dependsOn: ["parse.js"] }, { path: "report.js", role: "combine a and b", contract: t.report, dependsOn: ["a.js", "b.js"] }],
    ref: { "parse.js": t.parse, "a.js": t.a, "b.js": t.b, "report.js": t.report } }));
  if (name === "calibrate") return SIMPLE_TASKS.map((t: any) => ({ corpus: "calibrate", id: t.id, entry: "main.js", prelude: "", test: t.test,
    arch: [{ path: "helper.js", role: `primitive for ${t.id}`, contract: t.helper }, { path: "main.js", role: `${t.id} using the helper`, contract: t.main, dependsOn: ["helper.js"] }],
    ref: { "helper.js": t.helper, "main.js": t.main } }));
  return [];
}

function inProcess(task: any, files: any): any {
  const t0 = process.hrtime.bigint();
  const b = B.assembleAndLoad(files);
  let verified = false, err: any = b.ok ? null : b.error;
  if (b.ok) { try { verified = task.test(b.modules[task.entry]) === true; } catch (e: any) { verified = false; err = String((e && e.message) || e); } }
  return { buildOk: b.ok === true, verified, verdict: !b.ok ? "BUILD_ERROR" : (verified ? "PASS" : "FAIL"), error: err ? String(err).slice(0, 200) : null, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}
function isolated(task: any, files: any): any {
  const r = NBS.runIsolated(files, { kind: "source", source: NBS.testSourceFromFn(task.test, task.entry, task.prelude) });
  const verdict = r.status !== "EXECUTED" ? "NOT_RUN" : (!r.buildOk ? (r.outcome === "TIMEOUT" ? "TIMEOUT" : (r.outcome === "BUILD_ERROR" ? "BUILD_ERROR" : r.outcome)) : (r.verified ? "PASS" : "FAIL"));
  return { buildOk: r.buildOk === true, verified: r.status === "EXECUTED" ? r.verified === true : null, verdict, error: r.buildError || r.verifyError ? String(r.buildError || r.verifyError).slice(0, 200) : null, ms: r.wallMs, status: r.status };
}
function compare(label: string, task: any, files: any): any {
  const a = inProcess(task, files); const b = isolated(task, files);
  const same = a.verdict === b.verdict;
  return { corpus: task.corpus, id: task.id, variant: label, inProcess: a, isolated: b, verdictEqual: same };
}
function stats(xs: number[]): any { if (!xs.length) return { n: 0, medianMs: "NOT_MEASURED", meanMs: "NOT_MEASURED" }; const s = xs.slice().sort((p, q) => p - q); return { n: xs.length, medianMs: Number(s[Math.floor(s.length / 2)].toFixed(2)), meanMs: Number((xs.reduce((p, q) => p + q, 0) / xs.length).toFixed(2)), maxMs: Number(s[s.length - 1].toFixed(2)) }; }
function summarize(rows: any[]): any {
  return { comparisons: rows.length, verdictEqual: rows.filter((r) => r.verdictEqual).length, divergent: rows.filter((r) => !r.verdictEqual).map((r) => ({ corpus: r.corpus, id: r.id, variant: r.variant, inProcess: r.inProcess.verdict, isolated: r.isolated.verdict, inProcessError: r.inProcess.error, isolatedError: r.isolated.error })),
    passInProcess: rows.filter((r) => r.inProcess.verdict === "PASS").length, passIsolated: rows.filter((r) => r.isolated.verdict === "PASS").length,
    wallInProcess: stats(rows.map((r) => r.inProcess.ms)), wallIsolated: stats(rows.map((r) => r.isolated.ms)) };
}

// C) the 7 escapes (+ dynamic import) from generated source, observed inside the sandbox; host marker presence checked.
function escapes(): any[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-v159-esc-"));
  const secret = path.join(dir, "secret.txt"); const SECRET = "HOST-SECRET-" + Date.now(); fs.writeFileSync(secret, SECRET);
  const list: Array<[string, string]> = [
    ["require.cache", "(() => { const c = require.cache; return c[Object.keys(c)[0]].require('fs'); })()"],
    ["module.constructor._load", "module.constructor._load('fs')"],
    ["module.constructor.createRequire", "module.constructor.createRequire('/')('fs')"],
    ["process.mainModule.require", "process.mainModule.require('fs')"],
    ["process.getBuiltinModule", "process.getBuiltinModule('fs')"],
    ["Function('return process')", "(function () {}).constructor('return process')().getBuiltinModule('fs')"],
    ["process.binding", "(() => { const b = process.binding('fs'); return { writeFileSync: (p) => b.open(p, 0o101, 0o644), readFileSync: () => 'binding' }; })()"],
  ];
  const out: any[] = [];
  for (const [name, getFs] of list) {
    const mk = path.join(dir, "m-" + out.length);
    const src = `let __o; try { const fs = (${getFs}); fs.writeFileSync(${JSON.stringify(mk)}, "x"); __o = "ESCAPED:" + fs.readFileSync(${JSON.stringify(secret)}, "utf8"); } catch (e) { __o = "BLOCKED:" + String(e && e.message); } module.exports = () => __o;`;
    const r = NBS.runIsolated({ "evil.js": src }, { kind: "none" }, { repair: { entry: "evil.js", examples: [{ args: [] }] } });
    let v: any = null; try { v = JSON.parse(r.repairObservations[0]).value; } catch { v = null; }
    out.push({ escape: name, isolatedObserved: v, hostMarkerPresent: fs.existsSync(mk), secretLeaked: String(v).includes(SECRET) });
  }
  const mk = path.join(dir, "m-import");
  const imp = `var __o = "PENDING"; try { import("fs").then((fs) => { fs.writeFileSync(${JSON.stringify(mk)}, "x"); __o = "ESCAPED"; }, (e) => { __o = "BLOCKED:" + String(e && e.message); }); } catch (e) { __o = "BLOCKED:" + String(e && e.message); } module.exports = () => __o;`;
  const r = NBS.runIsolated({ "evil.js": imp }, { kind: "none" }, { repair: { entry: "evil.js", examples: [{ args: [] }] } });
  let v: any = null; try { v = JSON.parse(r.repairObservations[0]).value; } catch { v = null; }
  out.push({ escape: "dynamic import()", isolatedObserved: v, hostMarkerPresent: fs.existsSync(mk), secretLeaked: false });
  // CONTROL: the getBuiltinModule escape through the legacy in-process path
  const cmk = path.join(dir, "m-control");
  const ctl = B.assembleAndLoad({ "evil.js": `let __o; try { const fs = process.getBuiltinModule('fs'); fs.writeFileSync(${JSON.stringify(cmk)}, "x"); __o = "ESCAPED:" + fs.readFileSync(${JSON.stringify(secret)}, "utf8"); } catch (e) { __o = "BLOCKED:" + e.message; } module.exports = () => __o;` });
  out.push({ escape: "CONTROL process.getBuiltinModule via legacy IN-PROCESS path", inProcessObserved: ctl.ok ? String(ctl.modules["evil.js"]()).replace(SECRET, "<host-secret>") : null, hostMarkerPresent: fs.existsSync(cmk), secretLeaked: ctl.ok ? String(ctl.modules["evil.js"]()).includes(SECRET) : false });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  return out;
}

(async () => {
  const startedAt = new Date().toISOString();
  const head = (() => { try { return cp.execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "NOT_MEASURED"; } })();
  const probe = NBS.probeSandbox();
  if (!probe.ok) { process.stderr.write("sandbox unavailable ⇒ NOT_RUN: " + probe.reason + "\n"); process.exit(2); }

  // A) deterministic reference + broken variants
  const detRows: any[] = [];
  for (const c of ["hard", "complex", "calibrate"]) for (const t of corpusTasks(c)) {
    detRows.push(compare("REFERENCE", t, t.ref));
    detRows.push(compare("BROKEN_ENTRY", t, { ...t.ref, [t.entry]: "module.exports = () => null;" }));
  }
  process.stdout.write(`[A] deterministic: ${JSON.stringify(summarize(detRows))}\n`);

  // B) real model code
  const modelRows: any[] = []; const builds: any[] = [];
  if (MODEL !== "none") {
    for (const c of CORPORA) {
      const tasks = corpusTasks(c).slice(0, MAX_TASKS);
      for (const t of tasks) {
        const log: any[] = [];
        const gen0 = GEN.makeLocalGenerator({ model: MODEL, timeoutMs: 300000, numPredict: 1024, temperature: 0.1 });
        const gen = async (f: any, ctx: any) => { const g = await gen0(f, ctx); if (g && g.ok === true && typeof g.content === "string") log.push([f.path, g.content]); return g; };
        const spec = { name: `${c}-${t.id}`, architecture: t.arch, writeSet: t.arch.map((a: any) => a.path), independentTestSource: NBS.testSourceFromFn(t.test, t.entry, t.prelude) };
        const t0 = Date.now(); let bo: any = null, err: any = null;
        try { bo = await B.buildProject(spec, { generateFile: gen, maxRepair: 1 }); } catch (e: any) { err = String((e && e.message) || e); }
        const first: any = {}; for (const [p, src] of log) if (!(p in first)) first[p] = src;
        const b = bo || {};
        builds.push({ corpus: c, id: t.id, model: MODEL, executionMode: b.executionMode || null, executionStatus: b.executionStatus || null, firstPassAccepted: !!(b.firstPass && b.firstPass.verified), finalAccepted: b.accepted === true, repairs: b.repairs ?? null, repairStopReason: b.repairStopReason ?? null, sandboxWallMs: b.sandboxWallMs ?? null, buildMs: Date.now() - t0, error: err });
        if (Object.keys(first).length) modelRows.push(compare("MODEL_FIRST_PASS", t, first));
        if (b.files && Object.keys(b.files).length && JSON.stringify(b.files) !== JSON.stringify(first)) modelRows.push(compare("MODEL_FINAL", t, b.files));
        const last = modelRows[modelRows.length - 1];
        process.stdout.write(`[B ${c} ${t.id}] build=${b.accepted ? "ACCEPT" : "REJECT"} mode=${b.executionMode} repairs=${b.repairs} ${Date.now() - t0}ms parity=${last ? last.verdictEqual : "n/a"}\n`);
      }
    }
  }

  const esc = escapes();
  const evidence = {
    schema: "V159_NATIVE_BUILD_ISOLATION_EVIDENCE",
    directive: "CTO V15.9 — model-written native-build code executes ONLY inside an outer isolated process (bwrap); the host never compiles/executes it",
    startedAt, finishedAt: new Date().toISOString(), head, node: process.version,
    isolation: NBS.NATIVE_BUILD_SANDBOX_CONTRACT,
    method: "Same code evaluated by both paths: IN_PROCESS = native-project-builder.assembleAndLoad + the corpus host-function test (legacy, now opt-in UNISOLATED); ISOLATED = odg-native-build-sandbox.runIsolated (bwrap --unshare-all/--clearenv + prlimit RLIMIT_AS 1GiB + null-prototype vm; test serialized via testSourceFromFn). Wall time per evaluation (isolated includes bwrap+node process start).",
    deterministic: { note: "every corpus task's REFERENCE implementation (expected PASS) + a BROKEN_ENTRY variant (expected FAIL)", summary: summarize(detRows), rows: detRows },
    modelGenerated: MODEL === "none" ? { status: "NOT_MEASURED", reason: "no model selected" } : { model: MODEL, transport: "Ollama loopback 127.0.0.1:11434 (generation on the host; ONLY execution sandboxed)", corpora: CORPORA, maxTasksPerCorpus: Number.isFinite(MAX_TASKS) ? MAX_TASKS : "ALL", builds, summary: summarize(modelRows), rows: modelRows },
    escapes: esc,
    honestLimits: [
      "SOURCE-form test runs in the candidate's realm (tamper-equivalent to the legacy in-thread test, not stronger); the CASES form is host-graded.",
      "inside the sandbox generated code may require only other generated files or 'assert' (in-context shim); the #913 in-process allowlist also allowed util/events/string_decoder — such code builds in-process but fails isolated (REQUIRE_DENIED) — any such case appears as a divergence above.",
      "wall time includes per-evaluation bwrap + node startup; measured on a shared host.",
      "VERIFIED in-repo ≠ DEPLOYED.",
    ],
  };
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(`[B] model: ${JSON.stringify(evidence.modelGenerated.summary || evidence.modelGenerated)}\n[C] escapes blocked: ${esc.filter((e: any) => !e.hostMarkerPresent && !e.secretLeaked).length - 0}/${esc.length} (last row is the in-process CONTROL)\n=> ${OUT}\n`);
  process.exit(0);
})().catch((e) => { process.stderr.write("isolation bench error: " + String((e && e.message) || e) + "\n"); process.exit(1); });

export {};
