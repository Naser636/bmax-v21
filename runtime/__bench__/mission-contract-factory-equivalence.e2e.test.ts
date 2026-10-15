#!/usr/bin/env node
/*
 * LOT mission-contract-factory — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/mission-contract-factory.ts →
 * runtime/dist/core/mission-contract-factory.js; build-dist-closure co-locates its dep
 * (mission-synthesizer.js — a TS port) in dist/core. buildContract/classifyMission/... are PURE (no
 * clock/random) ⇒ BYTE-IDENTICAL. The only writes live in generateMissing/generateForMission and are
 * disabled via {write:false}; a seeded temp root supplies ROADMAP.json/policies; ODG_CONTRACT_ON_DEMAND
 * is normalised (deleted) so the policy path is exercised deterministically. NO real repo write occurs.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mission-contract-factory-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "mission-contract-factory.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "mission-contract-factory.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT mission-contract-factory — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/mission-contract-factory.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/mission-contract-factory.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "mission-synthesizer.js")), "prerequisite: dep mission-synthesizer.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const EXPORTS = ["readRoadmap", "contractPathFor", "isContractMissing", "resolveVerifyProbes", "derivePathScope", "classifyMission", "buildContract", "generateMissing", "generateForMission", "isOnDemandEnabled", "humanizeId", "LIFECYCLE_STATES", "CONTRACT_POLICIES", "CONTRACT_EVIDENCE"];
for (const x of EXPORTS) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
for (const c of ["LIFECYCLE_STATES", "CONTRACT_POLICIES", "CONTRACT_EVIDENCE"]) check(EQ(js[c], ts[c]), `${c} byte-identical`);

// classifyMission — full class matrix.
const CLASS = [
  ["strong: requires_engineering", { id: "M", requiresEngineering: true }],
  ["strong: non-empty authorized_paths", { id: "M", authorized_paths: ["src/a.ts"] }],
  ["strong: engineering mode", { id: "M", mode: "IMPLEMENT" }],
  ["strong: objective patch", { id: "M", objectives: [{ patch: { edits: [] } }] }],
  ["observation: AUDIT mode", { id: "M0001", mode: "AUDIT" }],
  ["observation: explicit empty paths", { id: "M", authorized_paths: [] }],
  ["observation: engineering false", { id: "M", requiresEngineering: false }],
  ["weak delivery: intent keyword", { id: "FIX_THE_PARSER" }],
  ["weak delivery: file target", { id: "M", goal: "touch src/runtime/x.ts" }],
  ["unknown: bare id/title", { id: "UI_DEPLOYMENT_FOUNDATION", title: "UI Deployment Foundation" }],
];
for (const [label, e] of CLASS as Array<[string, any]>) check(EQ(js.classifyMission(e), ts.classifyMission(e)), `classifyMission ${label} BYTE-IDENTICAL`);
check(js.classifyMission({ id: "X" }).missionClass === "UNKNOWN", "classifyMission bare id ⇒ UNKNOWN (fail-closed)");

// buildContract — shape across classes + probes + observability + eligibility.
const BUILD = [
  { id: "IMPLEMENT_X", title: "Implement X in src/runtime/x.ts" },
  { id: "M0001_AUDIT", mode: "AUDIT", title: "Read-only audit" },
  { id: "UI_FOUNDATION", title: "UI Foundation" }, // UNKNOWN ⇒ engineering fail-closed
  { id: "EXPLORE_ONLINE", title: "Explore online connectivity opportunities" }, // internet probe
  { id: "EXT_RESEARCH", title: "external research acquisition for market" }, // research probe
  { id: "GIT_BRANCH_INTEGRATION", title: "branch integration fast-forward" }, // git probe
  { id: "DASH", title: "governed dashboard & autonomy observability" }, // observability binding
  { id: "SCOPED", authorized_paths: ["src/runtime/a.ts", "runtime/core/b.ts"], title: "scoped" },
];
for (const e of BUILD) check(EQ(js.buildContract(e), ts.buildContract(e)), `buildContract ${e.id} BYTE-IDENTICAL`);
{
  const c = js.buildContract({ id: "UI_FOUNDATION", title: "UI Foundation" });
  check(c.missionClass === "UNKNOWN" && c.permissions.engineering === true && c.authorized_paths.length > 0, "buildContract UNKNOWN ⇒ engineering fail-closed (evidence-required)");
  check(c.objectives[0].authorization.eligible === true && c.objectives[0].authorization.authorized === true, "buildContract: engineering objective ⇒ eligible+authorized declaration");
  const a = js.buildContract({ id: "M0001", mode: "AUDIT", title: "audit" });
  check(a.objectives[0].authorization.excluded === true, "buildContract: observation objective ⇒ excluded-from-denominator declaration");
  const dash = js.buildContract({ id: "DASH", title: "governed dashboard & autonomy observability" });
  check(dash.objectives[0].id === "VERIFY_OBSERVABILITY_1" && dash.objectives[0].proof === "autonomy-observability-verified", "buildContract: observability intent ⇒ VERIFY_OBSERVABILITY_ binding");
  const gbi = js.buildContract({ id: "GIT_BRANCH_INTEGRATION", title: "branch integration fast-forward" });
  check(Array.isArray(gbi.verify) && gbi.verify.some((v: any) => v.evidence === "git-branch-integrated"), "buildContract: git-branch intent ⇒ git-branch-integrated probe declared");
}

// resolveVerifyProbes / derivePathScope / humanizeId / contractPathFor.
for (const e of [{ id: "A", title: "internet online connectivity" }, { id: "B", title: "bash command run a command" }, { id: "C", title: "nothing" }]) {
  check(EQ(js.resolveVerifyProbes(e), ts.resolveVerifyProbes(e)), `resolveVerifyProbes(${e.id}) BYTE-IDENTICAL`);
}
check(EQ(js.derivePathScope({ id: "M", goal: "fix src/runtime/a.ts and runtime/core/b.js" }), ts.derivePathScope({ id: "M", goal: "fix src/runtime/a.ts and runtime/core/b.js" })), "derivePathScope BYTE-IDENTICAL");
check(js.humanizeId("DYNAMIC_MISSION_CONTRACT_FACTORY") === ts.humanizeId("DYNAMIC_MISSION_CONTRACT_FACTORY") && js.humanizeId("A_B-C") === ts.humanizeId("A_B-C"), "humanizeId BYTE-IDENTICAL");
check(js.contractPathFor("/root", { id: "M" }) === ts.contractPathFor("/root", { id: "M" }) && js.contractPathFor("/root", { id: "M", contract: "custom/p.json" }) === ts.contractPathFor("/root", { id: "M", contract: "custom/p.json" }), "contractPathFor BYTE-IDENTICAL (default + explicit)");

// isOnDemandEnabled — env override + policy file (env normalised to deterministic).
const savedEnv = process.env.ODG_CONTRACT_ON_DEMAND;
const temps: string[] = [];
function root(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mcf-")); temps.push(d);
  for (const [rel, body] of Object.entries(files)) { const abs = path.join(d, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); }
  return d;
}
try {
  delete process.env.ODG_CONTRACT_ON_DEMAND;
  const rEnabled = root({ "runtime/policies/runtime-policies.json": JSON.stringify({ contractOnDemand: { enabled: true } }) });
  const rDisabled = root({ "runtime/policies/runtime-policies.json": JSON.stringify({ contractOnDemand: { enabled: false } }) });
  check(js.isOnDemandEnabled(rEnabled) === ts.isOnDemandEnabled(rEnabled) && js.isOnDemandEnabled(rEnabled) === true, "isOnDemandEnabled(policy enabled) ⇒ true (both)");
  check(js.isOnDemandEnabled(rDisabled) === ts.isOnDemandEnabled(rDisabled) && js.isOnDemandEnabled(rDisabled) === false, "isOnDemandEnabled(policy disabled) ⇒ false (both)");
  process.env.ODG_CONTRACT_ON_DEMAND = "0";
  check(js.isOnDemandEnabled(rEnabled) === false && ts.isOnDemandEnabled(rEnabled) === false, "isOnDemandEnabled(env=0) ⇒ false overrides policy (both)");
  process.env.ODG_CONTRACT_ON_DEMAND = "1";
  check(js.isOnDemandEnabled(rDisabled) === true && ts.isOnDemandEnabled(rDisabled) === true, "isOnDemandEnabled(env=1) ⇒ true overrides policy (both)");
  delete process.env.ODG_CONTRACT_ON_DEMAND;

  // readRoadmap / isContractMissing / generateMissing / generateForMission over a seeded temp root, write:false.
  const ROADMAP = { missions: [{ id: "MISSION_A", title: "Implement A in src/a.ts" }, { id: "MISSION_B", mode: "AUDIT", title: "Audit B" }, { bad: "no id" }] };
  const rr = root({ "runtime/governance/ROADMAP.json": JSON.stringify(ROADMAP) });
  check(EQ(js.readRoadmap(rr), ts.readRoadmap(rr)) && js.readRoadmap(rr).length === 2, "readRoadmap drops invalid entries BYTE-IDENTICAL (2 valid)");
  check(js.isContractMissing(rr, { id: "MISSION_A" }) === true && ts.isContractMissing(rr, { id: "MISSION_A" }) === true, "isContractMissing(absent) ⇒ true (both)");
  const gmJ = js.generateMissing(rr, { write: false });
  const gmT = ts.generateMissing(rr, { write: false });
  check(EQ(gmJ, gmT) && gmJ.generated.length === 2 && gmJ.invalid.length === 0, "generateMissing(write:false) BYTE-IDENTICAL (2 generated, 0 invalid, NO write)");
  check(!fs.existsSync(path.join(rr, "runtime", "missions", "MISSION_A.json")), "generateMissing(write:false): NO file written");
  const gfJ = js.generateForMission(rr, "ON_DEMAND_X", { write: false });
  const gfT = ts.generateForMission(rr, "ON_DEMAND_X", { write: false });
  check(EQ(gfJ, gfT) && gfJ.generated === true && gfJ.contract.mission === "ON_DEMAND_X", "generateForMission(write:false) BYTE-IDENTICAL (generated, not written)");
} finally {
  if (savedEnv === undefined) delete process.env.ODG_CONTRACT_ON_DEMAND; else process.env.ODG_CONTRACT_ON_DEMAND = savedEnv;
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT mission-contract-factory EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
