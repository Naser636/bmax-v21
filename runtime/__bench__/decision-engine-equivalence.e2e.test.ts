// @ts-nocheck
/*
 * LOT η3-B85 — DECISION-ENGINE EQUIVALENCE: historical runtime/core/decision-engine.js vs compiled port.
 * decision-engine is a top-level script: reads runtime/generated/mission-plan.json (+ optional knowledge.json),
 * writes runtime/generated/decision.json. No wall-clock ⇒ decision.json compared BYTE-IDENTICAL, zero
 * normalisation. Closure = 7 modules; only decision-engine ported. A2 provenance preserved (objective carrying
 * a contract patch ⇒ authoredBy:"CONTRACT"). Run: node_modules/.bin/tsx runtime/__bench__/decision-engine-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "decision-engine.js");
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
  const { closure, missing } = computeClosure(["decision-engine"]);
  check(missing.length === 0, `closure resolves (missing: ${missing.join(",") || "none"})`);
  // Closure grew 7→12 as decision-engine gained local-first routing — VERIFIED legitimate via the real
  // require-trace decision-engine → capability-router → local-model-manager → provider-sandbox (+ decision-rules,
  // patch-memory, capability-metrics, autonomy-store, evidence-provenance, action-gate, bash-command-governor,
  // state-transition), NOT accidental coupling. Assert the EXACT set (stricter than a bare count) so any
  // unintended add/removal still fails — this is a tightened guard, not a weakened one.
  const EXPECTED_CLOSURE = ["action-gate", "autonomy-store", "bash-command-governor", "capability-metrics", "capability-router", "decision-engine", "decision-rules", "evidence-provenance", "local-model-manager", "patch-memory", "provider-sandbox", "state-transition"];
  check(closure.length === EXPECTED_CLOSURE.length && EXPECTED_CLOSURE.every((m, i) => closure[i] === m), `closure is the expected ${EXPECTED_CLOSURE.length}-module set (size=${closure.length}; members=${closure.join(",")})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-de-dist-")); sandboxes.push(dir);
  for (const n of closure) place(dir, n);
  check(fs.readFileSync(path.join(DIST_CORE, "decision-engine.js"), "utf8") === fs.readFileSync(path.join(dir, "decision-engine.js"), "utf8"), "co-located decision-engine.js IS the compiled build output");
  COMPILED = path.join(dir, "decision-engine.js");
}
function runCase(engine: string, plan: any) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-de-run-")); sandboxes.push(sb);
  writeJson(path.join(sb, "runtime", "generated", "mission-plan.json"), plan);
  const r = spawnSync("node", [engine], { cwd: sb, encoding: "utf8", env: baseEnv() });
  const p = path.join(sb, "runtime", "generated", "decision.json");
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), decision: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null };
}
console.log("LOT η3-B85 — DECISION-ENGINE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_CORE, "decision-engine.js")), "prerequisite: compiled decision-engine.js emitted");
  buildEngine();
  // Case 1: plain read-only plan.
  {
    const PLAN = { mission: "M_DE", mode: "READ_ONLY", requiresEngineering: false, objectives: [{ id: "o1", description: "analyze" }, { id: "o2", description: "report" }] };
    const j = runCase(JS_ENGINE, PLAN), t = runCase(COMPILED, PLAN);
    check(j.status === 0 && t.status === 0, `C1 both exit 0 (js=${j.status} ts=${t.status})`);
    check(j.decision !== null && j.decision === t.decision, "C1 decision.json BYTE-IDENTICAL JS≡compiled (zero normalisation)");
    check(!!j.decision && JSON.parse(j.decision).status === "READY", "C1 decision.status=READY (meaningful)");
  }
  // Case 2: A2 provenance — an objective already carrying a contract patch ⇒ authoredBy:"CONTRACT".
  {
    const PLAN = { mission: "M_DE2", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/x/"], objectives: [{ id: "o1", description: "edit", patch: { edits: [{ target: "runtime/x/a", diff: "" }] } }] };
    const j = runCase(JS_ENGINE, PLAN), t = runCase(COMPILED, PLAN);
    check(j.decision !== null && j.decision === t.decision, "C2 decision.json BYTE-IDENTICAL (A2 CONTRACT provenance path)");
    check(!!j.decision && /"authoredBy":\s*"CONTRACT"/.test(j.decision), "C2 contract-supplied objective stamped authoredBy=CONTRACT (A2 invariant preserved)");
  }
  // Case 3: STOP — no objectives ⇒ exit 1, no decision.json.
  {
    const j = runCase(JS_ENGINE, { mission: "M_DE3", objectives: [] }), t = runCase(COMPILED, { mission: "M_DE3", objectives: [] });
    check(j.status === 1 && t.status === 1, `C3 no objectives ⇒ both exit 1 (js=${j.status} ts=${t.status})`);
    check(j.decision === null && t.decision === null, "C3 neither wrote decision.json on the STOP path");
  }
} finally { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} } }
console.log(failures === 0 ? "ALL PASS — LOT η3-B85 DECISION-ENGINE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
