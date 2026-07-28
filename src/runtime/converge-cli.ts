/*
 * Runtime Convergence Orchestrator — CLI entrypoint (`odg converge`, and the routed
 * `odg mission RUNTIME_FULL_AUTONOMY_EXECUTION`).
 *
 * The single command that drives the Runtime to convergence and emits a CAMPAIGN-LEVEL report. It
 * is pure composition — it re-implements nothing and touches no foundation/contract/governance:
 *
 *   1. generate missing roadmap contracts   → runtime/bin/odg-generate-contracts.js
 *                                              (Mission Contract Factory)                  [cap 2]
 *   2. migration report                      → mission-migration.ts (reachable in this path) [cap 4]
 *   3. chain missions to convergence         → RuntimeAutonomy.run + AutonomyRuntimeAdapter,
 *                                              exactly as `odg autonomy` does
 *                                              (select → contract → pipeline → evidence →
 *                                               ReleaseManager → archive → advance until
 *                                               PLAN_COMPLETE)         [caps 1/3/6/7/8/10/11]
 *   4. aggregate a convergence report        → folds the artifacts each run already writes
 *                                              (mission-ledger, autonomy-checkpoint,
 *                                               root-cause-report, migration, contract factory,
 *                                               mission queue) into ONE JSON + Markdown report,
 *                                               reusing the final-report.js formatting approach [cap 9]
 *
 * Exit-code mapping is identical to autonomy-cli.ts (design §3): PLAN_COMPLETE → 0, BLOCKED → 2,
 * anything else → 1. All effects are behind injectable seams so the orchestration is unit-testable
 * with no repository, provider or network (see converge-cli.test.ts).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyRunConfig,
  type AutonomyRunResult,
  type AutonomyRuntimePorts,
} from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { renderMigrationReport } from "./mission-migration";

const GENERATED = "runtime/generated";
const REPORTS_DIR = path.join(GENERATED, "reports");
const REPORT_JSON = path.join(GENERATED, "convergence-report.json");
const REPORT_MD = path.join(REPORTS_DIR, "convergence-report.md");

/** Minimal engine shape so tests can inject a stub in place of the real RuntimeAutonomy. */
interface AutonomyEngine {
  initialize(): unknown;
  run(config: AutonomyRunConfig, ports: AutonomyRuntimePorts): AutonomyRunResult;
}

/** Outcome of Step 1 (contract materialisation), surfaced in the convergence report. */
interface ContractStep {
  ok: boolean;
  detail: string;
}

/**
 * Injectable seams. Production leaves them all undefined and the real components are used; tests
 * inject stubs so the full orchestration runs with no spawn, disk, provider or network.
 */
export interface ConvergeSeams {
  /** Step 3 engine (default: RuntimeAutonomy). */
  autonomy?: AutonomyEngine;
  /** Step 3 ports (default: AutonomyRuntimeAdapter). */
  ports?: AutonomyRuntimePorts;
  /** Step 1 — materialise missing roadmap contracts (default: spawn odg-generate-contracts.js). */
  generateContracts?: () => ContractStep;
  /** Step 2 — migration report text (default: mission-migration.renderMigrationReport). */
  migrationReport?: () => string;
  /** Read a generated JSON artifact, relative to runtime/generated (null when absent/invalid). */
  readJson?: (rel: string) => unknown;
  /** Persist a report file (default: fs write, creating parents). */
  writeFile?: (abs: string, content: string) => void;
  /** ISO timestamp (injectable for deterministic tests). */
  now?: () => string;
  /** Logger (default console.log). */
  log?: (...args: unknown[]) => void;
}

/** Default Step 1: reuse the existing Mission Contract Factory driver, unchanged. */
function defaultGenerateContracts(): ContractStep {
  const r = spawnSync("node", [path.join("runtime", "bin", "odg-generate-contracts.js")], {
    stdio: "inherit",
  });
  return {
    ok: r.status === 0,
    detail: r.status === 0 ? "roadmap contracts materialised (idempotent)" : `driver exit ${r.status}`,
  };
}

/** Default artifact reader — null-safe, mirrors final-report.js `readJsonSafe`. */
function defaultReadJson(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(GENERATED, rel), "utf8"));
  } catch {
    return null;
  }
}

function defaultWriteFile(abs: string, content: string): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** Count PROVEN missions in the Mission Ledger, tolerating shape drift. */
function countProven(ledger: unknown): number {
  const entries = (ledger as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) return 0;
  return entries.filter((e) => e && (e as { proven?: boolean }).proven === true).length;
}

/** Remaining forward work-list size (the coherent runtime-model queue). */
function queueDepth(queue: unknown): number {
  const q = (queue as { queue?: unknown })?.queue;
  return Array.isArray(q) ? q.length : 0;
}

/** Assemble the campaign-level convergence report object from the run result + existing artifacts. */
function buildReport(
  result: AutonomyRunResult,
  contract: ContractStep,
  migrationText: string,
  seams: Required<Pick<ConvergeSeams, "readJson" | "now">>,
): Record<string, unknown> {
  const ledger = seams.readJson("mission-ledger.json");
  const checkpoint = seams.readJson("autonomy-checkpoint.json");
  const rootCause = seams.readJson("root-cause-report.json");
  const queue = seams.readJson("runtime-mission-queue.json");

  // A root cause is a LIVE blocking signal only when the campaign did NOT converge (BLOCKED / halt /
  // non-terminal). When the run reached PLAN_COMPLETE there is nothing blocking, so a
  // root-cause-report.json left on disk by an EARLIER blocked run (generated/ is git-ignored, so it
  // persists) must NOT be surfaced as a live NO_RELEASE blocker — that would make a CONVERGED report
  // also assert a blocker, the exact incoherent state the runtime must never end in (CONVERGED xor
  // BLOCKED). We therefore gate the root cause on the honest convergence verdict.
  const converged = result.status === "PLAN_COMPLETE" && result.halt == null;

  return {
    report: "RUNTIME_CONVERGENCE",
    generatedAt: seams.now(),
    autonomyContractVersion: result.autonomyContractVersion,
    converged,
    status: result.status,
    planComplete: result.planComplete,
    cycles: result.cycles,
    releasedThisRun: result.completed.map((c) => c.mission),
    halt: result.halt
      ? { mission: result.halt.mission, reason: result.halt.reason, message: result.halt.message }
      : null,
    contracts: contract,
    migration: migrationText,
    provenMissions: countProven(ledger),
    remainingWork: queueDepth(queue),
    checkpoint: checkpoint ?? null,
    rootCause:
      !converged && rootCause
        ? { present: true, summary: (rootCause as { summary?: unknown }).summary ?? null }
        : { present: false },
  };
}

/** Render the convergence report as Markdown, reusing final-report.js's shape/idiom. */
function renderMarkdown(r: Record<string, unknown>): string {
  const released = r.releasedThisRun as string[];
  const halt = r.halt as { mission: string | null; reason: string; message: string } | null;
  const contract = r.contracts as ContractStep;
  return [
    "# Convergence Report — Runtime",
    "",
    `- Generated: ${r.generatedAt}`,
    `- Converged: **${r.converged}**`,
    `- Status: **${r.status}**`,
    `- Autonomy contract: ${r.autonomyContractVersion}`,
    `- Cycles this run: ${r.cycles}`,
    `- Proven missions (ledger): ${r.provenMissions}`,
    `- Remaining forward work: ${r.remainingWork}`,
    "",
    "## Contracts",
    `- ${contract.ok ? "✅" : "❌"} ${contract.detail}`,
    "",
    "## Migration",
    "```",
    String(r.migration),
    "```",
    "",
    "## Released this run",
    released.length ? released.map((m) => `- ${m}`).join("\n") : "- (none — plan already converged)",
    "",
    "## Halt",
    halt ? `- ${halt.reason} on ${halt.mission ?? "(plan)"}: ${halt.message}` : "- (none)",
    "",
    "## Root cause",
    (r.rootCause as { present: boolean }).present
      ? "- root-cause-report.json present (see runtime/generated)"
      : "- (no root-cause report this run)",
    "",
  ].join("\n");
}

/**
 * Drive the Runtime to convergence and emit the campaign-level report. Always returns an exit code
 * (error-as-data at the boundary): PLAN_COMPLETE → 0, BLOCKED → 2, otherwise → 1.
 */
export function runConverge(seams: ConvergeSeams = {}): number {
  const log = seams.log ?? console.log;
  const now = seams.now ?? (() => new Date().toISOString());
  const readJson = seams.readJson ?? defaultReadJson;
  const writeFile = seams.writeFile ?? defaultWriteFile;
  const generateContracts = seams.generateContracts ?? defaultGenerateContracts;
  const migrationReport = seams.migrationReport ?? (() => renderMigrationReport());
  const autonomy: AutonomyEngine = seams.autonomy ?? new RuntimeAutonomy();
  const ports: AutonomyRuntimePorts = seams.ports ?? new AutonomyRuntimeAdapter();

  log("======================================");
  log("ODG RUNTIME CONVERGENCE");
  log("======================================");

  // Step 1 — materialise any missing roadmap contract so the campaign runs "from the roadmap alone".
  const contract = generateContracts();
  log("Contracts  :", contract.ok ? "OK" : "PARTIAL", `(${contract.detail})`);

  // Step 2 — migration status (which missions the local Runtime owns vs. still delegated).
  const migrationText = migrationReport();
  log("--------------------------------------");
  log(migrationText);
  log("--------------------------------------");

  // Step 3 — the EXISTING autonomy loop chains missions until PLAN_COMPLETE or a blocking halt.
  autonomy.initialize();
  const result = autonomy.run({ autonomyContractVersion: AUTONOMY_CONTRACT_VERSION }, ports);

  log("Status     :", result.status);
  log("Cycles     :", result.cycles);
  log(
    "Released   :",
    result.completed.length > 0 ? result.completed.map((c) => c.mission).join(", ") : "(none)",
  );
  if (result.halt) {
    log("Halt on    :", result.halt.mission ?? "(plan)");
    log("Reason     :", result.halt.reason);
    log("Detail     :", result.halt.message);
  }

  // Step 4 — aggregate the campaign-level convergence report (best-effort; never fails the run).
  try {
    const report = buildReport(result, contract, migrationText, { readJson, now });
    writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
    writeFile(REPORT_MD, renderMarkdown(report));
    log("--------------------------------------");
    log("Convergence:", report.converged ? "REACHED" : "NOT REACHED");
    log("Report     :", REPORT_MD);
    log("           :", REPORT_JSON);
  } catch (e) {
    log("Report     : (non-blocking error) " + (e as Error).message);
  }
  log("======================================");

  if (result.status === "PLAN_COMPLETE") return 0;
  if (result.status === "BLOCKED") return 2;
  return 1;
}

// Only auto-run when invoked directly as a script (not when imported by mission-cli.ts or a test).
if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /converge-cli\.ts$/.test(process.argv[1] ?? "")
) {
  process.exit(runConverge());
}
