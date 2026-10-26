#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial suite for agent-identity (V9). HERMETIC: ed25519 keypairs generated
// here only; private keys never logged/exported. Proves deny-by-default identity + session/contract binding +
// anti-replay + tenant isolation. Token presence is NEVER identity.
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const ID = require("./agent-identity.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function keypair() { return crypto.generateKeyPairSync("ed25519"); }
const pem = (k) => k.export({ type: "spki", format: "pem" });
const sign = (priv, ch) => crypto.sign(null, Buffer.from(ID.canon(ch)), priv).toString("base64");

// setup: tenant T1, agent A with a registered key + an open session bound to contractSha "C1"
const reg = ID.createRegistry();
const { publicKey, privateKey } = keypair();
ID.register(reg, { tenantId: "T1", agentId: "A", publicKeyPem: pem(publicKey) });
ID.openSession(reg, { sessionId: "S1", tenantId: "T1", agentId: "A", contractSha: "C1" });

const freshCh = () => ID.issueChallenge(reg, { tenantId: "T1", agentId: "A", sessionId: "S1", contractSha: "C1" });

// 1) valid identity + signature ⇒ ok
let ch = freshCh();
ok("valid identity + Ed25519 signature + binding ⇒ ok", ID.verifyAuth(reg, { challenge: ch, signature: sign(privateKey, ch) }).ok === true);

// 2) invalid signature ⇒ DENY
ch = freshCh();
ok("invalid signature ⇒ DENY", ID.verifyAuth(reg, { challenge: ch, signature: sign(keypair().privateKey, ch) }).ok === false);

// 3) unknown identity ⇒ DENY
ch = { tenantId: "T1", agentId: "GHOST", sessionId: "S1", contractSha: "C1", nonce: "x" };
ok("unknown agentId ⇒ DENY", ID.verifyAuth(reg, { challenge: ch, signature: sign(privateKey, ch) }).ok === false);

// 4) revoked agent ⇒ DENY
{ const r2 = ID.createRegistry(); const kp = keypair(); ID.register(r2, { tenantId: "T1", agentId: "A", publicKeyPem: pem(kp.publicKey) }); ID.openSession(r2, { sessionId: "S1", tenantId: "T1", agentId: "A", contractSha: "C1" }); ID.revoke(r2, { tenantId: "T1", agentId: "A" });
  const c = ID.issueChallenge(r2, { tenantId: "T1", agentId: "A", sessionId: "S1", contractSha: "C1" });
  ok("revoked identity ⇒ DENY", ID.verifyAuth(r2, { challenge: c, signature: sign(kp.privateKey, c) }).ok === false); }

// 5) session expired/revoked ⇒ DENY
{ const r3 = ID.createRegistry(); const kp = keypair(); ID.register(r3, { tenantId: "T1", agentId: "A", publicKeyPem: pem(kp.publicKey) }); ID.openSession(r3, { sessionId: "S1", tenantId: "T1", agentId: "A", contractSha: "C1" }); ID.closeSession(r3, "S1");
  const c = ID.issueChallenge(r3, { tenantId: "T1", agentId: "A", sessionId: "S1", contractSha: "C1" });
  ok("expired/closed session ⇒ DENY", ID.verifyAuth(r3, { challenge: c, signature: sign(kp.privateKey, c) }).ok === false); }

// 6) session belongs to another identity ⇒ DENY
{ const c = { tenantId: "T1", agentId: "A", sessionId: "S1", contractSha: "C1", nonce: "n" }; reg.nonces.get("T1::_nonces").add("n");
  // tamper the challenge agentId to B while session S1 is A's
  const cB = { ...c, agentId: "B" }; ok("session bound to a different identity ⇒ DENY", ID.verifyAuth(reg, { challenge: cB, signature: sign(privateKey, cB) }).ok === false); }

// 7) replayed challenge ⇒ DENY on 2nd use
ch = freshCh(); const sig = sign(privateKey, ch);
ok("challenge first use ⇒ ok", ID.verifyAuth(reg, { challenge: ch, signature: sig }).ok === true);
ok("challenge REPLAY (same nonce) ⇒ DENY", ID.verifyAuth(reg, { challenge: ch, signature: sig }).ok === false);

// 8) altered contractSha (not matching session) ⇒ DENY
ch = freshCh(); const cAlt = { ...ch, contractSha: "C2" };
ok("altered contractSha vs session ⇒ DENY", ID.verifyAuth(reg, { challenge: cAlt, signature: sign(privateKey, cAlt) }).ok === false);

// 9) token present but NO signature ⇒ DENY
ch = freshCh();
ok("token present but signature absent ⇒ DENY (presence != identity)", ID.verifyAuth(reg, { challenge: ch, signature: undefined }).ok === false);

// 10) unauthorized key change (presented key != registered) ⇒ DENY
ch = freshCh();
ok("presented key != registered ⇒ DENY (no self-rekey)", ID.verifyAuth(reg, { challenge: ch, signature: sign(privateKey, ch), presentedPublicKeyPem: pem(keypair().publicKey) }).ok === false);

// 11) TENANT ISOLATION: tenant T2 cannot use T1's nonce; T2 identity separate
{ const kp2 = keypair(); ID.register(reg, { tenantId: "T2", agentId: "A", publicKeyPem: pem(kp2.publicKey) }); ID.openSession(reg, { sessionId: "S2", tenantId: "T2", agentId: "A", contractSha: "C1" });
  const cT1 = ID.issueChallenge(reg, { tenantId: "T1", agentId: "A", sessionId: "S1", contractSha: "C1" });
  // T2 tries to present a challenge claiming T1's nonce under T2 namespace ⇒ nonce not in T2 set ⇒ DENY
  const cross = { tenantId: "T2", agentId: "A", sessionId: "S2", contractSha: "C1", nonce: cT1.nonce };
  ok("tenant isolation: T1 nonce not valid under T2 ⇒ DENY", ID.verifyAuth(reg, { challenge: cross, signature: sign(kp2.privateKey, cross) }).ok === false);
  // and T2's own fresh challenge works with T2's key, proving isolation is logical not blanket-deny
  const cT2 = ID.issueChallenge(reg, { tenantId: "T2", agentId: "A", sessionId: "S2", contractSha: "C1" });
  ok("tenant isolation: T2 own identity authenticates independently", ID.verifyAuth(reg, { challenge: cT2, signature: sign(kp2.privateKey, cT2) }).ok === true); }

// 12) evidence/reason carries NO secret (no PEM/base64-key leakage)
ch = freshCh(); const res = ID.verifyAuth(reg, { challenge: ch, signature: sign(privateKey, ch) });
ok("verify result contains no private key / PEM material", !/PRIVATE KEY|BEGIN .*KEY/.test(JSON.stringify(res)));

// ═════════ V10 §5 — identity LIFECYCLE: injected-clock TTL, rotation, concurrent sessions ═════════
{
  const r = ID.createRegistry(); const kp = keypair();
  ID.register(r, { tenantId: "T", agentId: "A", publicKeyPem: pem(kp.publicKey) });
  // session with a TTL: issuedAt=1000, ttl=500 ⇒ expiresAt=1500
  ID.openSession(r, { sessionId: "S", tenantId: "T", agentId: "A", contractSha: "C1", issuedAt: 1000, ttlMs: 500 });
  const mk = () => ID.issueChallenge(r, { tenantId: "T", agentId: "A", sessionId: "S", contractSha: "C1" });
  let c = mk();
  ok("V10 TTL: within window (now=1200) ⇒ ok", ID.verifyAuth(r, { challenge: c, signature: sign(kp.privateKey, c), now: 1200 }).ok === true);
  c = mk();
  ok("V10 TTL: at/after expiry (now=1600) ⇒ DENY (expired)", ID.verifyAuth(r, { challenge: c, signature: sign(kp.privateKey, c), now: 1600 }).ok === false);
  c = mk();
  ok("V10 TTL: backward clock (now=800 < issuedAt) ⇒ DENY (inconsistent clock)", ID.verifyAuth(r, { challenge: c, signature: sign(kp.privateKey, c), now: 800 }).ok === false);
  c = mk();
  ok("V10 TTL: session has TTL but no time source ⇒ DENY (fail-closed)", ID.verifyAuth(r, { challenge: c, signature: sign(kp.privateKey, c) }).ok === false);

  // ROTATION: after rotate, the OLD key fails, the NEW key verifies
  const kp2 = keypair();
  ID.rotateKey(r, { tenantId: "T", agentId: "A", newPublicKeyPem: pem(kp2.publicKey) });
  c = mk();
  ok("V10 rotation: OLD key ⇒ DENY after rotation", ID.verifyAuth(r, { challenge: c, signature: sign(kp.privateKey, c), now: 1200 }).ok === false);
  c = mk();
  ok("V10 rotation: NEW key ⇒ ok after rotation", ID.verifyAuth(r, { challenge: c, signature: sign(kp2.privateKey, c), now: 1200 }).ok === true);

  // CONCURRENT sessions: two active sessions; expiring/closing one does not affect the other
  ID.openSession(r, { sessionId: "S2", tenantId: "T", agentId: "A", contractSha: "C1", issuedAt: 1000, ttlMs: 10000 });
  ID.closeSession(r, "S");
  const cS2 = ID.issueChallenge(r, { tenantId: "T", agentId: "A", sessionId: "S2", contractSha: "C1" });
  ok("V10 concurrent: S closed but S2 still authenticates", ID.verifyAuth(r, { challenge: cS2, signature: sign(kp2.privateKey, cS2), now: 2000 }).ok === true);
  const cSclosed = ID.issueChallenge(r, { tenantId: "T", agentId: "A", sessionId: "S", contractSha: "C1" });
  ok("V10 concurrent: closed session S ⇒ DENY", ID.verifyAuth(r, { challenge: cSclosed, signature: sign(kp2.privateKey, cSclosed), now: 2000 }).ok === false);
}

console.log(`\nAGENT-IDENTITY suite — ${pass} assertions passed.`);
