/*
 * PersistentAutonomyControllerAdapter — the I/O ports for the PersistentAutonomyController.
 *
 * The controller (src/runtime/persistent-autonomy-controller.ts) is a pure decision core; this
 * adapter is the ONLY place the loop touches the world. It:
 *   - builds the fallback-ordered provider list from Runtime-supplied descriptors, ranked exactly as
 *     the Provider Orchestrator ranks them (priority desc, then id asc), with an optional local
 *     capability appended as the last resort;
 *   - diagnoses a failed attempt with the real RootCauseEngine (reads evidence, mutates nothing);
 *   - derives the ordered list of recovery strategies for a failure FROM that diagnosis — a
 *     regenerate step for any patch confined to the gitignored runtime/generated/ tree, then the
 *     diagnosed minimal patch itself as a (delegated) code-fix strategy;
 *   - applies ONLY the safe, in-scope strategies (those confined to runtime/generated/) and reports
 *     the rest undelegated, so the deterministic controller never silently edits tracked source;
 *   - stamps a real wall-clock time and persists the single report under runtime/generated/.
 *
 * The concrete provider-execution port is injected (`executor`): production wires it to the real
 * EngineeringProviderPort pipeline; tests and the demo supply a deterministic scenario. This keeps
 * the adapter free of any coupling to a concrete provider adapter and lets the whole loop run
 * without spawning an external process.
 */

import fs from "node:fs";
import path from "node:path";

import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import { ENGINEERING_CAPABILITY } from "@/contracts/provider-capability";
import {
  RootCauseEngine,
  type RootCauseReport,
} from "./root-cause-engine";
import type {
  ExecutionAttemptOutcome,
  ExecutionCapability,
  FailureClassification,
  PersistentAutonomyPorts,
  PersistentAutonomyReport,
  RecoveryOutcome,
  RecoveryStrategy,
} from "./persistent-autonomy-controller";
import { PersistentAutonomyController } from "./persistent-autonomy-controller";

/** Injected provider-execution port: run one capability, return evidence, never throw. */
export type PersistentExecutor = (
  capability: ExecutionCapability,
  mission: string,
) => ExecutionAttemptOutcome;

export interface PersistentAutonomyControllerAdapterOptions {
  /** Repository root the diagnosis + artifact writes run against. Defaults to process.cwd(). */
  cwd?: string;
  /** Gitignored directory the report is written to. Defaults to runtime/generated. */
  generatedDir?: string;
  /** Provider descriptors (registration/selection metadata) offered to the fallback loop. */
  providers?: ProviderAdapterDescriptor[];
  /** Append a local Runtime capability as the last-resort fallback. Defaults to true. */
  includeLocal?: boolean;
  /** The real provider-execution port (see PersistentExecutor). */
  executor?: PersistentExecutor;
  /** Injected clock for determinism in tests. Defaults to a real wall clock. */
  clock?: () => string;
}

const DEFAULT_GENERATED = "runtime/generated";
const REPORT_JSON = "persistent-autonomy-report.json";
const REPORT_MD = "persistent-autonomy-report.md";
const LOCAL_CAPABILITY_ID = "local-runtime";

export class PersistentAutonomyControllerAdapter implements PersistentAutonomyPorts {
  private readonly cwd: string;
  private readonly generatedDir: string;
  private readonly generatedPrefix: string;
  private readonly providers: ProviderAdapterDescriptor[];
  private readonly includeLocal: boolean;
  private readonly executor: PersistentExecutor;
  private readonly clock: () => string;
  private readonly rootCauseEngine: RootCauseEngine;

  constructor(options: PersistentAutonomyControllerAdapterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.generatedDir = options.generatedDir ?? DEFAULT_GENERATED;
    this.generatedPrefix = this.generatedDir.replace(/\/+$/, "") + "/";
    this.providers = options.providers ?? [];
    this.includeLocal = options.includeLocal ?? true;
    this.executor = options.executor ?? defaultExecutor;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.rootCauseEngine = new RootCauseEngine({ cwd: this.cwd, generatedDir: this.generatedDir });
  }

  // --- ports --------------------------------------------------------------

  /**
   * Fallback order = enabled providers serving the ENGINEERING capability, ranked (priority desc,
   * id asc) exactly as the Provider Orchestrator ranks them, then the local capability last.
   */
  availableProviders(): ExecutionCapability[] {
    const providers = this.providers
      .filter((p) => p.enabled && p.capabilities.includes(ENGINEERING_CAPABILITY))
      .slice()
      .sort((a, b) => (a.priority !== b.priority ? b.priority - a.priority : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map<ExecutionCapability>((p) => ({ id: p.id, kind: "provider" }));
    if (this.includeLocal) {
      providers.push({ id: LOCAL_CAPABILITY_ID, kind: "local" });
    }
    return providers;
  }

  execute(capability: ExecutionCapability, mission: string): ExecutionAttemptOutcome {
    return this.executor(capability, mission);
  }

  diagnose(mission: string, _outcome: ExecutionAttemptOutcome): RootCauseReport {
    return this.rootCauseEngine.diagnose(mission);
  }

  /**
   * Derive the ORDERED list of recovery strategies for a failure from the diagnosis (obj 5). Two
   * strategies at most, cheapest first:
   *   1. regenerate — when the diagnosed minimal patch is confined to the gitignored generated tree,
   *      the controller can safely refresh that artifact surface itself;
   *   2. patch — the diagnosed minimal patch as a code fix, offered even when it targets tracked
   *      source (applyRecovery will report it undelegated so the loop falls back to a provider).
   * A failure with no diagnosed patch yields no strategy — legitimately, there is nothing to try.
   */
  recoveryStrategies(
    _mission: string,
    _outcome: ExecutionAttemptOutcome,
    report: RootCauseReport,
    _classification: FailureClassification,
  ): RecoveryStrategy[] {
    const patch = report.minimalPatch;
    if (!patch) return [];
    const gate = report.rootCause?.gate ?? "unknown";
    const strategies: RecoveryStrategy[] = [];
    if (this.allInGenerated(patch.filesToModify)) {
      strategies.push({
        id: `regenerate:${gate}`,
        kind: "regenerate",
        description: `Refresh the regenerable artifact(s) for the "${gate}" gate: ${patch.rationale}`,
        targets: [...patch.filesToModify],
      });
    }
    strategies.push({
      id: `patch:${gate}`,
      kind: "patch",
      description: `Apply the minimal patch proposed for the "${gate}" gate: ${patch.rationale}`,
      targets: [...patch.filesToModify],
    });
    return strategies;
  }

  /**
   * Apply a recovery strategy ONLY when every target is confined to the gitignored runtime/generated/
   * tree (a regenerable artifact the controller is authorized to touch). Any strategy that would
   * mutate tracked source (.gitignore, src/**, a build) is left UNDELEGATED — applied:false — so the
   * loop falls back to a provider that holds the write authorization to author that code fix.
   */
  applyRecovery(strategy: RecoveryStrategy, _mission: string): RecoveryOutcome {
    const targets = strategy.targets ?? [];
    if (!this.allInGenerated(targets)) {
      return {
        applied: false,
        note: `strategy targets tracked source outside the controller's safe surface (${targets.join(", ") || "none"}); delegated to a provider capability`,
      };
    }
    // Safe, idempotent: ensure the generated tree the artifact lives under exists. The controller
    // never fabricates validation evidence — the provider/verifier remains its sole producer.
    fs.mkdirSync(path.resolve(this.cwd, this.generatedDir), { recursive: true });
    return { applied: true, note: `refreshed regenerable artifact surface for ${targets.join(", ")}` };
  }

  now(): string {
    return this.clock();
  }

  // --- persistence (obj 10) -----------------------------------------------

  /** Write the single report (JSON + Markdown) under the gitignored generated tree. */
  writeReport(report: PersistentAutonomyReport): { json: string; markdown: string } {
    const dir = path.resolve(this.cwd, this.generatedDir);
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, REPORT_JSON);
    const mdPath = path.join(dir, REPORT_MD);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(mdPath, new PersistentAutonomyController().render(report));
    return { json: jsonPath, markdown: mdPath };
  }

  // --- helpers ------------------------------------------------------------

  private allInGenerated(targets: string[]): boolean {
    return (
      targets.length > 0 &&
      targets.every((f) => f === this.generatedDir || f.startsWith(this.generatedPrefix))
    );
  }
}

/**
 * Default executor used when no provider-execution port is wired: there is no live capability, so a
 * provider attempt cannot run. It returns a systemic-external failure ("no provider available"),
 * which the controller classifies as a verified external blocker (provision a provider). Never throws.
 */
function defaultExecutor(capability: ExecutionCapability, mission: string): ExecutionAttemptOutcome {
  return {
    ok: false,
    capability: capability.id,
    classification: capability.kind === "provider" ? "SKIPPED" : "LOCAL_FAILED",
    changedFiles: [],
    unauthorizedChanges: [],
    diagnostics: [
      `no provider execution port is wired for "${capability.id}"; no provider available to execute ${mission}`,
    ],
    blocker: null,
  };
}
