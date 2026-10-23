// @ts-nocheck
/*
 * LOT η3-B65 — FLEET-STAGE EQUIVALENCE: the historical runtime/core/fleet-stage.js vs the compiled
 * runtime/dist/core/fleet-stage.js (TypeScript port) must be behaviourally identical. Offline, deterministic.
 * =====================================================================================================
 *
 * WHY: η3-B64 selected fleet-stage as the 2nd §M-2 stage. Unlike project-context-engine (0 deps), even
 * LOADING this module pulls a 19-module transitive require() closure (fleet-* + governance-kernel +
 * mission-ledger/-lifecycle + decision-rules + patch-memory + capability-learning + post-release-learning +
 * economic-unit/-verification + price-resolution + acceptance-facts + autonomy-store + mechanical-acceptance +
 * state-transition). The four direct deps stay .js and are loaded with require(); only fleet-stage is ported.
 * This harness proves parity BEFORE any .js retirement is contemplated; .js stays the production default.
 *
 * TWO INDEPENDENT PROOFS:
 *  A. resolveConfig matrix (PURE, no volatiles): JS vs compiled deep-equal over file / mission-contract /
 *     ODG_FLEET combinations, proving the EXACT precedence ladder env > contract > file > built-in default.
 *  B. run() — four observable cases, each in its OWN JS-sandbox and compiled-sandbox (cwd there, so all
 *     runtime/connectors + runtime/generated/fleet writes are isolated; the real repo is never written):
 *       1. DISABLED           → exit 0, "Fleet: DISABLED (skipped)", NO dep invoked, NO mailbox artifact.
 *       2. ENABLED+determ.    → exit 0, collector VALIDATED; request+response envelopes compared after
 *                               normalising ONLY the enumerated volatiles.
 *       3. failOpen:false     → exit 1 ("FAILED (fail-closed)").
 *       4. failOpen:true      → exit 0 ("WARN (fail-open)").
 *
 * DETERMINISTIC FAILURE LEVER for cases 3/4 (identified by inspection, not invented): fleet-bridge's
 * DEFAULT_CONFIG.command is "claude"; a candidate-local runtime/connectors/fleet-bridge.json overrides it to
 * {command:"node", args:["-e","process.exit(0)"], maxRetries:0, backoffMs:0} with FLEET_BRIDGE_MOCK CLEARED,
 * so the agent emits empty stdout → extractProposal() returns null → outcome FAILED, offline, with no retry
 * sleep and no network. The ONLY difference between case 3 and case 4 is fleet-pipeline.json.failOpen.
 *
 * VOLATILES (enumerated by inspection + proof, NOT invented): createdAt, deliveredAt, answeredAt,
 * validatedAt, failedAt, claimedAt — all `new Date().toISOString()` in fleet-envelope/-bridge/-collector —
 * and `pid` (= process.pid recorded at the bridge's atomic lock-claim, fleet-bridge.js:302). These are
 * normalised to a sentinel in case 2; requestId is DETERMINISTIC (`<mission>-NNN`, from the request count in
 * a fresh sandbox) and is NOT normalised. No other normalisation is applied.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/fleet-stage-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "fleet-stage.js");

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// --- reuse of the dist-closure-relocation technique: BFS the transitive ./require closure, then co-locate
//     each member in a self-contained compiled dist/core (compiled output where build:runtime emitted it,
//     historical .js otherwise) so the compiled fleet-stage can be LOADED and RUN from dist/core. ----------
function computeClosure(seeds: string[]): { closure: string[]; missing: string[] } {
  const visited = new Set<string>();
  const closure = new Set<string>();
  const missing: string[] = [];
  const stack = [...seeds];
  while (stack.length) {
    const name = stack.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);
    const file = path.join(CORE, name + ".js");
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    closure.add(name);
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    const src = fs.readFileSync(file, "utf8");
    while ((m = re.exec(src)) !== null) stack.push(m[1].replace(/^\.\//, ""));
  }
  return { closure: [...closure].sort(), missing };
}
function placeInDistCore(dir: string, name: string): "compiled" | "historical" {
  const compiled = path.join(DIST_CORE, name + ".js");
  const dest = path.join(dir, name + ".js");
  if (fs.existsSync(compiled)) { fs.cpSync(compiled, dest); return "compiled"; }
  fs.cpSync(path.join(CORE, name + ".js"), dest); return "historical";
}

function writeJson(p: string, obj: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
/** Recursively replace each enumerated volatile with a sentinel. The volatiles are identified by inspection
 *  and proof, NOT invented: the *At fields are all `new Date().toISOString()` (fleet-envelope/-bridge/
 *  -collector) and `pid` is `process.pid` at the bridge's atomic lock-claim (fleet-bridge.js:302). Nothing
 *  else is normalised — requestId is deterministic (<mission>-NNN) and every other field is behavioural. */
const VOLATILE = new Set(["createdAt", "deliveredAt", "answeredAt", "validatedAt", "failedAt", "claimedAt", "pid"]);
function normalise(v: any): any {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v)) o[k] = VOLATILE.has(k) ? "<VOL>" : normalise(v[k]);
    return o;
  }
  return v;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ODG_FLEET; delete env.FLEET_BRIDGE_MOCK; delete env.ODG_VERBOSE; delete env.NODE_PATH;
  return env;
}

// Build a self-contained compiled engine dir (the 19-closure co-located). Returns its fleet-stage.js path.
let COMPILED_ENGINE = "";
let composition = { compiled: 0, historical: 0 };
function buildCompiledEngineDir(): void {
  const { closure, missing } = computeClosure(["fleet-stage"]);
  check(missing.length === 0, `closure resolves every require target on disk (missing: ${missing.join(",") || "none"})`);
  check(closure.length >= 19, `transitive closure is the expected 19-module set (size=${closure.length})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fleet-dist-"));
  sandboxes.push(dir);
  for (const n of closure) { const prov = placeInDistCore(dir, n); composition[prov]++; }
  check(fs.existsSync(path.join(dir, "fleet-stage.js")), "compiled fleet-stage.js co-located in dist closure dir");
  check(fs.readFileSync(path.join(DIST_CORE, "fleet-stage.js"), "utf8") === fs.readFileSync(path.join(dir, "fleet-stage.js"), "utf8"), "the co-located fleet-stage.js IS the compiled build output");
  COMPILED_ENGINE = path.join(dir, "fleet-stage.js");
}

// ---- PART A: resolveConfig parity matrix --------------------------------------------------------------
// Driver is written to a FILE (a `node -e` script has NO script slot in process.argv, which would shift the
// indices) so argv[2]=enginePath and argv[3]=mission unambiguously.
let DRIVER_FILE = "";
function makeDriver(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fleet-drv-"));
  sandboxes.push(dir);
  DRIVER_FILE = path.join(dir, "resolve-driver.js");
  fs.writeFileSync(DRIVER_FILE, "const e=require(process.argv[2]);const m=process.argv[3]||undefined;process.stdout.write(JSON.stringify(e.resolveConfig(m)));");
}
function resolveVia(enginePath: string, combo: any): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fleet-rc-"));
  sandboxes.push(sb);
  if (combo.file !== undefined) writeJson(path.join(sb, "runtime", "connectors", "fleet-pipeline.json"), combo.file);
  if (combo.contract !== undefined) writeJson(path.join(sb, "runtime", "missions", combo.mission + ".json"), { mission: combo.mission, fleet: combo.contract });
  const env = baseEnv();
  if (combo.env !== undefined) env.ODG_FLEET = combo.env;
  const r = spawnSync("node", [DRIVER_FILE, enginePath, combo.mission], { cwd: sb, encoding: "utf8", env });
  if (r.status !== 0) return "ERR:" + (r.stderr || "").trim();
  return r.stdout;
}
const MATRIX = [
  { name: "default (no file/contract/env) → OFF, failOpen", mission: "M1", expect: { enabled: false, failOpen: true, deterministic: false } },
  { name: "file enabled:true → ON", mission: "M2", file: { enabled: true }, expect: { enabled: true, failOpen: true, deterministic: false } },
  { name: "file failOpen:false → fail-closed", mission: "M3", file: { enabled: true, failOpen: false }, expect: { enabled: true, failOpen: false, deterministic: false } },
  { name: "contract fleet:true (file absent) → ON", mission: "M4", contract: true, expect: { enabled: true, failOpen: true, deterministic: false } },
  { name: "contract {enabled:true,deterministic:true}", mission: "M5", contract: { enabled: true, deterministic: true }, expect: { enabled: true, failOpen: true, deterministic: true } },
  { name: "file OFF + contract ON → contract wins", mission: "M6", file: { enabled: false }, contract: { enabled: true }, expect: { enabled: true, failOpen: true, deterministic: false } },
  { name: "contract ON + ODG_FLEET=off → env wins (OFF)", mission: "M7", contract: { enabled: true }, env: "off", expect: { enabled: false, failOpen: true, deterministic: false } },
  { name: "file OFF + ODG_FLEET=on → env wins (ON)", mission: "M8", file: { enabled: false }, env: "on", expect: { enabled: true, failOpen: true, deterministic: false } },
];

// ---- PART B: run() observable cases --------------------------------------------------------------------
// The ENABLED+VALIDATED path needs the real downstream environment the collector reaches CWD-relative:
// runtime/llm/* (spawned response-parser + proposal-analyzer) and the governance support dirs read by
// authorizeMission. These are copied verbatim from the repo (NOT fabricated) only for that case.
// "dist/llm" provisions the COMPILED spawned scripts (response-parser, proposal-analyzer) the collector
// reaches by DEFAULT post-cutover: fleet-collector resolves LLM_BASE = ODG_RUNTIME==="js" ? "runtime/llm"
// : "runtime/dist/llm". These are spawned SUBPROCESSES, not in fleet-stage's require() closure, so they
// must be co-located explicitly; without dist/llm the default collector path spawns a missing script and
// the real mock proposal is wrongly reported "response-parser rejected". Both ports' llm scripts are shipped.
const SUPPORT_DIRS = ["llm", "dist/llm", "constitution", "policies", "governance", "brain"];
function copySupport(sb: string): void {
  for (const d of SUPPORT_DIRS) {
    const src = path.join(REPO, "runtime", d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(sb, "runtime", d), { recursive: true });
  }
}
function seedCase(sb: string, opts: { contract?: any; pipeline?: any; bridge?: any; agents?: any; support?: boolean; mission: string }): void {
  if (opts.pipeline !== undefined) writeJson(path.join(sb, "runtime", "connectors", "fleet-pipeline.json"), opts.pipeline);
  if (opts.bridge !== undefined) writeJson(path.join(sb, "runtime", "connectors", "fleet-bridge.json"), opts.bridge);
  if (opts.agents !== undefined) writeJson(path.join(sb, "runtime", "connectors", "fleet-agents.json"), opts.agents);
  const spec: any = { mission: opts.mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY" };
  if (opts.contract !== undefined) spec.fleet = opts.contract;
  writeJson(path.join(sb, "runtime", "missions", opts.mission + ".json"), spec);
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  if (opts.support) copySupport(sb);
}
function runCase(enginePath: string, mission: string, extraEnv: Record<string, string>, opts: any): { status: number | null; out: string; sb: string } {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fleet-run-"));
  sandboxes.push(sb);
  seedCase(sb, { ...opts, mission });
  const env = { ...baseEnv(), ...extraEnv };
  const r = spawnSync("node", [enginePath, mission], { cwd: sb, encoding: "utf8", env });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), sb };
}
function fleetArtifacts(sb: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const kind of ["requests", "responses"]) {
    const dir = path.join(sb, "runtime", "generated", "fleet", kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) out[`${kind}/${f}`] = normalise(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return out;
}

console.log("LOT η3-B65 — FLEET-STAGE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(JS_ENGINE), "prerequisite: historical runtime/core/fleet-stage.js present (untouched)");
  check(fs.existsSync(path.join(DIST_CORE, "fleet-stage.js")), "prerequisite: compiled runtime/dist/core/fleet-stage.js emitted by build:runtime");
  buildCompiledEngineDir();
  console.log(`  dist closure composition: ${composition.compiled} compiled + ${composition.historical} historical`);

  makeDriver();
  // ---- PART A ----
  console.log("  --- Part A: resolveConfig precedence matrix ---");
  for (const c of MATRIX) {
    const js = resolveVia(JS_ENGINE, c);
    const ts = resolveVia(COMPILED_ENGINE, c);
    const jsObj = (() => { try { return JSON.parse(js); } catch { return js; } })();
    check(js === ts, `A: JS≡compiled — ${c.name}`);
    check(JSON.stringify(jsObj) === JSON.stringify(c.expect), `A: value correct — ${c.name} (got ${js})`);
  }

  // ---- PART B ----
  console.log("  --- Part B: run() observable cases ---");
  // Case 1: DISABLED (default posture).
  {
    const opts = { pipeline: { enabled: false } };
    const j = runCase(JS_ENGINE, "FLEET_OFF", {}, opts);
    const t = runCase(COMPILED_ENGINE, "FLEET_OFF", {}, opts);
    check(j.status === 0 && t.status === 0, `B1 DISABLED: both exit 0 (js=${j.status} ts=${t.status})`);
    check(/Fleet: DISABLED \(skipped\)/.test(j.out) && /Fleet: DISABLED \(skipped\)/.test(t.out), "B1 DISABLED: both print skip banner");
    const jNo = !fs.existsSync(path.join(j.sb, "runtime", "generated", "fleet"));
    const tNo = !fs.existsSync(path.join(t.sb, "runtime", "generated", "fleet"));
    check(jNo && tNo, "B1 DISABLED: NO mailbox artifact created on either (deps never invoked)");
  }
  // Case 2: ENABLED + deterministic (mock) → VALIDATED, artifacts parity.
  {
    const opts = {
      contract: { enabled: true, deterministic: true },
      pipeline: {},
      agents: { agents: [{ id: "claude", kind: "file-mailbox", capabilities: ["patch-proposal"], enabled: true }] },
      support: true,
    };
    const j = runCase(JS_ENGINE, "FLEET_OK", { FLEET_BRIDGE_MOCK: "1" }, opts);
    const t = runCase(COMPILED_ENGINE, "FLEET_OK", { FLEET_BRIDGE_MOCK: "1" }, opts);
    check(j.status === 0 && t.status === 0, `B2 ENABLED: both exit 0 (js=${j.status} ts=${t.status})`);
    check(/Fleet stage : OK/.test(j.out) && /Fleet stage : OK/.test(t.out), "B2 ENABLED: both reach 'Fleet stage : OK'");
    check(/Collector:\s+VALIDATED/.test(j.out) && /Collector:\s+VALIDATED/.test(t.out), "B2 ENABLED: both collector VALIDATED");
    const aJs = fleetArtifacts(j.sb), aTs = fleetArtifacts(t.sb);
    check(Object.keys(aJs).length > 0, `B2 ENABLED: fleet envelopes written (${Object.keys(aJs).join(", ")})`);
    check(JSON.stringify(Object.keys(aJs).sort()) === JSON.stringify(Object.keys(aTs).sort()), "B2 ENABLED: same set of envelope files on both");
    check(JSON.stringify(aJs) === JSON.stringify(aTs), `B2 ENABLED: envelopes BYTE-IDENTICAL after normalising *At volatiles${JSON.stringify(aJs) === JSON.stringify(aTs) ? "" : `\n    JS=${JSON.stringify(aJs)}\n    TS=${JSON.stringify(aTs)}`}`);
    const reqFile = Object.keys(aJs).find((k) => k.startsWith("requests/"));
    check(!!reqFile && aJs[reqFile].status === "VALIDATED", "B2 ENABLED: request envelope status === VALIDATED");
  }
  // Deterministic offline FAILURE lever for cases 3 & 4.
  const BOGUS_BRIDGE = { command: "node", args: ["-e", "process.exit(0)"], maxRetries: 0, backoffMs: 0 };
  // Case 3: fail-closed → exit 1.
  {
    const opts = { pipeline: { failOpen: false }, bridge: BOGUS_BRIDGE };
    const j = runCase(JS_ENGINE, "FLEET_FC", { ODG_FLEET: "on" }, opts);
    const t = runCase(COMPILED_ENGINE, "FLEET_FC", { ODG_FLEET: "on" }, opts);
    check(j.status === 1 && t.status === 1, `B3 fail-closed: both exit 1 (js=${j.status} ts=${t.status})`);
    check(/FAILED \(fail-closed\)/.test(j.out) && /FAILED \(fail-closed\)/.test(t.out), "B3 fail-closed: both print 'FAILED (fail-closed)'");
  }
  // Case 4: fail-open → exit 0 + warn.
  {
    const opts = { pipeline: { failOpen: true }, bridge: BOGUS_BRIDGE };
    const j = runCase(JS_ENGINE, "FLEET_FO", { ODG_FLEET: "on" }, opts);
    const t = runCase(COMPILED_ENGINE, "FLEET_FO", { ODG_FLEET: "on" }, opts);
    check(j.status === 0 && t.status === 0, `B4 fail-open: both exit 0 (js=${j.status} ts=${t.status})`);
    check(/WARN \(fail-open/.test(j.out) && /WARN \(fail-open/.test(t.out), "B4 fail-open: both print 'WARN (fail-open)'");
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B65 FLEET-STAGE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
