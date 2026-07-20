/*
 * Documentation Engine — Contracts
 *
 * Frozen contract surface for DOCUMENTATION_ENGINE_SPEC_v1.md (Artifact Contract Version 1.0.0).
 * These types are the ONLY coupling between the Runtime and the Documentation Engine.
 * The engine consumes DocumentationInputs and nothing else — no paths, no I/O (spec §2).
 */

/** Artifact Contract Version supported by this build of the engine (spec §3). */
export const ARTIFACT_CONTRACT_VERSION = "1.0.0";

/** Kinds of Runtime artifact the engine can project (spec §2.1). */
export type ArtifactKind = "certificate" | "passport" | "report" | "generated";

/**
 * A single, already-materialized Runtime artifact.
 * `payload` is structured, pre-parsed data — never a path (spec §2.1).
 */
export interface Artifact {
  kind: ArtifactKind;
  id: string;
  version: string;
  payload: Record<string, unknown>;
}

/**
 * Abstract input contract supplied by the Runtime (spec §2.1).
 * The Runtime owns storage; the engine receives loaded artifacts only.
 */
export interface DocumentationInputs {
  artifactContractVersion: string;
  artifacts: Artifact[];
  requestId: string;
}

/** Human-readable projection of the artifacts (spec §4). */
export interface Documentation {
  artifactContractVersion: string;
  content: string;
}

/**
 * Technical, auditable proof of the projection (spec §4).
 * Independent of Documentation: derived purely from the input artifacts so an
 * auditor can re-derive the Documentation deterministically from the same inputs.
 */
export interface DocumentationProof {
  artifactContractVersion: string;
  requestId: string;
  artifactCount: number;
  artifacts: Array<{
    kind: ArtifactKind;
    id: string;
    version: string;
    hash: string;
  }>;
  inputsHash: string;
}

/** Explicit, auditable failure codes (spec §3.1). */
export type DocumentationEngineErrorCode =
  | "ARTIFACT_CONTRACT_INCOMPATIBLE"
  | "INPUTS_MALFORMED"
  | "PROJECTION_NON_DETERMINISTIC";

/** Error surfaced as data, never as a thrown narrative (spec §3.1, §7). */
export interface DocumentationEngineError {
  code: DocumentationEngineErrorCode;
  supported: string;
  received: string;
  requestId: string;
  message: string;
}

/** Successful projection: two independent outputs from the same artifacts (spec §4). */
export interface DocumentationGenerationSuccess {
  ok: true;
  documentation: Documentation;
  proof: DocumentationProof;
}

/** Failed projection: no output produced, explicit error (spec §3). */
export interface DocumentationGenerationFailure {
  ok: false;
  error: DocumentationEngineError;
}

export type DocumentationGenerationResult =
  | DocumentationGenerationSuccess
  | DocumentationGenerationFailure;

/** Static description of the capability (spec §7). */
export interface DocumentationEngineDescription {
  name: string;
  class: "capability";
  owner: "Observability";
  artifactContractVersion: string;
  status: string;
}
