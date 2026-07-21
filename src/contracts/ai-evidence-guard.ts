/*
 * AI Evidence Guard — Contracts
 *
 * Frozen contract surface for the AI Evidence Guard capability (Contract Version 1.0.0), part of the
 * Runtime industrialization layer.
 *
 * Founding invariant: evidence PRODUCED BY an AI provider is never self-certifying. It is ADMISSIBLE
 * only when corroborated by INDEPENDENT verification (build / typescript / gitClean green) AND the
 * provider's writes stayed within the mission's authorized scope. Otherwise it is QUARANTINED with
 * explicit reasons. Pure, deterministic, no I/O.
 */

export const AI_EVIDENCE_GUARD_CONTRACT_VERSION = "1.0.0";

/** The provider's own report of what it did — treated as UNTRUSTED claims until corroborated. */
export interface AiProviderClaim {
  classification: string; // "OK" | "ERROR" | "TIMEOUT" | ...
  changedFiles: string[];
}

/** Independent, non-AI verification of the working tree after the provider ran. */
export interface IndependentVerification {
  build?: boolean;
  typescript?: boolean;
  gitClean?: boolean;
}

export interface AiEvidenceGuardInputs {
  aiEvidenceGuardContractVersion: string;
  mission: string;
  provider: AiProviderClaim;
  verification: IndependentVerification;
  /** Write scope the mission authorized. A change outside it is a scope breach. */
  authorizedPaths: string[];
}

export type QuarantineReason =
  | "PROVIDER_NOT_OK"
  | "BUILD_NOT_GREEN"
  | "TYPESCRIPT_NOT_GREEN"
  | "GIT_NOT_CLEAN"
  | "OUT_OF_SCOPE_WRITE";

export interface AiEvidenceVerdict {
  aiEvidenceGuardContractVersion: string;
  mission: string;
  admissible: boolean;
  reasons: QuarantineReason[];
  /** Files the provider claimed to change that fell OUTSIDE the authorized scope. */
  outOfScope: string[];
}

export type AiEvidenceGuardErrorCode =
  | "INPUTS_MALFORMED"
  | "AI_EVIDENCE_GUARD_CONTRACT_INCOMPATIBLE";

export interface AiEvidenceGuardError {
  code: AiEvidenceGuardErrorCode;
  supported: string;
  received: string;
  mission: string;
  message: string;
}

export type AiEvidenceGuardResult =
  | { ok: true; verdict: AiEvidenceVerdict }
  | { ok: false; error: AiEvidenceGuardError };

export interface AiEvidenceGuardDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  aiEvidenceGuardContractVersion: string;
  status: "READY";
}
