// @ts-nocheck
/*
 * LOT η3-B42 — BUILD-RECOVERY ROOT RELOCATION: path invariant + behavioural parity JS vs dist/core.
 * =====================================================================================================
 *
 * build-recovery-engine.js derives config/report/provider-authorization paths from a project ROOT. η3-B2
 * found it used `path.resolve(__dirname,"..","..")`, so a copy relocated to runtime/dist/core resolved ROOT
 * to runtime/dist and wrote its artifacts to the WRONG tree (runtime/dist/generated). η3-B42 changes ONLY
 * the root derivation to `process.cwd()` — equal to the historical root when loaded from runtime/core (the
 * production default; the pipeline spawns stages with cwd = repo root), and STILL correct from dist/core.
 * The recovery LOGIC / policies / attribution are untouched.
 *
 * This bench proves, on isolated synthetic sandboxes (offline; no real config/report/credential touched):
 *  1. ROOT resolves to process.cwd() from BOTH runtime/core and runtime/dist/core (REPORT_PATH / PROVIDER_AUTH
 *     land under <cwd>/runtime/generated/).
 *  2. the report artifact is produced under runtime/generated/.
 *  3. NO artifact appears under runtime/dist/generated/.
 *  4. PARITY — the report content (fixed stamp) is byte-identical whether the module ran from core or dist/core.
 *  5. NEGATIVE CONTROL — the path a __dirname-derived root WOULD produce from dist/core is genuinely DIFFERENT
 *     from the correct cwd path, and NO artifact exists there: a wrong root cannot pass silently.
 *  6. NO RECOVERY REGRESSION — recover() with trivial command overrides yields the same verdicts from core and
 *     dist/core: all-green ⇒ {build:true,typescript:true,providerAuthorized:false}; a red typecheck ⇒
 *     {typescript:false,providerAuthorized:true}.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/build-recovery-relocation.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SRC = path.join(REPO, "runtime", "core", "build-recovery-engine.js");
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

/** Sandbox with the engine co-located at runtime/<rel>/build-recovery-engine.js. No node_modules. */
function seed(rel: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-bre-reloc-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  const dir = path.join(sb, "runtime", rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(SRC, path.join(dir, "build-recovery-engine.js"));
  // Minimal synthetic config at the cwd-relative DEFAULT_CONFIG location (recover() reads it via loadConfig;
  // commands are overridden per-probe, so {} suffices — all other fields fall back to defaults). This is a
  // throwaway fixture, never a real production config.
  fs.mkdirSync(path.join(sb, "runtime", "config"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "config", "build-recovery.json"), "{}\n");
  return sb;
}

/** Child node: require the co-located engine with cwd=sb, write a synthetic report, print path facts. */
function probePaths(sb: string, rel: string): any {
  const mod = path.join(sb, "runtime", rel, "build-recovery-engine.js");
  const code = `
    const bre = require(${JSON.stringify(mod)});
    const stamp = "2026-01-01T00:00:00Z";
    const result = { build:false, typescript:false, improved:false, providerAuthorized:true, iterations:0,
      rootCauses:["uncategorized-type-error"], modifiedFiles:[], initialErrors:1, finalErrors:1 };
    bre.writeReport("M_REL", result, stamp);
    bre.writeProviderAuthorization("M_REL", result, stamp);
    process.stdout.write("@@"+JSON.stringify({ REPORT_PATH:bre.REPORT_PATH, PROVIDER_AUTH_PATH:bre.PROVIDER_AUTH_PATH, cwd:process.cwd() })+"@@");
  `;
  const r = spawnSync("node", ["-e", code], { cwd: sb, encoding: "utf8" });
  const m = (r.stdout || "").match(/@@([\s\S]*)@@/);
  if (!m) throw new Error(`probePaths produced no payload (status ${r.status}):\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(m[1]);
}

/** Child node: run recover() with trivial command overrides; return the verdict. */
function probeRecover(sb: string, rel: string, red: boolean): any {
  const mod = path.join(sb, "runtime", rel, "build-recovery-engine.js");
  // green: typecheck exits 0 with zero diagnostics; red: emits one TS diagnostic + non-zero exit.
  const tc = red
    ? `["node","-e","console.log('x.ts(1,1): error TS1005: boom'); process.exit(1)"]`
    : `["node","-e","process.exit(0)"]`;
  const code = `
    const bre = require(${JSON.stringify(mod)});
    const res = bre.recover({ authorizedPaths: ["src/"], mission: "M_REC", cwd: process.cwd(),
      typecheckCommand: ${tc}, buildCommand: ["node","-e","process.exit(0)"] });
    process.stdout.write("@@"+JSON.stringify({ build:res.build, typescript:res.typescript, providerAuthorized:res.providerAuthorized, finalErrors:res.finalErrors })+"@@");
  `;
  const r = spawnSync("node", ["-e", code], { cwd: sb, encoding: "utf8" });
  const m = (r.stdout || "").match(/@@([\s\S]*)@@/);
  if (!m) throw new Error(`probeRecover produced no payload (status ${r.status}):\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(m[1]);
}

console.log("LOT η3-B42 — BUILD-RECOVERY ROOT RELOCATION (process.cwd() invariant; JS vs dist/core parity)");
try {
  // ---- source carries the fix (no __dirname root derivation) --------------------------------------
  const src = fs.readFileSync(SRC, "utf8");
  check(/const ROOT = process\.cwd\(\);/.test(src), "source derives ROOT from process.cwd()");
  const exec = src.split("\n").filter((l) => !/^\s*\*|^\s*\/\//.test(l)).join("\n");
  check(!/path\.resolve\(__dirname/.test(exec), "no path.resolve(__dirname...) in executable code");

  // ---- (A) JS path: engine at runtime/core -------------------------------------------------------
  const sbA = seed("core");
  const pA = probePaths(sbA, "core");
  const goodA = path.join(sbA, "runtime", "generated", "build-recovery-report.json");
  const badDirA = path.join(sbA, "runtime", "dist", "generated");
  check(pA.REPORT_PATH === goodA, "A(core): REPORT_PATH under <cwd>/runtime/generated/");
  check(fs.existsSync(goodA) && fs.statSync(goodA).size > 0, "A(core): report artifact present & non-empty");
  check(!fs.existsSync(badDirA), "A(core): no runtime/dist/generated/ created");

  // ---- (B) dist path: engine at runtime/dist/core ------------------------------------------------
  const sbB = seed(path.join("dist", "core"));
  const pB = probePaths(sbB, path.join("dist", "core"));
  const goodB = path.join(sbB, "runtime", "generated", "build-recovery-report.json");
  const badDirB = path.join(sbB, "runtime", "dist", "generated");
  check(pB.REPORT_PATH === goodB, "B(dist/core): REPORT_PATH under <cwd>/runtime/generated/ (NOT dist/generated)");
  check(fs.existsSync(goodB) && fs.statSync(goodB).size > 0, "B(dist/core): report artifact present & non-empty");
  check(!fs.existsSync(badDirB), "B(dist/core): no runtime/dist/generated/ created (the old __dirname bug would have)");
  check(fs.existsSync(path.join(sbB, "runtime", "generated", "provider-authorization.json")), "B(dist/core): provider-authorization written to runtime/generated/");

  // ---- (4) PARITY: report content identical (fixed stamp ⇒ fully deterministic) -------------------
  const repA = fs.readFileSync(goodA, "utf8");
  const repB = fs.readFileSync(goodB, "utf8");
  check(repA === repB, "PARITY: report content byte-identical JS (core) vs compiled-location (dist/core)");

  // ---- (5) NEGATIVE CONTROL: the __dirname-root the OLD code would use from dist/core -------------
  const buggyRoot = path.resolve(path.join(sbB, "runtime", "dist", "core"), "..", "..");   // = <sb>/runtime/dist/... up2 => <sb>/runtime
  const buggyReport = path.join(buggyRoot, "runtime", "generated", "build-recovery-report.json");
  check(buggyReport !== goodB, "NEG: the __dirname-derived path is genuinely DIFFERENT from the cwd path (fix is load-bearing, not a no-op)");
  check(!fs.existsSync(buggyReport), "NEG: NO artifact at the __dirname-derived path (a wrong root cannot pass silently)");
  check(pB.REPORT_PATH !== buggyReport, "NEG: the fixed module's REPORT_PATH is the cwd path, never the __dirname path");

  // ---- (6) NO RECOVERY REGRESSION: identical verdicts from core and dist/core ---------------------
  const greenA = probeRecover(sbA, "core", false);
  const greenB = probeRecover(sbB, path.join("dist", "core"), false);
  check(greenA.build === true && greenA.typescript === true && greenA.providerAuthorized === false, "recover() all-green verdict (core): build+ts true, provider NOT authorized");
  check(JSON.stringify(greenA) === JSON.stringify(greenB), "recover() all-green verdict identical core vs dist/core");
  const redA = probeRecover(sbA, "core", true);
  const redB = probeRecover(sbB, path.join("dist", "core"), true);
  check(redA.typescript === false && redA.providerAuthorized === true, "recover() red-typecheck verdict (core): ts false, provider authorized");
  check(JSON.stringify(redA) === JSON.stringify(redB), "recover() red-typecheck verdict identical core vs dist/core");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B42 BUILD-RECOVERY ROOT RELOCATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
