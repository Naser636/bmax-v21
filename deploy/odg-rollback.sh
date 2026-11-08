#!/usr/bin/env bash
# ODG rollback (USER-SPACE, git-based, no force, no destructive reset).
# Usage: deploy/odg-rollback.sh <git-ref>
# Checks out a KNOWN-GOOD ref on a NEW rollback branch (never detaches main, never force-pushes,
# never discards uncommitted or untracked work) and re-stages. The only state it changes is the
# checked-out ref on a fresh branch; preserved untracked files + stashes are untouched.
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${1:?usage: odg-rollback.sh <git-ref>}"
git rev-parse --verify "$REF^{commit}" >/dev/null 2>&1 || { echo "unknown ref: $REF"; exit 1; }

# Refuse to run with a dirty index (do not clobber staged work).
if ! git diff --cached --quiet; then echo "index not clean — commit or unstage first (refusing to clobber)"; exit 1; fi

BRANCH="rollback/$(echo "$REF" | tr '/:' '--')"
echo "== rolling back to $REF on branch $BRANCH (no force, no reset) =="
git switch -c "$BRANCH" "$REF"
bash deploy/odg-stage-and-verify.sh
echo "== rolled back + verified on $BRANCH. Promote with a normal PR; main history is untouched. =="
