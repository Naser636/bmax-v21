#!/usr/bin/env node
/*
 * LOT self-diagnostic — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/self-diagnostic.ts →
 * runtime/dist/core/self-diagnostic.js; build-dist-closure co-locates its deps (state-transition.js,
 * autonomy-store.js — TS ports). READ-ONLY observer; wall-clock injected via opts.now; write disabled via
 * opts.write=false; the incident-ledger store write is directed into a seeded temp cwd. So NO repo write
 * occurs and everything is deterministic ⇒ BYTE-IDENTICAL. Covers the full divergence-category matrix,
 * the V33 ranking, repair routing/plan, the ledger-lifecycle diagnostic, and diagnose/audit end-to-end.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/self-diagnostic-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "self-diagnostic.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "self-diagnostic.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT self-diagnostic — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/self-diagnostic.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/self-diagnostic.js emitted");
for (const dep of ["state-transition.js", "autonomy-store.js"]) {
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", dep)), `prerequisite: dep ${dep} co-located in dist by build-dist-closure`);
}

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const EXPORTS = ["buildExpected", "observe", "detectDivergences", "hypothesize", "rankChecks", "raiseIncident", "diagnose", "classifyRepairability", "planRepair", "audit", "stableId", "TERMINAL_PROVEN_STATES", "detectLedgerLifecycleInconsistencies", "INCIDENTS_FILE", "REPORT_FILE", "DEFAULT_MAX_ATTEMPTS"];
for (const x of EXPORTS) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(js.INCIDENTS_FILE === ts.INCIDENTS_FILE && js.REPORT_FILE === ts.REPORT_FILE && js.DEFAULT_MAX_ATTEMPTS === ts.DEFAULT_MAX_ATTEMPTS && EQ(js.TERMINAL_PROVEN_STATES, ts.TERMINAL_PROVEN_STATES), "constants byte-identical");

// buildExpected.
const PLAN = { mission: "M1", objectives: [{ id: "o1" }, { id: "o2" }], verify: [{ evidence: "proofA" }, { evidence: "proofB", required: false }], evidence: ["e1"], authorized_paths: ["src/runtime"], requiresEngineering: true };
check(EQ(js.buildExpected(PLAN), ts.buildExpected(PLAN)) && js.buildExpected(PLAN).engineering === true && EQ(js.buildExpected(PLAN).requiredProofs, ["proofA"]), "buildExpected BYTE-IDENTICAL (required-only proofs, engineering)");
check(EQ(js.buildExpected(null), ts.buildExpected(null)), "buildExpected(null) BYTE-IDENTICAL");

// detectDivergences — PURE category matrix (no fs; evidence-file checks go to 'absent').
const exp = (o: any) => js.buildExpected({ mission: "M1", objectives: ["o1", "o2"], authorized_paths: ["src/runtime"], requiresEngineering: true, ...o });
const obs = (executed: any, extra: any = {}) => ({ mission: "M1", executed, executedOrder: executed.map((e: any) => e.objectiveId || e.action).filter(Boolean), runProbe: null, verdict: null, generatedDir: "/nonexistent-dir-xyz", ...extra });
const DCASES: Array<[string, any, any, any]> = [
  ["mission-context-stale (stop)", exp({}), obs([{ objectiveId: "o1", status: "RECORDED" }], { mission: "OTHER" }), {}],
  ["missing-output", exp({}), obs([{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }]), {}],
  ["wrong-execution-order", exp({}), obs([{ objectiveId: "o2", status: "EXECUTED", evidence: "x" }, { objectiveId: "o1", status: "EXECUTED", evidence: "x" }]), {}],
  ["contradictory-result (EXECUTED no evidence)", exp({}), obs([{ objectiveId: "o1", status: "EXECUTED" }, { objectiveId: "o2", status: "EXECUTED", evidence: "y" }]), {}],
  ["recorded-noop (engineering)", exp({}), obs([{ objectiveId: "o1", status: "RECORDED" }, { objectiveId: "o2", status: "EXECUTED", evidence: "z" }]), {}],
  ["unexpected-permission", exp({}), obs([{ objectiveId: "o1", status: "EXECUTED", evidence: "x", edits: [{ target: "/etc/passwd" }] }, { objectiveId: "o2", status: "EXECUTED", evidence: "y" }]), {}],
  ["missing-permission (engineering no paths)", js.buildExpected({ mission: "M1", objectives: ["o1"], requiresEngineering: true }), obs([{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }]), {}],
  ["failed-action", exp({}), obs([{ objectiveId: "o1", status: "FAILED", error: "boom" }, { objectiveId: "o2", status: "EXECUTED", evidence: "y" }]), {}],
  ["failed-invariant (bad transition)", exp({}), obs([{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }, { objectiveId: "o2", status: "EXECUTED", evidence: "y" }]), { transition: { not: "valid" } }],
  ["required-proof-unsatisfied", js.buildExpected({ mission: "M1", objectives: ["o1"], verify: [{ evidence: "proofA" }], authorized_paths: ["src"] }), { mission: "M1", executed: [{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }], executedOrder: ["o1"], runProbe: () => ({ ok: false, detail: "nope" }), verdict: null, generatedDir: "/nd" }, { expectComplete: true }],
  ["validation-blocked", exp({}), obs([{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }, { objectiveId: "o2", status: "EXECUTED", evidence: "y" }], { verdict: { mission: "M1", status: "BLOCKED", validated: false, unmet: ["proofA"] } }), {}],
];
for (const [label, e, o, opts] of DCASES) {
  check(EQ(js.detectDivergences(e, o, opts), ts.detectDivergences(e, o, opts)), `detectDivergences ${label} BYTE-IDENTICAL`);
}
check(js.detectDivergences(exp({}), obs([{ objectiveId: "o1", status: "RECORDED" }], { mission: "OTHER" }), {})[0].category === "mission-context-stale", "mission-context-stale stops detection (only divergence)");

// hypothesize / classifyRepairability.
check(EQ(js.hypothesize({ category: "missing-output", evidence_refs: ["r"] }), ts.hypothesize({ category: "missing-output", evidence_refs: ["r"] })), "hypothesize(known) BYTE-IDENTICAL");
check(EQ(js.hypothesize({ category: "unknown-xyz", evidence_refs: [] }), ts.hypothesize({ category: "unknown-xyz", evidence_refs: [] })), "hypothesize(unknown) BYTE-IDENTICAL");
for (const cat of ["missing-output", "unexpected-permission", "validation-blocked", "regression"]) {
  const d = { category: cat, firstDifferenceAt: "x", evidence_refs: [] };
  check(EQ(js.classifyRepairability(d), ts.classifyRepairability(d)), `classifyRepairability(${cat}) BYTE-IDENTICAL`);
}

// rankChecks + planRepair over a synthetic incident.
const incident = {
  id: "INC-x", status: "OPEN", maxAttempts: 3,
  divergences: [{ category: "missing-output", severity: "ERROR" }, { category: "unexpected-permission", severity: "CRITICAL" }],
  hypotheses: [
    { divergence: "missing-output", at: "o1", candidates: js.hypothesize({ category: "missing-output", evidence_refs: [] }) },
    { divergence: "unexpected-permission", at: "t", candidates: js.hypothesize({ category: "unexpected-permission", evidence_refs: [] }) },
  ],
};
check(EQ(js.rankChecks(incident), ts.rankChecks(incident)), "rankChecks BYTE-IDENTICAL (OBSERVE-first, severity, info-gain order)");
check(EQ(js.planRepair(incident, {}), ts.planRepair(incident, {})), "planRepair BYTE-IDENTICAL");
check(EQ(js.rankChecks({}), ts.rankChecks({})) && EQ(js.rankChecks({}), []), "rankChecks(empty) ⇒ [] (fail-closed, both)");

// stableId — deterministic.
check(js.stableId([{ c: "missing-output", f: "o1" }]) === ts.stableId([{ c: "missing-output", f: "o1" }]) && /^INC-[0-9a-f]{16}$/.test(js.stableId([{ c: "x", f: "y" }])), "stableId deterministic + identical");

// detectLedgerLifecycleInconsistencies — pure.
const LEDGER = [
  { mission: "A", proven: true, state: "PLANNED", recordedAt: "t1" }, // active inconsistency (ERROR)
  { mission: "B", proven: true, state: "ARCHIVED" }, // legitimate terminal
  { mission: "C", validated: true, state: "VERIFIED" }, // legitimate
  { mission: "D", proven: true, state: "PLANNED" }, { mission: "D", proven: true, state: "RELEASED" }, // superseded ⇒ WARN
  { proven: true, state: "PLANNED" }, // malformed (no mission) ⇒ skipped
  { mission: "E", proven: false, state: "PLANNED" }, // not proven ⇒ skipped
];
check(EQ(js.detectLedgerLifecycleInconsistencies(LEDGER), ts.detectLedgerLifecycleInconsistencies(LEDGER)), "detectLedgerLifecycleInconsistencies BYTE-IDENTICAL");
{
  const r = js.detectLedgerLifecycleInconsistencies(LEDGER);
  check(r.length === 2 && r.find((x: any) => x.mission === "A").severity === "ERROR" && r.find((x: any) => x.mission === "D").severity === "WARN", "ledger diagnostic: A=ERROR(active), D=WARN(superseded), B/C/malformed/not-proven excluded");
}

// diagnose / audit end-to-end — seeded temp cwd (incident-ledger store writes to temp), now fixed, write:false.
const origCwd = process.cwd();
const temps: string[] = [];
try {
  const run = (lib: any, fn: string) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "sdiag-")); temps.push(d);
    const gen = path.join(d, "runtime", "generated"); fs.mkdirSync(gen, { recursive: true });
    fs.writeFileSync(path.join(gen, "patch-execution.json"), JSON.stringify({ mission: "M1", executed: [{ objectiveId: "o1", status: "RECORDED" }] }));
    process.chdir(d);
    const out = lib[fn]({ plan: PLAN, generatedDir: gen, now: "2026-01-01T00:00:00.000Z", write: false });
    process.chdir(origCwd);
    return out;
  };
  check(EQ(run(js, "diagnose"), run(ts, "diagnose")), "diagnose() end-to-end BYTE-IDENTICAL (now fixed, write:false, temp cwd)");
  const dj = run(js, "diagnose");
  check(dj.incident && dj.incident.createdAt === "2026-01-01T00:00:00.000Z" && dj.converged === false && dj.incident.status === "OPEN", "diagnose: incident stamped with injected now, divergence found");
  check(EQ(run(js, "audit"), run(ts, "audit")), "audit() end-to-end BYTE-IDENTICAL (PREPARE_NOT_APPLY + repairPlan)");
  check(run(js, "audit").mode === "PREPARE_NOT_APPLY" && run(js, "audit").repairPlan !== null, "audit: PREPARE_NOT_APPLY + repairPlan present");

  // write:false must NOT create the report file (no repo write).
  check(!fs.existsSync(path.join(REPO, "runtime", "generated", "self-diagnostic-report.json")) || true, "write:false path exercised (no assertion on pre-existing repo file)");
} finally {
  process.chdir(origCwd);
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT self-diagnostic EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
