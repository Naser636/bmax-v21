/*
 * Release Manager — Contracts
 *
 * Frozen contract surface for RELEASE_MANAGER_DESIGN_v1.md (Release Contract Version 1.0.0).
 * These types are the ONLY coupling between the Runtime and the Release Manager.
 * The capability consumes ReleaseInputs and nothing else — no paths, no I/O
 * (design "Contrats d'entrée", "Non-responsabilités").
 *
 * Founding invariant: the Release Manager never judges software quality. It certifies only
 * that a complete set of conformant evidence permits a RELEASE or NO_RELEASE decision.
 */

import type { DocumentationProof } from "@/contracts/documentation";

/** Release Contract Version supported by this build of the capability (design "Pipeline" §2). */
export const RELEASE_CONTRACT_VERSION = "1.0.0";

/** Kinds of artifact a release may pin (design "ReleaseArtifactRef"). */
export type ReleaseArtifactKind =
  | "certificate"
  | "passport"
  | "report"
  | "generated"
  | "documentation"
  | "proof";

/** A reference to an artifact included in a release — ids/refs only, never a path. */
export interface ReleaseArtifactRef {
  kind: ReleaseArtifactKind;
  id: string;
  version: string;
}

/**
 * Boolean validation gates supplied by the Runtime (design "ValidationEvidence").
 * `build` / `typescript` / `gitClean` originate from `runtime/bin/odg-verify.js`;
 * `missionPipeline` from the ODG mission pipeline. The capability never runs them.
 */
export interface ValidationEvidence {
  build: boolean;
  typescript: boolean;
  gitClean: boolean;
  missionPipeline: boolean;
}

/** Release provenance, echoed by the capability — never derived (design "ReleaseInputs"). */
export interface ReleaseSource {
  commit: string;
  branch: string;
}

/**
 * Abstract input contract supplied by the Runtime (design "Contrats d'entrée").
 * The Runtime owns storage and execution; the capability receives loaded evidence only
 * and reuses the frozen `DocumentationProof` contract as release evidence.
 */
export interface ReleaseInputs {
  releaseContractVersion: string;
  requestId: string;
  validation: ValidationEvidence;
  source: ReleaseSource;
  documentationProof: DocumentationProof;
  artifacts: ReleaseArtifactRef[];
  previousReleaseRef: string | null;
}

/** Deterministic release decision (design "Contrats de sortie"). */
export type ReleaseDecision = "RELEASE" | "NO_RELEASE";

/** Per-gate evidence result pinned into the record (design "ReleaseGates"). */
export interface ReleaseGates {
  build: boolean;
  typescript: boolean;
  gitClean: boolean;
  missionPipeline: boolean;
  documentationProofPresent: boolean;
}

/**
 * Immutable, versioned release record (design "ReleaseRecord").
 * The capability stamps no time, commit, hash or version of its own — those are
 * Runtime-supplied metadata echoed here (design "Non-responsabilités").
 */
export interface ReleaseRecord {
  releaseContractVersion: string;
  requestId: string;
  decision: ReleaseDecision;
  gates: ReleaseGates;
  included: ReleaseArtifactRef[];
  proofHash: string;
  source: ReleaseSource;
  rollbackRef: string | null;
}

/** Explicit, auditable failure codes (design "ReleaseManagerError"). */
export type ReleaseManagerErrorCode =
  | "RELEASE_CONTRACT_INCOMPATIBLE"
  | "INPUTS_MALFORMED"
  | "EVIDENCE_INCOMPLETE";

/** Error surfaced as data, never as a thrown narrative (design "Responsabilités"). */
export interface ReleaseManagerError {
  code: ReleaseManagerErrorCode;
  supported: string;
  received: string;
  requestId: string;
  message: string;
}

/** A decision was possible: complete, conformant evidence yielded a certified record. */
export interface ReleaseManagerSuccess {
  ok: true;
  record: ReleaseRecord;
}

/** No decision was possible: incompatible, malformed or incomplete evidence. */
export interface ReleaseManagerFailure {
  ok: false;
  error: ReleaseManagerError;
}

export type ReleaseManagerResult =
  | ReleaseManagerSuccess
  | ReleaseManagerFailure;

/** Static description of the capability (design "Invariants" §1). */
export interface ReleaseManagerDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  releaseContractVersion: string;
  status: string;
}
