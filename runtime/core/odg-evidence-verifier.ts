/**
 * V375 Lot A (G2) — verify MATURITY EVIDENCE against the REAL artefacts (a declared hash is never enough).
 * evidence = { missionContract: "WIC-…", contractPath: "docs/odg/WIC_….json", evidencePath: "docs/odg/evidence/….json",
 *              evidenceSha256 } is accepted ONLY if:
 *   - the contract file exists, parses, its `id` equals missionContract and its `state` is one of the executed/authorized
 *     states (AUTHORIZED, EXECUTING, VERIFIED, ACCEPTED) — PROPOSED/REJECTED/ROLLED_BACK/BLOCKED/DEFERRED do not count;
 *   - the evidence file exists under docs/odg/evidence/ and the SHA-256 RECOMPUTED over its bytes equals evidenceSha256;
 *   - the contract cross-references the evidence path (listed in evidence_required / write_set / text) — else WEAK, refused.
 * Paths are repo-relative, no "..", no absolute, confined to their directory. The file reader is INJECTED (makeRepoReader
 * gives a confined fs reader) so the check is testable and cannot be redirected outside the repository.
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const COUNTING_STATES = Object.freeze(["AUTHORIZED", "EXECUTING", "VERIFIED", "ACCEPTED"]);
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function safeRel(p: any, prefix: string): boolean {
  return typeof p === "string" && p.length > 0 && !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..") && p.startsWith(prefix);
}

/* makeRepoReader(root) -> (relPath) => Buffer | null, confined to root (symlinks resolved and re-checked). */
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

function verifyMaturityEvidence(ev: any, reader: any): any {
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
  if (!text.includes(ev.evidencePath) && !text.includes(path.basename(ev.evidencePath))) return deny("NOT_CROSS_REFERENCED (contract does not mention the evidence)");
  return Object.freeze({ ok: true, reason: "VERIFIED_ON_REAL_FILES", contractState: contract.state, evidenceSha256: actual });
}

module.exports = { verifyMaturityEvidence, makeRepoReader, COUNTING_STATES };
export {};
