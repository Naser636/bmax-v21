/*
 * P0-069 lock — the Validation Engine must reject a STALE freshness-bearing capability proof.
 *
 * Demonstrated defect (DISCOVER_VALIDATION_ENGINE_PROBE_FRESHNESS_V1): validation-engine.js evaluated the
 * `clean-workspace-scanned` probe WITHOUT runStartedAtMs, so a valid-but-stale prior-run scan artifact
 * (runtime/generated is never cleared) satisfied the proof and produced SUCCESS/validated=true. The fix
 * wires the mission-matched pipeline-checkpoint.startedAt into the probe ctx (parity with the LOCAL route),
 * so the probe's run-ownership branch rejects an artifact whose mtime predates the run start.
 *
 * This drives the REAL validation-engine.js consumer path (NOT capability-probes.runProbe directly) in a
 * throwaway git repo; the real repo and its generated artifacts are never touched. It locks:
 *   1. STALE scan (mtime < checkpoint.startedAt) ⇒ BLOCKED (validated=false, exit 1) — stale rejected
 *   2. FRESH scan (mtime > checkpoint.startedAt) ⇒ SUCCESS (validated=true, exit 0) — not over-blocked
 *
 * Run directly: node_modules/.bin/tsx src/runtime/validation-engine-probe-freshness.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const sh = (dir: string, cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

/**
 * Throwaway git repo staged so that EVERY non-probe gate passes (coverage 1/1/1, no FAILED, engineering
 * satisfied by a committed in-scope file, build/tsc green). The declared `clean-workspace-scanned` probe is
 * therefore the SOLE deciding gate. A mission-matched pipeline-checkpoint carries startedAt = `runStart`.
 */
function sandbox(runStartIso: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p0069-freshness-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "a@b.c"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  const common = {
    mission: "CWS_FRESHNESS", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"],
  };
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({
    ...common,
    objectives: [{ id: "OBJ1", goal: "scan workspace", done_when: ["scan recorded"] }],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definitionOfDone: ["Workspace scanned"], status: "READY_FOR_EXECUTION",
  }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({
    ...common, patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }],
  }));
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({
    mission: "CWS_FRESHNESS", executed: [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", evidence: "runtime/generated/clean-workspace-scan.json" }],
  }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  // Mission-matched per-run token — the run start the fix reads.
  fs.writeFileSync(G("pipeline-checkpoint.json"), JSON.stringify({ mission: "CWS_FRESHNESS", status: "RUNNING", startedAt: runStartIso }));
  return dir;
}

/** Write a structurally-VALID read-only clean-workspace scan and stamp its mtime. */
function writeScan(dir: string, mtimeMs: number): void {
  const p = path.join(dir, "runtime", "generated", "clean-workspace-scan.json");
  fs.writeFileSync(p, JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 0, candidates: [], deleted: 0 }));
  const secs = mtimeMs / 1000;
  fs.utimesSync(p, secs, secs);
}

function runValidation(dir: string): { status?: string; validated?: boolean; capabilitiesOk?: boolean; unmet?: string[]; exit: number } {
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  return { status: rep.status, validated: rep.validated, capabilitiesOk: rep.checks.capabilitiesOk, unmet: rep.unmet, exit: r.status ?? -1 };
}

console.log("P0-069 — VALIDATION ENGINE REJECTS STALE FRESHNESS-BEARING PROOF");

const RUN_START = "2026-06-01T12:00:00.000Z";
const runStartMs = Date.parse(RUN_START);

// 1 — STALE scan (mtime 1h BEFORE the run start) ⇒ BLOCKED. The ONLY failing gate is the probe.
{
  const dir = sandbox(RUN_START);
  writeScan(dir, runStartMs - 3600_000);
  const out = runValidation(dir);
  check(out.validated === false && out.status === "BLOCKED" && out.exit === 1, "STALE clean-workspace scan ⇒ BLOCKED (exit 1, no authoritative SUCCESS)");
  check(out.capabilitiesOk === false, "the capability proof is the failing gate (capabilitiesOk=false)");
  check((out.unmet || []).some((u) => u.includes("Clean Workspace") || u.toLowerCase().includes("stale") || u.includes("clean-workspace-scanned")), "unmet names the unproven Clean Workspace capability");
}

// 2 — FRESH scan (mtime AFTER the run start) ⇒ SUCCESS (fix does not over-block a genuine this-run proof).
{
  const dir = sandbox(RUN_START);
  writeScan(dir, runStartMs + 5_000);
  const out = runValidation(dir);
  check(out.validated === true && out.status === "SUCCESS" && out.exit === 0, "FRESH clean-workspace scan ⇒ SUCCESS (exit 0, not over-blocked)");
  check(out.capabilitiesOk === true, "the capability proof passes on a this-run artifact (capabilitiesOk=true)");
}

console.log(failures === 0 ? "ALL PASS — P0-069 PROBE FRESHNESS WIRED" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
