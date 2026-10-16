#!/usr/bin/env node

"use strict";

/*
 * EVIDENCE PROVENANCE — attributable, tamper-evident stamp for every capability-evidence artifact.
 *
 * ROOT CAUSE this closes (audit C5-A2, V57/V58): capability evidence is written under the gitignored
 * runtime/generated/ with mtime-only freshness — NOT bound to the source revision that produced it and
 * NOT tamper-evident. "Produced this run" (mtime) is a weak signal; it cannot answer "which code state
 * produced this?" nor "has this artifact been altered since?".
 *
 * PRINCIPLE (adapted, not copied). Software supply-chain provenance frameworks converge on two bindings:
 *   - SLSA provenance (slsa.dev): an artifact's provenance MUST attest the SOURCE it was built from, so
 *     trust flows from the revision, never from the artifact's mere presence.
 *   - in-toto attestations / NIST SSDF SP 800-218 (PS.3): bind a SUBJECT to a content DIGEST (sha256) so
 *     any post-hoc mutation is detectable.
 * ODG adopts the BINDING principle at minimum cost — a small, PURE, fail-closed stamp — WITHOUT importing
 * their heavyweight attestation formats or a new engine/primitive. This strengthens the EXISTING EVIDENCE
 * primitive (it does not create a tenth): every artifact now carries WHERE-FROM (git commit + tree-dirty)
 * and WHAT (sha256 of its own payload), composing with the existing run-ownership mtime checks.
 *
 * Pure except an injectable, fail-closed `git` read (opts.spawn). Deterministic given (obj, revision):
 * the digest excludes the provenance field itself, so stamping is stable and never hashes itself. The git
 * resolution NEVER throws (absent repo / absent git ⇒ sourceAvailable:false) and is cached per process
 * ONLY on success (HEAD is immutable within a run; a failed probe retries). No writes, no clock, no network.
 */

const crypto: any = require("crypto");
const { spawnSync }: any = require("child_process");

const SCHEMA = "evidence-provenance/1";

// sha256 of the payload's JSON, EXCLUDING any existing `provenance` field so the digest is self-consistent
// (a stamp never hashes itself) and re-stamping is idempotent on the content.
function contentDigest(obj: any): any {
  let subject;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const { provenance, ...rest } = obj; // eslint-disable-line no-unused-vars
    subject = rest;
  } else {
    subject = { value: obj };
  }
  return crypto.createHash("sha256").update(JSON.stringify(subject)).digest("hex");
}

let _cachedRevision: any = null; // per-process cache, set ONLY on a successful (available) resolution.

// Best-effort source revision: { commit, treeDirty, available }. Fail-closed — any failure (not a git repo,
// git absent, non-zero status, throw) yields { commit:null, treeDirty:null, available:false }, never a throw.
function resolveSourceRevision(opts: any): any {
  const injected = opts && typeof opts.spawn === "function";
  if (!injected && _cachedRevision) return _cachedRevision;
  const spawn = injected ? opts.spawn : spawnSync;
  const git = (args: any) => {
    try {
      const r = spawn("git", args, { encoding: "utf8" });
      return r && r.status === 0 ? String(r.stdout || "").trim() : null;
    } catch {
      return null;
    }
  };
  const commit = git(["rev-parse", "HEAD"]) || null;
  let treeDirty = null;
  if (commit) {
    const porcelain = git(["status", "--porcelain"]);
    treeDirty = porcelain === null ? null : porcelain.length > 0;
  }
  const revision = Object.freeze({ commit, treeDirty, available: !!commit });
  if (!injected && revision.available) _cachedRevision = revision;
  return revision;
}

// Return a NEW object = obj + an additive `provenance` field. Never mutates obj. `opts.revision` overrides
// the resolved revision (for hermetic tests); `opts.runId` records WHICH run captured it (null if absent).
function stampProvenance(obj: any, opts: any): any {
  const options = opts || {};
  const revision = options.revision || resolveSourceRevision(options);
  const provenance = {
    schema: SCHEMA,
    contentSha256: contentDigest(obj),
    sourceCommit: revision.commit != null ? revision.commit : null,
    treeDirty: revision.treeDirty != null ? revision.treeDirty : null,
    sourceAvailable: revision.available === true,
    capturedAtRun: typeof options.runId === "string" && options.runId ? options.runId : null,
  };
  if (obj && typeof obj === "object" && !Array.isArray(obj)) return { ...obj, provenance };
  return { value: obj, provenance };
}

// Verify a stamped artifact's content digest matches its payload (tamper detection). Returns
// { ok, reason }. A missing/malformed provenance stamp is reported, not thrown.
function verifyProvenance(stamped: any): any {
  if (!stamped || typeof stamped !== "object" || Array.isArray(stamped)) return { ok: false, reason: "not a stamped object" };
  const p = stamped.provenance;
  if (!p || typeof p !== "object") return { ok: false, reason: "no provenance stamp" };
  if (p.schema !== SCHEMA) return { ok: false, reason: `unknown provenance schema (${p.schema})` };
  const recomputed = contentDigest(stamped);
  if (recomputed !== p.contentSha256) return { ok: false, reason: `content digest mismatch (recomputed ${recomputed} != stamped ${p.contentSha256}) — artifact altered since stamping` };
  return { ok: true, reason: `content digest verified (sha256 ${recomputed}); source ${p.sourceAvailable ? p.sourceCommit + (p.treeDirty ? " [dirty]" : "") : "UNATTRIBUTED"}` };
}

module.exports = { SCHEMA, contentDigest, resolveSourceRevision, stampProvenance, verifyProvenance };

// Read-only CLI: print the resolved source revision + schema; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ schema: SCHEMA, revision: resolveSourceRevision(null) }, null, 2) + "\n");
}

export {};
