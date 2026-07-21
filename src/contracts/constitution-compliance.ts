/*
 * Constitution Compliance — Contracts
 *
 * Frozen contract surface for the Constitution Compliance capability (Contract Version 1.0.0),
 * part of the Runtime industrialization layer.
 *
 * The canonical principle set mirrors runtime/constitution/runtime-constitution.json (version 1).
 * Founding invariant: compliance requires an EXPLICIT positive attestation for EVERY principle
 * (EVIDENCE_REQUIRED) — a missing or false attestation is a violation. Pure, deterministic, no I/O.
 */

export const CONSTITUTION_COMPLIANCE_CONTRACT_VERSION = "1.0.0";

/** The frozen constitution principles (runtime-constitution.json v1). */
export const CONSTITUTION_PRINCIPLES = [
  "DETERMINISM_FIRST",
  "REUSE_BEFORE_CREATE",
  "EVIDENCE_REQUIRED",
  "ONE_RESPONSIBILITY_PER_COMPONENT",
  "ARTIFACTS_ARE_IMMUTABLE",
  "ROLLBACK_MUST_ALWAYS_BE_POSSIBLE",
  "PIPELINE_IS_REPRODUCIBLE",
] as const;

export type ConstitutionPrinciple = (typeof CONSTITUTION_PRINCIPLES)[number];

export interface ConstitutionComplianceInputs {
  constitutionComplianceContractVersion: string;
  /** Mission / action under evaluation. */
  subject: string;
  /** Explicit attestation per principle. Missing ⇒ treated as not attested ⇒ violation. */
  attestations: Partial<Record<ConstitutionPrinciple, boolean>>;
}

export interface ConstitutionViolation {
  principle: ConstitutionPrinciple;
  reason: "NOT_ATTESTED" | "ATTESTED_FALSE";
}

export interface ConstitutionComplianceReport {
  constitutionComplianceContractVersion: string;
  subject: string;
  compliant: boolean;
  checked: ConstitutionPrinciple[];
  violations: ConstitutionViolation[];
}

export type ConstitutionComplianceErrorCode =
  | "INPUTS_MALFORMED"
  | "CONSTITUTION_COMPLIANCE_CONTRACT_INCOMPATIBLE";

export interface ConstitutionComplianceError {
  code: ConstitutionComplianceErrorCode;
  supported: string;
  received: string;
  subject: string;
  message: string;
}

export type ConstitutionComplianceResult =
  | { ok: true; report: ConstitutionComplianceReport }
  | { ok: false; error: ConstitutionComplianceError };

export interface ConstitutionComplianceDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  constitutionComplianceContractVersion: string;
  status: "READY";
}
