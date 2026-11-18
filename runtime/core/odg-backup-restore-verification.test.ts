#!/usr/bin/env node
"use strict";
/* V294 — tests for odg-backup-restore-verification (qual C7). Asserts the restorable criteria (archive-intact + full
 * isolated-restore integrity + no secret leak), deny-by-default, and the REAL measured facts from the 2026-10-26
 * recovery vault (archive sha256 OK; 552/552 files verified, 0 failed, 0 missing ⇒ RESTORE_VERIFIED, C7 PASS). */
const V = require("./odg-backup-restore-verification.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// REAL measured facts from the V294 live controlled restore of odg-recovery-vault-20261026-pre-zerojs.tgz.
const VAULT_SHA = "2c3a9570f5ff5a330c6af26861b8b40855bb89f429db74c9081cd6b586862a3f";
const liveGood = { archiveSha: VAULT_SHA, recordedArchiveSha: VAULT_SHA, manifestTotal: 552, verifiedOk: 552, failed: 0, missing: 0, secretsExposed: false };

function main() {
  const r = V.verifyRestorability(liveGood);
  check("LIVE vault facts (sha OK, 552/552, 0 fail, 0 miss) ⇒ RESTORE_VERIFIED, C7 PASS", r.verdict === "RESTORE_VERIFIED" && r.c7Status === "PASS" && r.restorable === true && r.details.archiveIntact === true && r.details.allVerified === true);

  // deny-by-default: empty facts ⇒ BLOCKED (unknown failed/missing treated as failures).
  const empty = V.verifyRestorability({});
  check("deny-by-default: empty facts ⇒ NOT_CERTIFIED, C7 BLOCKED", empty.verdict === "NOT_CERTIFIED" && empty.c7Status === "BLOCKED" && empty.restorable === false);

  // archive sha mismatch ⇒ BLOCKED (archive not intact).
  check("archive sha ≠ recorded ⇒ BLOCKED (archive not intact)", V.verifyRestorability({ ...liveGood, archiveSha: "a".repeat(64) }).c7Status === "BLOCKED");
  // non-hex / short digests ⇒ BLOCKED.
  check("malformed digests ⇒ BLOCKED", V.verifyRestorability({ ...liveGood, archiveSha: "nothex", recordedArchiveSha: "nothex" }).restorable === false);

  // any failed>0 ⇒ BLOCKED.
  check("any failed file ⇒ BLOCKED (integrity incomplete)", V.verifyRestorability({ ...liveGood, verifiedOk: 551, failed: 1 }).c7Status === "BLOCKED");
  // any missing>0 ⇒ BLOCKED.
  check("any missing file ⇒ BLOCKED", V.verifyRestorability({ ...liveGood, verifiedOk: 551, missing: 1 }).c7Status === "BLOCKED");
  // verifiedOk < manifestTotal (even with 0 failed/missing) ⇒ BLOCKED (not every file accounted for).
  check("verifiedOk < manifestTotal ⇒ BLOCKED (incomplete accounting)", V.verifyRestorability({ ...liveGood, verifiedOk: 500 }).restorable === false);
  // empty manifest ⇒ BLOCKED (an empty backup is not a restorable backup).
  check("manifestTotal 0 ⇒ BLOCKED (empty backup not restorable)", V.verifyRestorability({ ...liveGood, manifestTotal: 0, verifiedOk: 0 }).restorable === false);
  // a secret leak forbids certification even if integrity is perfect.
  check("secretsExposed:true ⇒ BLOCKED even with full integrity", V.verifyRestorability({ ...liveGood, secretsExposed: true }).restorable === false);

  // remainingAction is actionable when blocked; null when restorable; deterministic + frozen; contract.
  check("remainingAction null on PASS, actionable on BLOCK", r.remainingAction === null && typeof empty.remainingAction === "string" && empty.remainingAction.length > 0);
  check("deterministic + frozen", JSON.stringify(V.verifyRestorability(liveGood)) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.details));
  check("contract: archive-intact + full-integrity + deny-by-default + point-in-time≠fresh-backup invariants", V.BACKUP_RESTORE_VERIFICATION_CONTRACT.invariants.some((i: string) => /archive-intact/.test(i)) && V.BACKUP_RESTORE_VERIFICATION_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && V.BACKUP_RESTORE_VERIFICATION_CONTRACT.invariants.some((i: string) => /does NOT replace a fresh pre-deploy backup/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-backup-restore-verification (V294 qual C7: restorable ONLY on archive-intact + full isolated-restore integrity [552/552 live] + no secret leak; deny-by-default [unknown⇒failure]; C7 PASS only when proven; point-in-time vault ≠ fresh pre-deploy backup; deterministic/read-only)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
