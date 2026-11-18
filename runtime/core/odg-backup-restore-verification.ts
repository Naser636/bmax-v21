#!/usr/bin/env node
"use strict";
/*
 * V294 — BACKUP RESTORABILITY VERIFICATION (qualification control C7). PURE, deterministic, read-only, deny-by-default.
 *
 * Encodes the C7 pass criteria so a backup is certified RESTORABLE only on reproducible proof, never by assertion:
 *   1. the archive is INTACT — its sha256 equals the recorded sha256;
 *   2. a controlled restore into an ISOLATED location reproduced every manifest file, and EVERY file's sha256 matched
 *      the per-file manifest (verifiedOk === manifestTotal, failed === 0, missing === 0, manifestTotal > 0);
 *   3. no secret was exposed during verification.
 * Deny-by-default: absent/short facts ⇒ NOT restorable ⇒ C7 stays BLOCKED. This changes no status and performs no I/O;
 * the caller supplies the measured facts from an actual isolated restore. No new primitive.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isHex64(s: any): boolean { return typeof s === "string" && /^[0-9a-f]{64}$/.test(s); }
function nonNegInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/**
 * verifyRestorability(facts) -> frozen verdict. facts = { archiveSha, recordedArchiveSha, manifestTotal, verifiedOk,
 * failed, missing, secretsExposed? }. restorable only when archive-intact AND every manifest file verified AND no leak.
 */
function verifyRestorability(facts: any): any {
  const f = isObj(facts) ? facts : {};
  const archiveIntact = isHex64(f.archiveSha) && isHex64(f.recordedArchiveSha) && f.archiveSha === f.recordedArchiveSha;
  const total = nonNegInt(f.manifestTotal) ? f.manifestTotal : 0;
  const ok = nonNegInt(f.verifiedOk) ? f.verifiedOk : -1;
  const failed = nonNegInt(f.failed) ? f.failed : 1;        // deny-by-default: unknown ⇒ treat as a failure
  const missing = nonNegInt(f.missing) ? f.missing : 1;     // deny-by-default: unknown ⇒ treat as missing
  const allVerified = total > 0 && ok === total && failed === 0 && missing === 0;
  const noSecretLeak = f.secretsExposed !== true;           // a known leak forbids certification
  const restorable = archiveIntact && allVerified && noSecretLeak;

  const details = Object.freeze({
    archiveIntact, allVerified, noSecretLeak,
    manifestTotal: total, verifiedOk: ok, failed, missing,
  });
  const remainingAction = restorable ? null
    : !archiveIntact ? "archive sha256 does not match the recorded digest — archive not intact"
    : !allVerified ? `restore integrity incomplete (${ok}/${total} ok, ${failed} failed, ${missing} missing) — re-run the isolated restore + per-file verify`
    : "a secret was exposed during verification — redo without exposing secrets";
  return Object.freeze({
    verdict: restorable ? "RESTORE_VERIFIED" : "NOT_CERTIFIED",
    c7Status: restorable ? "PASS" : "BLOCKED",
    restorable, details, remainingAction,
    note: "read-only; certifies restorability ONLY on reproducible proof (archive-intact + full isolated-restore integrity + no secret leak); deny-by-default; a point-in-time vault proof does not replace a fresh pre-deploy backup (owner-gated at cutover).",
  });
}

const BACKUP_RESTORE_VERIFICATION_CONTRACT = Object.freeze({
  id: "V294-BACKUP-RESTORE-VERIFICATION",
  source: "V294 — qualification control C7: a backup is RESTORABLE only on reproducible proof",
  reuses: Object.freeze(["sha256 archive-digest + per-file manifest from an actual isolated restore (caller-measured)"]),
  notAuthority: "a pure restorability verdict; performs no I/O, extracts nothing, changes no status; no new primitive",
  invariants: Object.freeze([
    "restorable requires BOTH archive-intact (sha256 == recorded) AND full isolated-restore integrity (verifiedOk===manifestTotal, 0 failed, 0 missing, total>0)",
    "deny-by-default: absent/unknown failed/missing counts are treated as failures ⇒ NOT restorable",
    "a known secret exposure forbids certification",
    "C7 ⇒ PASS only when restorable; otherwise BLOCKED — never PASS by assertion",
    "a point-in-time vault proof does NOT replace a fresh pre-deploy backup (owner-gated at cutover); deterministic + read-only",
  ]),
});

module.exports = { verifyRestorability, BACKUP_RESTORE_VERIFICATION_CONTRACT };
export {};
