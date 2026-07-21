/*
 * Evidence Pack — Contracts
 *
 * Frozen contract surface for the Evidence Pack capability (Evidence Pack Contract Version 1.0.0),
 * part of the Runtime industrialization layer.
 *
 * Founding invariant: an Evidence Pack is IMMUTABLE and CONTENT-ADDRESSED. Sealing the same set of
 * evidence items always yields the same sealHash (constitution principles ARTIFACTS_ARE_IMMUTABLE,
 * DETERMINISM_FIRST, EVIDENCE_REQUIRED). The capability performs NO I/O — it consumes item refs and
 * returns a sealed manifest; the Runtime persists it.
 */

export const EVIDENCE_PACK_CONTRACT_VERSION = "1.0.0";

/** A single, already-produced piece of evidence, referenced by id + its own content hash. */
export interface EvidencePackItem {
  /** Category of the evidence (e.g. "validation", "release", "documentation", "source"). */
  kind: string;
  /** Stable identifier of the item within its kind. */
  id: string;
  /** Content hash of the underlying artifact (supplied by whoever produced it). */
  hash: string;
}

export interface EvidencePackInputs {
  evidencePackContractVersion: string;
  /** The mission / request the pack certifies. */
  mission: string;
  items: EvidencePackItem[];
}

/** The immutable, content-addressed result of a successful seal. */
export interface SealedEvidencePack {
  evidencePackContractVersion: string;
  mission: string;
  itemCount: number;
  /** Items in canonical (kind, id, hash) order — never input order. */
  items: EvidencePackItem[];
  /** Deterministic seal over mission + canonical items. */
  sealHash: string;
  complete: true;
}

export type EvidencePackErrorCode =
  | "INPUTS_MALFORMED"
  | "EVIDENCE_PACK_CONTRACT_INCOMPATIBLE"
  | "PACK_EMPTY";

export interface EvidencePackError {
  code: EvidencePackErrorCode;
  supported: string;
  received: string;
  mission: string;
  message: string;
}

export type EvidencePackResult =
  | { ok: true; pack: SealedEvidencePack }
  | { ok: false; error: EvidencePackError };

export interface EvidencePackDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  evidencePackContractVersion: string;
  status: "READY";
}
