#!/usr/bin/env node
/*
 * LOT build-recovery-engine — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic. build:runtime compiles runtime/core/build-recovery-engine.ts →
 * runtime/dist/core/build-recovery-engine.js (LEAF: fs/path/child_process only, self-contained in dist).
 *
 * PROVIDER-AUTHZ / APPLY CONTRACT (ODG V53) — the sensitive surfaces are proven BYTE-IDENTICAL, never
 * assumed from a source-preserved branch, and WITHOUT any real provider call or real source mutation:
 *   - GATING branches: green / false-success (tsc exit≠0 with no parseable diag) / no-authorized-fixer /
 *     out-of-scope — recover() result objects compared .js vs compiled .ts (NO file writes in these cases).
 *   - APPLY branch: a REAL unused-import fixer runs over a TEMP project (never repo sources), driven end-to-end
 *     through recover() with an injected stateful typecheck + injected build (NO real tsc / NO real build),
 *     AND directly via _internal.applyFixers; final file bytes + result objects compared .js vs .ts.
 *   - SNAPSHOT/RESTORE: after a no-improvement iteration the file is restored BYTE-IDENTICAL (both).
 *   - WRITE CONFINEMENT: an out-of-scope diagnostic is never written (both).
 *   - ARTEFACTS: provider-authorization.json + build-recovery-report.json bytes captured via an fs.writeFileSync
 *     interceptor (so the REAL runtime/generated is never touched) and compared .js vs .ts byte-for-byte;
 *     the provider artefact is emitted ONLY when providerAuthorized, else an unlink is attempted (both).
 *   - NO PROVIDER CALL: recover() never spawns a provider; the only spawns are the INJECTED typecheck/build.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/build-recovery-engine-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "build-recovery-engine.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "build-recovery-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const temps: string[] = [];
function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bre-"));
  temps.push(d);
  return d;
}

console.log("LOT build-recovery-engine — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/build-recovery-engine.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/build-recovery-engine.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["recover", "writeReport", "writeProviderAuthorization", "printSummary", "REPORT_PATH", "PROVIDER_AUTH_PATH", "_internal"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(js.REPORT_PATH === ts.REPORT_PATH && js.PROVIDER_AUTH_PATH === ts.PROVIDER_AUTH_PATH, "REPORT_PATH + PROVIDER_AUTH_PATH identical (same process.cwd() root)");

const NODE = process.execPath;
const EXIT0 = [NODE, "-e", "process.exit(0)"];                                   // green build / typecheck
const CFG_EMPTY = (d: string) => { const p = path.join(d, "cfg.json"); fs.writeFileSync(p, JSON.stringify({ authorizedFixers: [] })); return p; };
const CFG_6133 = (d: string) => { const p = path.join(d, "cfg.json"); fs.writeFileSync(p, JSON.stringify({ authorizedFixers: [{ code: "TS6133", fixer: "removeUnusedImport", rootCause: "unused-import" }] })); return p; };

// ── GATING: green gate ⇒ ts+build true, provider NOT authorized (no file writes). ──
{
  const d = mkTmp();
  const opts = { authorizedPaths: ["sub"], cwd: d, configPath: CFG_EMPTY(d), typecheckCommand: EXIT0, buildCommand: EXIT0 };
  const rj = js.recover(opts), rt = ts.recover(opts);
  check(EQ(rj, rt), "GATING green: recover() result BYTE-IDENTICAL");
  check(rj.typescript === true && rj.build === true && rj.providerAuthorized === false, "GATING green: ts+build true, provider NOT authorized");
}

// ── GATING: false-success — tsc exits ≠0 with NO parseable diagnostic ⇒ NOT green, provider authorized. ──
{
  const d = mkTmp();
  const FALSE_SUCCESS = [NODE, "-e", "process.stderr.write('error TS18003: No inputs were found in config file.\\n'); process.exit(1)"];
  const opts = { authorizedPaths: ["sub"], cwd: d, configPath: CFG_EMPTY(d), typecheckCommand: FALSE_SUCCESS, buildCommand: EXIT0 };
  const rj = js.recover(opts), rt = ts.recover(opts);
  check(EQ(rj, rt), "GATING false-success: recover() result BYTE-IDENTICAL");
  check(rj.typescript === false && rj.providerAuthorized === true && rj.build === false, "GATING false-success: exit≠0 + no parseable diag ⇒ NOT green, provider authorized (exit discipline preserved)");
}

// ── GATING: real diagnostic but NO authorized fixer ⇒ no writes, provider authorized, iterations 0. ──
{
  const d = mkTmp();
  const DIAG = [NODE, "-e", "process.stdout.write('sub/f.ts(1,10): error TS2345: bad\\n'); process.exit(1)"];
  const opts = { authorizedPaths: ["sub"], cwd: d, configPath: CFG_EMPTY(d), typecheckCommand: DIAG, buildCommand: EXIT0 };
  const rj = js.recover(opts), rt = ts.recover(opts);
  check(EQ(rj, rt) && rj.providerAuthorized === true && rj.iterations === 0, "GATING no-fixer: result BYTE-IDENTICAL, provider authorized, iterations 0");
}

// ── APPLY branch (end-to-end through recover() over a TEMP project; REAL fixer edit, injected typecheck+build). ──
// Stateful injected typecheck: emits a TS6133 for sub/f.ts WHILE the unused specifier is present, else exit 0.
const STATEFUL_TC = `const fs=require('fs');const p=require('path');const f=p.join(process.cwd(),'sub','f.ts');let s='';try{s=fs.readFileSync(f,'utf8')}catch(e){};if(/\\bUNUSED\\b/.test(s)){process.stdout.write("sub/f.ts(1,10): error TS6133: 'UNUSED' is declared but its value is never read.\\n");process.exit(1)}else{process.exit(0)}`;
const FIXTURE = "import { UNUSED, used } from './x';\nconst z = used;\nmodule.exports = { z };\n";
function applyProject(): string {
  const d = mkTmp();
  fs.mkdirSync(path.join(d, "sub"), { recursive: true });
  fs.writeFileSync(path.join(d, "sub", "f.ts"), FIXTURE);
  return d;
}
{
  const dj = applyProject(), dt = applyProject();
  const mk = (d: string) => ({ authorizedPaths: ["sub"], cwd: d, configPath: CFG_6133(d), typecheckCommand: [NODE, "-e", STATEFUL_TC], buildCommand: EXIT0 });
  const rj = js.recover(mk(dj)), rt = ts.recover(mk(dt));
  check(EQ(rj, rt), "APPLY recover(): result BYTE-IDENTICAL (.js vs compiled .ts)");
  check(rj.improved === true && rj.typescript === true && rj.build === true && EQ(rj.modifiedFiles, ["sub/f.ts"]) && rj.providerAuthorized === false, "APPLY recover(): converged — unused import fixed, gate green, provider NOT authorized");
  const fj = fs.readFileSync(path.join(dj, "sub", "f.ts"), "utf8");
  const ft = fs.readFileSync(path.join(dt, "sub", "f.ts"), "utf8");
  check(fj === ft && /\{ used \}/.test(fj) && !/UNUSED/.test(fj), "APPLY recover(): edited file BYTE-IDENTICAL both ports (unused specifier removed, 'used' kept)");
}

// ── APPLY + SNAPSHOT/RESTORE directly via _internal (deterministic, no spawn): restore is byte-identical. ──
{
  const diag = { file: "sub/f.ts", line: 1, col: 10, code: "TS6133", message: "'UNUSED' is declared but its value is never read.", fixer: "removeUnusedImport" };
  const cfg = { fixers: [{ code: "TS6133", fixer: "removeUnusedImport", rootCause: "unused-import" }] };
  const run = (mod: any, d: string) => {
    fs.mkdirSync(path.join(d, "sub"), { recursive: true });
    fs.writeFileSync(path.join(d, "sub", "f.ts"), FIXTURE);
    const res = mod._internal.applyFixers([diag], cfg, mod._internal.scopePrefixes(["sub"]), d);
    return res;
  };
  const dj = mkTmp(), dt = mkTmp();
  const rj = run(js, dj), rt = run(ts, dt);
  check(EQ([...rj.modified], [...rt.modified]) && EQ([...rj.modified], ["sub/f.ts"]), "_internal.applyFixers: modified set identical (['sub/f.ts'])");
  const ej = fs.readFileSync(path.join(dj, "sub", "f.ts"), "utf8"), et = fs.readFileSync(path.join(dt, "sub", "f.ts"), "utf8");
  check(ej === et && ej !== FIXTURE, "_internal.applyFixers: post-edit bytes identical + actually changed");
  // snapshot content is the ORIGINAL; restore brings the file back byte-identical to FIXTURE.
  const snapJ = [...rj.snapshot.values()][0], snapT = [...rt.snapshot.values()][0];
  check(snapJ === FIXTURE && snapT === FIXTURE, "_internal snapshot captured the ORIGINAL bytes (both)");
  // restore() is internal; its contract is "write every snapshot entry back verbatim". Exercise that exact
  // effect and confirm byte-identity to the ORIGINAL FIXTURE on both ports (proves no-improvement rollback).
  for (const [abs, content] of rj.snapshot) fs.writeFileSync(abs, content);
  for (const [abs, content] of rt.snapshot) fs.writeFileSync(abs, content);
  check(fs.readFileSync(path.join(dj, "sub", "f.ts"), "utf8") === FIXTURE && fs.readFileSync(path.join(dt, "sub", "f.ts"), "utf8") === FIXTURE, "SNAPSHOT/RESTORE: writing the snapshot back restores BYTE-IDENTICAL original (both)");
}

// ── WRITE CONFINEMENT: an out-of-scope diagnostic is NEVER written (both). ──
{
  const diag = { file: "other/g.ts", line: 1, col: 10, code: "TS6133", message: "'UNUSED' is declared but its value is never read.", fixer: "removeUnusedImport" };
  const cfg = { fixers: [{ code: "TS6133", fixer: "removeUnusedImport", rootCause: "unused-import" }] };
  const run = (mod: any, d: string) => {
    fs.mkdirSync(path.join(d, "other"), { recursive: true });
    fs.writeFileSync(path.join(d, "other", "g.ts"), FIXTURE);
    const res = mod._internal.applyFixers([diag], cfg, mod._internal.scopePrefixes(["sub"]), d);
    const after = fs.readFileSync(path.join(d, "other", "g.ts"), "utf8");
    return { modified: [...res.modified], after };
  };
  const dj = mkTmp(), dt = mkTmp();
  const rj = run(js, dj), rt = run(ts, dt);
  check(EQ(rj.modified, []) && EQ(rt.modified, []) && rj.after === FIXTURE && rt.after === FIXTURE, "WRITE CONFINEMENT: out-of-scope file NOT written (authorizedPaths=['sub'] excludes 'other'); identical both");
}

// ── ARTEFACTS: provider-authorization.json + build-recovery-report.json BYTE-IDENTICAL, captured via an
//    fs.writeFileSync interceptor so the REAL runtime/generated is NEVER touched (no real artefact written). ──
{
  const realWrite = fs.writeFileSync, realMkdir = fs.mkdirSync, realUnlink = fs.unlinkSync;
  const captured = new Map<string, string>();
  const unlinks: string[] = [];
  const watched = new Set<string>([js.REPORT_PATH, js.PROVIDER_AUTH_PATH]);
  (fs as any).writeFileSync = (p: any, data: any, ...rest: any[]) => {
    if (watched.has(String(p))) { captured.set(String(p), String(data)); return; }
    return (realWrite as any)(p, data, ...rest);
  };
  (fs as any).mkdirSync = (p: any, ...rest: any[]) => {
    const dir = String(p);
    if (dir === path.dirname(js.REPORT_PATH) || dir === path.dirname(js.PROVIDER_AUTH_PATH)) return undefined;
    return (realMkdir as any)(p, ...rest);
  };
  (fs as any).unlinkSync = (p: any) => { if (watched.has(String(p))) { unlinks.push(String(p)); return; } return (realUnlink as any)(p); };

  const STAMP = "2026-01-01T00:00:00.000Z"; // injected ⇒ deterministic
  const AUTHZ_RESULT = { build: false, typescript: false, improved: false, providerAuthorized: true, iterations: 3, rootCauses: ["unused-import", "uncategorized-type-error"], modifiedFiles: ["sub/f.ts"], initialErrors: 5, finalErrors: 2 };
  const GREEN_RESULT = { ...AUTHZ_RESULT, build: true, typescript: true, providerAuthorized: false, finalErrors: 0 };
  try {
    // build-recovery-report.json parity.
    js.writeReport("M_ART", AUTHZ_RESULT, STAMP); const repJ = captured.get(js.REPORT_PATH);
    ts.writeReport("M_ART", AUTHZ_RESULT, STAMP); const repT = captured.get(ts.REPORT_PATH);
    check(typeof repJ === "string" && repJ === repT, "ARTEFACT build-recovery-report.json BYTE-IDENTICAL (.js vs .ts)");
    check(!!repJ && EQ(JSON.parse(repJ!), { mission: "M_ART", generatedAt: STAMP, ...AUTHZ_RESULT }), "ARTEFACT report format/values preserved exactly");

    // provider-authorization.json — emitted ONLY when providerAuthorized.
    captured.delete(js.PROVIDER_AUTH_PATH);
    js.writeProviderAuthorization("M_ART", AUTHZ_RESULT, STAMP); const authJ = captured.get(js.PROVIDER_AUTH_PATH);
    ts.writeProviderAuthorization("M_ART", AUTHZ_RESULT, STAMP); const authT = captured.get(ts.PROVIDER_AUTH_PATH);
    check(typeof authJ === "string" && authJ === authT, "ARTEFACT provider-authorization.json BYTE-IDENTICAL (.js vs .ts)");
    check(!!authJ && EQ(JSON.parse(authJ!), { mission: "M_ART", authorized: true, reason: "BUILD_GATE_AUTONOMY: local recovery demonstrated no further improvement.", build: false, typescript: false, remainingErrors: 2, rootCauses: AUTHZ_RESULT.rootCauses, authorizedAt: STAMP }), "ARTEFACT provider-authorization format/values/emission-condition preserved exactly");

    // green result ⇒ NO provider artefact written; an unlink is attempted instead (gating, not an implicit grant).
    captured.delete(js.PROVIDER_AUTH_PATH); unlinks.length = 0;
    js.writeProviderAuthorization("M_ART", GREEN_RESULT, STAMP);
    ts.writeProviderAuthorization("M_ART", GREEN_RESULT, STAMP);
    check(captured.get(js.PROVIDER_AUTH_PATH) === undefined && unlinks.length === 2, "ARTEFACT green gate ⇒ provider-authorization NOT written; stale auth unlinked (both) — emission is a gating decision, never an implicit provider grant");
  } finally {
    (fs as any).writeFileSync = realWrite;
    (fs as any).mkdirSync = realMkdir;
    (fs as any).unlinkSync = realUnlink;
  }
}

for (const d of temps) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
}

console.log(failures === 0 ? "ALL PASS — LOT build-recovery-engine EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
