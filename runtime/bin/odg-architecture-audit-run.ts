#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V87 §5/§6 — ARCHITECTURE AUDIT (Report B). An evidence-based census of the canonical pipeline components
 * (§6) + the 9 primitives. For each component it records, from the REAL repo: present (file exists), wired (referenced by
 * another runtime module, i.e. has an inbound caller), tested (a .test.ts references it). It HONESTLY distinguishes
 * present ≠ wired ≠ tested (a doc reference is NOT integration). This is a presence+wiring census — NOT a per-component
 * functional validation (that is each component's own test suite's job). Writes docs/odg/V87_ARCHITECTURE_AUDIT.json.
 * Run: `odg-architecture-audit-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(ROOTDIR());
function ROOTDIR(): string { return path.join(__dirname, "..", ".."); }
const CORE = path.join(ROOT, "runtime", "core");
const BIN = path.join(ROOT, "runtime", "bin");
const D = path.join(ROOT, "docs", "odg");

function listTs(dir: string): string[] { try { return fs.readdirSync(dir).filter((f: string) => f.endsWith(".ts")); } catch { return []; } }
const coreFiles = listTs(CORE);
const binFiles = listTs(BIN);
const allSrc = [...coreFiles.map((f: string) => ["core", f]), ...binFiles.map((f: string) => ["bin", f])];
function readFile(kind: string, f: string): string { try { return fs.readFileSync(path.join(kind === "core" ? CORE : BIN, f), "utf8"); } catch { return ""; } }
// cache all non-test source for inbound-reference scans.
const nonTest = allSrc.filter(([, f]: any) => !f.endsWith(".test.ts"));
const testFiles = allSrc.filter(([, f]: any) => f.endsWith(".test.ts"));

function census(moduleBase: string): any {
  const file = `${moduleBase}.ts`;
  const present = coreFiles.includes(file) || binFiles.includes(file);
  const ref = new RegExp(`[\\"'./]${moduleBase.replace(/[-]/g, "[-]")}(\\.js|\\.ts|\\")`);
  // inbound callers = other NON-TEST modules that require/import this one.
  const inbound = nonTest.filter(([k, f]: any) => f !== file && ref.test(readFile(k, f))).length;
  const tested = testFiles.some(([k, f]: any) => ref.test(readFile(k, f)));
  return { module: moduleBase, present, wired: present && inbound > 0, inboundCallers: inbound, tested };
}

// §6 — the canonical pipeline components that must be functionally integrated (not merely documentary).
const PIPELINE = [
  "action-gate", "inspection-boundary", "inspected-execution", "inspected-paths", "local-work-mandate",
  "evidence-qualifier", "inspector-meta-validation", "evaluator-independence", "champion-challenger-arbiter",
  "regulatory-assurance", "excellence-gate", "excellence-policy", "audit-log", "mission-scheduler", "campaign-engine",
  "intelligence-loop", "capability-executors", "coding-executor", "engineering-executor", "patch-executor",
  "checkpoint-engine", "campaign-closure-ledger", "roadmap-manager",
];
// 9 governance primitives → a representative canonical module each.
const PRIMITIVES = [
  { primitive: "IDENTITY", module: "root-of-trust" }, { primitive: "STATE", module: "runtime-model" },
  { primitive: "CONTRACT", module: "mission-contract-factory" }, { primitive: "POLICY", module: "action-gate" },
  { primitive: "RESOLVER", module: "capability-executors" }, { primitive: "EXECUTOR", module: "engineering-executor" },
  { primitive: "EVIDENCE", module: "evidence-provenance" }, { primitive: "RECOVERY", module: "checkpoint-engine" },
  { primitive: "ALLOCATOR", module: "p12-weighted-fair-share-scheduler" },
];

const pipeline = PIPELINE.map(census);
const primitives = PRIMITIVES.map((p) => ({ primitive: p.primitive, ...census(p.module) }));
const pipelinePresent = pipeline.filter((c: any) => c.present).length;
const pipelineWired = pipeline.filter((c: any) => c.wired).length;
const pipelineTested = pipeline.filter((c: any) => c.tested).length;
const primPresent = primitives.filter((c: any) => c.present).length;
const absent = [...pipeline, ...primitives].filter((c: any) => !c.present).map((c: any) => c.module);
// métier census: count the metier/profession modules present.
const metierModules = coreFiles.filter((f: string) => /profession|metier|métier|parcours/i.test(f) && !f.endsWith(".test.ts")).length;

const out = {
  "//": "CTO V87 §5/§6 — architecture census from the REAL repo. present=file exists; wired=has an inbound non-test caller; tested=a .test.ts references it. present≠wired≠tested≠validated (a doc reference is not integration). This is a presence+wiring census, NOT per-component functional validation (that is each suite's job).",
  coreModuleCount: coreFiles.filter((f: string) => !f.endsWith(".test.ts")).length,
  coreTestCount: coreFiles.filter((f: string) => f.endsWith(".test.ts")).length + binFiles.filter((f: string) => f.endsWith(".test.ts")).length,
  pipeline: { components: pipeline, present: pipelinePresent, wired: pipelineWired, tested: pipelineTested, total: pipeline.length },
  primitives: { components: primitives, present: primPresent, total: primitives.length },
  metierModulesPresent: metierModules,
  absentComponents: absent,
  honestConclusion: `Pipeline (§6): ${pipelinePresent}/${pipeline.length} present, ${pipelineWired} wired (inbound caller), ${pipelineTested} tested. 9 primitives: ${primPresent}/9 present. ${absent.length === 0 ? "No essential pipeline/primitive component is absent" : "ABSENT: " + absent.join(", ")}. Present≠wired≠validated — each component's functional validation remains its own suite's responsibility; this census proves integration wiring, not operational correctness.`,
  invariant: "census from source (present/wired/tested distinguished); a documentary reference is never counted as integration; absence reported honestly.",
};
fs.writeFileSync(path.join(D, "V87_ARCHITECTURE_AUDIT.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ pipeline: `${pipelineWired}/${pipeline.length} wired`, primitives: `${primPresent}/9 present`, metierModulesPresent: metierModules, absent: absent.length }, null, 2) + "\n");
export {};
