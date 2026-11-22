/**
 * V375 Lot A (G2) — verify MATURITY EVIDENCE against the REAL artefacts (a declared hash is never enough).
 * evidence = { missionContract: "WIC-…", contractPath: "docs/odg/WIC_….json", evidencePath: "docs/odg/evidence/….json",
 *              evidenceSha256 } is accepted ONLY if:
 *   - the contract file exists, parses, its `id` equals missionContract and its `state` is one of the executed/authorized
 *     states (AUTHORIZED, EXECUTING, VERIFIED, ACCEPTED) — PROPOSED/REJECTED/ROLLED_BACK/BLOCKED/DEFERRED do not count;
 *   - the evidence file exists under docs/odg/evidence/ and the SHA-256 RECOMPUTED over its bytes equals evidenceSha256;
 *   - the contract cross-references the evidence path (listed in evidence_required / write_set / text) — else WEAK, refused.
 * Paths are repo-relative, no "..", no absolute, prefix-checked (a symlink inside the repo is NOT re-confined to its directory). Reader is INJECTED (KI passes makeCommittedReader
 * = committed tree only; makeRepoReader = working-tree reader for sandbox tests).
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ATT = require("./odg-knowledge-attestation.js");   // V15: owner-anchored MATURITY_EVIDENCE signature

// V15: only INSPECTED states count (VERIFIED/ACCEPTED); AUTHORIZED/EXECUTING mean "allowed/started", not "inspected".
const COUNTING_STATES = Object.freeze(["VERIFIED", "ACCEPTED"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function safeRel(p: any, prefix: string): boolean {
  return typeof p === "string" && p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..") && p.startsWith(prefix);
}

/* makeCommittedReader(root) -> reads from the COMMITTED tree (git show HEAD:<path>) — uncommitted/unreviewed files never
 * count (inspection MEDIUM). Paths are validated by the caller; git itself confines reads to the repository. */
/* gitEnv(): the caller's GIT_* variables (GIT_DIR, GIT_WORK_TREE, GIT_CONFIG_*, GIT_OBJECT_DIRECTORY…) are STRIPPED, so git
 * reads THIS repository, not one chosen through the environment (inspection H1, partial: the local refs themselves stay
 * writable by a local actor — see the module limits). */
function gitEnv(): any { const e: any = {}; for (const k of Object.keys(process.env)) if (!/^GIT_/.test(k)) e[k] = process.env[k]; return e; }
function makeCommittedReader(root: string, ref?: string): any {
  const cp = require("child_process"); if (ref !== undefined && !(typeof ref === "string" && /^[A-Za-z0-9._\/][A-Za-z0-9._\/-]*$/.test(ref))) return () => null;   // bad ref ⇒ fail-closed (reads nothing)
  const r = typeof ref === "string" ? ref : "HEAD";
  // V15 closure (audit D6): only a regular committed FILE is read — a tree (directory) or a committed symlink (mode 120000) ⇒ null.
  // (inspection L1: a trailing "/" listed a directory's single child) — exact path match via -z, no trailing slash.
  return (rel: string) => { try {
    if (typeof rel !== "string" || !rel || rel.endsWith("/") || rel.includes("\0")) return null;
    const lt = cp.execFileSync("git", ["ls-tree", "-z", r, "--", rel], { cwd: root, stdio: ["ignore", "pipe", "ignore"], env: gitEnv() }).toString("utf8");
    const ents = lt.split("\0").filter(Boolean);
    const m = ents.length === 1 ? /^(100644|100755) blob [0-9a-f]{40,64}\t([\s\S]*)$/.exec(ents[0]) : null;
    if (!m || m[2] !== rel) return null;
    return cp.execFileSync("git", ["show", r + ":" + rel], { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, env: gitEnv() }); } catch { return null; } };
}
/* makeRepoReader(root) -> (relPath) => Buffer | null, WORKING-TREE reader confined to root (symlinks resolved and re-checked) — for sandbox tests. */
function makeRepoReader(root: string): any {
  const base = fs.realpathSync(root);
  return (rel: string) => {
    try {
      const real = fs.realpathSync(path.join(base, rel));
      if (real !== base && !real.startsWith(base + path.sep)) return null;      // escape via symlink ⇒ refused
      return fs.readFileSync(real);
    } catch { return null; }
  };
}

/* verifyMaturityEvidence(ev, reader, expect?) — expect = { claimKey, level }: the CONTRACT must declare, in
 * maturityClaims[], that it supports THIS claim (structured key subject|relation|value) at THIS level (inspection HIGH:
 * an unrelated verified WIC must not qualify every claim). NOTE: the reader must be the caller's OWN trusted reader. */
function verifyMaturityEvidence(ev: any, reader: any, expect?: any): any {
  const deny = (reason: string) => Object.freeze({ ok: false, reason });
  if (!isObj(ev)) return deny("NO_EVIDENCE");
  if (typeof reader !== "function") return deny("NO_READER (declared hashes are never accepted on their own)");
  if (typeof ev.missionContract !== "string" || !/^WIC-[A-Z0-9-]+$/.test(ev.missionContract)) return deny("BAD_CONTRACT_ID");
  if (!safeRel(ev.contractPath, "docs/odg/WIC_") || !/\.json$/.test(ev.contractPath)) return deny("BAD_CONTRACT_PATH");
  if (!safeRel(ev.evidencePath, "docs/odg/evidence/")) return deny("BAD_EVIDENCE_PATH");
  if (typeof ev.evidenceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(ev.evidenceSha256)) return deny("BAD_HASH_FORMAT");
  const cb = reader(ev.contractPath); if (!cb) return deny("CONTRACT_FILE_MISSING");
  let contract: any; try { contract = JSON.parse(cb.toString("utf8")); } catch { return deny("CONTRACT_UNPARSEABLE"); }
  if (contract.id !== ev.missionContract) return deny("CONTRACT_ID_MISMATCH (file id " + String(contract.id) + ")");
  if (!COUNTING_STATES.includes(contract.state)) return deny("CONTRACT_STATE_NOT_COUNTING (" + String(contract.state) + ")");
  const eb = reader(ev.evidencePath); if (!eb) return deny("EVIDENCE_FILE_MISSING");
  const actual = crypto.createHash("sha256").update(eb).digest("hex");
  if (actual !== ev.evidenceSha256) return deny("EVIDENCE_HASH_MISMATCH (recomputed " + actual.slice(0, 12) + "…)");
  const text = cb.toString("utf8");
  if (!text.includes(ev.evidencePath)) return deny("NOT_CROSS_REFERENCED (contract does not mention the evidence by its full path)");
  // V15: the claim binding is MANDATORY (inspection residual LOW 1) — a verified WIC without it qualifies nothing.
  if (!isObj(expect) || typeof expect.claimKey !== "string" || !expect.claimKey || typeof expect.level !== "string" || !expect.level) return deny("NO_CLAIM_BINDING (expect {claimKey, level} is required)");
  {
    const mc = Array.isArray(contract.maturityClaims) ? contract.maturityClaims : [];
    const hit = mc.some((m: any) => isObj(m) && m.claimKey === expect.claimKey && m.level === expect.level && (!m.evidencePath || m.evidencePath === ev.evidencePath));
    if (!hit) return deny("NOT_BOUND_TO_CLAIM (contract does not declare maturityClaims[{claimKey, level}] for this claim/level)");
  }
  // V15 (inspection): the WIC and evidence are provider-authorable ⇒ on their own they would be self-certification. The
  // OWNER must sign {contract, contractPath, contractSha256, evidencePath, evidenceSha256, claimKey, level} (purpose MATURITY_EVIDENCE) with a key
  // anchored in TRUST_ANCHORS.json; the signature sidecar <evidencePath>.sig.json is read through the same reader.
  let signed: any = null; try { const sb = reader(ev.evidencePath + ".sig.json"); signed = sb ? JSON.parse(sb.toString("utf8")) : null; } catch { signed = null; }
  // V15 closure (audit D5): the signature also binds the contract FILE (path + sha256 of its bytes) — a second WIC with
  // the same id elsewhere, or an edited/rolled-back contract, no longer matches.
  const payload = { contract: ev.missionContract, contractPath: ev.contractPath, contractSha256: crypto.createHash("sha256").update(cb).digest("hex"), evidencePath: ev.evidencePath, evidenceSha256: actual, claimKey: expect.claimKey, level: expect.level };
  const o = ATT.verifyOwnerAnchored("MATURITY_EVIDENCE", payload, signed);   // wall clock only: a caller-supplied past clock could revive an expired signature
  if (!o.ok) return deny("NOT_OWNER_SIGNED (" + o.reason + ")");
  return Object.freeze({ ok: true, reason: "VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED", contractState: contract.state, evidenceSha256: actual });
}

module.exports = { verifyMaturityEvidence, makeRepoReader, makeCommittedReader, gitEnv, COUNTING_STATES };
export {};
