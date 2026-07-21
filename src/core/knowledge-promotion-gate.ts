/*
 * Knowledge Promotion Gate — Capability implementation
 *
 * Industrialization layer. Deterministically decides whether a knowledge candidate may be PROMOTED
 * into the durable knowledge base. Promotion requires ALL governance backing:
 *   - Release Manager decision === "RELEASE",
 *   - a sealed Evidence Pack,
 *   - Constitution Compliance == compliant,
 *   - and, when the knowledge is AI-derived, AI Evidence Guard admissibility.
 * Any missing backing is a blocker; promotion is granted iff there are no blockers. Pure, no I/O.
 *
 * Single responsibility: gate promotion. It neither stores knowledge nor produces the backing
 * evidence — it consumes the verdicts of the other industrialization capabilities.
 */

import {
  KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION,
  type KnowledgePromotionDecision,
  type KnowledgePromotionGateDescription,
  type KnowledgePromotionGateError,
  type KnowledgePromotionGateErrorCode,
  type KnowledgePromotionGateResult,
  type KnowledgePromotionInputs,
  type PromotionBlocker,
} from "@/contracts/knowledge-promotion-gate";

const CAPABILITY_NAME = "Knowledge Promotion Gate";
const RELEASE_DECISION = "RELEASE";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class KnowledgePromotionGate {
  describe(): KnowledgePromotionGateDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Governance",
      knowledgePromotionGateContractVersion: KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Decide promotion (deterministic):
   *   1. structural validation   → INPUTS_MALFORMED
   *   2. contract version gate    → KNOWLEDGE_PROMOTION_GATE_CONTRACT_INCOMPATIBLE
   *   3. backing checks            → promote | blocked (as data)
   */
  decide(inputs: KnowledgePromotionInputs): KnowledgePromotionGateResult {
    const received =
      inputs && typeof inputs.knowledgePromotionGateContractVersion === "string"
        ? inputs.knowledgePromotionGateContractVersion
        : "";
    const candidateId =
      inputs && inputs.candidate && typeof inputs.candidate.id === "string" ? inputs.candidate.id : "";

    const malformed = this.validateStructure(inputs, received, candidateId);
    if (malformed) return { ok: false, error: malformed };

    const incompatible = this.checkContractVersion(received, candidateId);
    if (incompatible) return { ok: false, error: incompatible };

    const p = inputs.provenance;
    const blockers: PromotionBlocker[] = [];
    if (p.releaseDecision !== RELEASE_DECISION) blockers.push("NO_RELEASE");
    if (p.evidencePackSealed !== true) blockers.push("EVIDENCE_NOT_SEALED");
    if (p.constitutionCompliant !== true) blockers.push("CONSTITUTION_VIOLATION");
    // AI backing is only demanded when the knowledge is AI-derived; a local mission has no AI to gate.
    if (p.aiDerived === true && p.aiEvidenceAdmissible !== true) blockers.push("AI_EVIDENCE_QUARANTINED");

    const decision: KnowledgePromotionDecision = {
      knowledgePromotionGateContractVersion: KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION,
      candidateId,
      promote: blockers.length === 0,
      blockers,
    };
    return { ok: true, decision };
  }

  // --- validation ---------------------------------------------------------

  private validateStructure(
    inputs: KnowledgePromotionInputs,
    received: string,
    candidateId: string,
  ): KnowledgePromotionGateError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", received, candidateId, message);

    if (!inputs || typeof inputs !== "object") return bad("KnowledgePromotionInputs is missing or not an object.");
    if (typeof inputs.knowledgePromotionGateContractVersion !== "string") return bad("knowledgePromotionGateContractVersion is missing or not a string.");

    const c = inputs.candidate;
    if (typeof c !== "object" || c === null) return bad("candidate is missing or not an object.");
    if (typeof c.id !== "string" || c.id.length === 0) return bad("candidate.id is missing or empty.");
    if (typeof c.statement !== "string" || c.statement.length === 0) return bad("candidate.statement is missing or empty.");
    if (typeof c.sourceMission !== "string" || c.sourceMission.length === 0) return bad("candidate.sourceMission is missing or empty.");

    const p = inputs.provenance;
    if (typeof p !== "object" || p === null) return bad("provenance is missing or not an object.");
    if (typeof p.releaseDecision !== "string" || p.releaseDecision.length === 0) return bad("provenance.releaseDecision is missing or empty.");
    if (typeof p.evidencePackSealed !== "boolean") return bad("provenance.evidencePackSealed is missing or not a boolean.");
    if (typeof p.constitutionCompliant !== "boolean") return bad("provenance.constitutionCompliant is missing or not a boolean.");
    if (typeof p.aiDerived !== "boolean") return bad("provenance.aiDerived is missing or not a boolean.");
    if (p.aiEvidenceAdmissible !== undefined && typeof p.aiEvidenceAdmissible !== "boolean") {
      return bad("provenance.aiEvidenceAdmissible is present but not a boolean.");
    }
    return null;
  }

  private checkContractVersion(received: string, candidateId: string): KnowledgePromotionGateError | null {
    const supported = this.parseSemVer(KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, candidateId, "knowledgePromotionGateContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "KNOWLEDGE_PROMOTION_GATE_CONTRACT_INCOMPATIBLE",
        received,
        candidateId,
        `Incompatible Knowledge Promotion Gate Contract Version: supported ${KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION}, received ${received}.`,
      );
    }
    return null;
  }

  private parseSemVer(value: string): SemVer | null {
    if (typeof value !== "string") return null;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  }

  private error(
    code: KnowledgePromotionGateErrorCode,
    received: string,
    candidateId: string,
    message: string,
  ): KnowledgePromotionGateError {
    return { code, supported: KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION, received, candidateId, message };
  }
}

export { CAPABILITY_NAME };
