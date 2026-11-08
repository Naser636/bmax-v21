#!/usr/bin/env node
"use strict";
const assert = require("assert");
const ATTEST = require("./supply-chain-attest");
const S = require("./p8-slsa-level-gate");
const crypto = require("crypto");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W8 — SLSA LEVEL GATE");

// level inflation: claims L3 with builder 'local' ⇒ DENY_LEVEL_INFLATION (caps at L1).
{
  const r = S.assessSlsaLevel({ statement: { subject: [{ digest: { sha256: "abc" } }], predicate: { slsaLevelClaim: "L3", builder: { id: "local" } } }, requiredLevel: 3, trustedBuilders: ["github-hosted"] });
  check(r.verdict === "DENY_LEVEL_INFLATION" && r.achievedLevel === 1, `L3 claim on local builder ⇒ DENY_LEVEL_INFLATION, achieved L1 (got ${r.verdict}/L${r.achievedLevel})`);
}
// L1 required + well-formed statement ⇒ ADMIT at L1.
{
  const r = S.assessSlsaLevel({ statement: { subject: [{ digest: { sha256: "abc" } }], predicate: {} }, requiredLevel: 1, trustedBuilders: [] });
  check(r.verdict === "ADMIT" && r.achievedLevel === 1, "well-formed statement meets required L1 ⇒ ADMIT");
}
// genuine L2: real signature + trusted builder ⇒ achieves L2.
{
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" });
  const artifact = Buffer.from("artifact-bytes");
  const sha = ATTEST.sha256(artifact);
  const statement = { subject: [{ name: "a", digest: { sha256: sha } }], predicate: { builder: { id: "github-hosted" }, slsaLevelClaim: "L2" } };
  const sig = crypto.sign(null, Buffer.from(ATTEST.canon(statement)), privateKey).toString("base64");
  const r = S.assessSlsaLevel({ statement, envelope: { signature: sig }, publicKeyPem: pub, artifactBytes: artifact, requiredLevel: 2, trustedBuilders: ["github-hosted"] });
  check(r.achievedLevel >= 2 && r.verdict === "ADMIT", `valid sig + trusted builder ⇒ achieves L2 (got L${r.achievedLevel}/${r.verdict})`);
  // same evidence required at L3 (no source/reproducibility) ⇒ caps at L2 ⇒ DENY_LEVEL_INFLATION.
  const r3 = S.assessSlsaLevel({ statement, envelope: { signature: sig }, publicKeyPem: pub, artifactBytes: artifact, requiredLevel: 3, trustedBuilders: ["github-hosted"] });
  check(r3.achievedLevel === 2 && r3.verdict === "DENY_LEVEL_INFLATION", "L2 evidence cannot reach required L3 ⇒ DENY_LEVEL_INFLATION");
}
// malformed ⇒ L0 ⇒ DENY.
check(S.assessSlsaLevel({ statement: null, requiredLevel: 1 }).achievedLevel === 0, "malformed statement ⇒ L0");
check(S.SLSA_LEVEL_GATE_CONTRACT.invariants.some((i: any) => /NEVER trusted/.test(i)), "contract: self-declared claim never trusted");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W8 SLSA LEVEL GATE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
