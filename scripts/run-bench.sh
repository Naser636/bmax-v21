#!/usr/bin/env bash
# Canonical __bench__ e2e runner (institutionalised so the heavy dual-port/e2e harness can be run + does
# not silently rot — it is deliberately NOT in the fast `npm test` gate). Bounded + SEQUENTIAL (no
# concurrency) with a per-file timeout ⇒ OOM-safe; each scenario's exit code is PASS(0) / FAIL(nonzero<124)
# / TIMEOUT(124). Run: `npm run test:bench` (optionally pass a substring to run a subset, e.g.
# `npm run test:bench -- fleet`). Results + per-failure logs land under runtime/generated (git-ignored).
set -u
cd "$(dirname "$0")/.."
FILTER="${1:-}"
TIMEOUT_S="${BENCH_TIMEOUT_S:-300}"
OUTDIR="runtime/generated/bench"
mkdir -p "$OUTDIR/logs"
RES="$OUTDIR/results.tsv"
: > "$RES"
mapfile -t FILES < <(ls runtime/__bench__/*.e2e.test.ts runtime/__bench__/autonomy-e2e.test.ts 2>/dev/null | sort)
pass=0; fail=0; to=0; i=0; total=0
declare -a SELECTED=()
for f in "${FILES[@]}"; do
  if [ -z "$FILTER" ] || [[ "$f" == *"$FILTER"* ]]; then SELECTED+=("$f"); fi
done
total=${#SELECTED[@]}
echo "BENCH RUN START total=$total (filter='${FILTER}', per-file timeout=${TIMEOUT_S}s)"
for f in "${SELECTED[@]}"; do
  i=$((i+1))
  base=$(basename "$f" .test.ts)
  timeout "$TIMEOUT_S" node_modules/.bin/tsx "$f" > "$OUTDIR/logs/$base.log" 2>&1
  code=$?
  if [ "$code" -eq 0 ]; then verdict=PASS; pass=$((pass+1)); rm -f "$OUTDIR/logs/$base.log";
  elif [ "$code" -eq 124 ]; then verdict=TIMEOUT; to=$((to+1));
  else verdict=FAIL; fail=$((fail+1)); fi
  printf '%d\t%s\t%s\t%d\n' "$i" "$verdict" "$base" "$code" >> "$RES"
  echo "[$i/$total] $verdict ($code) $base"
done
echo "BENCH RUN DONE total=$total PASS=$pass FAIL=$fail TIMEOUT=$to  (results: $RES)"
[ "$fail" -eq 0 ] && [ "$to" -eq 0 ]
