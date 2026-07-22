import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { RuntimeMetadata } from "./runtime-types";

/**
 * RootCauseEngine — automated Root Cause Reporting for a BLOCKED mission.
 *
 * When the Runtime halts a mission with NO_RELEASE (Autonomy status BLOCKED, see
 * src/core/runtime-autonomy.ts), a human today reads the evidence by hand to find which
 * Release gate is red and which component owns it. This engine performs that diagnosis
 * deterministically and produces a single structured artifact —
 * `runtime/generated/root-cause-report.json` — carrying:
 *
 *   1. the root cause (the first red Release gate, in the Release Manager's own gate order);
 *   2. the component responsible for that gate (producer / relay / consumer / decision authority);
 *   3. the minimal patch proposed to clear it (PROPOSED, never applied — weakening a gate is a
 *      Release-Manager-owned policy decision);
 *   4. the corrective mission prepared to carry that patch to a subsequent RELEASE.
 *
 * It reuses the conventions already established by SnapshotEngine (resilient `execSync` git
 * access, `fs` inventories, a version-stamped structured return) and never mutates tracked
 * source: its only write target is the gitignored `runtime/generated/` tree.
 */

export const ROOT_CAUSE_ENGINE_VERSION = "ROOT_CAUSE_ENGINE_V1";

/**
 * The five deterministic Release gates evaluated by ReleaseManager.allGreen()
 * (src/core/release-manager.ts:373-381), in that exact evaluation order — the order in which a
 * red gate is selected as THE primary root cause.
 */
export const RELEASE_GATE_ORDER = [
  "build",
  "typescript",
  "gitClean",
  "missionPipeline",
  "documentationProofPresent",
] as const;

export type ReleaseGateName = (typeof RELEASE_GATE_ORDER)[number];

/** The chain of components that produce, relay, consume and decide on a single Release gate. */
export interface ResponsibleComponent {
  gate: ReleaseGateName;
  /** Where allGreen() turns the gate into the RELEASE / NO_RELEASE decision. */
  decisionAuthority: string;
  /** What computes the gate value. */
  evidenceProducer: string;
  /** The persisted evidence file the value is read from, when there is one. */
  evidenceFile: string | null;
  /** The adapter that relays the persisted evidence into ReleaseInputs. */
  evidenceRelay: string;
  /** The capability that feeds the gate to the Release Manager. */
  gateConsumer: string;
}

/** A minimal, PROPOSED fix. The engine never applies it (design: it proposes, the Runtime decides). */
export interface MinimalPatch {
  rationale: string;
  /** Files the patch would touch, repo-relative. */
  filesToModify: string[];
  /** Ordered, copy-pasteable remediation steps. */
  steps: string[];
  /** Always false: this engine diagnoses and proposes; it does not mutate the tree. */
  applied: false;
}

/** A ready-to-run corrective Mission Contract, matching the runtime/missions/*.json shape. */
export interface CorrectiveMission {
  mission: string;
  priority: string;
  mode: "ENGINEERING";
  requiresEngineering: true;
  continue_until_complete: true;
  description: string;
  authorizedPaths: string[];
  objectives: Array<{ id: string; goal: string; done_when: string[] }>;
}

export interface RootCause {
  gate: ReleaseGateName;
  responsibleComponent: ResponsibleComponent;
  /** The rule in the decision authority that the red gate violates. */
  blockingRule: string;
  /** Human-readable explanation of why this gate is red on the current repository. */
  detail: string;
  /** Structured facts the diagnosis rests on. */
  evidence: Record<string, unknown>;
}

export type RootCauseStatus = "DIAGNOSED" | "NO_BLOCKER" | "EVIDENCE_MISSING";

export interface RootCauseReport extends RuntimeMetadata {
  status: RootCauseStatus;
  /** The blocked mission this report is about (echoed, never decided). */
  mission: string | null;
  summary: string;
  /** Observed value of each gate: true / false, or null when not observable. */
  gates: Record<ReleaseGateName, boolean | null>;
  /** Red gates, in Release-gate order. */
  blockingGates: ReleaseGateName[];
  rootCause: RootCause | null;
  minimalPatch: MinimalPatch | null;
  correctiveMission: CorrectiveMission | null;
}

export interface RootCauseEngineOptions {
  /** Repository root the diagnosis is run against. Defaults to process.cwd(). */
  cwd?: string;
  /** Directory the report artifact is written to (gitignored). */
  generatedDir?: string;
  /** Validation evidence file (build / typescript / gitClean), relative to cwd. */
  verifyFile?: string;
}

const DEFAULT_GENERATED = "runtime/generated";
const REPORT_FILE = "root-cause-report.json";
const CORRECTIVE_MISSION_FILE = "corrective-mission.json";

/**
 * Static knowledge base: for each Release gate, the component chain that owns it. Sourced from
 * ReleaseManager (decision authority), odg-verify.js (evidence producer for the validation gates),
 * AutonomyRuntimeAdapter.gatherEvidence (relay) and RuntimeAutonomy.assembleReleaseInputs (consumer).
 */
const COMPONENTS: Record<ReleaseGateName, Omit<ResponsibleComponent, "gate">> = {
  build: {
    decisionAuthority: "src/core/release-manager.ts",
    evidenceProducer: "runtime/bin/odg-verify.js (npm run build)",
    evidenceFile: "runtime/generated/runtime-verify.json",
    evidenceRelay: "src/runtime/autonomy-runtime-adapter.ts (gatherEvidence)",
    gateConsumer: "src/core/runtime-autonomy.ts (assembleReleaseInputs -> ReleaseManager.decide)",
  },
  typescript: {
    decisionAuthority: "src/core/release-manager.ts",
    evidenceProducer: "runtime/bin/odg-verify.js (npx tsc --noEmit)",
    evidenceFile: "runtime/generated/runtime-verify.json",
    evidenceRelay: "src/runtime/autonomy-runtime-adapter.ts (gatherEvidence)",
    gateConsumer: "src/core/runtime-autonomy.ts (assembleReleaseInputs -> ReleaseManager.decide)",
  },
  gitClean: {
    decisionAuthority: "src/core/release-manager.ts",
    evidenceProducer: "runtime/bin/odg-verify.js (git diff --quiet)",
    evidenceFile: "runtime/generated/runtime-verify.json",
    evidenceRelay: "src/runtime/autonomy-runtime-adapter.ts (gatherEvidence)",
    gateConsumer: "src/core/runtime-autonomy.ts (assembleReleaseInputs -> ReleaseManager.decide)",
  },
  missionPipeline: {
    decisionAuthority: "src/core/release-manager.ts",
    evidenceProducer: "runtime/bin/odg-run.js / ClaudeProviderAdapter (pipeline outcome)",
    evidenceFile: null,
    evidenceRelay: "src/runtime/autonomy-runtime-adapter.ts (gatherEvidence)",
    gateConsumer: "src/core/runtime-autonomy.ts (assembleReleaseInputs -> ReleaseManager.decide)",
  },
  documentationProofPresent: {
    decisionAuthority: "src/core/release-manager.ts",
    evidenceProducer: "src/core/documentation-engine.ts (via AutonomyRuntimeAdapter.buildDocumentationProof)",
    evidenceFile:
      "runtime/generated/mission-report.json | runtime/mission-standard/generated/<mission>.json",
    evidenceRelay: "src/runtime/autonomy-runtime-adapter.ts (gatherEvidence)",
    gateConsumer: "src/core/runtime-autonomy.ts (assembleReleaseInputs -> ReleaseManager.decide)",
  },
};

const BLOCKING_RULE =
  "ReleaseManager.allGreen() (src/core/release-manager.ts:373-381) requires every gate === true; " +
  "this gate is false, so decide() returns decision:NO_RELEASE (Runtime status BLOCKED).";

export class RootCauseEngine {
  private readonly cwd: string;
  private readonly generatedDir: string;
  private readonly verifyFile: string;

  constructor(options: RootCauseEngineOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.generatedDir = options.generatedDir ?? DEFAULT_GENERATED;
    this.verifyFile = options.verifyFile ?? `${DEFAULT_GENERATED}/runtime-verify.json`;
  }

  /**
   * Diagnose the current repository state and build the Root Cause Report for `mission`.
   * Pure with respect to the tree: reads evidence and git state, mutates nothing.
   */
  diagnose(mission: string | null = null): RootCauseReport {
    const gates = this.observeGates(mission);
    const blockingGates = RELEASE_GATE_ORDER.filter((g) => gates[g] === false);

    const base = {
      version: ROOT_CAUSE_ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      mission,
      gates,
      blockingGates,
    };

    // No red gate observed: either releasable or evidence is not yet present.
    if (blockingGates.length === 0) {
      const anyMissing = RELEASE_GATE_ORDER.some((g) => gates[g] === null);
      return {
        ...base,
        status: anyMissing ? "EVIDENCE_MISSING" : "NO_BLOCKER",
        summary: anyMissing
          ? "No red gate found, but some gates are not observable (missing validation evidence). " +
            "Run runtime/bin/odg-verify.js to refresh runtime/generated/runtime-verify.json."
          : "All observable Release gates are green; no NO_RELEASE root cause to report.",
        rootCause: null,
        minimalPatch: null,
        correctiveMission: null,
      };
    }

    // THE root cause is the first red gate in the Release Manager's own gate order.
    const gate = blockingGates[0];
    const rootCause = this.buildRootCause(gate);
    const minimalPatch = this.buildMinimalPatch(gate, rootCause);
    const correctiveMission = this.buildCorrectiveMission(gate, minimalPatch);

    return {
      ...base,
      status: "DIAGNOSED",
      summary:
        `NO_RELEASE root cause: the "${gate}" gate is red` +
        (blockingGates.length > 1
          ? ` (also red: ${blockingGates.slice(1).join(", ")}).`
          : ".") +
        ` Responsible component: ${rootCause.responsibleComponent.evidenceProducer}.`,
      rootCause,
      minimalPatch,
      correctiveMission,
    };
  }

  /** Diagnose and persist the artifact(s). Returns the report actually written. */
  report(mission: string | null = null): RootCauseReport {
    const report = this.diagnose(mission);
    this.write(report);
    return report;
  }

  /**
   * Write the report to `runtime/generated/root-cause-report.json` and, when a corrective mission
   * was prepared, mirror it to `runtime/generated/corrective-mission.json` so a downstream runner
   * can pick it up. Both live under the gitignored generated tree, so writing never dirties git.
   */
  write(report: RootCauseReport): void {
    const dir = path.resolve(this.cwd, this.generatedDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, REPORT_FILE),
      JSON.stringify(report, null, 2) + "\n",
    );
    if (report.correctiveMission) {
      fs.writeFileSync(
        path.join(dir, CORRECTIVE_MISSION_FILE),
        JSON.stringify(report.correctiveMission, null, 2) + "\n",
      );
    }
  }

  /** Render the report as a compact human-readable Markdown brief. */
  render(report: RootCauseReport): string {
    const lines: string[] = ["# Root Cause Report", "", `Status: ${report.status}`];
    if (report.mission) lines.push(`Mission: ${report.mission}`);
    lines.push("", report.summary);
    if (report.rootCause) {
      const rc = report.rootCause;
      lines.push(
        "",
        "## Responsible component",
        `- gate            : ${rc.gate}`,
        `- evidenceProducer: ${rc.responsibleComponent.evidenceProducer}`,
        `- evidenceFile    : ${rc.responsibleComponent.evidenceFile ?? "(none)"}`,
        `- decisionAuthority: ${rc.responsibleComponent.decisionAuthority}`,
        "",
        "## Detail",
        rc.detail,
      );
    }
    if (report.minimalPatch) {
      lines.push(
        "",
        "## Minimal patch (proposed, not applied)",
        report.minimalPatch.rationale,
        ...report.minimalPatch.steps.map((s, i) => `${i + 1}. ${s}`),
      );
    }
    if (report.correctiveMission) {
      lines.push("", `## Corrective mission: ${report.correctiveMission.mission}`);
    }
    return lines.join("\n") + "\n";
  }

  // --- gate observation ---------------------------------------------------

  private observeGates(mission: string | null): Record<ReleaseGateName, boolean | null> {
    const verify = this.readJson<{
      build?: boolean;
      typescript?: boolean;
      gitClean?: boolean;
      missionPipeline?: boolean;
    }>(this.verifyFile);

    return {
      build: this.asBool(verify?.build),
      typescript: this.asBool(verify?.typescript),
      gitClean: this.asBool(verify?.gitClean),
      // missionPipeline is not persisted in runtime-verify.json; the adapter sets it true once the
      // pipeline succeeds. A gate-BLOCKED mission got past the pipeline, so absence reads as true.
      missionPipeline: verify?.missionPipeline === false ? false : true,
      documentationProofPresent: this.observeDocumentationProof(mission),
    };
  }

  /**
   * The Documentation Proof gate is derived, not persisted as a boolean: the adapter builds it from
   * a mission-scoped artifact. Mirror that check so the report is accurate — proof is present iff a
   * mission-matched report.json OR the mission-standard generated artifact exists.
   */
  private observeDocumentationProof(mission: string | null): boolean | null {
    if (!mission) return null;
    const mstd = this.exists(`runtime/mission-standard/generated/${mission}.json`);
    const report = this.readJson<{ mission?: string }>(
      `${DEFAULT_GENERATED}/mission-report.json`,
    );
    const reportMatches = !!report && report.mission === mission;
    return mstd || reportMatches;
  }

  // --- root-cause construction -------------------------------------------

  private buildRootCause(gate: ReleaseGateName): RootCause {
    const responsibleComponent: ResponsibleComponent = { gate, ...COMPONENTS[gate] };
    if (gate === "gitClean") {
      return this.gitCleanRootCause(responsibleComponent);
    }
    return {
      gate,
      responsibleComponent,
      blockingRule: BLOCKING_RULE,
      detail: this.genericDetail(gate),
      evidence: { gate, observedValue: false, evidenceFile: responsibleComponent.evidenceFile },
    };
  }

  private genericDetail(gate: ReleaseGateName): string {
    switch (gate) {
      case "build":
        return "runtime/bin/odg-verify.js recorded build:false — `npm run build` failed. Inspect the build output and fix the failing module before re-verifying.";
      case "typescript":
        return "runtime/bin/odg-verify.js recorded typescript:false — `npx tsc --noEmit` reported type errors. Resolve the reported errors before re-verifying.";
      case "missionPipeline":
        return "The mission pipeline (odg-run.js / provider) did not report success, so missionPipeline is false. Re-run the pipeline and capture its diagnostics.";
      case "documentationProofPresent":
        return "No mission-scoped artifact was found, so AutonomyRuntimeAdapter.buildDocumentationProof produced no proof. Produce runtime/generated/mission-report.json (mission-matched) or runtime/mission-standard/generated/<mission>.json.";
      default:
        return "";
    }
  }

  /**
   * gitClean-specific diagnosis: `git diff --quiet` (the exact verifier check) only sees TRACKED
   * modifications. Enumerate them and isolate regenerated per-run bookkeeping (history ledgers),
   * which is the known deadlock cause: it is rewritten every mission run yet gates the release.
   */
  private gitCleanRootCause(responsibleComponent: ResponsibleComponent): RootCause {
    const trackedModified = this.gitLines("git diff --name-only");
    const bookkeeping = trackedModified.filter((f) => this.isBookkeeping(f));
    const other = trackedModified.filter((f) => !this.isBookkeeping(f));

    const detailParts = [
      "runtime/bin/odg-verify.js runs `git diff --quiet`; a non-zero exit records gitClean:false. " +
        "That check sees only TRACKED modifications (untracked files are invisible to it).",
    ];
    if (trackedModified.length === 0) {
      detailParts.push(
        "No tracked modification is currently visible to `git diff --quiet` — the recorded " +
          "gitClean:false is stale; re-running the verifier should clear it.",
      );
    } else if (bookkeeping.length > 0) {
      detailParts.push(
        `Tracked modifications include regenerated bookkeeping that must not gate a release: ${bookkeeping.join(", ")}.`,
      );
      if (other.length > 0) {
        detailParts.push(`Other tracked modifications also present: ${other.join(", ")}.`);
      }
    } else {
      detailParts.push(`Tracked modifications: ${trackedModified.join(", ")}.`);
    }

    return {
      gate: "gitClean",
      responsibleComponent,
      blockingRule: BLOCKING_RULE,
      detail: detailParts.join(" "),
      evidence: {
        gate: "gitClean",
        observedValue: false,
        trackedModified,
        bookkeepingModified: bookkeeping,
        otherModified: other,
        note: "`git diff --quiet` ignores untracked files; only tracked modifications trip this gate.",
      },
    };
  }

  private isBookkeeping(file: string): boolean {
    return (
      file.startsWith("runtime/mission-standard/history/") ||
      /(^|\/)history\.md$/.test(file)
    );
  }

  // --- minimal patch ------------------------------------------------------

  private buildMinimalPatch(gate: ReleaseGateName, rootCause: RootCause): MinimalPatch {
    if (gate === "gitClean") {
      const bookkeeping = (rootCause.evidence.bookkeepingModified as string[]) ?? [];
      const other = (rootCause.evidence.otherModified as string[]) ?? [];
      if (bookkeeping.length > 0) {
        return {
          rationale:
            "The red gate is caused by regenerated per-run bookkeeping being tracked. runtime/generated/ " +
            "is already gitignored for exactly this reason; the same must hold for the history ledger so " +
            "it stops dirtying the tree. This is non-destructive to the files on disk.",
          filesToModify: [".gitignore", ...bookkeeping],
          steps: [
            ...bookkeeping.map((f) => `git rm --cached ${f}`),
            `Append to .gitignore:\n${bookkeeping.map((f) => `/${f}`).join("\n")}`,
            "Re-run runtime/bin/odg-verify.js and confirm gitClean:true.",
            ...(other.length > 0
              ? [`Review the remaining tracked modifications and commit or revert them: ${other.join(", ")}.`]
              : []),
          ],
          applied: false,
        };
      }
      if (other.length > 0) {
        return {
          rationale:
            "Tracked source modifications are outstanding. They are legitimate mission output and must be " +
            "committed (not discarded) so the working tree is clean when the Release Manager evaluates gitClean.",
          filesToModify: other,
          steps: [
            `Commit the outstanding tracked modifications: ${other.join(", ")}.`,
            "Re-run runtime/bin/odg-verify.js and confirm gitClean:true.",
          ],
          applied: false,
        };
      }
      return {
        rationale:
          "No tracked modification is visible; the recorded gitClean:false is stale evidence.",
        filesToModify: ["runtime/generated/runtime-verify.json"],
        steps: ["Re-run runtime/bin/odg-verify.js to refresh runtime/generated/runtime-verify.json."],
        applied: false,
      };
    }

    if (gate === "build") {
      return {
        rationale: "The build gate is red; the failing module must compile before a release is possible.",
        filesToModify: [],
        steps: [
          "Run `npm run build` and read the first error.",
          "Fix the failing module (within the mission's authorized paths).",
          "Re-run runtime/bin/odg-verify.js and confirm build:true.",
        ],
        applied: false,
      };
    }

    if (gate === "typescript") {
      return {
        rationale: "The typescript gate is red; reported type errors must be resolved before a release.",
        filesToModify: [],
        steps: [
          "Run `npx tsc --noEmit` and read the reported errors.",
          "Resolve the type errors (within the mission's authorized paths).",
          "Re-run runtime/bin/odg-verify.js and confirm typescript:true.",
        ],
        applied: false,
      };
    }

    if (gate === "documentationProofPresent") {
      return {
        rationale:
          "No mission-scoped artifact exists, so no Documentation Proof can be built. Producing one lets " +
          "the Documentation Engine emit the proof the Release Manager requires.",
        filesToModify: ["runtime/generated/mission-report.json"],
        steps: [
          "Produce a mission-matched runtime/generated/mission-report.json (or runtime/mission-standard/generated/<mission>.json).",
          "Re-run the release evaluation so gatherEvidence rebuilds the Documentation Proof.",
        ],
        applied: false,
      };
    }

    // missionPipeline
    return {
      rationale: "The mission pipeline did not report success; it must complete before evidence is gathered.",
      filesToModify: [],
      steps: [
        "Re-run the mission pipeline and capture its structured diagnostics.",
        "Address the reported pipeline failure, then re-run the release evaluation.",
      ],
      applied: false,
    };
  }

  // --- corrective mission -------------------------------------------------

  private buildCorrectiveMission(
    gate: ReleaseGateName,
    patch: MinimalPatch,
  ): CorrectiveMission {
    const missionName = `RESOLVE_${this.screamingSnake(gate)}_GATE`;
    const authorizedPaths = this.deriveAuthorizedPaths(patch.filesToModify);
    return {
      mission: missionName,
      priority: "CRITICAL",
      mode: "ENGINEERING",
      requiresEngineering: true,
      continue_until_complete: true,
      description:
        `Corrective mission auto-prepared by ${ROOT_CAUSE_ENGINE_VERSION}: clear the red "${gate}" ` +
        "Release gate so the Release Manager can reach RELEASE.",
      authorizedPaths,
      objectives: [
        {
          id: "OBJ-001",
          goal: `Apply the minimal patch proposed for the "${gate}" gate.`,
          done_when: patch.steps,
        },
        {
          id: "OBJ-002",
          goal: `Confirm the "${gate}" gate is green.`,
          done_when: [
            "runtime/bin/odg-verify.js has been re-run.",
            `runtime/generated/runtime-verify.json reports ${gate}:true.`,
          ],
        },
      ],
    };
  }

  private deriveAuthorizedPaths(files: string[]): string[] {
    const roots = new Set<string>();
    for (const f of files) {
      const top = f.split("/")[0];
      if (top === "src") {
        const second = f.split("/")[1];
        roots.add(second ? `src/${second}/**` : "src/**");
      } else if (top) {
        roots.add(f.includes("/") ? `${top}/**` : f);
      }
    }
    // Always allow the runtime tree the verifier and generated artifacts live under.
    roots.add("runtime/**");
    return [...roots].sort();
  }

  private screamingSnake(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  }

  // --- io helpers (resilient, mirroring SnapshotEngine) -------------------

  private asBool(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }

  private exists(rel: string): boolean {
    return fs.existsSync(path.resolve(this.cwd, rel));
  }

  private readJson<T>(rel: string): T | null {
    try {
      const raw = fs.readFileSync(path.resolve(this.cwd, rel), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private gitLines(command: string): string[] {
    return this.exec(command)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  private exec(command: string): string {
    try {
      return execSync(command, {
        cwd: this.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return "";
    }
  }
}
