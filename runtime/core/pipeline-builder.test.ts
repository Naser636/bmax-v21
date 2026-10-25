/*
 * pipeline-builder.test.ts — dedicated regression test for runtime/core/pipeline-builder.{js,ts}.
 *
 * pipeline-builder is a CommonJS module with IMPORT-TIME side effects (reads the capability registry,
 * assembles the stage array, writes runtime/generated/runtime-pipeline.json, prints a banner, exports the
 * array). It has no exported pure functions, so it is exercised the only honest way: spawn it as a child
 * process in a disposable temp cwd with controlled env + fixture dirs, then assert on the written
 * runtime-pipeline.json and the process exit/stderr. Every run uses its own mkdtemp cwd — the real
 * runtime/generated/runtime-pipeline.json is NEVER touched.
 *
 * PORT MODEL (verified from the sources — NOT asserted as byte-identical):
 *   - runtime/core/pipeline-builder.js  = LEGACY source port: stage paths HARDCODED to "runtime/core/*.js";
 *     no ODG_STAGE_BASE / dist routing. It is what `runtime/bin/odg-run.js` (the JS rollback entry) loads.
 *   - runtime/core/pipeline-builder.ts  = CANONICAL port: adds resolveStageBase (ODG_STAGE_BASE verbatim +
 *     fail-closed throw on a missing base; default = runtime/dist/core when present & ODG_RUNTIME!=js, else
 *     runtime/core). Its COMPILED form under runtime/dist/core is what the TS/dist entry loads.
 * Therefore the two ports SHARE structure (stage names/order, conditional ProjectContext, Fleet Bridge
 * position+idempotency, terminal stages, the written file) but legitimately DIFFER on base-path routing.
 * This test locks the shared structure on BOTH ports (compared by stage NAME) and the routing-safety
 * behaviour on the CANONICAL .ts port only.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const JS_PORT = path.join(ROOT, "runtime/core/pipeline-builder.js");
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

function run(port: string, cwd: string, env: any): any {
  const isTs = port.endsWith(".ts");
  const r = spawnSync(isTs ? TSX : process.execPath, [port], { cwd, encoding: "utf8", env: Object.assign({}, process.env, env) });
  let pipeline = null;
  const out = path.join(cwd, "runtime/generated/runtime-pipeline.json");
  if (fs.existsSync(out)) { try { pipeline = JSON.parse(fs.readFileSync(out, "utf8")); } catch { pipeline = null; } }
  return { status: r.status, stderr: String(r.stderr || ""), pipeline };
}

const names = (pipeline: any[]): string[] => pipeline.map((s) => s[0]);

// Drive BOTH ports with a SHARED base (ODG_RUNTIME=js ⇒ .ts also resolves runtime/core, matching the
// legacy .js) and assert they agree on STRUCTURE (stage names). Returns the JS result for further checks.
function bothPortsStructure(cwd: string, label: string): any {
  const env = { ODG_RUNTIME: "js" };
  const js = run(JS_PORT, cwd, env);
  const ts = run(TS_PORT, cwd, env);
  ok(`${label}: both ports exit 0`, js.status === 0 && ts.status === 0);
  ok(`${label}: both ports build a pipeline`, Array.isArray(js.pipeline) && Array.isArray(ts.pipeline));
  ok(`${label}: JS and TS ports agree on stage NAMES (shared structure)`, JSON.stringify(names(js.pipeline)) === JSON.stringify(names(ts.pipeline)));
  ok(`${label}: with ODG_RUNTIME=js both resolve runtime/core stage paths`, js.pipeline[0][1] === "runtime/core/mission-interpreter.js" && ts.pipeline[0][1] === "runtime/core/mission-interpreter.js");
  return js;
}

// ---- 1. Shared structure: Fleet Bridge inserted exactly once, immediately before Decision Engine. ----
(function fleetBridgePosition() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: [] });
  const r = bothPortsStructure(cwd, "structure");
  const n = names(r.pipeline);
  ok("Fleet Bridge present exactly once", n.filter((x) => x === "Fleet Bridge").length === 1);
  ok("Fleet Bridge immediately precedes Decision Engine", n[n.indexOf("Fleet Bridge") + 1] === "Decision Engine");
  ok("canonical terminal stages present in order", n.indexOf("Validation Engine") < n.indexOf("Mission Lifecycle") && n.indexOf("Mission Lifecycle") < n.indexOf("Mission Ledger") && n.indexOf("Mission Ledger") < n.indexOf("Final Report"));
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 2. ProjectContext Engine stage is conditional on the registry (both ports). ----------------
(function conditionalProjectContext() {
  const off = makeCwd({ srcCore: true, registryAvailable: [] });
  const roff = bothPortsStructure(off, "pc-off");
  ok("ProjectContext Engine omitted when registry does not list it", !names(roff.pipeline).includes("ProjectContext Engine"));
  fs.rmSync(off, { recursive: true, force: true });

  const on = makeCwd({ srcCore: true, registryAvailable: ["ProjectContext Engine"] });
  const ron = bothPortsStructure(on, "pc-on");
  const n = names(ron.pipeline);
  ok("ProjectContext Engine included when registry lists it", n.includes("ProjectContext Engine"));
  ok("ProjectContext Engine sits after Knowledge Engine", n.indexOf("ProjectContext Engine") > n.indexOf("Knowledge Engine"));
  fs.rmSync(on, { recursive: true, force: true });
})();

// ---- 3. Cold start (no capability-registry.json) ⇒ empty fallback, still builds, no ProjectContext. -
(function coldStartNoRegistry() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: null });
  const r = bothPortsStructure(cwd, "cold-start");
  ok("cold start omits the conditional ProjectContext stage", !names(r.pipeline).includes("ProjectContext Engine"));
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 4. CANONICAL .ts routing: explicit ODG_STAGE_BASE is used VERBATIM. -------------------------
(function canonicalExplicitBase() {
  const cwd = makeCwd({ srcCore: true, registryAvailable: [] });
  fs.mkdirSync(path.join(cwd, "custom/base"), { recursive: true });
  const ts = run(TS_PORT, cwd, { ODG_STAGE_BASE: "custom/base" });
  ok("canonical port: explicit ODG_STAGE_BASE used verbatim", ts.pipeline && ts.pipeline[0][1] === "custom/base/mission-interpreter.js");
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 5. CANONICAL .ts routing: default = runtime/dist/core when present and ODG_RUNTIME!=js. ------
(function canonicalDefaultDist() {
  const cwd = makeCwd({ distCore: true, srcCore: true, registryAvailable: [] });
  const ts = run(TS_PORT, cwd, { ODG_RUNTIME: "" });
  ok("canonical port: default base = runtime/dist/core when dist present", ts.pipeline && ts.pipeline[0][1] === "runtime/dist/core/mission-interpreter.js");
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 6. CANONICAL .ts routing: non-existent ODG_STAGE_BASE ⇒ THROW, no silent fallback, no write. -
(function canonicalBadBaseFailClosed() {
  const cwd = makeCwd({ distCore: true, srcCore: true, registryAvailable: [] });
  const ts = run(TS_PORT, cwd, { ODG_STAGE_BASE: "runtime/__no_such_base__" });
  ok("canonical port: bad ODG_STAGE_BASE ⇒ non-zero exit", ts.status !== 0);
  ok("canonical port: bad ODG_STAGE_BASE ⇒ refuses silent fallback (message)", /does not exist — refusing to silently fall back/.test(ts.stderr));
  ok("canonical port: bad ODG_STAGE_BASE ⇒ no runtime-pipeline.json written", ts.pipeline === null);
  fs.rmSync(cwd, { recursive: true, force: true });
})();

// ---- 7. DOCUMENTED port divergence (by design): legacy .js ignores ODG_STAGE_BASE / dist routing. -
// This is NOT a failure — it records the real port model so a future change that accidentally makes the
// legacy port start honouring (or the canonical port stop honouring) routing is caught.
(function documentedPortDivergence() {
  const cwd = makeCwd({ distCore: true, srcCore: true, registryAvailable: [] });
  const js = run(JS_PORT, cwd, { ODG_RUNTIME: "", ODG_STAGE_BASE: "custom/base" });
  ok("legacy .js ignores ODG_STAGE_BASE (hardcoded runtime/core — by design)", js.pipeline && js.pipeline[0][1] === "runtime/core/mission-interpreter.js");
  ok("legacy .js ignores dist default (hardcoded runtime/core — by design)", js.pipeline && js.pipeline.every((s: any) => !String(s[1]).startsWith("runtime/dist/core/")));
  fs.rmSync(cwd, { recursive: true, force: true });
})();

console.log(`\nPIPELINE BUILDER — ${passed} assertions passed.`);
export {};
