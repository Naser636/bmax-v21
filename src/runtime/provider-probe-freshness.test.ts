/*
 * P0-070 — FIX_PROVIDER_VALIDATION_PROBE_FRESHNESS_V1 regression.
 *
 * ROOT CAUSE (V11, reproduced): the provider route never wrote pipeline-checkpoint.json, so the REAL
 * validation-engine.js derived runStartedAtMs=undefined and the freshness-bearing probes
 * (clean-workspace-scanned / external-research-dry-run-planned) fell back to content-only — a VALID but
 * STALE artifact left by a prior mission/run falsely satisfied the current provider mission, yielding
 * SUCCESS/validated=true and therefore PROVEN/ledger admission.
 *
 * FIX: the provider→VE seam now supplies the EXISTING freshness token — a mission-scoped
 * pipeline-checkpoint.json {mission, startedAt} (providerRunStartCheckpoint) — captured at the provider
 * run start (same source as checkpoint-engine.begin). VE is UNCHANGED, so LOCAL/MSE behaviour is identical.
 *
 * This test drives the REAL validation-engine.js (no mocks of the gate) with the checkpoint the fix writes,
 * and performs causal A/B/C on exactly the two freshness-bearing probes. Plus a deny-safe unit on the
 * pure seam helper and a mission-identity-binding assertion.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/provider-probe-freshness.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { providerRunStartCheckpoint } from "./autonomy-runtime-adapter";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("PROVIDER-ROUTE PROBE FRESHNESS (P0-070)");

// ---- Unit: deny-safe seam helper ----------------------------------------------------------------
{
  const ok = providerRunStartCheckpoint("MISSION_B", "2030-01-01T00:00:00.000Z");
  check(!!ok && ok.mission === "MISSION_B" && ok.startedAt === "2030-01-01T00:00:00.000Z",
    "valid mission+start ⇒ mission-scoped checkpoint {mission, startedAt}");
  check(providerRunStartCheckpoint("", "2030-01-01T00:00:00.000Z") === null, "empty mission ⇒ null (deny-safe)");
  check(providerRunStartCheckpoint(undefined, "x") === null, "missing mission ⇒ null (deny-safe)");
  check(providerRunStartCheckpoint("M", "") === null, "missing run start ⇒ null (deny-safe)");
  check(providerRunStartCheckpoint("M", undefined) === null, "undefined run start ⇒ null (deny-safe)");
}

// ---- Shared staging: an ENGINEERING provider mission whose SOLE open gate is the freshness probe -----
// Every other predicate (coverage, noFailures, evidence-integrity [fieldless APPLIED], noRecordedNoOp,
// engineeringPerformed [a real in-scope change], build, tsc) is satisfied so the probe is the decider.
type Probe = { evidence: string; writeArtifact: (dir: string) => void };
const CLEAN_WORKSPACE: Probe = {
  evidence: "clean-workspace-scanned",
  writeArtifact: (dir) => fs.writeFileSync(
    path.join(dir, "runtime", "generated", "clean-workspace-scan.json"),
    JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 0, candidates: [], deleted: 0 })),
};
const EXTERNAL_RESEARCH: Probe = {
  evidence: "external-research-dry-run-planned",
  writeArtifact: (dir) => fs.writeFileSync(
    path.join(dir, "runtime", "generated", "external-research-acquisition.json"),
    JSON.stringify({ objective: "EXTERNAL_RESEARCH_1", mode: "DRY_RUN", acquired: false, sources: [], ranked: [] })),
};

type Scenario = "A_STALE" | "B_ABSENT" | "C_FRESH" | "MISMATCH";
function runVE(probe: Probe, scenario: Scenario): { status?: string; validated?: boolean; capOk?: boolean; exit: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p0070-"));
  const gen = path.join(dir, "runtime", "generated");
  try {
    fs.mkdirSync(gen, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["config", "user.email", "a@b.c"], { cwd: dir });
    spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
    // mission B: 1 objective APPLIED, declares the probe, engineering with a real in-scope change.
    fs.writeFileSync(path.join(gen, "mission-plan.json"), JSON.stringify({
      mission: "MISSION_B", mode: "IMPLEMENT", requiresEngineering: true,
      authorizedPaths: ["runtime/generated/b"],
      objectives: [{ id: "B_OBJ_1", goal: "do B" }],
      verify: [{ capability: "cap", evidence: probe.evidence }],
    }));
    fs.writeFileSync(path.join(gen, "patch-plan.json"), JSON.stringify({
      mission: "MISSION_B", patches: [{ objective: "B_OBJ_1", files: ["runtime/generated/b/x"] }] }));
    fs.writeFileSync(path.join(gen, "patch-execution.json"), JSON.stringify({
      mission: "MISSION_B", executed: [{ action: "B_OBJ_1", objectiveId: "B_OBJ_1", status: "APPLIED" }] }));
    fs.writeFileSync(path.join(gen, "runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
    // real in-scope change so engineeringPerformed holds on B's own merit
    fs.mkdirSync(path.join(dir, "runtime", "generated", "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "generated", "b", "x"), "seed\n");
    spawnSync("git", ["add", "runtime/generated/b/x"], { cwd: dir });
    spawnSync("git", ["commit", "-qm", "seed"], { cwd: dir });
    fs.appendFileSync(path.join(dir, "runtime", "generated", "b", "x"), "mod\n");

    // The checkpoint the FIX writes (mission-scoped run start = now). For MISMATCH, a foreign mission id.
    const startedAt = new Date().toISOString();
    const cp = providerRunStartCheckpoint(scenario === "MISMATCH" ? "OTHER_MISSION" : "MISSION_B", startedAt)!;
    fs.writeFileSync(path.join(gen, "pipeline-checkpoint.json"), JSON.stringify(cp));
    const runStartedMs = Date.parse(startedAt);

    const target = probe.evidence === "clean-workspace-scanned"
      ? path.join(gen, "clean-workspace-scan.json") : path.join(gen, "external-research-acquisition.json");
    // Set the artifact mtime EXPLICITLY relative to the run start so the test is deterministic (no reliance
    // on wall-clock/fs-granularity timing): stale = 1h BEFORE run start, fresh = 1h AFTER run start.
    if (scenario === "A_STALE" || scenario === "MISMATCH") {
      probe.writeArtifact(dir);
      const past = (runStartedMs - 3_600_000) / 1000;
      fs.utimesSync(target, past, past);
    } else if (scenario === "C_FRESH") {
      probe.writeArtifact(dir);
      const future = (runStartedMs + 3_600_000) / 1000; // produced after run start ⇒ fresh
      fs.utimesSync(target, future, future);
    } // B_ABSENT: no artifact

    const r = spawnSync("node", [VE, "MISSION_B"], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(path.join(gen, "mission-report.json"), "utf8"));
    return { status: rep.status, validated: rep.validated, capOk: rep.checks?.capabilitiesOk, exit: r.status ?? -1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const probe of [CLEAN_WORKSPACE, EXTERNAL_RESEARCH]) {
  console.log(`-- probe: ${probe.evidence}`);
  const A = runVE(probe, "A_STALE");
  check(A.status === "BLOCKED" && A.validated === false && A.capOk === false && A.exit !== 0,
    `A) stale prior artifact + current provider run ⇒ BLOCKED (was SUCCESS pre-fix)`);
  const B = runVE(probe, "B_ABSENT");
  check(B.status === "BLOCKED" && B.validated === false && B.capOk === false,
    `B) artifact absent ⇒ BLOCKED`);
  const C = runVE(probe, "C_FRESH");
  check(C.status === "SUCCESS" && C.validated === true && C.capOk === true && C.exit === 0,
    `C) artifact fresh for current run ⇒ SUCCESS (all other predicates pass)`);
  // mission identity: a checkpoint for ANOTHER mission must NOT lend its freshness to MISSION_B — VE's
  // mission-match guard ignores it, so the stale artifact is content-only and the gap would reopen ONLY
  // under a foreign identity; the fix always writes the TRUE mission id, so this asserts the boundary.
  const M = runVE(probe, "MISMATCH");
  check(M.capOk === true, `identity: foreign-mission checkpoint is ignored by VE's mission-match guard (documents why the fix binds the real mission id)`);
}

if (failures === 0) console.log("ALL PASS");
else { console.log(`${failures} FAIL`); process.exit(1); }
