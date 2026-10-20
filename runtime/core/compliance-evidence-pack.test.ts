// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// compliance-evidence-pack (Lot F) — composes SBOM+attestation+robustness into a re-verifiable pack; negatives:
// tampered artifact ⇒ verify fails; empty lockfile ⇒ SBOM-empty gap; missing inputs ⇒ NOT_ASSESSED (no silent PASS).
const assert = require("assert");
const crypto = require("crypto");
const TS = require("./compliance-evidence-pack.ts");
const JS = require("./compliance-evidence-pack.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const LOCK = { "": { version: "1.0.0" }, "node_modules/a": { version: "1.0.0" }, "node_modules/b": { version: "2.0.0" } };
const art = Buffer.from("ARTIFACT-v1");

// 1. signed pack builds + verifies (genuine).
t("signed pack builds + verifies", () => {
  const kp = crypto.generateKeyPairSync("ed25519");
  const signer = { privateKeyPem: kp.privateKey.export({ type: "pkcs8", format: "pem" }), publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }) };
  const pack = TS.buildEvidencePack({ repoName: "demo", sourceCommit: "abc", lockPackages: LOCK, artifactName: "demo@1", artifactBytes: art, signer,
    aiAct: { assessed: 10, partial: 6, blocked: 1, gap: 1, notAssessed: 2 },
    robustnessCases: [{ name: "ok", expected: { result: "ok", writeSet: [], requiredSteps: [], requiredEvidence: [] }, observed: { result: "ok", filesTouched: [], steps: [], evidence: [], reproducible: true, status: "PASS", claimedSuccess: true } }] });
  assert.strictEqual(pack.sbom.components.length, 2);
  assert.ok(pack.signature && pack.facts.length && pack.results.length);
  assert.strictEqual(TS.verifyPack(pack, { artifactBytes: art }).ok, true);
});

// 2. tampered artifact ⇒ verifyPack fails (tamper-evident).
t("tampered artifact ⇒ verify fails", () => {
  const kp = crypto.generateKeyPairSync("ed25519");
  const signer = { privateKeyPem: kp.privateKey.export({ type: "pkcs8", format: "pem" }), publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }) };
  const pack = TS.buildEvidencePack({ repoName: "demo", lockPackages: LOCK, artifactName: "x", artifactBytes: art, signer });
  const v = TS.verifyPack(pack, { artifactBytes: Buffer.from("TAMPERED") });
  assert.strictEqual(v.ok, false);
  assert.ok(/mismatch|tampered/.test(v.reason));
});

// 3. empty lockfile ⇒ SBOM empty + explicit gap (not hidden).
t("empty lockfile ⇒ SBOM empty gap", () => {
  const pack = TS.buildEvidencePack({ repoName: "empty", lockPackages: {}, artifactName: "x", artifactBytes: art });
  assert.strictEqual(pack.sbom.components.length, 0);
  assert.ok(pack.gaps.some((g) => /SBOM empty/.test(g)));
});

// 4. missing AI-Act + robustness ⇒ NOT_ASSESSED, never a silent PASS.
t("missing inputs ⇒ NOT_ASSESSED (no silent PASS)", () => {
  const pack = TS.buildEvidencePack({ repoName: "min", lockPackages: LOCK, artifactName: "x", artifactBytes: art });
  assert.ok(pack.results.some((r) => /AI-Act readiness: NOT_ASSESSED/.test(r)));
  assert.ok(pack.results.some((r) => /Robustness: NOT_ASSESSED/.test(r)));
  assert.ok(pack.results.every((r) => !/PASS\b/.test(r) || /NOT_ASSESSED/.test(r))); // no fabricated PASS
  // always carries the honest non-certification disclaimer + SLSA-L2 gap
  assert.ok(/NOT certification/.test(pack.disclaimer));
  assert.ok(pack.gaps.some((g) => /SLSA.*L2/.test(g)));
});

// 5. unsigned pack: not verifiable without artifactBytes; verifiable (digest) with them; parity.
t("unsigned pack digest-verify + parity", () => {
  const pack = TS.buildEvidencePack({ repoName: "u", lockPackages: LOCK, artifactName: "x", artifactBytes: art });
  assert.strictEqual(TS.verifyPack(pack, {}).ok, false);                         // no sig + no bytes
  assert.strictEqual(TS.verifyPack(pack, { artifactBytes: art }).ok, true);      // digest match
  assert.strictEqual(TS.verifyPack(pack, { artifactBytes: Buffer.from("X") }).ok, false);
  // parity (deterministic parts: sbom + facts/results/gaps; attestation identical for same inputs)
  const a = TS.buildEvidencePack({ repoName: "u", lockPackages: LOCK, artifactName: "x", artifactBytes: art });
  const b = JS.buildEvidencePack({ repoName: "u", lockPackages: LOCK, artifactName: "x", artifactBytes: art });
  assert.deepStrictEqual(a.sbom, b.sbom);
  assert.deepStrictEqual(a.attestation, b.attestation);
  assert.deepStrictEqual({ f: a.facts, r: a.results, g: a.gaps }, { f: b.facts, r: b.results, g: b.gaps });
});

console.log(`\nALL PASS — compliance-evidence-pack (${n} tests)`);
