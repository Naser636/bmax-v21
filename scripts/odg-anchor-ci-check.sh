#!/usr/bin/env bash
# V16 — CI check on docs/odg/evidence/TRUST_ANCHORS.json (makes any pin LOUD; it is NOT an enforcing control by itself).
# Passes only if: no anchor is pinned, OR every current pin was introduced by a commit with a GOOD SSH signature by a key
# listed in docs/odg/evidence/OWNER_ALLOWED_SIGNERS (git allowed-signers format: "<principal> <keytype> <base64>").
# A malformed / absent anchor file fails. Enforcement requires branch protection with a required review by an identity
# the provider does not control (the provider can edit this script, the workflow and the signers file — see
# docs/odg/V16_OWNER_REVIEW_PACKET.md §2).
set -euo pipefail
REPO="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/..}" && pwd -P)"; REF="${2:-HEAD}"
SIGNERS="$REPO/docs/odg/evidence/OWNER_ALLOWED_SIGNERS"
AUDIT=(npx --no-install tsx "$REPO/runtime/bin/odg-trust-anchor-audit.ts" --repo "$REPO" --ref "$REF")
if [ -s "$SIGNERS" ] && grep -qv '^\s*\(#\|$\)' "$SIGNERS"; then
  W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
  : > "$W/keys"
  # allowed-signers line: <principals> [options] <keytype> <base64> [comment] — locate the key type token (options allowed)
  while read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    printf '%s\n' "$line" | awk '{for(i=2;i<=NF;i++) if ($i ~ /^(ssh-|ecdsa-|sk-)/) {print $i, $(i+1); exit}}' > "$W/k.pub"
    ssh-keygen -lf "$W/k.pub" | awk '{print $2}' >> "$W/keys"
  done < <(sed 's/^[[:space:]]*//' "$SIGNERS")
  GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=gpg.format GIT_CONFIG_VALUE_0=ssh GIT_CONFIG_KEY_1=gpg.ssh.allowedSignersFile GIT_CONFIG_VALUE_1="$SIGNERS" \
    "${AUDIT[@]}" --signer-keys "$W/keys" --require-signed
else
  OUT="$("${AUDIT[@]}")"; printf '%s\n' "$OUT"
  printf '%s\n' "$OUT" | head -1 | grep -q 'verdict=NO_ANCHORS_PINNED' || { echo "[anchor-ci] FAIL: anchors pinned but no OWNER_ALLOWED_SIGNERS configured (or file malformed/absent)" >&2; exit 1; }
fi
echo "[anchor-ci] OK"
