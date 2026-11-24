#!/usr/bin/env node
/**
 * audit-log — tamper-EVIDENT append-only log via a hash chain (AXE 3, gap #4 auditability, LOCAL portion).
 *
 * Each entry links to its predecessor: hash = sha256(seq · prevHash · canon(payload)). Any mutation, reorder,
 * insertion or deletion breaks the chain and is detected by verifyChain. Pure, deterministic, no clock (timestamps
 * are DATA supplied by the caller). FAIL-CLOSED: a malformed chain verifies false.
 *
 * HONEST LIMIT: this makes a log tamper-EVIDENT (detectable after the fact), NOT tamper-PROOF. Production
 * append-only/WORM storage, a trusted time source, and off-host replication remain EXTERNAL (see
 * PRODUCTION_READINESS_GAPS_V1.md gap #4). This closes only the locally-testable integrity-of-the-chain portion.
 *
 * KEYED INTEGRITY (P0-E SEC#3 follow-on, mechanism portion): the link hash is HMAC-SHA256(key, material) when a
 * non-empty key is supplied, else plain sha256(material). An attacker who cannot reproduce the key cannot recompute
 * a self-consistent chain after a FULL REWRITE; an out-of-band tip ANCHOR detects TAIL TRUNCATION. The key is a
 * PARAMETER only — this module stays pure, never reads env, never holds a secret. Provisioning the key + wiring it
 * into the callers is the OWNER-GATED portion (register p0e-audit-log-keyed-integrity), deliberately NOT done here.
 *
 * CANON VERSION (V17.5 security fix). The historical canon `JSON.stringify(o, Object.keys(o).sort())` uses an ARRAY
 * replacer, which JSON.stringify applies as a key allow-list at EVERY depth ⇒ nested payload keys absent at top level
 * were DROPPED from the hashed material ⇒ a nested payload field could be altered without verifyChain noticing.
 * New entries carry `cv: 2` and are hashed over canonDeep(payload) (keys sorted at every depth, nothing dropped) with a
 * version-tagged preimage `seq\0prevHash\0cv2\0canonDeep(payload)` — the tag binds cv into the hash, so stripping or
 * changing cv breaks the link. Entries WITHOUT cv are LEGACY (pre-fix) and still verify with the legacy shallow canon,
 * but are COUNTED and SURFACED as LEGACY_SHALLOW_CANON (nested fields NOT covered) — never silently reported as fully
 * covered; opts.requireDeepCanon:true rejects them outright. NO DOWNGRADE: a legacy entry after any cv-2 entry ⇒ FAIL.
 * An unknown cv ⇒ FAIL (fail-closed). HMAC key + tip anchor apply identically to both versions.
 */
"use strict";

const crypto = require("crypto");
const { canonDeep, canonLegacyShallow } = require("./canon-deep.js");

const GENESIS = "GENESIS";
const CANON_VERSION = 2;                                   // the version every NEW entry is sealed with
const LEGACY_SHALLOW_CANON = "LEGACY_SHALLOW_CANON";       // status label for pre-fix entries (nested fields uncovered)
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

export interface AuditEntry { seq: number; prevHash: string; payload: any; cv?: number; hash: string; }

// Keyed link hash: HMAC-SHA256(key, material) when a non-empty key is given, else plain sha256(material) —
// BYTE-IDENTICAL to the historical keyless behaviour, so every existing (keyless) caller and every persisted chain
// is unchanged. The separator is a NUL (\0), matching the original sealing format EXACTLY — written here as the `\0`
// escape (plain-text source, git-diffable) rather than a raw 0x00 byte, but producing the identical runtime preimage.
// A previous draft used spaces, which silently changed every sealed hash and would false-BLOCK NUL-sealed chains
// (e.g. scheduler-audit-chain.json) under the verify-on-read gate — regression caught in independent validation.
// cv (5th arg): undefined ⇒ the LEGACY preimage (byte-identical to history — mission-ledger seals and every pre-fix
// chain depend on it); 2 ⇒ the deep-canon, version-tagged preimage. Any other cv THROWS (no silent fallback).
function entryHash(seq: number, prevHash: string, payload: any, key?: string, cv?: number): string {
  let material: string;
  if (cv === undefined) material = `${seq}\0${prevHash}\0${canonLegacyShallow(payload)}`;
  else if (cv === 2) material = `${seq}\0${prevHash}\0cv2\0${canonDeep(payload)}`;
  else throw new Error(`audit-log: unsupported canon version ${JSON.stringify(cv)}`);
  return (typeof key === "string" && key.length > 0)
    ? crypto.createHmac("sha256", key).update(material).digest("hex")
    : sha256(material);
}

/**
 * Append a payload, linking it to the chain's tail. Returns a NEW array (does not mutate the input).
 * opts.key (optional) seals the new entry with HMAC — use the SAME key consistently across a chain and at verify time.
 */
function appendEntry(chain: any[], payload: any, opts?: any): AuditEntry[] {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  const c = Array.isArray(chain) ? chain.slice() : [];
  const prev = c.length ? c[c.length - 1] : null;
  const seq = c.length;
  const prevHash = prev ? prev.hash : GENESIS;
  const entry: AuditEntry = { seq, prevHash, payload, cv: CANON_VERSION, hash: entryHash(seq, prevHash, payload, key, CANON_VERSION) };
  c.push(entry);
  return c;
}

// chainTip — the external ANCHOR a verifier stores OUT-OF-BAND to detect TAIL TRUNCATION: dropping trailing entries
// still yields a valid prefix chain (verifyChain alone cannot see what was removed from the end). { length, tipHash }.
function chainTip(chain: any[]): { length: number; tipHash: string } {
  const c = Array.isArray(chain) ? chain : [];
  return { length: c.length, tipHash: c.length ? c[c.length - 1].hash : GENESIS };
}

/**
 * verifyChain(chain, opts?) — recompute every link; detect tamper/reorder/insert/delete. FAIL-CLOSED on malformation.
 * opts.key verifies HMAC links (required to verify a keyed chain). opts.expectedTip = { length?, tipHash? } compares the
 * current tip against an out-of-band anchor to detect TAIL TRUNCATION / extension (which a prefix chain alone passes).
 * opts.requireDeepCanon:true rejects any LEGACY (pre-cv-2) entry. Returns { ok, length, brokenAt, reason, keyed,
 * tipAnchored, deepCanon, legacyShallowCanon, canonStatus }: keyed/tipAnchored report which protections were in force
 * (honest: an unkeyed, un-anchored verify is tamper-EVIDENT only, NOT full-rewrite/truncation proof); legacyShallowCanon
 * counts entries whose NESTED payload fields are NOT covered by their hash (canonStatus LEGACY_SHALLOW_CANON when > 0).
 */
function verifyChain(chain: any[], opts?: any): { ok: boolean; length: number; brokenAt: number; reason: string; keyed: boolean; tipAnchored: boolean; deepCanon: number; legacyShallowCanon: number; canonStatus: string } {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  const expectedTip = opts && typeof opts === "object" ? opts.expectedTip : undefined;
  const requireDeep = !!(opts && typeof opts === "object" && opts.requireDeepCanon === true);
  const keyed = typeof key === "string" && key.length > 0;
  const tipAnchored = !!(expectedTip && typeof expectedTip === "object");
  let deepCanon = 0; let legacyShallowCanon = 0;
  const status = () => (legacyShallowCanon > 0 ? LEGACY_SHALLOW_CANON : "DEEP_CANON_V2");
  const res = (ok: boolean, brokenAt: number, reason: string, length: number) => ({ ok, length, brokenAt, reason, keyed, tipAnchored, deepCanon, legacyShallowCanon, canonStatus: status() });
  if (!Array.isArray(chain)) return res(false, 0, "not an array", 0);
  let prevHash = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (!e || typeof e !== "object") return res(false, i, "malformed entry", chain.length);
    if (e.seq !== i) return res(false, i, `seq mismatch (expected ${i}, got ${e.seq}) - reorder/insert/delete`, chain.length);
    if (e.prevHash !== prevHash) return res(false, i, "prevHash does not link to the previous entry", chain.length);
    const hasCv = Object.prototype.hasOwnProperty.call(e, "cv");
    if (hasCv && e.cv !== CANON_VERSION) return res(false, i, `unsupported canon version ${JSON.stringify(e.cv)} (fail-closed)`, chain.length);
    if (!hasCv) {
      if (deepCanon > 0) return res(false, i, "canon DOWNGRADE - legacy shallow-canon entry after a cv-2 entry (refused)", chain.length);
      if (requireDeep) return res(false, i, `${LEGACY_SHALLOW_CANON} entry refused (requireDeepCanon)`, chain.length);
    }
    let expected: string;
    try { expected = entryHash(e.seq, e.prevHash, e.payload, key, hasCv ? CANON_VERSION : undefined); } catch { return res(false, i, "payload not canonicalizable (fail-closed)", chain.length); }
    if (e.hash !== expected) return res(false, i, "hash mismatch - payload tampered after sealing", chain.length);
    if (hasCv) deepCanon++; else legacyShallowCanon++;
    prevHash = e.hash;
  }
  // TIP ANCHOR: compare the current tip against the supplied out-of-band anchor (tail truncation/extension/forgery).
  if (tipAnchored) {
    const tip = chainTip(chain);
    if (expectedTip.length !== undefined && tip.length !== expectedTip.length) {
      return res(false, chain.length, `tip length mismatch (anchor ${expectedTip.length}, got ${tip.length}) - tail truncation/extension`, chain.length);
    }
    if (expectedTip.tipHash !== undefined && tip.tipHash !== expectedTip.tipHash) {
      return res(false, chain.length, "tip hash mismatch - tail truncation/extension/forgery", chain.length);
    }
  }
  return res(true, -1, legacyShallowCanon > 0 ? `intact (${legacyShallowCanon} ${LEGACY_SHALLOW_CANON} entr${legacyShallowCanon === 1 ? "y" : "ies"} - nested payload fields NOT covered by their hash)` : "intact", chain.length);
}

export { appendEntry, verifyChain, entryHash, chainTip, GENESIS, CANON_VERSION, LEGACY_SHALLOW_CANON };
module.exports = { appendEntry, verifyChain, entryHash, chainTip, GENESIS, CANON_VERSION, LEGACY_SHALLOW_CANON };
