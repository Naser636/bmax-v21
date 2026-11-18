#!/usr/bin/env node
"use strict";
/*
 * V293 Lot A — ARTIFACT IDENTITY & REPRODUCIBILITY (qualification control C11). PURE, deterministic, read-only.
 *
 * Binds a release artifact to an EXACT, reproducible identity: the git commit + a sha256 of the deterministic
 * `git archive --format=tar <commit>` byte stream (git archive is reproducible for a fixed commit — the mtime is the
 * commit's, not wall-clock). This gives a commit→digest fingerprint that an operator can recompute on any host and an
 * independent party can verify, so a deployment can be PROVEN to carry exactly the qualified commit (protection: never
 * deploy a commit different from the one qualified).
 *
 * Testable + host-agnostic: the archive bytes are INJECTED (no spawn here) so the digest math is verified hermetically;
 * the reproducible command is documented in GIT_ARCHIVE_SPEC for operators. No new primitive; crypto-only.
 */
const crypto = require("crypto");

const GIT_ARCHIVE_SPEC = Object.freeze({
  command: "git archive --format=tar <commit> | sha256sum",
  algorithm: "sha256(git archive --format=tar <commit>)",
  reproducible: "git archive is byte-stable for a fixed commit (entry mtime = commit time, not wall-clock)",
});

function isHexSha(s: any): boolean { return typeof s === "string" && /^[0-9a-f]{7,64}$/.test(s); }
function toBytes(v: any): any { if (v == null) return null; if (typeof v === "string") return Buffer.from(v); if (Buffer.isBuffer(v)) return v; if (v instanceof Uint8Array) return Buffer.from(v); return null; }

/** computeArtifactIdentity({commit, archive}) -> { ok, commit, treeDigest, algorithm, byteLength } | { ok:false, reason }. */
function computeArtifactIdentity(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  if (!isHexSha(i.commit)) return Object.freeze({ ok: false, reason: "commit must be a hex sha (7-64 chars)" });
  const bytes = toBytes(i.archive);
  if (!bytes || bytes.length === 0) return Object.freeze({ ok: false, reason: "archive bytes required (Buffer/Uint8Array/string)" });
  const treeDigest = crypto.createHash("sha256").update(bytes).digest("hex");
  return Object.freeze({ ok: true, commit: i.commit, treeDigest, algorithm: GIT_ARCHIVE_SPEC.algorithm, byteLength: bytes.length });
}

/**
 * verifyArtifactIdentity(expected, actualInput) -> { ok, reason }. The PROTECTION enforcement: an artifact is accepted
 * ONLY when its recomputed commit AND treeDigest both equal the expected (qualified) identity — fail-closed otherwise.
 */
function verifyArtifactIdentity(expected: any, actualInput: any): any {
  const e = expected && typeof expected === "object" ? expected : {};
  if (!isHexSha(e.commit) || typeof e.treeDigest !== "string" || e.treeDigest.length !== 64) return Object.freeze({ ok: false, reason: "expected identity incomplete (needs commit + 64-hex treeDigest)" });
  const actual = computeArtifactIdentity(actualInput);
  if (!actual.ok) return Object.freeze({ ok: false, reason: `cannot recompute actual identity: ${actual.reason}` });
  if (actual.commit !== e.commit) return Object.freeze({ ok: false, reason: `commit mismatch: expected ${e.commit}, got ${actual.commit}` });
  if (actual.treeDigest !== e.treeDigest) return Object.freeze({ ok: false, reason: "treeDigest mismatch — artifact is NOT the qualified commit (deploy REFUSED)" });
  return Object.freeze({ ok: true, reason: "artifact identity matches the qualified commit + digest" });
}

const ARTIFACT_IDENTITY_CONTRACT = Object.freeze({
  id: "V293-ARTIFACT-IDENTITY",
  source: "V293 Lot A — reproducible artifact identity for qualification control C11 + deploy-the-qualified-commit protection",
  spec: GIT_ARCHIVE_SPEC,
  notAuthority: "a pure fingerprint + verifier; deploys nothing, changes no status; no new primitive",
  invariants: Object.freeze([
    "identity = commit + sha256 of the deterministic `git archive --format=tar <commit>` stream (reproducible across hosts)",
    "verifyArtifactIdentity is fail-closed: accept ONLY when commit AND treeDigest both match the qualified identity",
    "deterministic: identical archive bytes ⇒ identical digest; different bytes ⇒ different digest",
    "host-agnostic + hermetic test (archive bytes injected); crypto-only; read-only",
  ]),
});

module.exports = { computeArtifactIdentity, verifyArtifactIdentity, GIT_ARCHIVE_SPEC, ARTIFACT_IDENTITY_CONTRACT };
export {};
