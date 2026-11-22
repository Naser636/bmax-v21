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

const PURPOSES = Object.freeze(["KNOWLEDGE_RECORD", "COLLECTION_ARTIFACT", "INSPECTION_RECORD", "MATURITY_EVIDENCE"]);   // V15: owner-anchored review/inspection + maturity evidence
const MAX_TTL_MS = 90 * 86400000;   // attestation lifetime cap (inspection LOW)
// revocation is TERMINAL here, independent of agent-identity.rotateKey (which re-activates a key — pre-existing behaviour).
const REVOKED: WeakMap<any, Set<string>> = new WeakMap();
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
/* deep canonical JSON (sorted keys at every level) — so a re-ordered but identical record hashes identically. */
function canonical(v: any): string {
  // STRICT (inspection LOW): only JSON-plain data — undefined, NaN/Infinity, functions, Dates/Maps/class instances are
  // REJECTED (they would otherwise collide with null / {}), so a pinned digest cannot be matched by a non-JSON variant.
  if (v === null) return "null";
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("canonical: non-finite number"); return JSON.stringify(v); }
  if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v) && Object.getPrototypeOf(v) === Object.prototype) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  throw new Error("canonical: non-JSON value (" + (v === undefined ? "undefined" : typeof v) + ")");
}
function contentSha256(payload: any): string { return crypto.createHash("sha256").update(canonical(payload)).digest("hex"); }

/* ephemeral TEST identity: returns { issuer, publicKeyPem, privateKey } — the private key stays in the caller's memory. */
function ephemeralIdentity(issuer: string): any {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return Object.freeze({ issuer, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }), privateKey });
}
function fingerprint(publicKeyPem: string): string { return crypto.createHash("sha256").update(String(publicKeyPem)).digest("hex"); }
function registerIssuer(reg: any, id: any): void { AI.register(reg, { tenantId: "odg-knowledge", agentId: id.issuer, publicKeyPem: id.publicKeyPem }); }
function revokeIssuer(reg: any, issuer: string): void { AI.revoke(reg, { tenantId: "odg-knowledge", agentId: issuer }); const s = REVOKED.get(reg) || new Set<string>(); s.add(issuer); REVOKED.set(reg, s); }

function createAttestation(o: any): any {
  if (!isObj(o) || !PURPOSES.includes(o.purpose)) throw new Error("createAttestation: unknown purpose");
  if (!Number.isFinite(o.issuedAt) || !Number.isFinite(o.expiresAt) || o.expiresAt <= o.issuedAt) throw new Error("createAttestation: issuedAt < expiresAt required");
  if (o.expiresAt - o.issuedAt > MAX_TTL_MS) throw new Error("createAttestation: lifetime exceeds 90 days");
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
  if (!PURPOSES.includes(opts.purpose)) return deny("PURPOSE_REQUIRED");                 // purpose binding is MANDATORY
  if (h.purpose !== opts.purpose) return deny("WRONG_PURPOSE");
  if (!(opts.seenNonces instanceof Set) && opts.allowRepeatVerification !== true) return deny("REPLAY_POLICY_REQUIRED");   // replay protection explicit
  if (!Number.isFinite(h.expiresAt) || !Number.isFinite(h.issuedAt) || h.expiresAt - h.issuedAt > MAX_TTL_MS) return deny("LIFETIME_INVALID");
  let digest: string; try { digest = contentSha256(payload); } catch { return deny("NON_CANONICAL_PAYLOAD"); }
  if (h.contentSha256 !== digest) return deny("CONTENT_MODIFIED");
  const reg = opts.registry; const k = reg && reg.keys && reg.keys.get("odg-knowledge::" + h.issuer);
  if (!k) return deny("UNKNOWN_KEY");
  if (k.state !== "active" || (REVOKED.get(reg) && REVOKED.get(reg)!.has(h.issuer))) return deny("REVOKED_KEY");
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(canonical(h)), crypto.createPublicKey(k.publicKeyPem), Buffer.from(att.signature, "base64")); } catch { ok = false; }
  if (!ok) return deny("BAD_SIGNATURE");
  if (opts.asOf < h.issuedAt) return deny("NOT_YET_VALID");
  if (opts.asOf >= h.expiresAt) return deny("EXPIRED");
  if (opts.seenNonces instanceof Set) { const nk = h.issuer + ":" + h.nonce; if (opts.seenNonces.has(nk)) return deny("REPLAYED"); opts.seenNonces.add(nk); }
  return Object.freeze({ valid: true, reason: "SIGNATURE_VALID", provesTruth: false,
    provenance: Object.freeze({ issuer: h.issuer, keyFingerprint: fingerprint(k.publicKeyPem), keyVersion: k.keyVersion, contentSha256: h.contentSha256, issuedAt: h.issuedAt, expiresAt: h.expiresAt, purpose: h.purpose }),
    note: "integrity + declared origin only — NOT the truth of the content" });
}

// V15 OWNER ANCHORS for owner-only purposes, loaded HERE from the git-reviewed TRUST_ANCHORS.json (never from a caller).
const OWNER_PURPOSES = Object.freeze(["INSPECTION_RECORD", "MATURITY_EVIDENCE"]);
const OWNER_ANCHORS: any = Object.freeze((() => { const out: any = {}; let j: any = {}; try { j = require("../../docs/odg/evidence/TRUST_ANCHORS.json"); } catch {}
  for (const p of OWNER_PURPOSES) out[p] = Object.freeze(Array.isArray(j[p]) ? j[p].slice() : []); return out; })());
/* verifyOwnerAnchored(purpose, payload, signed={attestation, publicKeyPem}, asOf) -> {ok, reason}. ok ONLY if the key's
 * fingerprint is pinned for that purpose in TRUST_ANCHORS.json (owner-controlled, empty by design) AND the Ed25519
 * attestation verifies over exactly this payload. A provider-made key can never pass. */
function verifyOwnerAnchored(purpose: string, payload: any, signed: any, asOf: number): any {
  if (!OWNER_PURPOSES.includes(purpose)) return Object.freeze({ ok: false, reason: "NOT_AN_OWNER_PURPOSE" });
  if (!isObj(signed) || typeof signed.publicKeyPem !== "string" || !isObj(signed.attestation)) return Object.freeze({ ok: false, reason: "NO_OWNER_SIGNATURE (provider-authored evidence never counts on its own)" });
  const fp = fingerprint(signed.publicKeyPem);
  if (!OWNER_ANCHORS[purpose].includes(fp)) return Object.freeze({ ok: false, reason: "KEY_NOT_OWNER_ANCHORED (TRUST_ANCHORS." + purpose + " has " + OWNER_ANCHORS[purpose].length + " key(s))" });
  const reg = AI.createRegistry(); registerIssuer(reg, { issuer: String(signed.attestation.header && signed.attestation.header.issuer || ""), publicKeyPem: signed.publicKeyPem });
  const v = verifyAttestation(signed.attestation, payload, { registry: reg, asOf, purpose, allowRepeatVerification: true });
  return Object.freeze({ ok: v.valid === true, reason: v.reason });
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

module.exports = { verifyOwnerAnchored, OWNER_ANCHORS, OWNER_PURPOSES, canonical, contentSha256, fingerprint, ephemeralIdentity, registerIssuer, revokeIssuer, createAttestation, verifyAttestation, PURPOSES, KNOWLEDGE_ATTESTATION_CONTRACT, createRegistry: AI.createRegistry };
export {};
