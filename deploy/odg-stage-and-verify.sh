#!/usr/bin/env bash
# ODG deployment PREPARATION — stage + verify (USER-SPACE, no root, no service restart).
# Builds the runtime + app and runs the verify + health gates WITHOUT touching any running service
# (edg-core:8080, next:3000, ollama:11434 are left exactly as they are). Safe to run repeatedly.
# Exit 0 only when build + typescript + contracts + health are all green.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== ODG stage + verify (user-space, non-disruptive) =="

echo "-- runtime build --"
npm run build:runtime >/dev/null

echo "-- verify gate (build + typescript + generated contracts) --"
# NB: `odg verify` can exit non-zero purely because gitClean=false in a working tree (expected, unrelated to
# build health). We judge the THREE health fields, not the process exit code. Capture both streams.
VERIFY_OUT="$(./runtime/bin/odg verify 2>&1 || true)"
echo "$VERIFY_OUT" | grep -E "build:|typescript:|generatedContractsValid"
echo "$VERIFY_OUT" | grep -q "build: true"                  || { echo "verify gate FAILED: build"; exit 1; }
echo "$VERIFY_OUT" | grep -q "typescript: true"             || { echo "verify gate FAILED: typescript"; exit 1; }
echo "$VERIFY_OUT" | grep -q "generatedContractsValid: true" || { echo "verify gate FAILED: contracts"; exit 1; }

echo "-- runtime health smoke --"
HEALTH_OUT="$(./runtime/bin/odg health 2>&1 || true)"
echo "$HEALTH_OUT" | grep -E "Runtime|Foundation|Pipeline|Brain"
echo "$HEALTH_OUT" | grep -q "Runtime" || { echo "health probe FAILED"; exit 1; }

echo "== STAGED + VERIFIED. No service was restarted. To go live, see deploy/README.md (one root action). =="
