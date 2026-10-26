/*
 * pipeline-builder.test.ts — dedicated regression test for runtime/core/pipeline-builder.ts (the SOLE port;
 * ZERO-JS L-iii retired the legacy runtime/core/pipeline-builder.js source rollback).
 *
 * pipeline-builder is a CommonJS module with IMPORT-TIME side effects (reads the capability registry,
 * assembles the stage array, writes runtime/generated/runtime-pipeline.json, prints a banner, exports the
 * array). It has no exported pure functions, so it is exercised the only honest way: spawn it as a child
 * process in a disposable temp cwd with controlled env + fixture dirs, then assert on the written
 * runtime-pipeline.json and the process exit/stderr. Every run uses its own mkdtemp cwd — the real
 * runtime/generated/runtime-pipeline.json is NEVER touched.
 *
 * ROUTING MODEL: resolveStageBase uses an explicit ODG_STAGE_BASE verbatim (fail-closed throw on a missing
 * base); otherwise the default is runtime/dist/core when a compiled dist is present, else runtime/core. The
 * temp cwds below create only the dirs they intend, so the default resolves deterministically per test.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TS_PORT = path.join(ROOT, "runtime/core/pipeline-builder.ts");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

let passed = 0;
function ok(name: string, cond: any) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Disposable cwd mirroring the dirs pipeline-builder resolves against (relative to cwd).
function makeCwd(opts: any): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-"));
  fs.mkdirSync(path.join(dir, "runtime/generated"), { recursive: true });
  if (opts.distCore) fs.mkdirSync(path.join(dir, "runtime/dist/core"), { recursive: true });
  if (opts.srcCore) fs.mkdirSync(path.join(dir, "runtime/core"), { recursive: true });
  if (opts.registryAvailable !== undefined && opts.registryAvailable !== null) {
    fs.writeFileSync(path.join(dir, "runtime/generated/capability-registry.json"), JSON.stringify({ available: opts.registryAvailable }));
  }
  return dir;
}

function run(cwd: string, env: any): any {
  const r = spawnSync(TSX, [TS_PORT], { cwd, encoding: "utf8", env: Object.assign({}, process.env, env) });
  let pipeline = null;
  const out = path.join(cwd, "runtime/generated/runtime-pipeline.json");
  if (fs.existsSync(out)) { try { pipeline = JSON.parse(fs.readFileSync(out, "utf8")); } catch { pipeline = null; } }
  return { status: r.status, stderr: String(r.stderr || ""), pipeline };
}

const names = (pipeline: any[]): string[] => pipeline.map((s) => s[0]);

// Build the pipeline with NO dist present (temp cwd has srcCore only) ⇒ default base resolves to
// runtime/core, and assert the shared structure (stage names + the documented stage paths).
function structure(cwd: string, label: string): any {
  const r = run(cwd, {});
  ok(`${label}: exits 0`, r.status === 0);
  ok(`${label}: builds a pipeline`, Array.isArray(r.pipeline));
  ok(`${label}: default base = runtime/core when no dist present`, r.pipeline[0][1] === "runtime/core/mission-interpreter.js");
  return r;
}

// ---- 1. Shared structure: Fleet Bridge inserted exactly once, immediately before Decision Engine. ----
(function fleetBridgePosition() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: [] });
  const r = structure(cwd, "structure");
  const n = names(r.pipeline);
  ok("Fleet Bridge present exactly once", n.filter((x) => x === "Fleet Bridge").length === 1);
  ok("Fleet Bridge immediately precedes Decision Engine", n[n.indexOf("Fleet Bridge") + 1] === "Decision Engine");
  ok("canonical terminal stages present in order", n.indexOf("Validation Engine") < n.indexOf("Mission Lifecycle") && n.indexOf("Mission Lifecycle") < n.indexOf("Mission Ledger") && n.indexOf("Mission Ledger") < n.indexOf("Final Report"));
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 2. ProjectContext Engine stage is conditional on the registry. ------------------------------
(function conditionalProjectContext() {
  const off = makeCwd({ srcCore: true, registryAvailable: [] });
  const roff = structure(off, "pc-off");
  ok("ProjectContext Engine omitted when registry does not list it", !names(roff.pipeline).includes("ProjectContext Engine"));
  fs.rmSync(off, { recursive: true, force: true });

  const on = makeCwd({ srcCore: true, registryAvailable: ["ProjectContext Engine"] });
  const ron = structure(on, "pc-on");
  const n = names(ron.pipeline);
  ok("ProjectContext Engine included when registry lists it", n.includes("ProjectContext Engine"));
  ok("ProjectContext Engine sits after Knowledge Engine", n.indexOf("ProjectContext Engine") > n.indexOf("Knowledge Engine"));
  fs.rmSync(on, { recursive: true, force: true });
})();

// ---- 3. Cold start (no capability-registry.json) ⇒ empty fallback, still builds, no ProjectContext. -
(function coldStartNoRegistry() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: null });
  const r = structure(cwd, "cold-start");
  ok("cold start omits the conditional ProjectContext stage", !names(r.pipeline).includes("ProjectContext Engine"));
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 4. Explicit ODG_STAGE_BASE is used VERBATIM. ------------------------------------------------
(function canonicalExplicitBase() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: [] });
  fs.mkdirSync(path.join(cwd, "custom/base"), { recursive: true });
  const ts = run(cwd, { ODG_STAGE_BASE: "custom/base" });
  ok("explicit ODG_STAGE_BASE used verbatim", ts.pipeline && ts.pipeline[0][1] === "custom/base/mission-interpreter.js");
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 5. Default = runtime/dist/core when a compiled dist is present. -----------------------------
(function canonicalDefaultDist() {
  const cwd = makeCwd({ distCore: true, srcCore: true, registryAvailable: [] });
  const ts = run(cwd, {});
  ok("default base = runtime/dist/core when dist present", ts.pipeline && ts.pipeline[0][1] === "runtime/dist/core/mission-interpreter.js");
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 6. Non-existent ODG_STAGE_BASE ⇒ THROW, no silent fallback, no write. -----------------------
(function canonicalBadBaseFailClosed() {
  const cwd = makeCwd({ distCore: true, srcCore: true, registryAvailable: [] });
  const ts = run(cwd, { ODG_STAGE_BASE: "runtime/__no_such_base__" });
  ok("bad ODG_STAGE_BASE ⇒ non-zero exit", ts.status !== 0);
  ok("bad ODG_STAGE_BASE ⇒ refuses silent fallback (message)", /does not exist — refusing to silently fall back/.test(ts.stderr));
  ok("bad ODG_STAGE_BASE ⇒ no runtime-pipeline.json written", ts.pipeline === null);
  fs.rmSync(cwd, { recursive: true, force: true });
})();

console.log(`\nPIPELINE BUILDER — ${passed} assertions passed.`);
export {};
