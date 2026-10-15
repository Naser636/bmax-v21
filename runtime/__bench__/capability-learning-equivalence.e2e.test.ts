#!/usr/bin/env node
/*
 * LOT capability-learning — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/capability-learning.ts →
 * runtime/dist/core/capability-learning.js; build-dist-closure co-locates its deps (autonomy-store.js,
 * patch-memory.js, decision-rules.js — all TS ports) in dist/core. The autonomy-store is CWD-relative, so
 * a seeded temp cwd makes learn/outcomes fully deterministic ⇒ BYTE-IDENTICAL. The only non-det field is
 * the outcome `at` timestamp (and patch-memory's learnedAt, not surfaced here); outcomes compared with `at`
 * normalised. learnedPatches are deterministic signatures.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-learning-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-learning.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-learning.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function both(jsFn: () => any, tsFn: () => any): boolean {
  const run = (f: () => any) => {
    try {
      return { ok: true, value: f() };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  return EQ(run(jsFn), run(tsFn));
}

console.log("LOT capability-learning — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/capability-learning.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/capability-learning.js emitted");
for (const dep of ["autonomy-store.js", "patch-memory.js", "decision-rules.js"]) {
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", dep)), `prerequisite: dep ${dep} co-located in dist by build-dist-closure`);
}

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["learn", "outcomes", "OUTCOMES"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(js.OUTCOMES === ts.OUTCOMES && js.OUTCOMES === "capability-outcomes", "OUTCOMES constant identical");

// learn throws on non-object (both).
check(both(() => js.learn(null), () => ts.learn(null)), "learn(null) ⇒ throws identical message");

const origCwd = process.cwd();
const temps: string[] = [];
const seed = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "clearn-")); temps.push(d); return d; };
const normOutcomes = (arr: any[]) => arr.map((o) => ({ ...o, at: "<ts>" }));
const readStore = (cwd: string, name: string) => JSON.parse(fs.readFileSync(path.join(cwd, "runtime", "generated", "autonomy", name + ".json"), "utf8"));

try {
  // A validated report with an explicit capability + one objective carrying edits ⇒ outcome recorded +
  // patch learned. Run JS and TS in separate seeded cwds; compare returns + stored outcomes (at normalised).
  const report = {
    mission: "M1", validated: true, capability: "local-fixers",
    objectives: [
      { objectiveId: "o1", goal: "fix the parser", rootCause: "RC1", authoredBy: "ODG_CAPABILITY", edits: [{ target: "src/a.ts", mode: "edit" }] },
      { objectiveId: "o2", goal: "no-edit objective" }, // recorded outcome, no patch
    ],
  };
  const dJ = seed(); process.chdir(dJ);
  const retJ = js.learn(report);
  const outJ = js.outcomes();
  const storeJ = readStore(dJ, js.OUTCOMES);
  process.chdir(origCwd);
  const dT = seed(); process.chdir(dT);
  const retT = ts.learn(report);
  const outT = ts.outcomes();
  const storeT = readStore(dT, ts.OUTCOMES);
  process.chdir(origCwd);

  check(EQ(retJ, retT), "learn() return BYTE-IDENTICAL (success/recordedOutcomes/learnedPatches)");
  check(retJ.success === true && retJ.recordedOutcomes === 2 && retJ.learnedPatches.length === 1, "learn(): success, 2 outcomes recorded, 1 patch learned");
  check(EQ(normOutcomes(outJ), normOutcomes(outT)), "outcomes() BYTE-IDENTICAL (at normalised)");
  check(EQ(normOutcomes(storeJ.outcomes), normOutcomes(storeT.outcomes)) && storeJ.outcomes[0].capability === "local-fixers", "stored outcomes BYTE-IDENTICAL + explicit capability used");

  // No explicit capability ⇒ resolved via decision-rules.match(goal) or "unknown".
  const reportNoCap = { mission: "M2", validated: true, objectives: [{ objectiveId: "x", goal: "totally unrecognized goal zzz", edits: [] }] };
  const dJ2 = seed(); process.chdir(dJ2); const r2J = js.learn(reportNoCap); const s2J = js.outcomes(); process.chdir(origCwd);
  const dT2 = seed(); process.chdir(dT2); const r2T = ts.learn(reportNoCap); const s2T = ts.outcomes(); process.chdir(origCwd);
  check(EQ(r2J, r2T) && EQ(normOutcomes(s2J), normOutcomes(s2T)), "learn(no capability) capability-resolution BYTE-IDENTICAL (rules.match/unknown)");

  // Not validated ⇒ success false, outcomes recorded with success:false, NO patch learned even with edits.
  const reportFail = { mission: "M3", validated: false, capability: "c", objectives: [{ objectiveId: "o", goal: "g", edits: [{ target: "t", mode: "edit" }] }] };
  const dJ3 = seed(); process.chdir(dJ3); const r3J = js.learn(reportFail); process.chdir(origCwd);
  const dT3 = seed(); process.chdir(dT3); const r3T = ts.learn(reportFail); process.chdir(origCwd);
  check(EQ(r3J, r3T) && r3J.success === false && r3J.learnedPatches.length === 0, "learn(not validated) ⇒ success false, 0 patches (edits NOT learned) BYTE-IDENTICAL");

  // Empty / missing objectives ⇒ recordedOutcomes 0.
  const dJ4 = seed(); process.chdir(dJ4); const r4J = js.learn({ mission: "M4", validated: true }); process.chdir(origCwd);
  const dT4 = seed(); process.chdir(dT4); const r4T = ts.learn({ mission: "M4", validated: true }); process.chdir(origCwd);
  check(EQ(r4J, r4T) && r4J.recordedOutcomes === 0, "learn(no objectives) ⇒ 0 recorded BYTE-IDENTICAL");
} finally {
  process.chdir(origCwd);
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT capability-learning EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
