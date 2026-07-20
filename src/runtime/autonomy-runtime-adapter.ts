/*
 * Runtime Autonomy — Runtime adapter (integration glue)
 *
 * Implements AutonomyRuntimePorts (RUNTIME_AUTONOMY_DESIGN_v1.md §2) over the REAL existing
 * Runtime components. This is the thin, impure boundary the frozen design assigns to the Runtime:
 * it reads already-persisted evidence, launches the EXISTING pipeline unchanged, reuses the
 * Documentation Engine to produce the release proof, and appends to the EXISTING Mission Ledger.
 *
 * It creates no new foundation and no new persistence format, and it never modifies the pipeline's
 * business logic — it only invokes `runtime/bin/odg-run.js` exactly as a human does today. The
 * completion decision is NOT made here; it belongs solely to the Release Manager, invoked by the
 * pure core (design §0 founding invariant).
 */

import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";

import type {
  AutonomyPlanState,
  AutonomyRuntimePorts,
  MissionContract,
  PipelineOutcome,
  ReleaseEvidence,
} from "@/contracts/runtime-autonomy";
import type { ReleaseArtifactRef, ReleaseRecord } from "@/contracts/release";
import type {
  Artifact,
  DocumentationInputs,
  DocumentationProof,
} from "@/contracts/documentation";
import { DocumentationEngine } from "@/core/documentation-engine";
import { ARTIFACT_CONTRACT_VERSION } from "@/contracts/documentation";

const GENERATED = "runtime/generated";
const MISSION_PLAN = `${GENERATED}/mission-plan.json`;
const MISSION_REPORT = `${GENERATED}/mission-report.json`;
const REGISTRY = `${GENERATED}/capability-registry.json`;
const LEDGER = `${GENERATED}/mission-ledger.json`;
const VERIFY = `${GENERATED}/runtime-verify.json`;
const BRAIN = "runtime/brain/MASTER_PLAN.md";
const MSTD_GENERATED = "runtime/mission-standard/generated";
const PIPELINE = "runtime/bin/odg-run.js";

export class AutonomyRuntimeAdapter implements AutonomyRuntimePorts {
  private readonly documentation = new DocumentationEngine();
  // Missions released this session, so readPlanState excludes them and the loop advances (design §3).
  private readonly archivedThisSession = new Set<string>();
  private lastReleaseRef: string | null = null;

  constructor(private readonly cwd: string = process.cwd()) {}

  /** Stage 1 — deterministic selection inputs from existing artifacts (design §2 Stage 1). */
  readPlanState(): AutonomyPlanState {
    const masterPlanObjectives = this.readMasterPlanObjectives();
    const registry = this.readJson<{ missingCapabilities?: string[] }>(REGISTRY);
    const missingCapabilities = Array.isArray(registry?.missingCapabilities)
      ? registry!.missingCapabilities
      : [];

    const ledger = this.readJson<{ entries?: Array<{ mission?: string }> }>(LEDGER);
    const ledgerMissions = Array.isArray(ledger?.entries)
      ? ledger!.entries.map((e) => e?.mission).filter((m): m is string => typeof m === "string")
      : [];

    const completedMissions = Array.from(
      new Set([...ledgerMissions, ...this.archivedThisSession]),
    );

    return { masterPlanObjectives, missingCapabilities, completedMissions };
  }

  /** Stage 2 — assemble a Mission Contract in the EXISTING runtime/missions/*.json shape. */
  generateContract(mission: string): MissionContract {
    return {
      mission,
      priority: "NORMAL",
      mode: "SEQUENTIAL",
      objectives: [
        {
          id: this.slug(mission),
          goal: `Deliver capability: ${mission}.`,
          done_when: [
            "Pipeline executed without error.",
            "Release Manager returns RELEASE on complete evidence.",
          ],
        },
      ],
      definition_of_done: [
        "Objective completed.",
        "Validation successful.",
        "Mission ledger updated.",
      ],
      completion: ["Release Manager decision is RELEASE."],
    };
  }

  /** Stage 3 — launch the EXISTING pipeline unchanged (design §2 Stage 3). */
  runPipeline(mission: string): PipelineOutcome {
    const r = spawnSync("node", [PIPELINE, mission], {
      cwd: this.cwd,
      stdio: "inherit",
    });
    return { pipelineOk: r.status === 0 };
  }

  /** Stage 4 — collect evidence from existing capabilities (design §2 Stage 4). */
  gatherEvidence(mission: string): ReleaseEvidence {
    const verify = this.readJson<{
      build?: boolean;
      typescript?: boolean;
      gitClean?: boolean;
    }>(VERIFY);

    return {
      validation: {
        build: verify?.build,
        typescript: verify?.typescript,
        gitClean: verify?.gitClean,
        // We only reach Stage 4 after runPipeline reported success (design §2 Stage 4).
        missionPipeline: true,
      },
      source: this.readSource(),
      documentationProof: this.buildDocumentationProof(mission),
      artifacts: this.collectArtifacts(mission),
      previousReleaseRef: this.lastReleaseRef,
    };
  }

  /** Stage 6 — archive via the EXISTING Mission Ledger; no new persistence format (design §2 Stage 6). */
  archive(mission: string, record: ReleaseRecord): void {
    // Reuse the existing Mission Ledger component exactly as the pipeline does.
    spawnSync("node", ["runtime/core/mission-ledger.js", mission], {
      cwd: this.cwd,
      stdio: "inherit",
    });
    this.archivedThisSession.add(mission);
    this.lastReleaseRef = record.requestId;
  }

  // --- helpers ------------------------------------------------------------

  private readMasterPlanObjectives(): string[] {
    // Prefer the pipeline-produced plan; fall back to parsing the Master Plan directly.
    const plan = this.readJson<{ objectives?: string[] }>(MISSION_PLAN);
    if (Array.isArray(plan?.objectives) && plan!.objectives.length > 0) {
      return plan!.objectives;
    }
    const brainPath = this.resolve(BRAIN);
    if (!fs.existsSync(brainPath)) return [];
    return fs
      .readFileSync(brainPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\d+\./.test(l.trim()))
      .map((l) => l.trim().replace(/^\d+\.\s*/, ""));
  }

  private readSource(): { commit?: string; branch?: string } {
    try {
      const commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.cwd,
        encoding: "utf8",
      }).trim();
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: this.cwd,
        encoding: "utf8",
      }).trim();
      return { commit, branch };
    } catch {
      return {};
    }
  }

  private buildDocumentationProof(mission: string): DocumentationProof | null {
    const artifacts = this.documentableArtifacts(mission);
    if (artifacts.length === 0) return null;
    const inputs: DocumentationInputs = {
      artifactContractVersion: ARTIFACT_CONTRACT_VERSION,
      requestId: mission,
      artifacts,
    };
    const result = this.documentation.generate(inputs);
    return result.ok ? result.proof : null;
  }

  /**
   * Real, already-materialized artifacts of the just-executed mission, fed to the existing
   * Documentation Engine. Two provenance paths are supported so a mission run via EITHER runner
   * yields a proof:
   *   - `runtime/mission-standard/generated/<mission>.json` — the Mission-Standard engine output
   *     (the `odg mission <NAME>` path);
   *   - `runtime/generated/mission-report.json` — the canonical pipeline output written by
   *     odg-run.js for the current mission (the `odg autonomy` path). It is mission-scoped, so we
   *     only accept it when its own `mission` field matches the mission we just ran.
   */
  private documentableArtifacts(mission: string): Artifact[] {
    const artifacts: Artifact[] = [];

    const mstd = this.readJson<Record<string, unknown>>(
      `${MSTD_GENERATED}/${mission}.json`,
    );
    if (mstd && typeof mstd === "object") {
      artifacts.push({ kind: "generated", id: mission, version: "1.0.0", payload: mstd });
    }

    const report = this.readJson<Record<string, unknown>>(MISSION_REPORT);
    if (report && typeof report === "object" && report.mission === mission) {
      artifacts.push({ kind: "report", id: mission, version: "1.0.0", payload: report });
    }

    return artifacts;
  }

  private collectArtifacts(mission: string): ReleaseArtifactRef[] {
    const refs: ReleaseArtifactRef[] = [];
    const candidates: Array<{ kind: ReleaseArtifactRef["kind"]; path: string }> = [
      { kind: "certificate", path: `runtime/mission-standard/certificates/${mission}.certificate.md` },
      { kind: "passport", path: `runtime/mission-standard/passports/${mission}.passport.md` },
      { kind: "report", path: `runtime/mission-standard/reports/${mission}.report.md` },
      { kind: "generated", path: `${MSTD_GENERATED}/${mission}.json` },
    ];
    for (const c of candidates) {
      if (fs.existsSync(this.resolve(c.path))) {
        refs.push({ kind: c.kind, id: mission, version: "1.0.0" });
      }
    }
    // Canonical pipeline output (odg-run.js path): the mission report is a real, mission-scoped
    // artifact. Pin it so a mission executed by `odg autonomy` has at least one releasable artifact.
    const report = this.readJson<{ mission?: string }>(MISSION_REPORT);
    if (report && report.mission === mission) {
      refs.push({ kind: "report", id: `${mission}:mission-report`, version: "1.0.0" });
    }
    return refs;
  }

  private readJson<T>(relPath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(this.resolve(relPath), "utf8")) as T;
    } catch {
      return null;
    }
  }

  private resolve(relPath: string): string {
    return `${this.cwd}/${relPath}`;
  }

  private slug(mission: string): string {
    return mission.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  }
}
