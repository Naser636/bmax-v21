/*
 * Convergence Orchestrator — deterministic unit test.
 *
 * Run directly with tsx (no repository, provider or network — every effect is an injected seam):
 *   node_modules/.bin/tsx src/runtime/converge-cli.test.ts
 *
 * Exercises the composition contract of runConverge(): it front-loads contract generation, surfaces
 * the migration report, runs the EXISTING autonomy loop exactly once, aggregates a campaign-level
 * convergence report from the generated artifacts, and maps the terminal status to the documented
 * exit code (PLAN_COMPLETE → 0, BLOCKED → 2, else → 1).
 */

import { runConverge, type ConvergeSeams } from "./converge-cli";
import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyRunResult,
  type AutonomyStatus,
} from "@/contracts/runtime-autonomy";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

/** Build a canned autonomy result for a given terminal status. */
function resultFor(status: AutonomyStatus, released: string[] = []): AutonomyRunResult {
  return {
    autonomyContractVersion: AUTONOMY_CONTRACT_VERSION,
    status,
    planComplete: status === "PLAN_COMPLETE",
    cycles: released.length,
    completed: released.map((mission) => ({ mission, record: {} as never })),
    halt:
      status === "PLAN_COMPLETE"
        ? null
        : { mission: "MX", reason: status, message: `halt ${status}` },
  };
}

/** A recording harness: injects every seam and captures what the orchestrator did. */
function harness(status: AutonomyStatus, released: string[] = []) {
  const writes = new Map<string, string>();
  let contractsCalled = 0;
  let migrationCalled = 0;
  let runCalled = 0;
  const artifacts: Record<string, unknown> = {
    "mission-ledger.json": { entries: [{ proven: true }, { proven: true }, { proven: false }] },
    "autonomy-checkpoint.json": { status, resumeAfter: "PRIOR" },
    "root-cause-report.json": { summary: "diagnosed" },
    "runtime-mission-queue.json": { queue: released.length ? [] : ["WORK_A"] },
  };

  const seams: ConvergeSeams = {
    autonomy: {
      initialize: () => ({ ready: true }),
      run: () => {
        runCalled++;
        return resultFor(status, released);
      },
    },
    ports: {} as never,
    generateContracts: () => {
      contractsCalled++;
      return { ok: true, detail: "stub contracts" };
    },
    migrationReport: () => {
      migrationCalled++;
      return "MIGRATION REPORT — stub";
    },
    readJson: (rel) => artifacts[rel] ?? null,
    writeFile: (abs, content) => void writes.set(abs, content),
    now: () => "2026-07-27T00:00:00.000Z",
    log: () => {},
  };

  const code = runConverge(seams);
  return { code, writes, contractsCalled, migrationCalled, runCalled };
}

console.log("Convergence Orchestrator — composition + exit-code mapping");

// 1. Happy path: plan already converged.
{
  const h = harness("PLAN_COMPLETE", []);
  check(h.code === 0, "PLAN_COMPLETE → exit 0");
  check(h.contractsCalled === 1, "contract generation front-loaded exactly once");
  check(h.migrationCalled === 1, "migration report produced");
  check(h.runCalled === 1, "existing autonomy loop invoked exactly once");

  const jsonEntry = [...h.writes].find(([p]) => p.endsWith("convergence-report.json"));
  const mdEntry = [...h.writes].find(([p]) => p.endsWith("convergence-report.md"));
  check(!!jsonEntry, "convergence-report.json written");
  check(!!mdEntry, "convergence-report.md written");

  const report = JSON.parse(jsonEntry![1]);
  check(report.report === "RUNTIME_CONVERGENCE", "report is tagged RUNTIME_CONVERGENCE");
  check(report.converged === true, "converged flag true on PLAN_COMPLETE");
  check(report.status === "PLAN_COMPLETE", "status carried through");
  check(report.provenMissions === 2, "proven-mission count aggregated from ledger");
  check(report.remainingWork === 1, "remaining forward work read from queue");
  check(report.rootCause.present === true, "root-cause presence aggregated");
  check(report.contracts.ok === true, "contract step recorded");
  check(report.migration === "MIGRATION REPORT — stub", "migration text embedded");
  check(report.generatedAt === "2026-07-27T00:00:00.000Z", "injected timestamp used (deterministic)");
  check(mdEntry![1].includes("# Convergence Report"), "markdown header rendered");
}

// 2. Missions released this run appear in the report.
{
  const h = harness("PLAN_COMPLETE", ["MISSION_A", "MISSION_B"]);
  const jsonEntry = [...h.writes].find(([p]) => p.endsWith("convergence-report.json"))!;
  const report = JSON.parse(jsonEntry[1]);
  check(
    JSON.stringify(report.releasedThisRun) === JSON.stringify(["MISSION_A", "MISSION_B"]),
    "released missions listed in report",
  );
  check(report.remainingWork === 0, "queue drained → remainingWork 0",
  );
}

// 3. BLOCKED → exit 2; halt captured; not converged.
{
  const h = harness("BLOCKED");
  check(h.code === 2, "BLOCKED → exit 2");
  const report = JSON.parse([...h.writes].find(([p]) => p.endsWith(".json"))![1]);
  check(report.converged === false, "converged flag false on BLOCKED");
  check(report.halt && report.halt.reason === "BLOCKED", "halt reason captured");
}

// 4. Any other failure → exit 1.
{
  const h = harness("EXECUTION_FAILED");
  check(h.code === 1, "EXECUTION_FAILED → exit 1");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
