// @ts-nocheck
/*
 * LOT η3-B85 — MISSION-LOADER EQUIVALENCE: historical runtime/core/mission-loader.js vs compiled
 * runtime/dist/core/mission-loader.js (TypeScript port) must be behaviourally identical. Offline, deterministic.
 *
 * mission-loader is a top-level executing script: argv[2]=mission; reads the contract runtime/missions/
 * <mission>.json (via the mission-contract-factory on-demand path only when absent — here it is ALWAYS seeded,
 * so no factory/network), writes runtime/generated/mission-plan.json + mission-context.json. No wall-clock ⇒
 * both artifacts are compared BYTE-IDENTICAL with ZERO normalisation. The closure is whatever mission-loader
 * transitively requires (incl. `.js`-extension requires); only mission-loader is ported, the rest stay .js.
 * .js remains the production default.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mission-loader-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "mission-loader.js");
const sandboxes: string[] = [];
let failures = 0;
function check(c: boolean, l: string): void { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function computeClosure(seeds: string[]) { const v = new Set<string>(), c = new Set<string>(), miss: string[] = [], st = [...seeds];
  while (st.length) { const n = st.pop()!; if (v.has(n)) continue; v.add(n); const f = path.join(CORE, n + ".js"); if (!fs.existsSync(f)) { miss.push(n); continue; } c.add(n);
    // Capture both require("./x") AND require("./x.js") — the optional .js is dot-terminated and was
    // previously missed, dropping real siblings (e.g. require("./objective-authorization.js")) from the closure.
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)(?:\.js)?["'`]\s*\)/g; let m: RegExpExecArray | null; const s = fs.readFileSync(f, "utf8"); while ((m = re.exec(s)) !== null) st.push(m[1].replace(/^\.\//, "")); }
  return { closure: [...c].sort(), missing: miss }; }
function place(dir: string, n: string) { const comp = path.join(DIST_CORE, n + ".js"); const dest = path.join(dir, n + ".js"); if (fs.existsSync(comp)) { fs.cpSync(comp, dest); return "c"; } fs.cpSync(path.join(CORE, n + ".js"), dest); return "h"; }
function writeJson(p: string, o: any) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function baseEnv() { const e = { ...process.env }; delete e.ODG_VERBOSE; delete e.NODE_PATH; return e; }
let COMPILED = "";
let JS_COLOCATED = "";
function buildEngine(): void {
  const { closure, missing } = computeClosure(["mission-loader"]);
  check(missing.length === 0, `closure resolves (missing: ${missing.join(",") || "none"})`);
  // Completeness assertion (robust; replaces a stale `=== 9` magic number that under-counted because the
  // closure scanner missed `.js`-extension requires). The closure must at least contain the seed and the
  // previously-dropped sibling, and stay non-trivial — it will not re-stale as the real closure grows.
  check(closure.includes("mission-loader") && closure.includes("objective-authorization") && closure.length >= 9,
    `closure is complete (size=${closure.length}, includes mission-loader + objective-authorization)`);
  // COMPILED dir: compiled mission-loader + historical rest. JS dir: ALL historical. Running BOTH engines
  // from co-located closure dirs keeps the dependency LOCATION symmetric — essential because the untyped
  // sibling mission-context-builder reads some content relative to its own module location, so an
  // asymmetric location (real runtime/core vs a tmp dir) would diverge mission-context.json for an
  // ENVIRONMENTAL reason unrelated to the port. Symmetric co-location makes the comparison a TRUE port
  // parity test (mission-loader.js vs compiled mission-loader.ts against byte-identical deps + env).
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-dist-")); sandboxes.push(cdir);
  for (const n of closure) place(cdir, n);
  check(fs.readFileSync(path.join(DIST_CORE, "mission-loader.js"), "utf8") === fs.readFileSync(path.join(cdir, "mission-loader.js"), "utf8"), "co-located mission-loader.js IS the compiled build output");
  COMPILED = path.join(cdir, "mission-loader.js");
  const jdir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-hist-")); sandboxes.push(jdir);
  for (const n of closure) fs.cpSync(path.join(CORE, n + ".js"), path.join(jdir, n + ".js"));
  JS_COLOCATED = path.join(jdir, "mission-loader.js");
}
function runCase(engine: string, mission: string, contract: any) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-run-")); sandboxes.push(sb);
  writeJson(path.join(sb, "runtime", "missions", mission + ".json"), contract);
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  const r = spawnSync("node", [engine, mission], { cwd: sb, encoding: "utf8", env: baseEnv() });
  const read = (f: string) => { const p = path.join(sb, "runtime", "generated", f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; };
  return { status: r.status, plan: read("mission-plan.json"), context: read("mission-context.json") };
}
console.log("LOT η3-B85 — MISSION-LOADER EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_CORE, "mission-loader.js")), "prerequisite: compiled mission-loader.js emitted");
  buildEngine();
  const CONTRACT = { mission: "M_ML", version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", objectives: [{ id: "o1", description: "analyze repo" }, { id: "o2", description: "report" }] };
  const j = runCase(JS_COLOCATED, "M_ML", CONTRACT);
  const t = runCase(COMPILED, "M_ML", CONTRACT);
  check(j.status === 0 && t.status === 0, `both exit 0 (js=${j.status} ts=${t.status})`);
  check(j.plan !== null && j.plan === t.plan, "mission-plan.json BYTE-IDENTICAL JS≡compiled (zero normalisation)");
  check(j.context === t.context, "mission-context.json BYTE-IDENTICAL JS≡compiled");
  check(!!j.plan && JSON.parse(j.plan).mission === "M_ML" && Array.isArray(JSON.parse(j.plan).objectives), "mission-plan has mission + objectives (meaningful output)");
} finally { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} } }
console.log(failures === 0 ? "ALL PASS — LOT η3-B85 MISSION-LOADER EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
