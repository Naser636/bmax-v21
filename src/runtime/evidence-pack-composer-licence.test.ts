/*
 * ODG evidence-pack — composer.lock LICENCE extraction (CTO continuation).
 * Proves licence-risk now covers composer.lock (per-package SPDX `license`), merged with npm, with an honest
 * analyzedEcosystems/note; npm path unchanged; fail-closed. Hermetic: in-memory sources + temp dirs, no network.
 * Run: node_modules/.bin/tsx src/runtime/evidence-pack-composer-licence.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const REPO = process.cwd();
const ep = require(path.join(REPO, "runtime/bin/odg-evidence-pack.ts"));
let failures = 0;
function check(c: boolean, label: string): void { if (c) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const COMPOSER = JSON.stringify({
  packages: [
    { name: "monolog/monolog", version: "3.5.0", license: ["MIT"] },
    { name: "copyleft/lib", version: "1.0.0", license: ["GPL-3.0-or-later"] },
    { name: "nolicence/pkg", version: "0.1.0" }, // no license ⇒ unknown
  ],
  "packages-dev": [{ name: "phpunit/phpunit", version: "10.5.5", license: ["BSD-3-Clause"] }],
});
const NPM = JSON.stringify({ packages: { "node_modules/express": { version: "4.19.2", license: "MIT" }, "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" } } });
const KP = crypto.generateKeyPairSync("ed25519");

console.log("ODG evidence-pack — composer.lock licence extraction (hermetic)");

// 1 — direct extractor: copyleft + unknown surfaced; licensed counted; packages-dev included.
const r = ep.licenceRiskComposer(COMPOSER);
check(r.copyleft.includes("copyleft/lib") && r.unknown.includes("nolicence/pkg") && r.licensed === 3, "composer licence: copyleft (GPL) + unknown surfaced, 3 licensed (incl packages-dev BSD)");

// 2 — malformed composer.lock ⇒ zero risk, no throw (fail-closed).
let threw = false; let z: any;
try { z = ep.licenceRiskComposer("{not json"); } catch { threw = true; }
check(!threw && z && z.licensed === 0 && z.unknownCount === 0 && z.copyleftCount === 0, "malformed composer.lock ⇒ zero risk, no throw (fail-closed)");

// 3 — buildEvidencePackMulti: composer-only repo ⇒ analyzedEcosystems [composer], copyleft surfaced (no false 'not analyzed').
const composerOnly = ep.buildEvidencePackMulti([{ content: COMPOSER, ecosystem: "composer", manifest: "composer.lock" }], { publicKey: KP.publicKey, privateKey: KP.privateKey });
check(composerOnly.summary.licence.analyzedEcosystems.join(",") === "composer" && composerOnly.summary.licence.copyleft === 1 && composerOnly.summary.licence.unknown === 1, "composer-only ⇒ licence analyzed (analyzedEcosystems=[composer], copyleft=1, unknown=1)");
check(!composerOnly.summary.licence.note || !/no licence-bearing/i.test(composerOnly.summary.licence.note), "composer-only ⇒ no false 'not analyzed' note");

// 4 — npm + composer ⇒ analyzedEcosystems [npm,composer], merged copyleft (gpl-lib + copyleft/lib).
const both = ep.buildEvidencePackMulti([{ content: NPM, ecosystem: "npm", manifest: "package-lock.json" }, { content: COMPOSER, ecosystem: "composer", manifest: "composer.lock" }], { publicKey: KP.publicKey, privateKey: KP.privateKey });
check(both.summary.licence.analyzedEcosystems.slice().sort().join(",") === "composer,npm", "npm+composer ⇒ analyzedEcosystems [composer,npm]");
check(both.licenceRisk.copyleft.includes("gpl-lib") && both.licenceRisk.copyleft.includes("copyleft/lib"), "merged copyleft includes npm gpl-lib AND composer copyleft/lib");

// 5 — honest note when a non-licence-bearing ecosystem is present alongside.
const withCargo = ep.buildEvidencePackMulti([{ content: COMPOSER, ecosystem: "composer", manifest: "composer.lock" }, { content: '[[package]]\nname="serde"\nversion="1.0.0"\n', ecosystem: "cargo", manifest: "Cargo.lock" }], { publicKey: KP.publicKey, privateKey: KP.privateKey });
check(/NOT analyzed for cargo/i.test(withCargo.summary.licence.note || ""), "honest note: cargo present ⇒ 'NOT analyzed for cargo' (no licence metadata there)");

// 6 — npm-path NON-REGRESSION: single-lockfile buildEvidencePack licence unchanged.
const LOCK = { "node_modules/express": { version: "4.19.2", license: "MIT" }, "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" }, "node_modules/unknown-lib": { version: "0.0.1" } };
const npmPack = ep.buildEvidencePack(LOCK, { name: "n", publicKey: KP.publicKey, privateKey: KP.privateKey });
check(npmPack.licenceRisk.copyleft.includes("gpl-lib") && npmPack.licenceRisk.unknown.includes("unknown-lib") && (npmPack.summary as any).licence.analyzedEcosystems === undefined, "npm buildEvidencePack licence unchanged (no analyzedEcosystems field)");

// 7 — end-to-end over a temp composer repo dir (detection + licence).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "composer-repo-"));
  try {
    fs.writeFileSync(path.join(dir, "composer.lock"), COMPOSER);
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(pack.summary.ecosystems.includes("composer") && pack.summary.licence.analyzedEcosystems.includes("composer") && pack.summary.licence.copyleft === 1, "repo dir with composer.lock ⇒ SBOM + licence analyzed (copyleft surfaced)");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

console.log(`\nevidence-pack-composer-licence — ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (composer licence merged with npm; honest coverage; engine untouched).`);
process.exit(failures === 0 ? 0 : 1);
