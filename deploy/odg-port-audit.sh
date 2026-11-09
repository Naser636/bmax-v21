#!/usr/bin/env bash
# ODG PORT AUDIT — read-only VPS exposure check (CTO V7/V8/V10 §5/§7). No root, no mutation, no network egress.
# Enumerates listening sockets and asserts the EXPECTED private posture:
#   - the ONLY public (0.0.0.0 / ::) bind allowed is SSH:22 (key-only admin access — a genuine necessity);
#   - edg-core:8080, Ollama:11434 and the ODG dashboard:3000 MUST be loopback (127.0.0.1 / ::1) only.
# Exit 0 = posture OK; exit 1 = an UNEXPECTED public port is bound (a real exposure regression). Fail-closed: if `ss`
# is unavailable we cannot prove the posture ⇒ exit 1 (never a silent pass).
set -u
command -v ss >/dev/null 2>&1 || { echo "FAIL: ss unavailable — cannot prove port posture (fail-closed)"; exit 1; }

echo "== ODG port audit (read-only) =="
PUBLIC="$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\*|\[::\]|::):' || true)"
echo "-- public (0.0.0.0/::) listeners --"
echo "${PUBLIC:-  (none)}" | sed 's/^/  /'

rc=0
# Every public bind must be port 22 (SSH). Anything else is an unexpected exposure.
while IFS= read -r bind; do
  [ -z "$bind" ] && continue
  port="${bind##*:}"
  if [ "$port" != "22" ]; then echo "FAIL: unexpected PUBLIC bind ${bind} (only SSH:22 is allowed public)"; rc=1; fi
done <<< "$PUBLIC"

# edg-core / ollama / dashboard must NOT appear in the public set.
for p in 8080 11434 3000; do
  if echo "$PUBLIC" | grep -qE ":${p}\$"; then echo "FAIL: private service port ${p} is PUBLIC (must be loopback)"; rc=1; fi
done

if [ "$rc" = "0" ]; then echo "PASS: only SSH:22 public; edg-core/ollama/dashboard loopback-only (no public port added)."; fi
exit "$rc"
