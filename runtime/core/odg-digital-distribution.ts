#!/usr/bin/env node
"use strict";
/*
 * V182 §4.2 — digital_distribution (one of V180's three MISSING capabilities). PURE, deterministic, fail-closed, governed.
 *
 * Governs the PREPARATION and governed distribution of digital products: package manifest + semver validation +
 * content checksum, version ledger with traceability + supersede/retract, channel-compatibility checks, rights/licence
 * verification (deny if missing), and publication gating. CRITICAL: real external publication / account creation /
 * contractual commitment / spend is OWNER_GATED — publishDecision NEVER publishes; it returns a prepared record only.
 *
 * No parallel system: reuses crypto for checksums; mints no second registry/scheduler/governance.
 */

const crypto = require("crypto");

const PUBLISH_STATUS = Object.freeze(["PREPARED", "OWNER_GATED", "RETRACTED"]);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function sha256(s: string): string { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

/* preparePackage — deterministic package manifest. Validates semver, computes a content checksum, requires metadata. */
function preparePackage(product: string, version: string, artifacts: any[], metadata?: any): any {
  if (!product) return Object.freeze({ ok: false, code: "NO_PRODUCT" });
  if (!SEMVER.test(String(version))) return Object.freeze({ ok: false, code: "BAD_SEMVER", version });
  const arts = Array.isArray(artifacts) ? artifacts : [];
  if (!arts.length) return Object.freeze({ ok: false, code: "NO_ARTIFACTS" });
  const md = metadata || {};
  const missingMeta = ["title", "description", "license"].filter((k) => !md[k]);
  const files = arts.map((a: any) => Object.freeze({ path: a.path, bytes: Number(a.bytes) || 0, checksum: sha256(`${a.path}:${a.content != null ? a.content : a.bytes}`) }));
  const manifestChecksum = sha256(files.map((f: any) => f.checksum).sort().join("|") + `|${product}@${version}`);
  return Object.freeze({
    ok: true, product, version, files: Object.freeze(files), manifestChecksum,
    metadataComplete: missingMeta.length === 0, missingMetadata: Object.freeze(missingMeta),
    note: missingMeta.length ? "package prepared but metadata incomplete — not publishable until complete" : "package prepared",
  });
}

/* validateRights — deny-by-default: a package with no declared license/rights cannot be distributed. */
function validateRights(pkg: any, declaredLicenses?: string[]): any {
  const lic = Array.isArray(declaredLicenses) ? declaredLicenses : [];
  if (!lic.length) return Object.freeze({ ok: false, code: "NO_LICENSE_DECLARED", note: "deny-by-default: distribution requires an explicit license/rights declaration" });
  return Object.freeze({ ok: true, licenses: Object.freeze(lic.slice()) });
}

/* channelCompatibility — checks a channel's metadata requirements against the package. */
function channelCompatibility(pkg: any, channel: any): any {
  const req = (channel && Array.isArray(channel.requires)) ? channel.requires : [];
  const present = pkg && pkg.ok;
  const missing = req.filter((r: string) => !(present && !pkg.missingMetadata.includes(r)));
  return Object.freeze({ channel: channel && channel.name, compatible: present && missing.length === 0, missing: Object.freeze(missing) });
}

/* publishDecision — ALWAYS OWNER_GATED for real external publication. Never publishes; returns a prepared record only. */
function publishDecision(pkg: any, rights: any, channel: any): any {
  const compat = channelCompatibility(pkg, channel);
  const ready = pkg && pkg.ok && pkg.metadataComplete && rights && rights.ok && compat.compatible;
  return Object.freeze({
    status: "OWNER_GATED",
    published: false,
    readyForOwnerReview: !!ready,
    blockers: Object.freeze([
      ...(pkg && pkg.ok ? [] : ["package-invalid"]),
      ...(pkg && pkg.metadataComplete ? [] : ["metadata-incomplete"]),
      ...(rights && rights.ok ? [] : ["rights-missing"]),
      ...(compat.compatible ? [] : ["channel-incompatible"]),
    ]),
    note: "real external publication / account creation / contractual commitment / spend is OWNER_GATED — this capability prepares and verifies only, it NEVER publishes autonomously",
  });
}

/* versionLedger — pure traceability: supersede + retract over an ordered list (no external state). */
function versionLedger(entries: any[]): any {
  const list = (Array.isArray(entries) ? entries : []).slice().sort((a: any, b: any) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  const latest = list.filter((e: any) => !e.retracted).slice(-1)[0] || null;
  return Object.freeze({
    versions: Object.freeze(list.map((e: any) => Object.freeze({ version: e.version, checksum: e.checksum || null, retracted: !!e.retracted }))),
    latestPublishable: latest ? latest.version : null,
    retracted: Object.freeze(list.filter((e: any) => e.retracted).map((e: any) => e.version)),
    note: "retracted versions remain in the ledger for traceability; they are never the latest-publishable",
  });
}

function retract(entry: any, reason: string): any {
  return Object.freeze({ ...entry, retracted: true, retractReason: reason || "unspecified", note: "retraction is governed + traceable; prevents the version from being distributed" });
}

const DIGITAL_DISTRIBUTION_CONTRACT = Object.freeze({
  id: "V182-DIGITAL-DISTRIBUTION",
  purpose: "§4.2 — governed package preparation, version traceability, rights verification, channel checks, OWNER_GATED publication",
  invariants: Object.freeze([
    "real external publication / account / contractual commitment / spend is OWNER_GATED — publishDecision NEVER publishes",
    "distribution denied by default without an explicit license/rights declaration",
    "semver validated; content + manifest checksums deterministic; metadata completeness enforced before publishability",
    "retracted versions stay in the ledger for traceability and can never be the latest-publishable",
    "deterministic; fail-closed; no parallel registry/system",
  ]),
});

module.exports = { PUBLISH_STATUS, sha256, preparePackage, validateRights, channelCompatibility, publishDecision, versionLedger, retract, DIGITAL_DISTRIBUTION_CONTRACT };
export {};
