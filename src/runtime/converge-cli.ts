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

// L7-FIX-3 (converge spawn) — PURE, exported test seam for the dist-vs-source contract-generator selection.
// Prefers the COMPILED dist port (TS-only transitive load) when the TS runtime is active AND the dist bin
// exists; source fallback on ODG_RUNTIME=js or an absent dist. `exists` injected for behavioral verification.
export function resolveGenerateContractsBin(
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const DIST = path.join("runtime", "dist", "bin", "odg-generate-contracts.js");
  const SOURCE = path.join("runtime", "bin", "odg-generate-contracts.js");
  return env.ODG_RUNTIME !== "js" && exists(DIST) ? DIST : SOURCE;
}

/** Default Step 1: reuse the existing Mission Contract Factory driver, unchanged. */
function defaultGenerateContracts(): ContractStep {
  const gen = resolveGenerateContractsBin();
  const r = spawnSync("node", [gen], {
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
  startedAt: string,
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

  // §7-A observability: wall-clock convergence duration (start captured in runConverge, end here).
  // Fail-safe: unparseable timestamps ⇒ null (never a fabricated number); clamped ≥0.
  const durationMs = (() => {
    const a = Date.parse(startedAt), b = Date.parse(seams.now());
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
  })();

  return {
    report: "RUNTIME_CONVERGENCE",
    generatedAt: seams.now(),
    durationMs,
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
  const startedAt = now(); // §7-A: capture wall-clock start before the autonomy loop runs
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
    const report = buildReport(result, contract, migrationText, { readJson, now }, startedAt);
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

// ---------------------------------------------------------------------------------------------------
// V16.1 — MISSION-SCOPED converge (odg-delegate only). `runConverge()` above is the campaign-wide
// orchestrator and is NOT modified: every existing caller (`odg converge` with no scope flag, mission-cli's
// routed RUNTIME_FULL_AUTONOMY_EXECUTION) still reaches it unchanged. The scoped path below is entered
// ONLY when the CLI receives an explicit `--mission=<ID>` (odg-delegate passes it).
//
// It reuses the SAME RuntimeAutonomy loop + AutonomyRuntimeAdapter + Release Manager — the decision
// authority is unchanged — but restricts the work-list to exactly that mission (no roadmap walk, no
// campaign contract factory). With `--delegated-path=<p>` (the EXACT list odg-delegate proved in-scope +
// non-protected on its ONE observation), the release gitClean gate is judged with odg-verify's OWN
// delegatedGitClean over the same porcelain surface: a dirty entry is tolerated only when it is exactly one
// of those proven paths. That verdict is recomputed FRESH (a) before the pipeline runs and (b) at evidence
// time — any new dirty path that appeared after delegate's observation (between verify and converge, or
// produced by the pipeline itself) ⇒ gitClean=false ⇒ NO_RELEASE ⇒ non-zero exit ⇒ no archive.
// Exit 0 ONLY when the loop reached PLAN_COMPLETE AND the target mission was actually RELEASED this run.
// ---------------------------------------------------------------------------------------------------

/** Explicit scope for a mission-scoped converge. */
export interface ConvergeScope {
  mission: string;
  /** Proven in-scope uncommitted patch paths (odg-delegate). Empty ⇒ the default gitClean gate. */
  delegatedPaths: string[];
}

/** Fresh delegated gitClean verdict for the current tree (same surface as odg-verify's delegated mode). */
export interface DelegatedVerdict {
  gitClean: boolean;
  residual: string[];
}

/** Seams for the scoped path (in addition to ConvergeSeams). */
export interface ScopedConvergeSeams extends ConvergeSeams {
  /** Recompute the delegated verdict over the CURRENT tree (default: odg-verify's delegatedGitClean). */
  delegatedVerdict?: (provenPaths: string[]) => DelegatedVerdict;
}

const MISSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/;
const SAFE_PATH_RE = /^[A-Za-z0-9._\-/]+$/;

/**
 * PURE argv parser. Returns null when no scope flag is present (⇒ the UNCHANGED campaign-wide converge,
 * whatever else argv holds — exactly as before, when argv was ignored); `{ error }` on any malformed/unsafe
 * scoped input (fail-closed — a scoped request is never silently widened to the campaign); otherwise the
 * scope. `--delegated-path` without `--mission` is an error.
 */
export function parseConvergeScope(argv: string[]): ConvergeScope | { error: string } | null {
  const list = Array.isArray(argv) ? argv.filter((a) => typeof a === "string") : [];
  const isMission = (a: string) => a.startsWith("--mission=");
  const isPath = (a: string) => a.startsWith("--delegated-path=");
  const missions = list.filter(isMission).map((a) => a.slice("--mission=".length));
  const paths = list.filter(isPath).map((a) => a.slice("--delegated-path=".length));
  if (missions.length === 0 && paths.length === 0) return null;
  const unknown = list.filter((a) => !isMission(a) && !isPath(a));
  if (unknown.length > 0) return { error: `unknown argument(s) with a scoped converge: ${unknown.map((u) => JSON.stringify(u).slice(0, 80)).join(", ")}` };
  if (missions.length !== 1) return { error: missions.length === 0 ? "--delegated-path requires --mission=<ID>" : "exactly one --mission=<ID> is allowed" };
  const mission = missions[0];
  if (!MISSION_ID_RE.test(mission)) return { error: `invalid mission id ${JSON.stringify(mission).slice(0, 80)}` };
  for (const p of paths) {
    if (!p || p.length > 300 || !SAFE_PATH_RE.test(p) || p.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(p)) {
      return { error: `invalid --delegated-path ${JSON.stringify(p).slice(0, 80)}` };
    }
  }
  return { mission, delegatedPaths: Array.from(new Set(paths)).sort() };
}

/** Default delegated verdict: odg-verify's OWN exported delegatedGitClean + gitCleanExcludes (no re-derivation). */
function defaultDelegatedVerdict(provenPaths: string[]): DelegatedVerdict {
  try {
    const dist = path.resolve("runtime", "dist", "bin", "odg-verify.js");
    const src = path.resolve("runtime", "bin", "odg-verify.ts");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v = require(process.env.ODG_RUNTIME !== "js" && fs.existsSync(dist) ? dist : src);
    const z = spawnSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...v.gitCleanExcludes()],
      { encoding: "utf8" },
    );
    if (z.status !== 0 || typeof z.stdout !== "string") return { gitClean: false, residual: ["<git status failed>"] };
    const d = v.delegatedGitClean(z.stdout, provenPaths);
    return { gitClean: d.gitClean === true, residual: Array.isArray(d.residual) ? d.residual : ["<no residual>"] };
  } catch (e) {
    return { gitClean: false, residual: [`<verdict failed: ${(e as Error).message}>`] };
  }
}

/**
 * Wrap the real ports so the EXISTING loop sees a one-mission work-list. generateContract/runPipeline are
 * the real ones; gatherEvidence is the real one with gitClean replaced — ONLY in delegated mode — by the
 * fresh delegated verdict; archive is the real one (records the ledger) and marks the scope done so the
 * next selection returns null (PLAN_COMPLETE). readPlanState does NOT call the adapter's campaign
 * readPlanState (which materialises every roadmap contract): it is the mission alone.
 */
export function scopedPorts(
  inner: AutonomyRuntimePorts,
  scope: ConvergeScope,
  delegatedVerdict: (provenPaths: string[]) => DelegatedVerdict,
  onVerdict: (v: DelegatedVerdict) => void = () => {},
): AutonomyRuntimePorts {
  let archived = false;
  return {
    readPlanState: () => ({
      masterPlanObjectives: [scope.mission],
      missingCapabilities: [scope.mission],
      completedMissions: archived ? [scope.mission] : [],
    }),
    generateContract: (m) => inner.generateContract(m),
    runPipeline: (m) => inner.runPipeline(m),
    gatherEvidence: (m) => {
      const ev = inner.gatherEvidence(m);
      if (scope.delegatedPaths.length === 0) return ev;
      const v = delegatedVerdict(scope.delegatedPaths);
      onVerdict(v);
      return { ...ev, validation: { ...ev.validation, gitClean: v.gitClean === true } };
    },
    archive: (m, record) => {
      inner.archive(m, record);
      if (m === scope.mission) archived = true;
    },
  };
}

/** Mission-scoped converge. Exit 0 ⇔ PLAN_COMPLETE AND the scoped mission (and only it) RELEASED this run. */
export function runScopedConverge(scope: ConvergeScope, seams: ScopedConvergeSeams = {}): number {
  const log = seams.log ?? console.log;
  const now = seams.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const readJson = seams.readJson ?? defaultReadJson;
  const writeFile = seams.writeFile ?? defaultWriteFile;
  const migrationReport = seams.migrationReport ?? (() => renderMigrationReport());
  const verdictFn = seams.delegatedVerdict ?? defaultDelegatedVerdict;
  const delegated = scope.delegatedPaths.length > 0;
  const io = { readJson, now, writeFile, log };

  log("======================================");
  log("ODG RUNTIME CONVERGENCE — MISSION-SCOPED");
  log("======================================");
  log("Mission    :", scope.mission);
  log("gitClean   :", delegated ? `DELEGATED_PATCH (exactly ${scope.delegatedPaths.length} proven path(s))` : "default gate");

  // Pre-flight (delegated): the tree must STILL be exactly the proven patch before any pipeline runs.
  const verdicts: DelegatedVerdict[] = [];
  if (delegated) {
    const pre = verdictFn(scope.delegatedPaths);
    verdicts.push(pre);
    if (pre.gitClean !== true) {
      log("STOP       : working tree diverged from the proven delegated patch — residual:", pre.residual.join(", "));
      writeScopedReport(null, scope, verdicts, "PREFLIGHT_DIVERGED", io, startedAt, "");
      log("======================================");
      return 2;
    }
  }

  const contract: ContractStep = { ok: true, detail: "skipped — mission-scoped converge does not run the campaign contract factory" };
  const migrationText = migrationReport();
  const autonomy: AutonomyEngine = seams.autonomy ?? new RuntimeAutonomy();
  const ports = scopedPorts(seams.ports ?? new AutonomyRuntimeAdapter(), scope, verdictFn, (v) => verdicts.push(v));

  autonomy.initialize();
  const result = autonomy.run({ autonomyContractVersion: AUTONOMY_CONTRACT_VERSION }, ports);
  const released = result.completed.some((c) => c.mission === scope.mission);
  const onlyTarget = result.completed.every((c) => c.mission === scope.mission);

  log("Status     :", result.status);
  log("Released   :", released ? scope.mission : "(none)");
  if (result.halt) {
    log("Halt on    :", result.halt.mission ?? "(plan)");
    log("Reason     :", result.halt.reason);
    log("Detail     :", result.halt.message);
  }
  writeScopedReport({ result, contract }, scope, verdicts, null, io, startedAt, migrationText);
  log("======================================");

  if (result.status === "PLAN_COMPLETE" && released && onlyTarget) return 0;
  if (result.status === "BLOCKED" || result.status === "VALIDATED_PENDING_COMMIT") return 2;
  return 1;
}

/** Same convergence-report artifact as the campaign path, plus a `scope` block (best-effort; never throws). */
function writeScopedReport(
  run: { result: AutonomyRunResult; contract: ContractStep } | null,
  scope: ConvergeScope,
  verdicts: DelegatedVerdict[],
  preflightStop: string | null,
  s: {
    readJson: (rel: string) => unknown;
    now: () => string;
    writeFile: (abs: string, c: string) => void;
    log: (...a: unknown[]) => void;
  },
  startedAt: string,
  migrationText: string,
): void {
  try {
    const base: Record<string, unknown> = run
      ? buildReport(run.result, run.contract, migrationText, { readJson: s.readJson, now: s.now }, startedAt)
      : { report: "RUNTIME_CONVERGENCE", generatedAt: s.now(), converged: false, status: preflightStop, releasedThisRun: [], halt: null };
    const released = run ? run.result.completed.some((c) => c.mission === scope.mission) : false;
    const gitCleanBasis = scope.delegatedPaths.length ? "DELEGATED_PATCH" : "DEFAULT";
    const report = {
      ...base,
      converged: base.converged === true && released,
      scope: {
        mode: "MISSION_SCOPED",
        mission: scope.mission,
        released,
        gitCleanBasis,
        delegatedPaths: scope.delegatedPaths,
        delegatedVerdicts: verdicts,
        preflightStop,
      },
    };
    s.writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
    if (run) {
      s.writeFile(REPORT_MD, renderMarkdown(report) + `## Scope\n- MISSION_SCOPED: ${scope.mission} (gitClean basis: ${gitCleanBasis}; released: ${released})\n`);
    }
    s.log("Convergence:", report.converged ? "REACHED (mission-scoped)" : "NOT REACHED");
    s.log("Report     :", REPORT_JSON);
  } catch (e) {
    s.log("Report     : (non-blocking error) " + (e as Error).message);
  }
}

/** CLI dispatch: no scope flag ⇒ the UNCHANGED campaign runConverge(); malformed scope ⇒ exit 2 (never widened). */
export function convergeMain(argv: string[], seams: ScopedConvergeSeams = {}): number {
  const scope = parseConvergeScope(argv);
  if (scope === null) return runConverge(seams);
  if ("error" in scope) {
    (seams.log ?? console.error)(`STOP: converge scope refused — ${scope.error}`);
    return 2;
  }
  return runScopedConverge(scope, seams);
}

// Only auto-run when invoked directly as a script (not when imported by mission-cli.ts or a test).
if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /converge-cli\.ts$/.test(process.argv[1] ?? "")
) {
  process.exit(convergeMain(process.argv.slice(2)));
}
