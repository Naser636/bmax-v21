/*
 * Release Manager — Capability implementation
 *
 * Implements RELEASE_MANAGER_DESIGN_v1.md (FROZEN, Release Contract Version 1.0.0).
 * Classification: Capability (not an engine), owned by Governance (design header, "Invariants" §1).
 *
 * Founding invariant (design "Invariant fondateur"):
 *   The Release Manager never judges software quality. It certifies only that a complete set
 *   of conformant evidence permits a RELEASE or NO_RELEASE decision.
 *
 * Single responsibility (design "Invariants" §8): decide + certify. It owns no storage and
 * performs no I/O — no `fs`, no `child_process`, no paths (design "Non-responsabilités").
 * The decision is a deterministic function of boolean evidence gates only; commit, branch,
 * timestamps and hashes are Runtime-supplied metadata that are echoed, never decided
 * (design "Invariants" §3, §7, risk R2).
 */

import {
  RELEASE_CONTRACT_VERSION,
  type ReleaseArtifactKind,
  type ReleaseArtifactRef,
  type ReleaseDecision,
  type ReleaseGates,
  type ReleaseInputs,
  type ReleaseManagerDescription,
  type ReleaseManagerError,
  type ReleaseManagerErrorCode,
  type ReleaseManagerResult,
  type ReleaseRecord,
} from "@/contracts/release";

const CAPABILITY_NAME = "Release Manager";
const RELEASE_ARTIFACT_KINDS: ReadonlyArray<ReleaseArtifactKind> = [
  "certificate",
  "passport",
  "report",
  "generated",
  "documentation",
  "proof",
];

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class ReleaseManager {
  /** Static description of the capability (design "Invariants" §1). */
  describe(): ReleaseManagerDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Governance",
      releaseContractVersion: RELEASE_CONTRACT_VERSION,
      status: "READY",
    };
  }

  /** No I/O; the Runtime supplies inputs and persists/freezes/stamps outputs (design "Pipeline" §6). */
  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Deterministic certification pipeline (design "Pipeline"):
   *   1. structural validation           → INPUTS_MALFORMED
   *   2. Release Contract Version gate    → RELEASE_CONTRACT_INCOMPATIBLE
   *   3. evidence completeness            → EVIDENCE_INCOMPLETE
   *   4. deterministic gate evaluation
   *   5. assemble the immutable ReleaseRecord
   *   6. return (Runtime does the I/O)
   *
   * A red gate on complete, conformant evidence is a certified refusal
   * (`ok:true, decision:"NO_RELEASE"`), never an error (design "Contrats de sortie", risk R6).
   */
  decide(inputs: ReleaseInputs): ReleaseManagerResult {
    const requestId =
      typeof inputs?.requestId === "string" ? inputs.requestId : "";

    // 1. Structural conformity of the ReleaseInputs container (design "Pipeline" §1).
    const malformed = this.validateStructure(inputs);
    if (malformed) {
      return { ok: false, error: malformed };
    }

    // 2. Release Contract Version compatibility gate — before ANY evaluation (design "Pipeline" §2).
    const incompatible = this.checkContractVersion(
      inputs.releaseContractVersion,
      requestId,
    );
    if (incompatible) {
      return { ok: false, error: incompatible };
    }

    // 3. Evidence completeness — a decision requires a complete evidence set (design "Pipeline" §3).
    const incomplete = this.checkEvidenceComplete(inputs);
    if (incomplete) {
      return { ok: false, error: incomplete };
    }

    // 4. Deterministic gate evaluation (design "Pipeline" §4).
    const gates = this.evaluateGates(inputs);
    const decision: ReleaseDecision = this.allGreen(gates)
      ? "RELEASE"
      : "NO_RELEASE";

    // 5. Assemble the immutable record (design "Pipeline" §5).
    const record: ReleaseRecord = {
      releaseContractVersion: inputs.releaseContractVersion,
      requestId: inputs.requestId,
      decision,
      gates,
      included: this.orderArtifacts(inputs.artifacts),
      proofHash: inputs.documentationProof.inputsHash,
      source: { commit: inputs.source.commit, branch: inputs.source.branch },
      rollbackRef: inputs.previousReleaseRef,
    };

    // 6. Return; the Runtime persists + freezes + stamps metadata (design "Pipeline" §6).
    return { ok: true, record };
  }

  // --- 1. Structural validation (design "Pipeline" §1, risk R1) ------------
  // Wrong TYPE on a supplied field ⇒ INPUTS_MALFORMED. Absence of evidence is
  // handled separately by completeness (step 3) so the two failure modes stay distinct.

  private validateStructure(
    inputs: ReleaseInputs,
  ): ReleaseManagerError | null {
    const received =
      inputs && typeof inputs.releaseContractVersion === "string"
        ? inputs.releaseContractVersion
        : "";
    const requestId =
      inputs && typeof inputs.requestId === "string" ? inputs.requestId : "";
    const bad = (message: string) =>
      this.error("INPUTS_MALFORMED", received, requestId, message);

    if (!inputs || typeof inputs !== "object") {
      return bad("ReleaseInputs is missing or not an object.");
    }
    if (typeof inputs.releaseContractVersion !== "string") {
      return bad("releaseContractVersion is missing or not a string.");
    }
    if (typeof inputs.requestId !== "string") {
      return bad("requestId is missing or not a string.");
    }

    // validation: if present, must be an object with boolean-typed flags.
    if (inputs.validation !== undefined) {
      if (typeof inputs.validation !== "object" || inputs.validation === null) {
        return bad("validation is present but not an object.");
      }
      const flags: ReadonlyArray<keyof ReleaseInputs["validation"]> = [
        "build",
        "typescript",
        "gitClean",
        "missionPipeline",
      ];
      for (const flag of flags) {
        const value = inputs.validation[flag];
        if (value !== undefined && typeof value !== "boolean") {
          return bad(`validation.${flag} is present but not a boolean.`);
        }
      }
    }

    // source: if present, must be an object with string-typed fields.
    if (inputs.source !== undefined) {
      if (typeof inputs.source !== "object" || inputs.source === null) {
        return bad("source is present but not an object.");
      }
      if (
        inputs.source.commit !== undefined &&
        typeof inputs.source.commit !== "string"
      ) {
        return bad("source.commit is present but not a string.");
      }
      if (
        inputs.source.branch !== undefined &&
        typeof inputs.source.branch !== "string"
      ) {
        return bad("source.branch is present but not a string.");
      }
    }

    // documentationProof: if present, must be an object; inputsHash, if present, a string.
    if (inputs.documentationProof !== undefined) {
      if (
        typeof inputs.documentationProof !== "object" ||
        inputs.documentationProof === null
      ) {
        return bad("documentationProof is present but not an object.");
      }
      if (
        inputs.documentationProof.inputsHash !== undefined &&
        typeof inputs.documentationProof.inputsHash !== "string"
      ) {
        return bad("documentationProof.inputsHash is present but not a string.");
      }
    }

    // artifacts: if present, must be an array of well-formed refs.
    if (inputs.artifacts !== undefined) {
      if (!Array.isArray(inputs.artifacts)) {
        return bad("artifacts is present but not an array.");
      }
      for (let i = 0; i < inputs.artifacts.length; i++) {
        const refError = this.validateArtifactRef(
          inputs.artifacts[i],
          i,
          received,
          requestId,
        );
        if (refError) {
          return refError;
        }
      }
    }

    // previousReleaseRef: must be a string or null (never undefined-as-omitted-typo).
    if (
      inputs.previousReleaseRef !== null &&
      typeof inputs.previousReleaseRef !== "string"
    ) {
      return bad("previousReleaseRef is missing or not (string | null).");
    }

    return null;
  }

  private validateArtifactRef(
    ref: ReleaseArtifactRef,
    index: number,
    received: string,
    requestId: string,
  ): ReleaseManagerError | null {
    const at = `artifacts[${index}]`;
    const bad = (message: string) =>
      this.error("INPUTS_MALFORMED", received, requestId, message);

    if (!ref || typeof ref !== "object") {
      return bad(`${at} is missing or not an object.`);
    }
    if (!RELEASE_ARTIFACT_KINDS.includes(ref.kind)) {
      return bad(`${at}.kind is not one of: ${RELEASE_ARTIFACT_KINDS.join(", ")}.`);
    }
    if (typeof ref.id !== "string") {
      return bad(`${at}.id is missing or not a string.`);
    }
    if (typeof ref.version !== "string") {
      return bad(`${at}.version is missing or not a string.`);
    }
    return null;
  }

  // --- 2. Version gate (design "Pipeline" §2, risk R3) --------------------

  private checkContractVersion(
    received: string,
    requestId: string,
  ): ReleaseManagerError | null {
    const supported = this.parseSemVer(RELEASE_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "releaseContractVersion is not a valid MAJOR.MINOR.PATCH version.",
      );
    }
    // Same MAJOR required; MINOR/PATCH forward-compatible within the MAJOR.
    if (got.major !== supported!.major) {
      return this.error(
        "RELEASE_CONTRACT_INCOMPATIBLE",
        received,
        requestId,
        `Incompatible Release Contract Version: supported ${RELEASE_CONTRACT_VERSION}, received ${received}.`,
      );
    }
    return null;
  }

  private parseSemVer(value: string): SemVer | null {
    if (typeof value !== "string") {
      return null;
    }
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!match) {
      return null;
    }
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    };
  }

  // --- 3. Evidence completeness (design "Pipeline" §3, "Invariants" §4) ----
  // Structure is conformant here; absence of any required evidence ⇒ no decision possible.

  private checkEvidenceComplete(
    inputs: ReleaseInputs,
  ): ReleaseManagerError | null {
    const received = inputs.releaseContractVersion;
    const requestId = inputs.requestId;
    const missing = (message: string) =>
      this.error("EVIDENCE_INCOMPLETE", received, requestId, message);

    // All four validation flags must be present booleans.
    const validation = inputs.validation;
    if (typeof validation !== "object" || validation === null) {
      return missing("validation evidence is absent.");
    }
    const flags: ReadonlyArray<keyof ReleaseInputs["validation"]> = [
      "build",
      "typescript",
      "gitClean",
      "missionPipeline",
    ];
    for (const flag of flags) {
      if (typeof validation[flag] !== "boolean") {
        return missing(`validation.${flag} evidence is absent.`);
      }
    }

    // Source provenance must be present.
    const source = inputs.source;
    if (typeof source !== "object" || source === null) {
      return missing("source provenance is absent.");
    }
    if (typeof source.commit !== "string" || source.commit.length === 0) {
      return missing("source.commit evidence is absent.");
    }
    if (typeof source.branch !== "string" || source.branch.length === 0) {
      return missing("source.branch evidence is absent.");
    }

    // Documentation Proof must be present, carrying its inputsHash.
    const proof = inputs.documentationProof;
    if (typeof proof !== "object" || proof === null) {
      return missing("documentationProof evidence is absent.");
    }
    if (typeof proof.inputsHash !== "string" || proof.inputsHash.length === 0) {
      return missing("documentationProof.inputsHash evidence is absent.");
    }

    // At least one artifact must be pinned by a release.
    if (!Array.isArray(inputs.artifacts) || inputs.artifacts.length === 0) {
      return missing("artifacts evidence is absent (no artifact to release).");
    }

    return null;
  }

  // --- 4. Deterministic gate evaluation (design "Pipeline" §4) -------------

  private evaluateGates(inputs: ReleaseInputs): ReleaseGates {
    return {
      build: inputs.validation.build === true,
      typescript: inputs.validation.typescript === true,
      gitClean: inputs.validation.gitClean === true,
      missionPipeline: inputs.validation.missionPipeline === true,
      // Guaranteed present by completeness; recorded as part of the decision basis.
      documentationProofPresent:
        typeof inputs.documentationProof.inputsHash === "string" &&
        inputs.documentationProof.inputsHash.length > 0,
    };
  }

  private allGreen(gates: ReleaseGates): boolean {
    return (
      gates.build &&
      gates.typescript &&
      gates.gitClean &&
      gates.missionPipeline &&
      gates.documentationProofPresent
    );
  }

  // --- Deterministic ordering (design "Invariants" §3, §7) ----------------
  // Stable sort by (kind, id, version) so input order never affects the record.

  private orderArtifacts(artifacts: ReleaseArtifactRef[]): ReleaseArtifactRef[] {
    return [...artifacts]
      .map((ref) => ({ kind: ref.kind, id: ref.id, version: ref.version }))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
        if (a.id !== b.id) return a.id < b.id ? -1 : 1;
        if (a.version !== b.version) return a.version < b.version ? -1 : 1;
        return 0;
      });
  }

  private error(
    code: ReleaseManagerErrorCode,
    received: string,
    requestId: string,
    message: string,
  ): ReleaseManagerError {
    return {
      code,
      supported: RELEASE_CONTRACT_VERSION,
      received,
      requestId,
      message,
    };
  }
}

export { CAPABILITY_NAME };
