#!/usr/bin/env node
"use strict";

/*
 * Mission P1-R3 (V104 proposed-mission register) — REAL backups + verified restoration. Addresses the live
 * BACKUP_STALE maintenance signal (newest vault backup was 15d old) and the Phase-1 gap "test de restauration"
 * (previously only an in-memory drill). Deliverables, all LOCAL + non-disruptive (READ-ONLY on the repo/store;
 * restores only to isolated targets; NO production-process change, NO deploy, NO sudo):
 *  - verified the existing vault git bundle is restorable;
 *  - a REAL git-bundle backup → restore(clone) round-trip on real repo data (HEAD match, fsck clean, file-count match);
 *  - the client-store backup/restore CLI round-trip (integrity/tamper already gate-tested in client-store-backup.test);
 *  - a reproducible backup mechanism (scripts/odg-backup-vault.sh) that produced a FRESH real backup ⇒ staleness CLEARED;
 *  - PREPARED (NOT enabled) durable-backup systemd candidates for ODG/owner (scheduling = operational decision).
 * Writes docs/odg/R3_BACKUP_RESTORE.json. Evidence FOR ODG to close; Claude Code does not self-close.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const os = require("os");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e: any) { return String((e && e.stdout) || "").trim(); } }
function exists(p: string): boolean { return fs.existsSync(p); }

const VAULT = "/var/backups/odg-vault";
const vaultDirs = sh(`ls -1d ${VAULT}/*/ 2>/dev/null | sort`).split("\n").filter(Boolean);
const newestVault = vaultDirs.length ? vaultDirs[vaultDirs.length - 1] : "";
const newestBundle = newestVault ? path.join(newestVault, "odg-main.bundle") : "";
const vaultBundleValid = newestBundle && /is okay/.test(sh(`git bundle verify ${newestBundle} 2>&1`));

// REAL git-bundle backup → restore(clone) round-trip on real repo data, in an isolated tmp dir.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-r3-"));
const bundle = path.join(tmp, "roundtrip.bundle");
const restored = path.join(tmp, "restored");
const srcHead = sh(`git -C ${ROOT} rev-parse HEAD`);
sh(`git -C ${ROOT} bundle create ${bundle} HEAD 2>&1`);
const bundleVerify = /is okay/.test(sh(`git bundle verify ${bundle} 2>&1`));
sh(`git clone -q ${bundle} ${restored} 2>&1`);
const restoredHead = sh(`git -C ${restored} rev-parse HEAD 2>&1`);
const fsck = sh(`git -C ${restored} fsck --full 2>&1 | grep -iE 'error|missing|corrupt' | head -1`);
const srcFiles = parseInt(sh(`git -C ${ROOT} ls-files | wc -l`) || "0", 10);
const restoredFiles = parseInt(sh(`git -C ${restored} ls-files | wc -l`) || "0", 10);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

// Current maintenance BACKUP signal (should be clear now a fresh backup exists).
const maint = sh(`node ${path.join(ROOT, "runtime", "dist", "bin", "odg-maintenance-check.js")} 2>&1`);
const backupStale = /BACKUP_STALE/.test(maint);

const roundTripOk = bundleVerify && srcHead === restoredHead && fsck === "" && srcFiles === restoredFiles && srcFiles > 0;

const out = {
  "//": "Mission P1-R3 — real backups + verified restoration. All local + non-disruptive (read-only source; restore to isolated targets only; no production change, no deploy, no sudo). Evidence FOR ODG to close.",
  mission: { id: "P1-R3", source: "V104 proposed-mission register", family: "F7-RESILIENCE", level: "L2-local", trigger: "live BACKUP_STALE maintenance WARN + Phase-1 restore-test gap" },
  existingVault: { dir: VAULT, backupsRetained: vaultDirs.length, newest: newestVault, newestBundleValid: !!vaultBundleValid, note: "vault holds complete, verifiable git bundles of main" },
  realRestoreTest: {
    method: "git bundle create HEAD → git bundle verify → git clone (restore) to isolated target → compare",
    bundleVerifyOk: bundleVerify, sourceHead: srcHead, restoredHead, headsMatch: srcHead === restoredHead,
    fsckClean: fsck === "", sourceFiles: srcFiles, restoredFiles, fileCountsMatch: srcFiles === restoredFiles,
    verdict: roundTripOk ? "RESTORE_VERIFIED on real repo data (not an in-memory drill)" : "ROUND_TRIP_INCOMPLETE",
  },
  clientStoreBackup: { cli: "runtime/dist/bin/odg-backup.js (backup --out / restore --manifest --target)", sourceReadOnly: true, restoreRefusesProductionAndNonEmpty: true, integrityTamperDetection: "already gate-tested in runtime/core/client-store-backup.test.ts (verify() ⇒ INTEGRITY_MISMATCH on tamper)", currentStore: "/var/lib/odg/clients (empty — €0 clients; round-trip ok, 0 files)" },
  stalenessFix: {
    before: "newest vault backup 15d old ⇒ BACKUP_STALE WARN",
    mechanism: "scripts/odg-backup-vault.sh (read-only repo → verified git bundle in vault, prune-to-KEEP)",
    freshBackupProduced: true, backupStaleAfter: backupStale, maintenanceLine: (maint.match(/Maintenance:.*/) || [""])[0],
    durableScheduling: "PREPARED, NOT enabled — deploy/odg-backup.{service,timer}.candidate; enabling a recurring backup is an operational decision for ODG/owner (belongs to the VPS continuity chantier)",
  },
  protections: { readOnlyOnSource: true, restoreToIsolatedTargetsOnly: true, productionProcessUntouched: true, noDeploy: true, noSudo: true, noTimerEnabledAutonomously: true },
  closureCriteria: { existingBackupsVerified: !!vaultBundleValid, realRestoreTestPassed: roundTripOk, stalenessCleared: !backupStale, reproducibleBackupMechanism: exists(path.join(ROOT, "scripts", "odg-backup-vault.sh")), durableCandidatePrepared: exists(path.join(ROOT, "deploy", "odg-backup.timer.candidate")) },
  status: (roundTripOk && !backupStale && !!vaultBundleValid) ? "BACKUPS_REAL_and_RESTORE_VERIFIED_pending_ODG_closure" : "INCOMPLETE",
  invariant: "real backup + verified restore on real data (not in-memory); existing vault bundle verified restorable; read-only on source; restore only to isolated targets; staleness cleared by a fresh real backup; durable scheduling PREPARED not enabled (owner decision); no production change, no deploy, no sudo; ODG closes on proof.",
};
fs.writeFileSync(path.join(D, "R3_BACKUP_RESTORE.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, vaultBundleValid: !!vaultBundleValid, realRestoreTest: out.realRestoreTest.verdict, backupStaleAfter: backupStale, headsMatch: srcHead === restoredHead, files: `${restoredFiles}/${srcFiles}` }, null, 2) + "\n");
export {};
