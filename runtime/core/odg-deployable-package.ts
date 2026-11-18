#!/usr/bin/env node
"use strict";
/*
 * V296 — DEPLOYABLE PACKAGE IDENTITY & INTEGRITY (qualification control C9). PURE, deterministic, read-only.
 *
 * Extends the V293 source identity (commit → tree digest) to the DEPLOYABLE PACKAGE: given the deployable file set
 * (each {path, sha256}), it builds a sorted, deterministic MANIFEST and a packageDigest = sha256(manifest). The
 * packageDigest is DISTINCT from the source treeDigest (different input: the selected deployable set + per-file
 * digests, not the git-archive tar). A single changed deployable file flips the packageDigest, so any artifact that
 * is not the validated candidate is REFUSED. Excludes secrets by contract. Builds/deploys nothing; crypto-only.
 *
 * Reuses the identity doctrine of odg-artifact-identity (V293); this is its deploy-package complement.
 */
const crypto = require("crypto");

const SECRET_RE = /(^|\/)\.env($|\.)|\.pem$|\.key$|id_rsa|credential|secret|\.p12$|\.pfx$/i;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isHex64(s: any): boolean { return typeof s === "string" && /^[0-9a-f]{64}$/.test(s); }

/** buildPackageManifest(files) -> { ok, fileCount, manifest, packageDigest, algorithm } | { ok:false, reason }. */
function buildPackageManifest(files: any): any {
  if (!Array.isArray(files) || files.length === 0) return Object.freeze({ ok: false, reason: "deployable file list (non-empty) required" });
  const seen = new Set<string>();
  const entries: Array<{ path: string; sha256: string }> = [];
  for (const f of files) {
    if (!isObj(f) || typeof f.path !== "string" || !isHex64(f.sha256)) return Object.freeze({ ok: false, reason: "each file needs { path:string, sha256:64-hex }" });
    if (seen.has(f.path)) return Object.freeze({ ok: false, reason: `duplicate path '${f.path}'` });
    seen.add(f.path);
    entries.push({ path: f.path, sha256: f.sha256 });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));   // deterministic, sorted by PATH
  const manifest = entries.map((e) => `${e.sha256}  ${e.path}`).join("\n") + "\n";
  const packageDigest = crypto.createHash("sha256").update(manifest).digest("hex");
  return Object.freeze({ ok: true, fileCount: entries.length, manifest, packageDigest, algorithm: "sha256(path-sorted '<sha256>  <path>' manifest)" });
}

/** verifyPackage(expected, actualFiles) -> { ok, reason }. Fail-closed: accept ONLY when the recomputed packageDigest matches. */
function verifyPackage(expected: any, actualFiles: any): any {
  const e = isObj(expected) ? expected : {};
  if (!isHex64(e.packageDigest)) return Object.freeze({ ok: false, reason: "expected.packageDigest (64-hex) required" });
  const actual = buildPackageManifest(actualFiles);
  if (!actual.ok) return Object.freeze({ ok: false, reason: `cannot recompute package: ${actual.reason}` });
  if (actual.packageDigest !== e.packageDigest) return Object.freeze({ ok: false, reason: "packageDigest mismatch — artifact is NOT the validated candidate (deploy REFUSED)" });
  return Object.freeze({ ok: true, reason: "deployable package matches the validated candidate" });
}

/** assertNoSecrets(paths) -> { ok, offenders }. The deployable set must contain no secret/credential/personal files. */
function assertNoSecrets(paths: any): any {
  const list = Array.isArray(paths) ? paths.filter((p: any) => typeof p === "string") : [];
  const offenders = list.filter((p: string) => SECRET_RE.test(p));
  return Object.freeze({ ok: offenders.length === 0, offenders: Object.freeze(offenders.slice(0, 20)) });
}

/**
 * qualifyC9(facts) -> honest C9 status. PASS requires the WHOLE chain proven; deny-by-default. facts:
 * { commitExact, artifactBuilt, identityVerifiable, depsSatisfied, nodeCompatible, startupHealthOk, vpsCompatDemonstrated }.
 */
function qualifyC9(facts: any): any {
  const f = isObj(facts) ? facts : {};
  const b = (k: string) => f[k] === true;
  const localChain = b("commitExact") && b("artifactBuilt") && b("identityVerifiable") && b("depsSatisfied") && b("nodeCompatible");
  const vpsProven = b("startupHealthOk") && b("vpsCompatDemonstrated");
  let status: string;
  if (f.artifactBuilt === false) status = "FAIL";                 // the build actually failed
  else if (!localChain) status = "NOT_MEASURED";                  // local chain incomplete
  else if (vpsProven) status = "PASS";                            // full chain incl. real VPS runtime proof
  else status = "PARTIAL";                                        // immutable artifact + identity + local validation, VPS runtime not proven
  const missing = ["commitExact", "artifactBuilt", "identityVerifiable", "depsSatisfied", "nodeCompatible", "startupHealthOk", "vpsCompatDemonstrated"].filter((k) => f[k] !== true);
  return Object.freeze({
    c9Status: status, localChainProven: localChain, vpsRuntimeProven: vpsProven, missing: Object.freeze(missing),
    note: status === "PASS" ? "clean-source build + verifiable identity + real VPS runtime start/health proven"
      : status === "PARTIAL" ? "immutable artifact built from a clean git-archive with a verifiable package identity and local validation; REAL VPS runtime start/health NOT yet demonstrated ⇒ PARTIAL, not PASS"
      : status === "FAIL" ? "the production build failed" : "insufficient reproducible evidence",
  });
}

const DEPLOYABLE_PACKAGE_CONTRACT = Object.freeze({
  id: "V296-DEPLOYABLE-PACKAGE",
  source: "V296 — qualification control C9: immutable deployable package identity + VPS compatibility",
  reuses: Object.freeze(["odg-artifact-identity (V293) commit→tree digest doctrine", "per-file sha256 of the clean-archive deployable set"]),
  notAuthority: "a pure package fingerprint + verifier + C9 qualifier; builds/deploys nothing; changes no status; no new primitive",
  invariants: Object.freeze([
    "packageDigest = sha256 of the sorted '<sha256>  <path>' manifest of the deployable set — DISTINCT from the source treeDigest",
    "a single changed deployable file flips the packageDigest; verifyPackage is fail-closed (accept ONLY the validated candidate)",
    "the deployable set must contain NO secret/credential/personal file (assertNoSecrets)",
    "C9 PASS requires the whole chain: exact commit + built artifact + verifiable identity + deps satisfied + node-compatible + real VPS start/health; deny-by-default",
    "while the artifact is built + identity-verifiable + locally validated but real VPS runtime is unproven, C9 is PARTIAL (never PASS by omission); deterministic + read-only",
  ]),
});

module.exports = { buildPackageManifest, verifyPackage, assertNoSecrets, qualifyC9, DEPLOYABLE_PACKAGE_CONTRACT };
export {};
