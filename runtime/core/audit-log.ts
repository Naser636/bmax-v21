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
 */
"use strict";

const crypto = require("crypto");

const GENESIS = "GENESIS";
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function canon(o: any): string { return JSON.stringify(o, o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).sort() : undefined); }

export interface AuditEntry { seq: number; prevHash: string; payload: any; hash: string; }

// Keyed link hash: HMAC-SHA256(key, material) when a non-empty key is given, else plain sha256(material) —
// BYTE-IDENTICAL to the historical keyless behaviour, so every existing (keyless) caller and every persisted chain
// is unchanged. The separator is a NUL (\0), matching the original sealing format EXACTLY — written here as the `\0`
// escape (plain-text source, git-diffable) rather than a raw 0x00 byte, but producing the identical runtime preimage.
// A previous draft used spaces, which silently changed every sealed hash and would false-BLOCK NUL-sealed chains
// (e.g. scheduler-audit-chain.json) under the verify-on-read gate — regression caught in independent validation.
function entryHash(seq: number, prevHash: string, payload: any, key?: string): string {
  const material = `${seq}\0${prevHash}\0${canon(payload)}`;
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
  const entry: AuditEntry = { seq, prevHash, payload, hash: entryHash(seq, prevHash, payload, key) };
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
 * Returns { ok, length, brokenAt, reason, keyed, tipAnchored }; keyed/tipAnchored report which protections were in
 * force (honest: an unkeyed, un-anchored verify is tamper-EVIDENT only, NOT full-rewrite/truncation proof).
 */
function verifyChain(chain: any[], opts?: any): { ok: boolean; length: number; brokenAt: number; reason: string; keyed: boolean; tipAnchored: boolean } {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  const expectedTip = opts && typeof opts === "object" ? opts.expectedTip : undefined;
  const keyed = typeof key === "string" && key.length > 0;
  const tipAnchored = !!(expectedTip && typeof expectedTip === "object");
  if (!Array.isArray(chain)) return { ok: false, length: 0, brokenAt: 0, reason: "not an array", keyed, tipAnchored };
  let prevHash = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (!e || typeof e !== "object") return { ok: false, length: chain.length, brokenAt: i, reason: "malformed entry", keyed, tipAnchored };
    if (e.seq !== i) return { ok: false, length: chain.length, brokenAt: i, reason: `seq mismatch (expected ${i}, got ${e.seq}) - reorder/insert/delete`, keyed, tipAnchored };
    if (e.prevHash !== prevHash) return { ok: false, length: chain.length, brokenAt: i, reason: "prevHash does not link to the previous entry", keyed, tipAnchored };
    if (e.hash !== entryHash(e.seq, e.prevHash, e.payload, key)) return { ok: false, length: chain.length, brokenAt: i, reason: "hash mismatch - payload tampered after sealing", keyed, tipAnchored };
    prevHash = e.hash;
  }
  // TIP ANCHOR: compare the current tip against the supplied out-of-band anchor (tail truncation/extension/forgery).
  if (tipAnchored) {
    const tip = chainTip(chain);
    if (expectedTip.length !== undefined && tip.length !== expectedTip.length) {
      return { ok: false, length: chain.length, brokenAt: chain.length, reason: `tip length mismatch (anchor ${expectedTip.length}, got ${tip.length}) - tail truncation/extension`, keyed, tipAnchored };
    }
    if (expectedTip.tipHash !== undefined && tip.tipHash !== expectedTip.tipHash) {
      return { ok: false, length: chain.length, brokenAt: chain.length, reason: "tip hash mismatch - tail truncation/extension/forgery", keyed, tipAnchored };
    }
  }
  return { ok: true, length: chain.length, brokenAt: -1, reason: "intact", keyed, tipAnchored };
}

export { appendEntry, verifyChain, entryHash, chainTip, GENESIS };
module.exports = { appendEntry, verifyChain, entryHash, chainTip, GENESIS };
