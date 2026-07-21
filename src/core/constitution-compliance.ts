/*
 * Constitution Compliance — Capability implementation
 *
 * Industrialization layer. Deterministically checks a subject (mission / action) against the frozen
 * constitution principles: it is compliant iff EVERY principle carries an explicit `true` attestation
 * (EVIDENCE_REQUIRED). A missing attestation ⇒ NOT_ATTESTED; an explicit `false` ⇒ ATTESTED_FALSE.
 * Pure, no I/O, error-as-data.
 *
 * Single responsibility: evaluate compliance. It does not gather attestations and does not decide
 * releases — it only certifies conformance to the constitution.
 */

import {
  CONSTITUTION_COMPLIANCE_CONTRACT_VERSION,
  CONSTITUTION_PRINCIPLES,
  type ConstitutionComplianceDescription,
  type ConstitutionComplianceError,
  type ConstitutionComplianceErrorCode,
  type ConstitutionComplianceInputs,
  type ConstitutionComplianceResult,
  type ConstitutionPrinciple,
  type ConstitutionViolation,
} from "@/contracts/constitution-compliance";

const CAPABILITY_NAME = "Constitution Compliance";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class ConstitutionCompliance {
  describe(): ConstitutionComplianceDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Governance",
      constitutionComplianceContractVersion: CONSTITUTION_COMPLIANCE_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Evaluate compliance (deterministic):
   *   1. structural validation   → INPUTS_MALFORMED
   *   2. contract version gate    → CONSTITUTION_COMPLIANCE_CONTRACT_INCOMPATIBLE
   *   3. per-principle evaluation over the FROZEN principle set (constitution order)
   */
  evaluate(inputs: ConstitutionComplianceInputs): ConstitutionComplianceResult {
    const received =
      inputs && typeof inputs.constitutionComplianceContractVersion === "string"
        ? inputs.constitutionComplianceContractVersion
        : "";
    const subject = inputs && typeof inputs.subject === "string" ? inputs.subject : "";

    const malformed = this.validateStructure(inputs, received, subject);
    if (malformed) return { ok: false, error: malformed };

    const incompatible = this.checkContractVersion(received, subject);
    if (incompatible) return { ok: false, error: incompatible };

    const violations: ConstitutionViolation[] = [];
    // Iterate the FROZEN principle set in constitution order — the attestations object cannot add,
    // remove or reorder principles, so the check is total and deterministic.
    for (const principle of CONSTITUTION_PRINCIPLES) {
      const value = inputs.attestations[principle as ConstitutionPrinciple];
      if (value === undefined) {
        violations.push({ principle, reason: "NOT_ATTESTED" });
      } else if (value !== true) {
        violations.push({ principle, reason: "ATTESTED_FALSE" });
      }
    }

    return {
      ok: true,
      report: {
        constitutionComplianceContractVersion: CONSTITUTION_COMPLIANCE_CONTRACT_VERSION,
        subject,
        compliant: violations.length === 0,
        checked: [...CONSTITUTION_PRINCIPLES],
        violations,
      },
    };
  }

  // --- validation ---------------------------------------------------------

  private validateStructure(
    inputs: ConstitutionComplianceInputs,
    received: string,
    subject: string,
  ): ConstitutionComplianceError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", received, subject, message);

    if (!inputs || typeof inputs !== "object") return bad("ConstitutionComplianceInputs is missing or not an object.");
    if (typeof inputs.constitutionComplianceContractVersion !== "string") return bad("constitutionComplianceContractVersion is missing or not a string.");
    if (typeof inputs.subject !== "string" || inputs.subject.length === 0) return bad("subject is missing or empty.");
    if (typeof inputs.attestations !== "object" || inputs.attestations === null || Array.isArray(inputs.attestations)) {
      return bad("attestations is missing or not an object.");
    }
    // Each provided attestation must be a boolean; keys outside the frozen set are ignored, but a
    // wrong TYPE on a recognised key is a malformation (distinct from a false attestation).
    for (const principle of CONSTITUTION_PRINCIPLES) {
      const value = inputs.attestations[principle as ConstitutionPrinciple];
      if (value !== undefined && typeof value !== "boolean") {
        return bad(`attestations.${principle} is present but not a boolean.`);
      }
    }
    return null;
  }

  private checkContractVersion(received: string, subject: string): ConstitutionComplianceError | null {
    const supported = this.parseSemVer(CONSTITUTION_COMPLIANCE_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, subject, "constitutionComplianceContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "CONSTITUTION_COMPLIANCE_CONTRACT_INCOMPATIBLE",
        received,
        subject,
        `Incompatible Constitution Compliance Contract Version: supported ${CONSTITUTION_COMPLIANCE_CONTRACT_VERSION}, received ${received}.`,
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
    code: ConstitutionComplianceErrorCode,
    received: string,
    subject: string,
    message: string,
  ): ConstitutionComplianceError {
    return { code, supported: CONSTITUTION_COMPLIANCE_CONTRACT_VERSION, received, subject, message };
  }
}

export { CAPABILITY_NAME };
