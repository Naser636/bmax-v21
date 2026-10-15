#!/usr/bin/env node
/*
 * LOT post-release-learning — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/post-release-learning.ts →
 * runtime/dist/core/post-release-learning.js; build-dist-closure co-locates its dep (capability-learning.js)
 * in dist/core so the compiled module resolves require("./capability-learning"). buildLearnReport is PURE
 * with injected deps ⇒ BYTE-IDENTICAL across its whole gating matrix (no disk). accumulate() delegates to
 * capability-learning (cwd-relative patch-memory store) — exercised in a seeded temp cwd.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/post-release-learning-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "post-release-learning.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "post-release-learning.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT post-release-learning — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/post-release-learning.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/post-release-learning.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "capability-learning.js")), "prerequisite: dep capability-learning.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.buildLearnReport === "function" && typeof ts.buildLearnReport === "function", "both export buildLearnReport");
check(typeof js.accumulate === "function" && typeof ts.accumulate === "function", "both export accumulate");

const MISSION = "M_FIX_1";
const appliedEntry = {
  objectiveId: "o1", status: "APPLIED", authoredBy: "ODG_CAPABILITY", rootCause: "RC-x", goal: "fix the parser",
  files: [{ target: "src/a.ts", mode: "edit" }],
};
const okReport = { mission: MISSION, validated: true };
const okExec = { mission: MISSION, executed: [appliedEntry] };

// buildLearnReport gating matrix (pure, injected deps) — every branch BYTE-IDENTICAL.
const CASES: Array<[string, any, any]> = [
  ["valid APPLIED ⇒ objectives", okReport, okExec],
  ["validated!==true ⇒ null", { mission: MISSION, validated: false }, okExec],
  ["wrong mission report ⇒ null", { mission: "OTHER", validated: true }, okExec],
  ["absent report ⇒ null", null, okExec],
  ["wrong mission exec ⇒ null", okReport, { mission: "OTHER", executed: [appliedEntry] }],
  ["exec.executed not array ⇒ null", okReport, { mission: MISSION, executed: "nope" }],
  ["EXECUTED (not APPLIED) ⇒ excluded ⇒ null", okReport, { mission: MISSION, executed: [{ ...appliedEntry, status: "EXECUTED" }] }],
  ["APPLIED but no files ⇒ null", okReport, { mission: MISSION, executed: [{ ...appliedEntry, files: [] }] }],
  ["APPLIED file missing target ⇒ null", okReport, { mission: MISSION, executed: [{ ...appliedEntry, files: [{ mode: "edit" }] }] }],
  ["authoredBy absent ⇒ omitted", okReport, { mission: MISSION, executed: [{ ...appliedEntry, authoredBy: undefined }] }],
  ["two APPLIED ⇒ two objectives", okReport, { mission: MISSION, executed: [appliedEntry, { ...appliedEntry, objectiveId: "o2", files: [{ target: "src/b.ts", mode: "create" }] }] }],
];
for (const [label, report, execution] of CASES) {
  check(EQ(js.buildLearnReport(MISSION, { report, execution }), ts.buildLearnReport(MISSION, { report, execution })), `buildLearnReport ${label}: BYTE-IDENTICAL`);
}
// Spot-check the positive shape.
const built = js.buildLearnReport(MISSION, { report: okReport, execution: okExec });
check(built && built.validated === true && built.objectives.length === 1 && built.objectives[0].authoredBy === "ODG_CAPABILITY" && EQ(built.objectives[0].edits, [{ target: "src/a.ts", mode: "edit" }]), "buildLearnReport forwards authoredBy + edits from APPLIED evidence");

// accumulate() delegates to capability-learning (seeded cwd); NO_ELIGIBLE_EVIDENCE + learned paths.
const origCwd = process.cwd();
const temps: string[] = [];
try {
  const dJ = fs.mkdtempSync(path.join(os.tmpdir(), "prlJ-")); temps.push(dJ); process.chdir(dJ);
  const aJ = js.accumulate(MISSION, { report: okReport, execution: okExec });
  const nJ = js.accumulate(MISSION, { report: { mission: MISSION, validated: false }, execution: okExec });
  process.chdir(origCwd);
  const dT = fs.mkdtempSync(path.join(os.tmpdir(), "prlT-")); temps.push(dT); process.chdir(dT);
  const aT = ts.accumulate(MISSION, { report: okReport, execution: okExec });
  const nT = ts.accumulate(MISSION, { report: { mission: MISSION, validated: false }, execution: okExec });
  process.chdir(origCwd);
  check(EQ(aJ, aT) && aJ.learned === 1, "accumulate(valid) ⇒ learned=1 BYTE-IDENTICAL (delegates to capability-learning)");
  check(EQ(nJ, nT) && EQ(nJ, { learned: 0, reason: "NO_ELIGIBLE_EVIDENCE" }), "accumulate(ineligible) ⇒ {learned:0, NO_ELIGIBLE_EVIDENCE} (both)");
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

console.log(failures === 0 ? "ALL PASS — LOT post-release-learning EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
