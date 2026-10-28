#!/usr/bin/env bash
# provision-dashboard-token — OWNER-RUN prerequisite for activating the dashboard fail-closed auth.
#
# Mints a strong ODG_DASHBOARD_TOKEN and writes it to a 0600 EnvironmentFile that the systemd unit reads. The token
# value is NEVER printed — only a sha256 fingerprint. Idempotent: it will NOT overwrite an existing token unless
# --rotate is passed. Pure mechanism lives in runtime/core/dashboard-token-provision.ts (tested).
#
# SAFETY: writing to /etc and reloading systemd are PRIVILEGED (sudo). This script is executed BY THE OWNER on the VPS,
# not autonomously. It does not restart the service or expose anything. Run the redeploy separately (see
# docs/odg/deploy/DASHBOARD_AUTH_ACTIVATION.md).
set -euo pipefail

ENV_PATH="${ODG_DASHBOARD_ENV_PATH:-/etc/odg/odg-preprod.env}"
ROTATE=""
for a in "$@"; do case "$a" in --rotate) ROTATE="1";; --path=*) ENV_PATH="${a#*=}";; esac; done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ENV_PATH" ] && [ -z "$ROTATE" ]; then
  echo "KEEP: token file already present at $ENV_PATH (use --rotate to replace). No change."
  exit 0
fi

mkdir -p "$(dirname "$ENV_PATH")"
# mint + write 0600 via the tested module (run under tsx so the .ts resolves); capture ONLY the fingerprint.
FP="$(cd "$REPO" && ODG_WRITE_PATH="$ENV_PATH" npx tsx -e '
const P=require("./runtime/core/dashboard-token-provision.js");
const t=P.mintToken();
const r=P.writeEnvFile(process.env.ODG_WRITE_PATH, t);
process.stdout.write(r.fingerprint);
')"
chmod 600 "$ENV_PATH"
echo "WROTE: $ENV_PATH (mode 0600) — ODG_DASHBOARD_TOKEN set. fingerprint=sha256:${FP} (token value not shown)."
echo "NEXT: wire the EnvironmentFile into the unit + redeploy — see docs/odg/deploy/DASHBOARD_AUTH_ACTIVATION.md"
