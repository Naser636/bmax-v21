#!/usr/bin/env node
"use strict";
/*
 * agent-identity — LOCAL, HERMETIC, TEST-ONLY cryptographic identity for external agents (V9). SEPARATE from
 * supply-chain-attest (which attests ARTIFACTS: subject digest + SBOM rebind). Here the Ed25519 signature proves
 * the AGENT controls a registered key, over a context-bound, single-use challenge. Identity ≠ permission: this
 * AUTHENTICATES the agent; the contract/policy/gate decide admission; the existing EXECUTOR keeps execution authority.
 *
 * Guarantees (deny-by-default, fail-closed):
 *   - agentId ↔ APPROVED public key (agent-supplied keys are NEVER trusted — an unauthorised key change ⇒ DENY);
 *   - signature verified over canon(challenge) with the REGISTERED key only;
 *   - challenge binds tenant+identity+session+contract (contractSha) + a single-use nonce (anti-replay = freshness);
 *   - revoked identity / inactive-or-foreign session / contract mismatch / consumed-or-unknown nonce ⇒ DENY;
 *   - token PRESENCE alone is NEVER accepted as identity.
 * TEST-ONLY: keys live only in the hermetic test env; private keys are NEVER logged/exported/committed. Production
 * key management (TTL, rotation, HSM/KMS, a real identity store) is an EXTERNAL dependency — NOT implemented here.
 */
import crypto from "node:crypto";

function canon(o: any): string { return JSON.stringify(o, Object.keys(o).sort()); }
const nsKey = (t: any, a: any) => `${t || "_"}::${a}`;

export interface AgentRegistry { kind: "TEST_ONLY"; keys: Map<string, any>; sessions: Map<string, any>; nonces: Map<string, Set<string>> }
function createRegistry(): AgentRegistry { return { kind: "TEST_ONLY", keys: new Map(), sessions: new Map(), nonces: new Map() }; }

function register(reg: AgentRegistry, p: any): void {
  reg.keys.set(nsKey(p.tenantId, p.agentId), { tenantId: p.tenantId || null, agentId: p.agentId, publicKeyPem: p.publicKeyPem, state: "active", keyVersion: 1 });
}
function revoke(reg: AgentRegistry, p: any): void { const k = reg.keys.get(nsKey(p.tenantId, p.agentId)); if (k) k.state = "revoked"; }
// Key ROTATION (test scope): only the NEW key verifies afterwards; the old key ⇒ DENY. keyVersion increments.
function rotateKey(reg: AgentRegistry, p: any): boolean { const k = reg.keys.get(nsKey(p.tenantId, p.agentId)); if (!k) return false; k.publicKeyPem = p.newPublicKeyPem; k.keyVersion = (k.keyVersion || 1) + 1; k.state = "active"; return true; }
// Session with an OPTIONAL injected-clock TTL: pass issuedAt+ttlMs for expiry; omit for a non-expiring (V9) session.
function openSession(reg: AgentRegistry, s: any): any {
  const hasTtl = typeof s.issuedAt === "number" && typeof s.ttlMs === "number";
  const sess = { sessionId: s.sessionId, tenantId: s.tenantId || null, agentId: s.agentId, contractSha: s.contractSha, active: true,
    issuedAt: hasTtl ? s.issuedAt : null, expiresAt: hasTtl ? s.issuedAt + s.ttlMs : null };
  reg.sessions.set(s.sessionId, sess); return sess;
}
function closeSession(reg: AgentRegistry, sessionId: any): void { const s = reg.sessions.get(sessionId); if (s) s.active = false; }

/** issueChallenge — a single-use, context-bound challenge. Nonce stored per-tenant (isolation). */
function issueChallenge(reg: AgentRegistry, c: any): any {
  const nonce = crypto.randomBytes(16).toString("hex");
  const ns = nsKey(c.tenantId, "_nonces");
  if (!reg.nonces.has(ns)) reg.nonces.set(ns, new Set());
  reg.nonces.get(ns)!.add(nonce);
  return { tenantId: c.tenantId || null, agentId: c.agentId, sessionId: c.sessionId, contractSha: c.contractSha, nonce };
}

/**
 * verifyAuth — authenticate ONE challenge+signature and bind identity↔session↔contract. Returns {ok, reason,
 * identity}. presentedPublicKeyPem (if any) is compared to the REGISTERED key and a mismatch ⇒ DENY (no self-rekey).
 */
function verifyAuth(reg: AgentRegistry, req: any): any {
  const r = req || {};
  const ch = r.challenge;
  if (!ch || typeof ch !== "object") return { ok: false, reason: "no challenge" };
  const rec = reg.keys.get(nsKey(ch.tenantId, ch.agentId));
  if (!rec) return { ok: false, reason: "unknown identity (agentId/tenant not registered)" };
  if (rec.state !== "active") return { ok: false, reason: "identity revoked/inactive" };
  if (r.presentedPublicKeyPem !== undefined && r.presentedPublicKeyPem !== rec.publicKeyPem) return { ok: false, reason: "unauthorised key change (presented key != registered)" };
  if (!r.signature || typeof r.signature !== "string") return { ok: false, reason: "no signature presented (token presence is NOT identity)" };
  // session binding
  const sess = reg.sessions.get(ch.sessionId);
  if (!sess || sess.active !== true) return { ok: false, reason: "session absent/expired/revoked" };
  if (sess.agentId !== ch.agentId || (sess.tenantId || null) !== (ch.tenantId || null)) return { ok: false, reason: "session belongs to a different identity/tenant" };
  if (sess.contractSha !== ch.contractSha) return { ok: false, reason: "contract does not match the session" };
  // injected-clock TTL (only when the session declared one). FAIL-CLOSED on missing/backward/after now.
  if (sess.expiresAt != null) {
    if (typeof r.now !== "number") return { ok: false, reason: "session has a TTL but no time source presented (fail-closed)" };
    if (r.now < sess.issuedAt) return { ok: false, reason: "inconsistent clock (now < session issuedAt) — refused" };
    if (r.now >= sess.expiresAt) return { ok: false, reason: `session expired (now ${r.now} >= expiresAt ${sess.expiresAt})` };
  }
  // signature over canon(challenge) with the REGISTERED key only
  let sigOk = false;
  try { sigOk = crypto.verify(null, Buffer.from(canon(ch)), rec.publicKeyPem, Buffer.from(r.signature, "base64")); } catch { sigOk = false; }
  if (!sigOk) return { ok: false, reason: "invalid Ed25519 signature over the bound challenge" };
  // anti-replay: nonce must exist (freshness) in this tenant's set, then is consumed (single-use)
  const ns = nsKey(ch.tenantId, "_nonces");
  const set = reg.nonces.get(ns);
  if (!set || !set.has(ch.nonce)) return { ok: false, reason: "stale/unknown/replayed challenge nonce" };
  set.delete(ch.nonce);
  return { ok: true, reason: "identity authenticated + session/contract bound + fresh", identity: { tenantId: ch.tenantId || null, agentId: ch.agentId, sessionId: ch.sessionId } };
}

export { createRegistry, register, revoke, rotateKey, openSession, closeSession, issueChallenge, verifyAuth, canon };
module.exports = { createRegistry, register, revoke, rotateKey, openSession, closeSession, issueChallenge, verifyAuth, canon };
