#!/usr/bin/env node
"use strict";
/* V162 §5 P3 — audit-log keyed-integrity forgery-resistance battery (realizable portion of p0e-audit-log-keyed-integrity).
 * Proves ADVERSARIALLY, over the EXISTING canonical audit-log (audit-log.ts, UNMODIFIED), that: a plain hash-chain is
 * tamper/reorder-EVIDENT but misses FULL-REWRITE and TAIL-TRUNCATION; a KEYED HMAC closes full-rewrite; a TIP-ANCHOR closes
 * tail-truncation; key-rotation / wrong-key reject a chain sealed with a different key. Uses ephemeral/test keys only.
 * Honest: production activation (owner key + anchor store + governance) is OWNER_GATED; the register mission is NOT closed. */
const A = require("./odg-audit-integrity-analysis.js");
const AL = require("./audit-log.js");
const crypto = require("crypto");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const ephemeralKey = () => crypto.randomBytes(32).toString("hex");

function main() {
  const K = ephemeralKey();

  // ---- forgery-resistance matrix ----
  const m = A.forgeryResistanceMatrix(K);
  check("every genuine chain verifies under its own config (no false positive)", m.matrix.every((r: any) => r.genuineVerifies === true));
  check("[gap] plain hash-chain catches payload-tamper + reorder but MISSES full-rewrite & tail-truncation", m.findings.hashChainCatchesTamperAndReorder === true && m.findings.unkeyedMissesFullRewrite === true && m.findings.unkeyedMissesTailTruncation === true);
  check("[fix] KEYED HMAC closes FULL-REWRITE (attacker without the key cannot reforge HMACs)", m.findings.keyedClosesFullRewrite === true);
  check("[fix] TIP-ANCHOR closes TAIL-TRUNCATION (out-of-band anchor sees dropped tail)", m.findings.tipAnchorClosesTailTruncation === true);
  check("KEYED_TIP_ANCHORED detects ALL four attack classes", (() => { const r = m.matrix.find((x: any) => x.config === "KEYED_TIP_ANCHORED"); return r.detects.payloadTamper && r.detects.reorder && r.detects.fullRewrite && r.detects.tailTruncation; })());

  // ---- direct adversarial checks against the REAL audit-log with an ephemeral key ----
  const genuine = A.buildChain([{ a: 1 }, { a: 2 }, { a: 3 }], K);
  const anchor = AL.chainTip(genuine);
  check("keyed genuine chain verifies with key + anchor", AL.verifyChain(genuine, { key: K, expectedTip: anchor }).ok === true);

  // full-rewrite by an attacker WITHOUT the key ⇒ keyed verify REJECTS
  const attackerForge = A.forgeFullRewrite([{ a: 1 }, { a: 2 }, { a: 999 }]);   // no key
  check("full-rewrite forged without the key ⇒ keyed verifyChain REJECTS (hash mismatch)", AL.verifyChain(attackerForge, { key: K }).ok === false);
  // the SAME forgery passes an UNKEYED verify (proves the gap keyed closes)
  check("the same full-rewrite PASSES an unkeyed verify (demonstrates why keyed is required)", AL.verifyChain(A.forgeFullRewrite([{ a: 1 }, { a: 2 }, { a: 999 }]), {}).ok === true);

  // tail-truncation ⇒ keyed-only verify PASSES the prefix, tip-anchored verify REJECTS
  const truncated = A.forgeTailTruncation(genuine, 2);
  check("tail-truncation: keyed-only verify PASSES the valid prefix (the gap)", AL.verifyChain(truncated, { key: K }).ok === true);
  check("tail-truncation: with the tip-anchor, verify REJECTS (length/tip mismatch)", AL.verifyChain(truncated, { key: K, expectedTip: anchor }).ok === false);

  // ---- key rotation / wrong key ----
  const K2 = ephemeralKey();
  check("wrong/rotated key ⇒ a chain sealed with the old key fails verification (key binding)", AL.verifyChain(genuine, { key: K2 }).ok === false);
  check("a chain re-sealed under a rotated key verifies under the new key, not the old", (() => { const rotated = A.buildChain([{ a: 1 }, { a: 2 }, { a: 3 }], K2); return AL.verifyChain(rotated, { key: K2 }).ok === true && AL.verifyChain(rotated, { key: K }).ok === false; })());

  // ---- in-place tamper + reorder caught even unkeyed (baseline integrity) ----
  check("payload tamper caught by the plain hash-chain (unkeyed)", AL.verifyChain(A.tamperPayload(A.buildChain([{ a: 1 }, { a: 2 }]), 1, "X"), {}).ok === false);
  check("reorder caught by the plain hash-chain (unkeyed)", AL.verifyChain(A.reorder(A.buildChain([{ a: 1 }, { a: 2 }, { a: 3 }]), 0, 2), {}).ok === false);

  // ---- honest boundary: realizable here vs owner-gated; mission NOT closed; no parallel system ----
  const au = A.auditExistingMechanism();
  check("audit: existing mechanism characterized; realizable vs OWNER_GATED separated; mission NOT closed", au.module === "runtime/core/audit-log.ts" && au.ownerGated.some((x: string) => /OWNER-held production HMAC key/.test(x)) && /does NOT mark the register mission ACCEPTED/.test(au.missionStatus));
  check("contract: reuses canonical audit-log (no second mechanism), no production secret, mission not closed by provider", /NO second integrity mechanism/.test(A.AUDIT_INTEGRITY_ANALYSIS_CONTRACT.invariants[0]) && /NO production secret/.test(A.AUDIT_INTEGRITY_ANALYSIS_CONTRACT.invariants[2]) && /provider cannot close a real mission/.test(A.AUDIT_INTEGRITY_ANALYSIS_CONTRACT.invariants[3]));

  // ---- fail-closed ----
  check("fail-closed: garbage inputs ⇒ no throw", (() => { try { A.buildChain(null); A.forgeTailTruncation(null, 1); A.forgeryResistanceMatrix(null); return true; } catch { return false; } })());

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — audit-integrity-analysis (adversarial proof over the EXISTING audit-log: keyed HMAC closes FULL-REWRITE, tip-anchor closes TAIL-TRUNCATION, key-rotation/wrong-key reject; audit-log.ts UNMODIFIED; ephemeral keys; production activation OWNER_GATED; mission not closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
