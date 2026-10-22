/*
 * ODG evidence-pack (R9-lite) — product harness test. Verifies the thin productization composes the proven
 * supply-chain-attest engine into a reproducible, fail-closed, deliverable pack. Self-contained temp output;
 * deterministic via an injected keypair. No network, no secrets.
 * Run: node_modules/.bin/tsx src/runtime/odg-evidence-pack.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const REPO = process.cwd();
const ep = require(path.join(REPO, "runtime/bin/odg-evidence-pack.ts"));
const sc = require(path.join(REPO, "runtime/core/supply-chain-attest.js"));

let failures = 0;
function check(c: boolean, label: string): void { if (c) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const LOCK = {
  "": { name: "demo-app", version: "1.2.3" },
  "node_modules/express": { version: "4.19.2", license: "MIT" },
  "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" },
  "node_modules/unknown-lib": { version: "0.0.1" },
  "node_modules/.bin/x": { version: undefined }, // malformed ⇒ skipped
};
const KP = crypto.generateKeyPairSync("ed25519"); // injected ⇒ deterministic across runs in this process

console.log("ODG evidence-pack (R9-lite) — product harness");

// 1 — pack builds; SBOM reconciles (3 real comps; malformed skipped); provenance self-verifies.
const pack = ep.buildEvidencePack(LOCK, { name: "demo-app", version: "1.2.3", publicKey: KP.publicKey, privateKey: KP.privateKey });
check(pack.summary.components === 3 && pack.summary.reconciles === true, "SBOM 3 components, reconciles (malformed entry skipped)");
check(pack.summary.provenanceVerified === true && pack.summary.ok === true, "provenance self-verifies; summary.ok=true");
check(pack.summary.slsa.includes("L2 BLOCKED"), "SLSA honestly declares L2 BLOCKED");

// 2 — licence risk: copyleft + unknown surfaced (no false all-clear).
check(pack.licenceRisk.copyleft.includes("gpl-lib") && pack.licenceRisk.unknown.includes("unknown-lib"), "licence risk surfaces copyleft (gpl-lib) + unknown (unknown-lib)");

// 3 — reproducibility: same inputs + same key ⇒ identical SBOM digest.
const pack2 = ep.buildEvidencePack(LOCK, { name: "demo-app", version: "1.2.3", publicKey: KP.publicKey, privateKey: KP.privateKey });
check(pack2.summary.sbomDigest === pack.summary.sbomDigest, "reproducible (identical SBOM digest)");

// 4 — tamper guard: altering the attestation subject ⇒ verifyStatement fails (no false success).
const tam = JSON.parse(JSON.stringify(pack.attestation)); tam.subject[0].digest.sha256 = sc.sha256("x");
check(sc.verifyStatement(tam, pack.envelope, KP.publicKey, {}).ok === false, "tampered attestation ⇒ verify fails");

// 5 — empty input ⇒ honest 0-component flagged pack (not false success).
const empty = ep.buildEvidencePack({}, { name: "e", publicKey: KP.publicKey, privateKey: KP.privateKey });
check(empty.summary.components === 0 && empty.summary.empty === true, "empty lockfile ⇒ 0-component pack flagged empty (honest)");

// 6 — invalid input ⇒ throws (fail-closed).
let threw = false; try { ep.buildEvidencePack(null); } catch { threw = true; }
check(threw, "invalid lockfile ⇒ throws (fail-closed)");

// 7 — writePack emits the deliverable files + a report with explicit limits + exclusions.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ep-"));
try {
  const files = ep.writePack(pack, dir);
  const names = files.map((f: any) => f.file);
  check(["sbom.cdx.json", "attestation.intoto.json", "licence-risk.json", "summary.json", "report.md"].every((n) => names.includes(n)), "pack writes all deliverable files with sha256");
  const report = fs.readFileSync(path.join(dir, "report.md"), "utf8");
  check(/Limits/.test(report) && /NOT a certification|not a certification/.test(report) && /Liability exclusions/.test(report), "report states explicit limits + liability exclusions (readiness-not-certification)");
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

// 8–11 — verifyArtifactIntegrity (release-artifact verification vs a published hash) — hermetic.
{
  const bytes = Buffer.from("odg release artifact test payload");
  const sriOk = "sha512-" + crypto.createHash("sha512").update(bytes).digest("base64");
  const sha1Ok = crypto.createHash("sha1").update(bytes).digest("hex");
  check(ep.verifyArtifactIntegrity(bytes, sriOk).ok === true, "SRI sha512 matches ⇒ ok (release artifact verified)");
  check(ep.verifyArtifactIntegrity(bytes, sha1Ok).ok === true, "npm sha1 shasum matches ⇒ ok");
  const tampered = Buffer.from(bytes); tampered[0] ^= 0xff;
  check(ep.verifyArtifactIntegrity(tampered, sriOk).ok === false, "tampered bytes vs published SRI ⇒ ok:false (no false success)");
  check(ep.verifyArtifactIntegrity(bytes, "not-a-valid-integrity").ok === false, "unrecognised integrity format ⇒ ok:false (fail-closed)");
}

console.log(`\nodg-evidence-pack — ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (R9-lite product harness; reuses supply-chain-attest; no new primitive).`);
process.exit(failures === 0 ? 0 : 1);
