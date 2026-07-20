/*
 * Documentation Engine — Capability implementation
 *
 * Implements DOCUMENTATION_ENGINE_SPEC_v1.md (FROZEN, Artifact Contract Version 1.0.0).
 * Classification: Capability (not an engine), owned by Observability (spec §0, §7).
 *
 * Single responsibility (spec §1): deterministic projection of Runtime artifacts into
 * Documentation and an independent Documentation Proof. It owns no storage and performs
 * no I/O — inputs are supplied, outputs are returned in memory (spec §2).
 *
 * Invariant (spec §5): the engine never decides, interprets, reformulates or summarizes.
 * `generate` is a pure, total function of its inputs — no clocks, randomness, locale or
 * environment may enter the projection, so identical inputs yield byte-identical outputs.
 */

import {
  ARTIFACT_CONTRACT_VERSION,
  type Artifact,
  type ArtifactKind,
  type Documentation,
  type DocumentationEngineDescription,
  type DocumentationEngineError,
  type DocumentationEngineErrorCode,
  type DocumentationGenerationResult,
  type DocumentationInputs,
  type DocumentationProof,
} from "@/contracts/documentation";

const CAPABILITY_NAME = "Documentation Engine";
const ARTIFACT_KINDS: ReadonlyArray<ArtifactKind> = [
  "certificate",
  "passport",
  "report",
  "generated",
];

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class DocumentationEngine {
  /** Static description of the capability (spec §7). */
  describe(): DocumentationEngineDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Observability",
      artifactContractVersion: ARTIFACT_CONTRACT_VERSION,
      status: "READY",
    };
  }

  /** No I/O; the Runtime supplies inputs and persists outputs (spec §2, §7). */
  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Pure, total projection over valid, version-compatible inputs (spec §7).
   * Returns two independent outputs on success, or an explicit error-as-data on failure.
   */
  generate(inputs: DocumentationInputs): DocumentationGenerationResult {
    const requestId =
      typeof inputs?.requestId === "string" ? inputs.requestId : "";

    // 1. Structural validation (spec §3.1 INPUTS_MALFORMED).
    const malformed = this.validateInputs(inputs);
    if (malformed) {
      return { ok: false, error: malformed };
    }

    // 2. Artifact Contract Version compatibility gate — before ANY generation (spec §3).
    const incompatible = this.checkContractVersion(
      inputs.artifactContractVersion,
      requestId,
    );
    if (incompatible) {
      return { ok: false, error: incompatible };
    }

    // 3. Deterministic projection (spec §4, §5). Guarded so non-deterministic /
    //    non-serializable payloads fail explicitly rather than leak interpretation.
    try {
      const documentation = this.projectDocumentation(inputs);
      const proof = this.projectProof(inputs);
      return { ok: true, documentation, proof };
    } catch {
      return {
        ok: false,
        error: this.error(
          "PROJECTION_NON_DETERMINISTIC",
          inputs.artifactContractVersion,
          requestId,
          "Artifact payload is not deterministically serializable; projection refused.",
        ),
      };
    }
  }

  // --- Validation ---------------------------------------------------------

  private validateInputs(
    inputs: DocumentationInputs,
  ): DocumentationEngineError | null {
    const received =
      inputs && typeof inputs.artifactContractVersion === "string"
        ? inputs.artifactContractVersion
        : "";
    const requestId =
      inputs && typeof inputs.requestId === "string" ? inputs.requestId : "";

    if (!inputs || typeof inputs !== "object") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "DocumentationInputs is missing or not an object.",
      );
    }
    if (typeof inputs.artifactContractVersion !== "string") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "artifactContractVersion is missing or not a string.",
      );
    }
    if (typeof inputs.requestId !== "string") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "requestId is missing or not a string.",
      );
    }
    if (!Array.isArray(inputs.artifacts)) {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "artifacts is missing or not an array.",
      );
    }
    for (let i = 0; i < inputs.artifacts.length; i++) {
      const a = inputs.artifacts[i];
      const bad = this.validateArtifact(a, i, received, requestId);
      if (bad) {
        return bad;
      }
    }
    return null;
  }

  private validateArtifact(
    artifact: Artifact,
    index: number,
    received: string,
    requestId: string,
  ): DocumentationEngineError | null {
    const at = `artifacts[${index}]`;
    if (!artifact || typeof artifact !== "object") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        `${at} is missing or not an object.`,
      );
    }
    if (!ARTIFACT_KINDS.includes(artifact.kind)) {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        `${at}.kind is not one of: ${ARTIFACT_KINDS.join(", ")}.`,
      );
    }
    if (typeof artifact.id !== "string") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        `${at}.id is missing or not a string.`,
      );
    }
    if (typeof artifact.version !== "string") {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        `${at}.version is missing or not a string.`,
      );
    }
    if (
      !artifact.payload ||
      typeof artifact.payload !== "object" ||
      Array.isArray(artifact.payload)
    ) {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        `${at}.payload is missing or not an object.`,
      );
    }
    return null;
  }

  // --- Version gate (spec §3) ---------------------------------------------

  private checkContractVersion(
    received: string,
    requestId: string,
  ): DocumentationEngineError | null {
    const supported = this.parseSemVer(ARTIFACT_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error(
        "INPUTS_MALFORMED",
        received,
        requestId,
        "artifactContractVersion is not a valid MAJOR.MINOR.PATCH version.",
      );
    }
    // Same MAJOR required; MINOR/PATCH forward-compatible within the MAJOR (spec §3).
    if (got.major !== supported!.major) {
      return this.error(
        "ARTIFACT_CONTRACT_INCOMPATIBLE",
        received,
        requestId,
        `Incompatible Artifact Contract Version: supported ${ARTIFACT_CONTRACT_VERSION}, received ${received}.`,
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

  // --- Projection: Documentation (spec §4, §5) ----------------------------

  private projectDocumentation(inputs: DocumentationInputs): Documentation {
    const lines: string[] = [];
    lines.push("# Documentation");
    lines.push("");
    lines.push(`- Artifact Contract Version: ${inputs.artifactContractVersion}`);
    lines.push(`- Request: ${inputs.requestId}`);
    lines.push(`- Artifacts: ${inputs.artifacts.length}`);
    lines.push("");

    // Deterministic ordering: stable sort by (kind, id, version). No reordering by
    // content, no interpretation — a faithful, reconstructible projection.
    const ordered = this.orderArtifacts(inputs.artifacts);
    for (const artifact of ordered) {
      lines.push(`## ${artifact.kind}:${artifact.id}`);
      lines.push("");
      lines.push(`- version: ${artifact.version}`);
      lines.push("");
      lines.push("```json");
      lines.push(this.canonicalize(artifact.payload));
      lines.push("```");
      lines.push("");
    }

    return {
      artifactContractVersion: inputs.artifactContractVersion,
      content: lines.join("\n"),
    };
  }

  // --- Projection: Documentation Proof (spec §4) --------------------------
  // Derived purely from inputs — never reads the Documentation output.

  private projectProof(inputs: DocumentationInputs): DocumentationProof {
    const ordered = this.orderArtifacts(inputs.artifacts);
    return {
      artifactContractVersion: inputs.artifactContractVersion,
      requestId: inputs.requestId,
      artifactCount: inputs.artifacts.length,
      artifacts: ordered.map((artifact) => ({
        kind: artifact.kind,
        id: artifact.id,
        version: artifact.version,
        hash: this.hash(
          this.canonicalize({
            kind: artifact.kind,
            id: artifact.id,
            version: artifact.version,
            payload: artifact.payload,
          }),
        ),
      })),
      inputsHash: this.hash(
        this.canonicalize({
          artifactContractVersion: inputs.artifactContractVersion,
          requestId: inputs.requestId,
          artifacts: ordered,
        }),
      ),
    };
  }

  private orderArtifacts(artifacts: Artifact[]): Artifact[] {
    return [...artifacts].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      if (a.version !== b.version) return a.version < b.version ? -1 : 1;
      return 0;
    });
  }

  // --- Deterministic primitives -------------------------------------------

  /**
   * Canonical, key-sorted JSON. Throws on values that cannot be projected
   * deterministically (functions, undefined, symbols, circular refs) so the
   * caller can fail with PROJECTION_NON_DETERMINISTIC instead of guessing.
   */
  private canonicalize(value: unknown): string {
    return this.encode(value, new WeakSet<object>());
  }

  private encode(value: unknown, seen: WeakSet<object>): string {
    if (value === null) return "null";
    const type = typeof value;
    if (type === "number") {
      if (!Number.isFinite(value as number)) {
        throw new Error("non-finite number");
      }
      return JSON.stringify(value);
    }
    if (type === "boolean" || type === "string") {
      return JSON.stringify(value);
    }
    if (type === "function" || type === "undefined" || type === "symbol" || type === "bigint") {
      throw new Error(`non-deterministic value of type ${type}`);
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) throw new Error("circular reference");
      seen.add(value);
      const parts = value.map((item) => this.encode(item, seen));
      seen.delete(value);
      return `[${parts.join(",")}]`;
    }
    if (type === "object") {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) throw new Error("circular reference");
      seen.add(obj);
      const keys = Object.keys(obj).sort();
      const parts = keys.map(
        (key) => `${JSON.stringify(key)}:${this.encode(obj[key], seen)}`,
      );
      seen.delete(obj);
      return `{${parts.join(",")}}`;
    }
    throw new Error(`unsupported value of type ${type}`);
  }

  /** Deterministic, environment-independent content hash (FNV-1a, 64-bit). */
  private hash(input: string): string {
    let hashHigh = 0xcbf29ce4 >>> 0;
    let hashLow = 0x84222325 >>> 0;
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      hashLow ^= code;
      // 64-bit multiply by FNV prime 0x100000001b3, split into 32-bit halves.
      const primeLow = 0x000001b3;
      const primeHigh = 0x00000100;
      const ll = hashLow * primeLow;
      const lh = hashLow * primeHigh;
      const hl = hashHigh * primeLow;
      const carry = Math.floor(ll / 0x100000000);
      hashLow = ll >>> 0;
      hashHigh = ((lh + hl + carry) & 0xffffffff) >>> 0;
    }
    return (
      hashHigh.toString(16).padStart(8, "0") +
      hashLow.toString(16).padStart(8, "0")
    );
  }

  private error(
    code: DocumentationEngineErrorCode,
    received: string,
    requestId: string,
    message: string,
  ): DocumentationEngineError {
    return {
      code,
      supported: ARTIFACT_CONTRACT_VERSION,
      received,
      requestId,
      message,
    };
  }
}

export { CAPABILITY_NAME };
