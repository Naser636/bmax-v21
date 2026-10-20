#!/usr/bin/env node
"use strict";
/*
 * odg evidence-pack [--repo <dir>] [--out <file>] [--sign]  — ODG builds a portable CRA + AI-Act
 * TECHNICAL-EVIDENCE pack for a local repo and immediately RE-VERIFIES it (tamper-evident). READ-ONLY
 * over the target repo; the only write is the optional --out pack JSON. NO network, NO client data.
 *
 * Thin orchestration over runtime/core/compliance-evidence-pack.js — no new logic. The pack is EVIDENCE +
 * readiness, NOT a certification/conformity assessment. SBOM is npm-lockfile-derived (OS packages NOT covered);
 * an ephemeral ed25519 key (--sign) demonstrates the signing MECHANISM only (not a managed/keyless SLSA-L2 key).
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const ROOT = process.cwd();
const { buildEvidencePack, verifyPack } = require(path.join(ROOT, "runtime", "core", "compliance-evidence-pack.js"));

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const repo = path.resolve(arg("--repo", ROOT));
const out = arg("--out", null);
const doSign = process.argv.includes("--sign");

// READ-ONLY inputs from the target repo.
let lockPackages = {};
const lockPath = path.join(repo, "package-lock.json");
if (fs.existsSync(lockPath)) { try { lockPackages = JSON.parse(fs.readFileSync(lockPath, "utf8")).packages || {}; } catch { lockPackages = {}; } }
let repoName = path.basename(repo);
try { repoName = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).name || repoName; } catch { /* keep basename */ }
let sourceCommit = null;
try { sourceCommit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a git repo */ }
// The attested artifact: the repo's package.json bytes (a stable, present-state artifact).
let artifactBytes = ""; const pkgPath = path.join(repo, "package.json");
if (fs.existsSync(pkgPath)) artifactBytes = fs.readFileSync(pkgPath);

let signer = null;
if (doSign) {
  const kp = crypto.generateKeyPairSync("ed25519");
  signer = { privateKeyPem: kp.privateKey.export({ type: "pkcs8", format: "pem" }), publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }) };
}

const pack = buildEvidencePack({ repoName, sourceCommit, lockPackages, artifactName: repoName + "/package.json", artifactBytes, signer });
const v = verifyPack(pack, { artifactBytes });

console.log("======================================");
console.log("ODG COMPLIANCE EVIDENCE PACK (technical evidence / readiness — NOT certification)");
console.log("======================================");
console.log("repo        :", repoName, sourceCommit ? "@" + sourceCommit.slice(0, 12) : "(no git)");
console.log("SBOM        :", pack.sbom.components.length, "npm components (CycloneDX)");
console.log("provenance  :", pack.signature ? "ed25519-signed (mechanism demo)" : "UNSIGNED");
console.log("re-verify   :", v.ok ? "OK — " + v.reason : "FAIL — " + v.reason);
console.log("--- RESULTS ---"); pack.results.forEach((r) => console.log("  •", r));
console.log("--- GAPS ---"); pack.gaps.forEach((g) => console.log("  !", g));
console.log("--- DISCLAIMER ---\n  ", pack.disclaimer);
if (out) { fs.writeFileSync(out, JSON.stringify(pack, null, 2)); console.log("\nwritten     :", out); }
console.log("======================================");
process.exit(v.ok ? 0 : 1);
