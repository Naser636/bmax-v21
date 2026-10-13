// @ts-nocheck
/*
 * LOT η2 — LEAF-STAGE EQUIVALENCE: historical .js vs compiled .ts (Phase-03 TS migration).
 * ========================================================================================
 *
 * Proves the four migrated PURE-LEAF stages — mission-interpreter, execution-planner, knowledge-engine,
 * patch-engine — behave identically whether run from the historical JavaScript source (runtime/core/<s>.js)
 * or from the JavaScript COMPILED from the new TypeScript canonical source (runtime/dist/core/<s>.js, emitted
 * by `npm run build:runtime`). The historical .js are NOT modified and remain the production default; the
 * compiled sources are reached only via the ODG_STAGE_BASE opt-in (proven in η1-B1).
 *
 * METHOD (real execution, not import/compile/config assertions): for each stage, in its OWN throwaway
 * sandbox (cwd = sandbox; every stage does cwd-relative I/O), seed deterministic inputs, then:
 *   1. run the LEGACY stage by ABSOLUTE path (`node <REPO>/runtime/core/<s>.js [arg]`), capture its artifact;
 *   2. DELETE that artifact (so a stale legacy file cannot be mistaken for the compiled output);
 *   3. run the COMPILED stage by ABSOLUTE path (`node <REPO>/runtime/dist/core/<s>.js [arg]`), capture its artifact;
 *   4. compare exit codes + artifacts, normalising ONLY the documented volatile field (knowledge-engine's
 *      `generatedAt` wall-clock, volatile in the historical output too).
 * The executed file path is unambiguous (explicit absolute path per spawn); additionally each compiled file
 * is asserted to EXIST, carry the η2 canonical header, and DIFFER from its legacy twin (a real tsc emit, not
 * a copy) — so "the compiled TypeScript genuinely executed" is proven, not assumed.
 *
 * ISOLATION: throwaway os.tmpdir() sandboxes OUTSIDE the repo (asserted); offline; no git/network/provider.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/leaf-stage-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function mkSandbox(): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-leaf-equiv-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  return sb;
}
function runStage(sb: string, absFile: string, arg?: string): { code: number | null; out: string } {
  const args = arg !== undefined && arg !== "" ? [absFile, arg] : [absFile];
  const r = spawnSync("node", args, { cwd: sb, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const outPath = (sb: string, n: string) => path.join(sb, "runtime", "generated", n);
function readOut(sb: string, n: string): any { return JSON.parse(fs.readFileSync(outPath(sb, n), "utf8")); }
function strip(obj: any, volatile: string[]): any { const c = JSON.parse(JSON.stringify(obj)); for (const k of volatile) delete c[k]; return c; }
const legacyFile = (s: string) => path.join(REPO, "runtime", "core", `${s}.js`);
const compiledFile = (s: string) => path.join(REPO, "runtime", "dist", "core", `${s}.js`);

// Per-stage deterministic fixtures + comparison spec.
const STAGES = [
  {
    name: "mission-interpreter", arg: "BENCH_IMPLEMENT_EXECUTION_TEST", out: "mission-interpretation.json", volatile: [],
    seed: (sb: string) => {
      fs.mkdirSync(path.join(sb, "runtime", "governance"), { recursive: true });
      fs.writeFileSync(path.join(sb, "runtime", "governance", "RUNTIME_ROADMAP.md"), "# ROADMAP v9\nline2\n");
    },
  },
  {
    name: "execution-planner", arg: "", out: "execution-plan.json", volatile: [],
    seed: (sb: string) => {
      fs.writeFileSync(outPath(sb, "mission-plan.json"), JSON.stringify({
        mission: "BENCH_PLAN", nextObjective: "OBJ_1",
        objectives: [{ id: "OBJ_1", goal: "do x" }, { id: "OBJ_2", goal: "do y" }],
      }, null, 2));
    },
  },
  {
    name: "knowledge-engine", arg: "", out: "knowledge.json", volatile: ["generatedAt"],
    seed: (sb: string) => {
      fs.writeFileSync(outPath(sb, "execution-plan.json"), JSON.stringify({ mission: "BENCH_KNOW" }, null, 2));
      fs.writeFileSync(outPath(sb, "capability-registry.json"), JSON.stringify({ capabilities: ["A", "B"], missingCapabilities: ["C"] }, null, 2));
      // Deterministic source tree walked by both runs (identical ⇒ identical counts). Only generatedAt is volatile.
      fs.mkdirSync(path.join(sb, "src"), { recursive: true });
      fs.writeFileSync(path.join(sb, "src", "a.ts"), `import x from "./b";\nexport class Foo {}\n// TODO one\nimport y from "pkg";\n`);
      fs.writeFileSync(path.join(sb, "src", "b.js"), `export const z = 1;\n// FIXME later\n`);
      fs.mkdirSync(path.join(sb, "runtime", "core"), { recursive: true });
      fs.writeFileSync(path.join(sb, "runtime", "core", "k.js"), `const a = require("./x");\n`);
    },
  },
  {
    name: "patch-engine", arg: "", out: "patch-plan.json", volatile: [],
    seed: (sb: string) => {
      fs.writeFileSync(outPath(sb, "decision.json"), JSON.stringify({
        mission: "BENCH_PATCH", mode: "IMPLEMENT", priority: "HIGH", requiresEngineering: true,
        authorizedPaths: ["bench/**"], actions: ["OBJ_A", "OBJ_B"],
        objectives: [
          { id: "OBJ_A", goal: "write a", done_when: ["a exists"], patch: [{ target: "bench/a.txt", content: "A\n" }], authoredBy: "ODG_CAPABILITY" },
          { id: "OBJ_B", goal: "symbolic b", done_when: ["b planned"] },
        ],
      }, null, 2));
    },
  },
];

console.log("LOT η2 — LEAF-STAGE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });

  for (const st of STAGES) {
    // Compiled-artifact identity proof: exists, is the tsc emit (η2 header), and DIFFERS from the legacy twin.
    const compiledExists = fs.existsSync(compiledFile(st.name));
    check(compiledExists, `${st.name}: compiled dist file emitted`);
    if (!compiledExists) continue;
    const compiledSrc = fs.readFileSync(compiledFile(st.name), "utf8");
    const legacySrc = fs.readFileSync(legacyFile(st.name), "utf8");
    check(/TypeScript canonical \(Lot η2/.test(compiledSrc) && compiledSrc !== legacySrc, `${st.name}: compiled file is the η2 tsc emit, distinct from the legacy .js (not a copy)`);

    // 1) LEGACY run.
    const sb = mkSandbox();
    st.seed(sb);
    const rL = runStage(sb, legacyFile(st.name), st.arg);
    check(rL.code === 0, `${st.name}: LEGACY exits 0`);
    check(fs.existsSync(outPath(sb, st.out)), `${st.name}: LEGACY produced ${st.out}`);
    const artL = readOut(sb, st.out);

    // 2) delete the artifact so the compiled run must regenerate it.
    fs.rmSync(outPath(sb, st.out));

    // 3) COMPILED run (same sandbox, same seeded inputs — inputs are read-only to the stages).
    const rC = runStage(sb, compiledFile(st.name), st.arg);
    check(rC.code === 0, `${st.name}: COMPILED exits 0`);
    check(fs.existsSync(outPath(sb, st.out)), `${st.name}: COMPILED regenerated ${st.out} (proves it actually ran)`);
    const artC = readOut(sb, st.out);

    // 4) compare (normalising only documented volatile fields).
    check(rL.code === rC.code, `${st.name}: identical exit codes`);
    const eq = JSON.stringify(strip(artL, st.volatile)) === JSON.stringify(strip(artC, st.volatile));
    check(eq, `${st.name}: artifact byte-equivalent${st.volatile.length ? ` (volatile ${st.volatile.join(",")} normalised)` : ""}`);
    if (st.volatile.includes("generatedAt")) {
      check(typeof artL.generatedAt === "string" && typeof artC.generatedAt === "string", `${st.name}: both carry a generatedAt timestamp (volatile, legitimately differs)`);
    }
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η2 LEAF-STAGE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
