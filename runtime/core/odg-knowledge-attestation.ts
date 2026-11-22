/**
 * V374 KI-V2 Lot 2 — signed ATTESTATIONS for knowledge records and collection artefacts (SANDBOX / TEST keys only).
 * REUSES agent-identity's TEST_ONLY registry (register / revoke / rotateKey / canon) — no second identity store.
 * An attestation binds: issuer (registered key) · content SHA-256 (canonical) · issuedAt · expiresAt · nonce · purpose.
 * verifyAttestation() proves INTEGRITY + DECLARED ORIGIN only: a valid signature NEVER makes the content true.
 * Pure except node:crypto; injected clock; private keys never logged/exported/committed (ephemeral, generated in-process).
 * Production key management (KMS/HSM, real identity store, rotation policy) is OWNER-GATED (register item
 * p0e-audit-log-keyed-integrity) and NOT implemented here.
 */
"use strict";
const crypto = require("crypto");
const AI = require("./agent-identity.js");

const PURPOSES = Object.freeze(["KNOWLEDGE_RECORD", "COLLECTION_ARTIFACT"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
/* deep canonical JSON (sorted keys at every level) — so a re-ordered but identical record hashes identically. */
function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function contentSha256(payload: any): string { return crypto.createHash("sha256").update(canonical(payload)).digest("hex"); }

/* ephemeral TEST identity: returns { issuer, publicKeyPem, privateKey } — the private key stays in the caller's memory. */
function ephemeralIdentity(issuer: string): any {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return Object.freeze({ issuer, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }), privateKey });
}
function registerIssuer(reg: any, id: any): void { AI.register(reg, { tenantId: "odg-knowledge", agentId: id.issuer, publicKeyPem: id.publicKeyPem }); }
function revokeIssuer(reg: any, issuer: string): void { AI.revoke(reg, { tenantId: "odg-knowledge", agentId: issuer }); }

function createAttestation(o: any): any {
  if (!isObj(o) || !PURPOSES.includes(o.purpose)) throw new Error("createAttestation: unknown purpose");
  if (!Number.isFinite(o.issuedAt) || !Number.isFinite(o.expiresAt) || o.expiresAt <= o.issuedAt) throw new Error("createAttestation: issuedAt < expiresAt required");
  if (typeof o.nonce !== "string" || o.nonce.length < 8) throw new Error("createAttestation: nonce required");
  const header = Object.freeze({ v: 1, purpose: o.purpose, issuer: o.identity.issuer, contentSha256: contentSha256(o.payload), issuedAt: o.issuedAt, expiresAt: o.expiresAt, nonce: o.nonce });
  const signature = crypto.sign(null, Buffer.from(canonical(header)), o.identity.privateKey).toString("base64");
  return Object.freeze({ header, signature });
}

/* verifyAttestation(att, payload, { registry, asOf, seenNonces?: Set, purpose? }) -> { valid, reason, provenance? }.
 * Fail-closed on every missing/odd signal. seenNonces (if given) is UPDATED on success ⇒ replay of the same attestation fails. */
function verifyAttestation(att: any, payload: any, o: any): any {
  const deny = (reason: string) => Object.freeze({ valid: false, reason, provesTruth: false });
  if (!isObj(att) || !isObj(att.header) || typeof att.signature !== "string" || !att.signature) return deny("UNSIGNED");
  const h = att.header; const opts = isObj(o) ? o : {};
  if (!Number.isFinite(opts.asOf)) return deny("NO_CLOCK");
  if (opts.purpose && h.purpose !== opts.purpose) return deny("WRONG_PURPOSE");
  if (h.contentSha256 !== contentSha256(payload)) return deny("CONTENT_MODIFIED");
  const reg = opts.registry; const k = reg && reg.keys && reg.keys.get("odg-knowledge::" + h.issuer);
  if (!k) return deny("UNKNOWN_KEY");
  if (k.state !== "active") return deny("REVOKED_KEY");
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(canonical(h)), crypto.createPublicKey(k.publicKeyPem), Buffer.from(att.signature, "base64")); } catch { ok = false; }
  if (!ok) return deny("BAD_SIGNATURE");
  if (opts.asOf < h.issuedAt) return deny("NOT_YET_VALID");
  if (opts.asOf >= h.expiresAt) return deny("EXPIRED");
  if (opts.seenNonces instanceof Set) { const nk = h.issuer + ":" + h.nonce; if (opts.seenNonces.has(nk)) return deny("REPLAYED"); opts.seenNonces.add(nk); }
  return Object.freeze({ valid: true, reason: "SIGNATURE_VALID", provesTruth: false,
    provenance: Object.freeze({ issuer: h.issuer, keyVersion: k.keyVersion, contentSha256: h.contentSha256, issuedAt: h.issuedAt, expiresAt: h.expiresAt, purpose: h.purpose }),
    note: "integrity + declared origin only — NOT the truth of the content" });
}

const KNOWLEDGE_ATTESTATION_CONTRACT = Object.freeze({
  id: "V374-KI-V2-LOT2-ATTESTATION",
  reuses: Object.freeze(["agent-identity (TEST_ONLY registry: register/revoke/rotateKey)", "node:crypto ed25519"]),
  invariants: Object.freeze([
    "a valid signature proves integrity + declared origin, NEVER truth (provesTruth:false always)",
    "fail-closed: unsigned, modified, unknown key, revoked key, bad signature, expired, not-yet-valid, replayed ⇒ invalid",
    "deep-canonical content hash: re-ordered identical content verifies; any byte change does not",
    "TEST/ephemeral keys only; production key management is OWNER-GATED (p0e)",
  ]),
});

module.exports = { canonical, contentSha256, ephemeralIdentity, registerIssuer, revokeIssuer, createAttestation, verifyAttestation, PURPOSES, KNOWLEDGE_ATTESTATION_CONTRACT, createRegistry: AI.createRegistry };
export {};
