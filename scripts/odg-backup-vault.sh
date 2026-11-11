#!/bin/bash
# odg-backup-vault.sh — REAL durable backup of the ODG repo into the local vault (READ-ONLY on the repo).
# Creates /var/backups/odg-vault/<UTC-timestamp>/odg-main.bundle (a complete, verifiable git bundle of `main`),
# verifies it, and prunes to the newest KEEP backups. NO push, NO deploy, NO production-process change, no sudo.
# This is the mechanism behind mission P0-R3 (it addresses the BACKUP_STALE maintenance signal when scheduled).
set -u
REPO="${ODG_REPO:-/home/ubuntu/bmax-v21}"
VAULT="${ODG_VAULT:-/var/backups/odg-vault}"
KEEP="${ODG_VAULT_KEEP:-8}"
REF="${ODG_BACKUP_REF:-main}"
cd "$REPO" || { echo "odg-backup-vault: repo $REPO unavailable"; exit 1; }
mkdir -p "$VAULT" || { echo "odg-backup-vault: vault $VAULT not writable"; exit 1; }
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="$VAULT/$TS"; mkdir -p "$DIR"
if ! git bundle create "$DIR/odg-main.bundle" "$REF" >/dev/null 2>&1; then
  echo "odg-backup-vault: bundle create FAILED for ref $REF"; rmdir "$DIR" 2>/dev/null; exit 1
fi
if ! git bundle verify "$DIR/odg-main.bundle" >/dev/null 2>&1; then
  echo "odg-backup-vault: bundle VERIFY FAILED — removing corrupt backup"; rm -rf "$DIR"; exit 1
fi
echo "odg-backup-vault: OK $DIR/odg-main.bundle ($(stat -c%s "$DIR/odg-main.bundle") bytes, ref=$REF)"
# prune: keep newest $KEEP timestamped dirs
ls -1d "$VAULT"/*/ 2>/dev/null | sort | head -n -"$KEEP" | while read -r old; do rm -rf "$old" && echo "odg-backup-vault: pruned $old"; done
exit 0
