// @ts-nocheck
/*
 * LOT η3-B85 — FINAL-REPORT EQUIVALENCE: historical runtime/core/final-report.js vs compiled port.
 * final-report is a top-level script: argv[2]=mission; reads runtime/generated/{mission-plan,mission-report,
 * mission-lifecycle,patch-plan,patch-execution}.json; writes runtime/generated/reports/<MISSION>.final-report.md.
 * It consumes the A2 modules (autonomy-measure + objective-attribution) for its autonomy section.
 *
 * VOLATILE (enumerated by inspection, final-report.js:177): exactly ONE line `- Generated: <ISO>` from
 * `new Date().toISOString()`. It is normalised to a sentinel in BOTH outputs — nothing else. The rest of the
 * markdown (status, validated, governance state, autonomy section) is deterministic and compared verbatim.
 * Closure = 16 modules; only final-report ported. Run: node_modules/.bin/tsx runtime/__bench__/final-report-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "final-report.js");
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
// Normalise ONLY the single enumerated volatile line (final-report.js:177) — nothing else.
function normalise(md: string | null): string | null { return md === null ? null : md.replace(/^- Generated: .*$/m, "- Generated: <VOL>"); }
let COMPILED = "";
function buildEngine(): void {
  const { closure, missing } = computeClosure(["final-report"]);
  check(missing.length === 0, `closure resolves (missing: ${missing.join(",") || "none"})`);
  check(closure.length === 21, `closure is the authoritative 21-module set (size=${closure.length})`); // 16→18 (FINAL_REPORT_TEST_FIX) → 18→21 (IMPLEMENT_LOCAL_CODE): capability-executors now composes delegate-isolation + local-model-manager (+ transitive provider-sandbox) for the Stage-6 governed local-provider capability; reused modules, not new primitives; .js≡.ts equivalence unchanged
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fr-dist-")); sandboxes.push(dir);
  for (const n of closure) place(dir, n);
  check(fs.readFileSync(path.join(DIST_CORE, "final-report.js"), "utf8") === fs.readFileSync(path.join(dir, "final-report.js"), "utf8"), "co-located final-report.js IS the compiled build output");
  COMPILED = path.join(dir, "final-report.js");
}
function runCase(engine: string, mission: string, seed: Record<string, any>) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fr-run-")); sandboxes.push(sb);
  for (const [f, o] of Object.entries(seed)) writeJson(path.join(sb, "runtime", "generated", f), o);
  const r = spawnSync("node", [engine, mission], { cwd: sb, encoding: "utf8", env: baseEnv() });
  const p = path.join(sb, "runtime", "generated", "reports", mission + ".final-report.md");
  return { status: r.status, md: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null };
}
console.log("LOT η3-B85 — FINAL-REPORT EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_CORE, "final-report.js")), "prerequisite: compiled final-report.js emitted");
  buildEngine();
  const SEED = {
    "mission-plan.json": { mission: "M_FR", mode: "READ_ONLY", objectives: [{ id: "o1", description: "analyze" }] },
    "mission-report.json": { mission: "M_FR", status: "SUCCESS", validated: true, checks: {}, completed: ["o1"], blocked: [] },
    "mission-lifecycle.json": { mission: "M_FR", achieved: "RELEASED", path: ["CREATED", "QUALIFIED", "RELEASED"], c03Transitions: [] },
    "patch-plan.json": { mission: "M_FR", patches: [{ objectiveId: "o1" }] },
    "patch-execution.json": { mission: "M_FR", executed: [{ objectiveId: "o1", status: "DONE" }] },
  };
  const j = runCase(JS_ENGINE, "M_FR", SEED);
  const t = runCase(COMPILED, "M_FR", SEED);
  check(j.status === 0 && t.status === 0, `both exit 0 (js=${j.status} ts=${t.status})`);
  check(j.md !== null, "final-report .md written");
  check(normalise(j.md) === normalise(t.md), "final-report .md IDENTICAL JS≡compiled after normalising ONLY the `- Generated:` volatile line");
  // Prove the ONLY difference is the volatile line: the raw md differs (timestamps) but normalised matches,
  // and the non-volatile body (status/validated/governance/autonomy section) is present + identical.
  check(!!j.md && /- Status: \*\*SUCCESS\*\*/.test(j.md) && /- Validated: \*\*true\*\*/.test(j.md) && /- Governance state: \*\*RELEASED\*\*/.test(j.md), "non-volatile body present (status/validated/governance)");
  check(!!j.md && !!t.md && j.md.replace(/^- Generated: .*$/m, "") === t.md.replace(/^- Generated: .*$/m, ""), "everything EXCEPT the Generated line is already byte-identical (single enumerated volatile)");
} finally { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} } }
console.log(failures === 0 ? "ALL PASS — LOT η3-B85 FINAL-REPORT EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
