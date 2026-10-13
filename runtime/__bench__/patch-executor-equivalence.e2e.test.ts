// @ts-nocheck
/*
 * LOT η3-B85 — PATCH-EXECUTOR EQUIVALENCE: historical runtime/core/patch-executor.js vs compiled port.
 * patch-executor is a top-level script: reads runtime/generated/patch-plan.json, applies each patch inside a
 * sandbox cwd, writes runtime/generated/patch-execution.json. No wall-clock ⇒ patch-execution.json compared
 * BYTE-IDENTICAL, zero normalisation — INCLUDING the A2 author-provenance fields (authoredBy/appliedBy/
 * authorizedBy/humanMandatory). Closure = 16 modules; only patch-executor ported. Two cases exercise the
 * RECORDED no-op shape (deliberately attribution-free) and the APPLIED attribution-stamped shape.
 * Run: node_modules/.bin/tsx runtime/__bench__/patch-executor-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "patch-executor.js");
const sandboxes: string[] = [];
let failures = 0;
function check(c: boolean, l: string): void { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function computeClosure(seeds: string[]) { const v = new Set<string>(), c = new Set<string>(), miss: string[] = [], st = [...seeds];
  while (st.length) { const n = st.pop()!; if (v.has(n)) continue; v.add(n); const f = path.join(CORE, n + ".js"); if (!fs.existsSync(f)) { miss.push(n); continue; } c.add(n);
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g; let m: RegExpExecArray | null; const s = fs.readFileSync(f, "utf8"); while ((m = re.exec(s)) !== null) st.push(m[1].replace(/^\.\//, "")); }
  return { closure: [...c].sort(), missing: miss }; }
function place(dir: string, n: string) { const comp = path.join(DIST_CORE, n + ".js"); const dest = path.join(dir, n + ".js"); if (fs.existsSync(comp)) { fs.cpSync(comp, dest); return "c"; } fs.cpSync(path.join(CORE, n + ".js"), dest); return "h"; }
function writeJson(p: string, o: any) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function baseEnv() { const e = { ...process.env }; delete e.ODG_VERBOSE; delete e.NODE_PATH; return e; }
let COMPILED = "";
function buildEngine(): void {
  const { closure, missing } = computeClosure(["patch-executor"]);
  check(missing.length === 0, `closure resolves (missing: ${missing.join(",") || "none"})`);
  check(closure.length === 16, `closure is the expected 16-module set (size=${closure.length})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pe-dist-")); sandboxes.push(dir);
  for (const n of closure) place(dir, n);
  check(fs.readFileSync(path.join(DIST_CORE, "patch-executor.js"), "utf8") === fs.readFileSync(path.join(dir, "patch-executor.js"), "utf8"), "co-located patch-executor.js IS the compiled build output");
  COMPILED = path.join(dir, "patch-executor.js");
}
function runCase(engine: string, plan: any) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pe-run-")); sandboxes.push(sb);
  writeJson(path.join(sb, "runtime", "generated", "patch-plan.json"), plan);
  const r = spawnSync("node", [engine], { cwd: sb, encoding: "utf8", env: baseEnv() });
  const p = path.join(sb, "runtime", "generated", "patch-execution.json");
  return { status: r.status, exec: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null };
}
console.log("LOT η3-B85 — PATCH-EXECUTOR EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_CORE, "patch-executor.js")), "prerequisite: compiled patch-executor.js emitted");
  buildEngine();
  // Case 1: RECORDED no-op (empty edits) — the deliberately attribution-free shape {objectiveId,status}.
  {
    const PLAN = { mission: "M_PE", status: "READY", authorizedPaths: [], patches: [{ objectiveId: "o1", description: "analyze", edits: [] }] };
    const j = runCase(JS_ENGINE, PLAN), t = runCase(COMPILED, PLAN);
    check(j.status === 0 && t.status === 0, `C1 both exit 0 (js=${j.status} ts=${t.status})`);
    check(j.exec !== null && j.exec === t.exec, "C1 patch-execution.json BYTE-IDENTICAL JS≡compiled (RECORDED no-op)");
    check(!!j.exec && /"status":\s*"RECORDED"/.test(j.exec) && !/authoredBy/.test(JSON.parse(j.exec).executed[0] ? JSON.stringify(JSON.parse(j.exec).executed[0]) : "authoredBy"), "C1 RECORDED entry is attribution-free {objectiveId,status} (A2 invariant)");
  }
  // Case 2: APPLIED edit to an authorized path — exercises the A2 attribution stamping, byte-identically.
  {
    const PLAN = { mission: "M_PE2", status: "READY", authorizedPaths: ["runtime/x/"], patches: [{ objectiveId: "o1", target: "runtime/x/a.txt", edits: [{ target: "runtime/x/a.txt", diff: "GARBAGE-NOT-A-DIFF" }] }] };
    const j = runCase(JS_ENGINE, PLAN), t = runCase(COMPILED, PLAN);
    check(j.exec !== null && j.exec === t.exec, "C2 patch-execution.json BYTE-IDENTICAL JS≡compiled (APPLIED attribution-stamped)");
    check(!!j.exec && /"authoredBy"/.test(j.exec) && /"appliedBy":\s*"ODG_EXECUTOR"/.test(j.exec) && /"authorizedBy":\s*"ODG"/.test(j.exec) && /"humanMandatory"/.test(j.exec), "C2 A2 attribution fields {authoredBy,appliedBy,authorizedBy,humanMandatory} present + identical");
  }
} finally { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} } }
console.log(failures === 0 ? "ALL PASS — LOT η3-B85 PATCH-EXECUTOR EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
