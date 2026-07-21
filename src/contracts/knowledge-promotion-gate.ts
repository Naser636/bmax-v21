/*
 * Knowledge Promotion Gate — Contracts
 *
 * Frozen contract surface for the Knowledge Promotion Gate capability (Contract Version 1.0.0),
 * part of the Runtime industrialization layer.
 *
 * Founding invariant: knowledge is PROMOTED into the durable knowledge base ONLY when it is fully
 * backed by governance evidence — a RELEASE decision, a sealed Evidence Pack, constitution
 * compliance, and (when the knowledge is AI-derived) admissible AI evidence. Any missing backing is
 * a blocker. Pure, deterministic, no I/O.
 */

export const KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION = "1.0.0";

export interface KnowledgeCandidate {
  id: string;
  statement: string;
  sourceMission: string;
}

/** Governance backing for the candidate — the outputs of the other industrialization capabilities. */
export interface KnowledgeProvenance {
  /** Release Manager decision for the source mission. */
  releaseDecision: string; // "RELEASE" | "NO_RELEASE" | ...
  /** Whether an Evidence Pack was sealed complete for the source mission. */
  evidencePackSealed: boolean;
  /** Whether Constitution Compliance reported compliant. */
  constitutionCompliant: boolean;
  /** Whether the knowledge derives from an AI provider's work. */
  aiDerived: boolean;
  /** Required when aiDerived: whether AI Evidence Guard deemed the evidence admissible. */
  aiEvidenceAdmissible?: boolean;
}

export interface KnowledgePromotionInputs {
  knowledgePromotionGateContractVersion: string;
  candidate: KnowledgeCandidate;
  provenance: KnowledgeProvenance;
}

export type PromotionBlocker =
  | "NO_RELEASE"
  | "EVIDENCE_NOT_SEALED"
  | "CONSTITUTION_VIOLATION"
  | "AI_EVIDENCE_QUARANTINED";

export interface KnowledgePromotionDecision {
  knowledgePromotionGateContractVersion: string;
  candidateId: string;
  promote: boolean;
  blockers: PromotionBlocker[];
}

export type KnowledgePromotionGateErrorCode =
  | "INPUTS_MALFORMED"
  | "KNOWLEDGE_PROMOTION_GATE_CONTRACT_INCOMPATIBLE";

export interface KnowledgePromotionGateError {
  code: KnowledgePromotionGateErrorCode;
  supported: string;
  received: string;
  candidateId: string;
  message: string;
}

export type KnowledgePromotionGateResult =
  | { ok: true; decision: KnowledgePromotionDecision }
  | { ok: false; error: KnowledgePromotionGateError };

export interface KnowledgePromotionGateDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  knowledgePromotionGateContractVersion: string;
  status: "READY";
}
