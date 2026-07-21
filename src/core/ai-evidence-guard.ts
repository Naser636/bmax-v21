/*
 * AI Evidence Guard — Capability implementation
 *
 * Industrialization layer. Deterministically decides whether AI-provider-produced evidence is
 * ADMISSIBLE. It is admissible ONLY when:
 *   - the provider classification is "OK", AND
 *   - independent verification is green (build && typescript && gitClean), AND
 *   - every file the provider claims to have changed is within the mission's authorized scope.
 * Any failing condition quarantines the evidence with an explicit reason. Pure, no I/O.
 *
 * Single responsibility: gate AI evidence admissibility. It does not run the verifier or the
 * provider — it judges already-collected signals.
 */

import {
  AI_EVIDENCE_GUARD_CONTRACT_VERSION,
  type AiEvidenceGuardDescription,
  type AiEvidenceGuardError,
  type AiEvidenceGuardErrorCode,
  type AiEvidenceGuardInputs,
  type AiEvidenceGuardResult,
  type AiEvidenceVerdict,
  type QuarantineReason,
} from "@/contracts/ai-evidence-guard";

const CAPABILITY_NAME = "AI Evidence Guard";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class AiEvidenceGuard {
  describe(): AiEvidenceGuardDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Governance",
      aiEvidenceGuardContractVersion: AI_EVIDENCE_GUARD_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Judge admissibility (deterministic):
   *   1. structural validation   → INPUTS_MALFORMED
   *   2. contract version gate    → AI_EVIDENCE_GUARD_CONTRACT_INCOMPATIBLE
   *   3. corroboration checks      → admissible | quarantined (as data)
   */
  guard(inputs: AiEvidenceGuardInputs): AiEvidenceGuardResult {
    const received =
      inputs && typeof inputs.aiEvidenceGuardContractVersion === "string"
        ? inputs.aiEvidenceGuardContractVersion
        : "";
    const mission = inputs && typeof inputs.mission === "string" ? inputs.mission : "";

    const malformed = this.validateStructure(inputs, received, mission);
    if (malformed) return { ok: false, error: malformed };

    const incompatible = this.checkContractVersion(received, mission);
    if (incompatible) return { ok: false, error: incompatible };

    const reasons: QuarantineReason[] = [];
    if (inputs.provider.classification !== "OK") reasons.push("PROVIDER_NOT_OK");
    if (inputs.verification.build !== true) reasons.push("BUILD_NOT_GREEN");
    if (inputs.verification.typescript !== true) reasons.push("TYPESCRIPT_NOT_GREEN");
    if (inputs.verification.gitClean !== true) reasons.push("GIT_NOT_CLEAN");

    // Every claimed change must be inside the authorized scope. Sorted for deterministic output.
    const outOfScope = inputs.provider.changedFiles
      .filter((f) => !this.inScope(f, inputs.authorizedPaths))
      .sort();
    if (outOfScope.length > 0) reasons.push("OUT_OF_SCOPE_WRITE");

    const verdict: AiEvidenceVerdict = {
      aiEvidenceGuardContractVersion: AI_EVIDENCE_GUARD_CONTRACT_VERSION,
      mission,
      admissible: reasons.length === 0,
      reasons,
      outOfScope,
    };
    return { ok: true, verdict };
  }

  // --- scope matching -----------------------------------------------------

  /**
   * A file is in scope if it matches any authorized entry. Supported forms (deterministic, no globs
   * beyond a trailing `/**`): exact match, `dir/**` (any file under dir), or a plain prefix ending
   * in `/` (any file under that directory). Empty authorized set ⇒ nothing is in scope.
   */
  private inScope(file: string, authorized: string[]): boolean {
    for (const raw of authorized) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      if (entry === file) return true;
      if (entry.endsWith("/**")) {
        const base = entry.slice(0, -2); // keep trailing "/"
        if (file.startsWith(base)) return true;
      } else if (entry.endsWith("/")) {
        if (file.startsWith(entry)) return true;
      }
    }
    return false;
  }

  // --- validation ---------------------------------------------------------

  private validateStructure(
    inputs: AiEvidenceGuardInputs,
    received: string,
    mission: string,
  ): AiEvidenceGuardError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", received, mission, message);

    if (!inputs || typeof inputs !== "object") return bad("AiEvidenceGuardInputs is missing or not an object.");
    if (typeof inputs.aiEvidenceGuardContractVersion !== "string") return bad("aiEvidenceGuardContractVersion is missing or not a string.");
    if (typeof inputs.mission !== "string" || inputs.mission.length === 0) return bad("mission is missing or empty.");

    const p = inputs.provider;
    if (typeof p !== "object" || p === null) return bad("provider is missing or not an object.");
    if (typeof p.classification !== "string" || p.classification.length === 0) return bad("provider.classification is missing or empty.");
    if (!Array.isArray(p.changedFiles) || !p.changedFiles.every((f) => typeof f === "string")) {
      return bad("provider.changedFiles must be an array of strings.");
    }

    const v = inputs.verification;
    if (typeof v !== "object" || v === null) return bad("verification is missing or not an object.");
    for (const flag of ["build", "typescript", "gitClean"] as const) {
      if (v[flag] !== undefined && typeof v[flag] !== "boolean") return bad(`verification.${flag} is present but not a boolean.`);
    }

    if (!Array.isArray(inputs.authorizedPaths) || !inputs.authorizedPaths.every((s) => typeof s === "string")) {
      return bad("authorizedPaths must be an array of strings.");
    }
    return null;
  }

  private checkContractVersion(received: string, mission: string): AiEvidenceGuardError | null {
    const supported = this.parseSemVer(AI_EVIDENCE_GUARD_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, mission, "aiEvidenceGuardContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "AI_EVIDENCE_GUARD_CONTRACT_INCOMPATIBLE",
        received,
        mission,
        `Incompatible AI Evidence Guard Contract Version: supported ${AI_EVIDENCE_GUARD_CONTRACT_VERSION}, received ${received}.`,
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
    code: AiEvidenceGuardErrorCode,
    received: string,
    mission: string,
    message: string,
  ): AiEvidenceGuardError {
    return { code, supported: AI_EVIDENCE_GUARD_CONTRACT_VERSION, received, mission, message };
  }
}

export { CAPABILITY_NAME };
