/*
 * AutonomousExecutionAdapter — the I/O ports for the AutonomousExecutionEngine.
 *
 * The engine (src/runtime/autonomous-execution-engine.ts) is a pure decision core; this adapter is
 * the ONLY place the loop touches the world. It:
 *   - builds the fallback-ordered capability list from Runtime-supplied provider descriptors,
 *     ranked exactly as the Provider Orchestrator ranks them (priority desc, then id asc), with an
 *     optional local capability appended as the last resort;
 *   - diagnoses a failed attempt with the real RootCauseEngine (reads evidence, mutates nothing);
 *   - applies a minimal patch ONLY when it is safe and in-scope — patches confined to the gitignored
 *     runtime/generated/ tree — and otherwise reports it undelegated so the loop falls back to a
 *     provider that can author the code fix;
 *   - stamps a real wall-clock time and persists the single executive report under runtime/generated/.
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
  type MinimalPatch,
  type RootCauseReport,
} from "./root-cause-engine";
import type {
  AutonomousExecutionPorts,
  ExecutionAttemptOutcome,
  ExecutionCapability,
  ExecutiveReport,
  PatchApplication,
} from "./autonomous-execution-engine";
import { AutonomousExecutionEngine } from "./autonomous-execution-engine";

/** Injected provider-execution port: run one capability, return evidence, never throw. */
export type ExecutionExecutor = (
  capability: ExecutionCapability,
  mission: string,
) => ExecutionAttemptOutcome;

export interface AutonomousExecutionAdapterOptions {
  /** Repository root the diagnosis + artifact writes run against. Defaults to process.cwd(). */
  cwd?: string;
  /** Gitignored directory the executive report is written to. Defaults to runtime/generated. */
  generatedDir?: string;
  /** Provider descriptors (registration/selection metadata) offered to the fallback loop. */
  providers?: ProviderAdapterDescriptor[];
  /** Append a local Runtime capability as the last-resort fallback. Defaults to true. */
  includeLocal?: boolean;
  /** The real provider-execution port (see ExecutionExecutor). */
  executor?: ExecutionExecutor;
  /** Injected clock for determinism in tests. Defaults to a real wall clock. */
  clock?: () => string;
}

const DEFAULT_GENERATED = "runtime/generated";
const REPORT_JSON = "executive-report.json";
const REPORT_MD = "executive-report.md";
const LOCAL_CAPABILITY_ID = "local-runtime";

export class AutonomousExecutionAdapter implements AutonomousExecutionPorts {
  private readonly cwd: string;
  private readonly generatedDir: string;
  private readonly providers: ProviderAdapterDescriptor[];
  private readonly includeLocal: boolean;
  private readonly executor: ExecutionExecutor;
  private readonly clock: () => string;
  private readonly rootCause: RootCauseEngine;

  constructor(options: AutonomousExecutionAdapterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.generatedDir = options.generatedDir ?? DEFAULT_GENERATED;
    this.providers = options.providers ?? [];
    this.includeLocal = options.includeLocal ?? true;
    this.executor = options.executor ?? defaultExecutor;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.rootCause = new RootCauseEngine({ cwd: this.cwd, generatedDir: this.generatedDir });
  }

  // --- ports --------------------------------------------------------------

  /**
   * Fallback order = enabled providers serving the ENGINEERING capability, ranked (priority desc,
   * id asc) exactly as the Provider Orchestrator ranks them, then the local capability last.
   */
  availableCapabilities(): ExecutionCapability[] {
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
    return this.rootCause.diagnose(mission);
  }

  /**
   * Apply a minimal patch ONLY when every target is confined to the gitignored runtime/generated/
   * tree (a regenerable artifact the engine is authorized to touch). Any patch that would mutate
   * tracked source (.gitignore, src/**, a build) is left UNDELEGATED — applied:false — so the loop
   * falls back to a provider that holds the write authorization to author that code fix. This keeps
   * the deterministic engine from silently editing tracked source outside its safe surface.
   */
  applyPatch(patch: MinimalPatch, _mission: string): PatchApplication {
    const targets = patch.filesToModify;
    const generatedPrefix = this.generatedDir.replace(/\/+$/, "") + "/";
    const allInGenerated =
      targets.length > 0 && targets.every((f) => f === this.generatedDir || f.startsWith(generatedPrefix));
    if (!allInGenerated) {
      return {
        applied: false,
        note: `patch targets tracked source outside the engine's safe surface (${targets.join(", ") || "none"}); delegated to a provider capability`,
      };
    }
    // Safe, idempotent: ensure the generated tree the artifact lives under exists. The engine never
    // fabricates validation evidence — the provider/verifier remains the sole producer of that.
    fs.mkdirSync(path.resolve(this.cwd, this.generatedDir), { recursive: true });
    return { applied: true, note: `refreshed regenerable artifact surface for ${targets.join(", ")}` };
  }

  now(): string {
    return this.clock();
  }

  // --- persistence (obj 9) ------------------------------------------------

  /** Write the single executive report (JSON + Markdown) under the gitignored generated tree. */
  writeReport(report: ExecutiveReport): { json: string; markdown: string } {
    const dir = path.resolve(this.cwd, this.generatedDir);
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, REPORT_JSON);
    const mdPath = path.join(dir, REPORT_MD);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(mdPath, new AutonomousExecutionEngine().render(report));
    return { json: jsonPath, markdown: mdPath };
  }
}

/**
 * Default executor used when no provider-execution port is wired: there is no live capability, so a
 * provider attempt cannot run. It returns a systemic-external failure ("no provider available"),
 * which the engine classifies as a verified external blocker (provision a provider). Never throws.
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
