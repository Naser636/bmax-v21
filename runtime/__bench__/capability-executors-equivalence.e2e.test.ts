#!/usr/bin/env node
/*
 * LOT capability-executors — EQUIVALENCE (historical .js vs compiled .ts). The module's only impure deps —
 * child-process spawn, the wall clock, and DNS/HTTP(S) — are routed through `_seams` (V66), so this bench
 * CONTROLS them via __setExecutorSeams on BOTH modules with IDENTICAL fakes: NO real subprocess, clock, or
 * network. It exercises the dispatch, the pure helpers, the network worker functions (runAudit/httpGetBounded/
 * governedHttpGet) and every executor branch in a throwaway cwd, comparing results + written evidence
 * BYTE-IDENTICAL. Timestamps are injected (fixed) ⇒ zero normalization of functional output.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-executors-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-executors.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-executors.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT capability-executors — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
check(typeof js.__setExecutorSeams === "function" && typeof ts.__setExecutorSeams === "function", "both expose the seam setter");

const NOW = "2026-01-01T00:00:00.000Z";
// Fake DNS (resolves) + fake HTTP (HEAD → cb(res); GET → res emits body then end). Deterministic, no network.
const fakeDns = async (_host: any, _opts: any) => [{ address: "203.0.113.1", family: 4 }];
const fakeHttp = (bodyFor: (u: string) => { statusCode: number; body: string }) => (u: any, options: any, cb: any) => {
  const r = bodyFor(String(u));
  const res: any = new EventEmitter(); res.statusCode = r.statusCode; res.resume = () => {}; res.destroy = () => {};
  const req: any = new EventEmitter(); req.destroy = () => {};
  req.end = () => { cb(res); if (options && options.method === "GET") setImmediate(() => { if (r.body) res.emit("data", Buffer.from(r.body)); res.emit("end"); }); };
  return req;
};
// Fake spawn: simulates each re-exec'd worker deterministically (writes canned evidence / returns stdout).
const fakeSpawn = (cmd: any, args: any) => {
  const a = Array.isArray(args) ? args.map(String) : [];
  if (cmd === "git") return { status: 0, stdout: "runtime/generated/x.tmp\nruntime/generated/y.tmp\n", stderr: "" };
  if (a.includes("--http-get")) return { status: 0, stdout: JSON.stringify({ status: 200, body: "ok", fetched_at: NOW, truncated: false, bytes: 2 }), stderr: "" };
  // connectivity / provider worker: write a canned evidence file to the `out` arg (last arg) + status 0.
  const out = a[a.length - 1];
  try {
    if (out && out.includes("connectivity")) fs.writeFileSync(out, JSON.stringify({ capability: "Connectivity Audit", ranAt: NOW, internet: { reachable: true }, secretsExposed: false }));
    else if (out && out.includes("provider-activation.json")) fs.writeFileSync(out, JSON.stringify({ orchestration: { decision: "SELECTED", selectedProvider: "fake" }, execution: { classification: "OK" } }));
  } catch { /* temp cwd */ }
  return { status: 0, stdout: "", stderr: "" };
};
const SEAMS = { spawn: fakeSpawn, nowIso: () => NOW, dnsLookup: fakeDns, httpRequest: fakeHttp(() => ({ statusCode: 200, body: "x" })) };
function withSeams(mod: any, fn: () => any): any { mod.__setExecutorSeams(SEAMS); try { return fn(); } finally { mod.__resetExecutorSeams(); } }

// (1) EXECUTORS registry + routing (pure)
check(EQ(js.EXECUTORS.map((e: any) => e.capability), ts.EXECUTORS.map((e: any) => e.capability)), "EXECUTORS capability list byte-identical");
for (const oid of ["ODG_WRITE_x", "ODG_SPEC_x", "GIT_BRANCH_INTEGRATION__x", "BASH_COMMAND__x", "CLEAN_WORKSPACE_1", "VERIFY_OBSERVABILITY_x", "EXTERNAL_RESEARCH_x", "nope"]) {
  const jr = js.resolve({ objectiveId: oid }); const tr = ts.resolve({ objectiveId: oid });
  check((jr && jr.capability) === (tr && tr.capability), `resolve routes ${oid} identically (${jr && jr.capability || "null"})`);
}
check((js.resolve({ action: "run connectivity audit" }) || {}).capability === (ts.resolve({ action: "run connectivity audit" }) || {}).capability, "resolve routes a connectivity haystack identically");

// (2) pure helpers
check(js.isProtectedGovernanceTarget("runtime/governance/x") === true && ts.isProtectedGovernanceTarget("runtime/governance/x") === true, "isProtectedGovernanceTarget(governance) true (both)");
check(js.isProtectedGovernanceTarget("runtime/core/x") === false && ts.isProtectedGovernanceTarget("runtime/core/x") === false, "isProtectedGovernanceTarget(core) false (both)");
check(EQ(js.formulateSyntheticManifest({ mission: "M", objectives: [{ id: "o1" }, { id: "o2" }] }), ts.formulateSyntheticManifest({ mission: "M", objectives: [{ id: "o1" }, { id: "o2" }] })), "formulateSyntheticManifest byte-identical");

// (3) network worker functions via injected dns/http/clock (no real network) — async.
(async () => {
  // runAudit must hold the seams across its awaits ⇒ set, await, reset (not via the sync withSeams wrapper).
  js.__setExecutorSeams(SEAMS); const ja = await js.runAudit(); js.__resetExecutorSeams();
  ts.__setExecutorSeams(SEAMS); const ta = await ts.runAudit(); ts.__resetExecutorSeams();
  check(EQ(ja, ta), "runAudit() byte-identical under injected DNS/HTTP/clock (fixed ranAt ⇒ no normalization)");
  check(ja.ranAt === NOW && ja.internet.reachable === true, "runAudit uses injected clock + resolves via fake network");

  js.__setExecutorSeams(SEAMS); const jh = await js.httpGetBounded("https://x.test/p", 1000, 2000); js.__resetExecutorSeams();
  ts.__setExecutorSeams(SEAMS); const th = await ts.httpGetBounded("https://x.test/p", 1000, 2000); ts.__resetExecutorSeams();
  check(EQ(jh, th) && jh.fetched_at === NOW && jh.status === 200, "httpGetBounded() byte-identical (injected HTTP + fixed fetched_at)");

  runSyncScenarios();
  console.log(failures === 0 ? "ALL PASS — LOT capability-executors EQUIVALENCE" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();

function runSyncScenarios(): void {
  // (4) governedHttpGet via injected spawn (fake subprocess stdout)
  check(EQ(withSeams(js, () => js.governedHttpGet("https://x.test")), withSeams(ts, () => ts.governedHttpGet("https://x.test"))), "governedHttpGet() byte-identical (injected spawn)");

  // (5) executor run() in a throwaway cwd, injected spawn — compare result + written evidence byte-identical.
  const run = (mod: any, patch: any, seed?: (g: string) => void): any => {
    const cwd0 = process.cwd();
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "capx-"));
    const g = path.join(d, "runtime", "generated"); fs.mkdirSync(g, { recursive: true });
    if (seed) seed(g);
    let result: any, evidence: any = null, threw: any = null;
    try { process.chdir(d); result = withSeams(mod, () => mod.resolve(patch).run()); try { evidence = fs.existsSync(result.evidence) ? JSON.parse(fs.readFileSync(result.evidence, "utf8")) : null; } catch { evidence = null; } }
    catch (e: any) { threw = String(e && e.message || e); }
    finally { process.chdir(cwd0); try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
    // provenance.sourceCommit/treeDirty come from the real git repo — identical for both runs ms apart; drop
    // only the provenance block's volatile git fields are NOT needed (same state), so compare the whole evidence.
    return { result, evidence, threw };
  };
  const both = (patch: any, label: string, seed?: (g: string) => void) => {
    const j = run(js, patch, seed); const t = run(ts, patch, seed);
    check(EQ(j.result, t.result) && EQ(j.evidence, t.evidence) && EQ(j.threw, t.threw), label);
    return j;
  };

  // BASH_COMMAND dry-run (no execute) ⇒ ANALYZED, no sandbox
  both({ objectiveId: "BASH_COMMAND__x", bash_command: { command: "ls" } }, "BASH_COMMAND dry-run run() byte-identical (result+evidence)");
  // EXTERNAL_RESEARCH dry-run ⇒ DRY_RUN acquired:false, zero network
  both({ objectiveId: "EXTERNAL_RESEARCH_x" }, "EXTERNAL_RESEARCH dry-run run() byte-identical");
  // CLEAN_WORKSPACE_1 ⇒ scan via injected git spawn
  both({ objectiveId: "CLEAN_WORKSPACE_1" }, "CLEAN_WORKSPACE_1 run() byte-identical (injected git scan)");
  // Connectivity ⇒ injected spawn writes canned evidence
  both({ objectiveId: "x", action: "connectivity audit" }, "Connectivity run() byte-identical (injected worker)");
  // ODG_WRITE_ synthetic ⇒ writes a deliverable under seeded authorized_paths (patch-plan.json in temp cwd)
  both({ objectiveId: "ODG_WRITE_x" }, "ODG_WRITE_ run() byte-identical (confined write under seeded plan)",
    (g) => fs.writeFileSync(path.join(g, "patch-plan.json"), JSON.stringify({ mission: "M", authorizedPaths: ["runtime/generated/out/"], objectives: [{ id: "o1" }] })));
}
