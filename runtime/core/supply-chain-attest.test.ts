// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// supply-chain-attest — reproducible SBOM + in-toto attestation + ed25519 sign/verify; negatives: tampered
// artifact, invalid signature, missing attestation, wrong subject, inconsistent SBOM. JS/TS parity.
// Key is EPHEMERAL (generated in-test, never stored). PROVEN signing mechanism; true SLSA L2 remains BLOCKED.
const assert = require("assert");
const crypto = require("crypto");
const TS = require("./supply-chain-attest.ts");
const JS = require("./supply-chain-attest.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const LOCK = { "": { version: "0.1.0" }, "node_modules/b-pkg": { version: "2.0.0" }, "node_modules/a-pkg": { version: "1.0.0" }, "node_modules/bad": {} };
const artifactBytes = Buffer.from("RELEASE-ARTIFACT-BYTES");
const kp = crypto.generateKeyPairSync("ed25519");
const PUB = kp.publicKey.export({ type: "spki", format: "pem" });
const PRIV = kp.privateKey.export({ type: "pkcs8", format: "pem" });

function mk(mod) {
  const sbom = mod.buildSbom(LOCK, { name: "bmax-v21", version: "0.1.0" });
  const att = mod.buildAttestation({ name: "odg-release", sha256: mod.sha256(artifactBytes) }, sbom, { commit: "abc", builderId: "local" });
  const env = mod.signStatement(att, PRIV);
  return { sbom, att, env };
}

// 1. SBOM deterministic + sorted + skips invalid/root components.
t("buildSbom deterministic, sorted, skips root/invalid", () => {
  const s1 = TS.buildSbom(LOCK), s2 = TS.buildSbom(LOCK);
  assert.strictEqual(JSON.stringify(s1), JSON.stringify(s2));         // reproducible
  assert.strictEqual(s1.components.length, 2);                         // "bad" (no version) + root skipped
  assert.deepStrictEqual(s1.components.map((c) => c.name), ["a-pkg", "b-pkg"]); // sorted by purl
  assert.strictEqual(s1.components[0].purl, "pkg:npm/a-pkg@1.0.0");
});

// 2. positive: generate -> sign -> verify (signature + subject digest + SBOM rebind) ok.
t("sign+verify OK (signature + subject + SBOM consistent)", () => {
  const { sbom, att, env } = mk(TS);
  const v = TS.verifyStatement(att, env, PUB, { artifactBytes, expectName: "odg-release", sbom });
  assert.strictEqual(v.ok, true, v.reason);
  assert.strictEqual(v.checks.sigOk, true);
});

// 3. negative: tampered artifact (digest mismatch).
t("tampered artifact ⇒ digest mismatch ⇒ fail", () => {
  const { att, env } = mk(TS);
  const v = TS.verifyStatement(att, env, PUB, { artifactBytes: Buffer.from("TAMPERED") });
  assert.strictEqual(v.ok, false);
  assert.ok(/digest mismatch/.test(v.reason));
});

// 4. negative: invalid signature (wrong key).
t("invalid signature (wrong public key) ⇒ fail", () => {
  const { att, env } = mk(TS);
  const other = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  const v = TS.verifyStatement(att, env, other, {});
  assert.strictEqual(v.ok, false);
  assert.ok(/invalid signature/.test(v.reason));
});

// 5. negative: missing attestation / signature / key.
t("missing attestation or key ⇒ fail-closed", () => {
  assert.strictEqual(TS.verifyStatement(null, {}, PUB).ok, false);
  const { att } = mk(TS);
  assert.strictEqual(TS.verifyStatement(att, null, PUB).ok, false);
  assert.strictEqual(TS.verifyStatement(att, {}, null).ok, false);
});

// 6. negative: wrong subject name + inconsistent SBOM.
t("wrong subject name / inconsistent SBOM ⇒ fail", () => {
  const { sbom, att, env } = mk(TS);
  assert.ok(/wrong subject name/.test(TS.verifyStatement(att, env, PUB, { expectName: "NOT-IT" }).reason));
  const otherSbom = TS.buildSbom({ "node_modules/z": { version: "9.9.9" } });
  assert.ok(/SBOM digest inconsistent/.test(TS.verifyStatement(att, env, PUB, { sbom: otherSbom }).reason));
});

// 7. parity (SBOM + attestation + verify verdict).
t("JS/TS parity", () => {
  assert.strictEqual(JSON.stringify(TS.buildSbom(LOCK)), JSON.stringify(JS.buildSbom(LOCK)));
  const a = mk(TS), b = mk(JS);
  // attestations differ only by nothing (same inputs) ⇒ identical
  assert.strictEqual(JSON.stringify(a.att), JSON.stringify(b.att));
  // cross-verify: TS-signed verifies under JS and vice versa (same ed25519)
  assert.strictEqual(JS.verifyStatement(a.att, a.env, PUB, { artifactBytes }).ok, true);
  assert.strictEqual(TS.verifyStatement(b.att, b.env, PUB, { artifactBytes }).ok, true);
});

console.log(`\nALL PASS — supply-chain-attest (${n} tests)`);
