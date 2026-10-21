#!/usr/bin/env node
/*
 * Truth Lock — canonical pure repository-safety POLICY (ODG_RUNTIME=js rollback twin of truth-lock.ts; kept
 * byte-for-byte in parity). Single home shared by the node runtime pipeline (odg-run) and the tsx/Next app
 * (src/runtime/truth-lock.ts re-exports from here). PURE: no fs/process/clock/randomness.
 */
"use strict";

const DEFAULT_TRUTH_LOCK_POLICY = { expectedBranch: "main" };

/**
 * evaluateTruthLock — PURE policy over observable git facts. Refuses on: not-repo / unexpected branch /
 * origin/main unresolvable / HEAD diverges from origin/main / staged index. Deliberately does NOT require a
 * clean WORKTREE (unstaged edits are isolated by git-archive).
 */
function evaluateTruthLock(s, policy) {
  policy = policy || DEFAULT_TRUTH_LOCK_POLICY;
  const violations = [];
  if (!s.isRepo) {
    violations.push("not a git repository");
  } else {
    if (s.branch !== policy.expectedBranch) violations.push(`unexpected branch "${s.branch}" (expected "${policy.expectedBranch}")`);
    if (s.originMain === null) violations.push("origin/main unavailable — cannot confirm the published reference");
    else if (s.head !== s.originMain) violations.push(`HEAD ${s.head.slice(0, 8)} diverges from origin/main ${s.originMain.slice(0, 8)}`);
    if (s.staged > 0) violations.push(`${s.staged} staged change(s) in the index — refuse to risk incorporating/committing them`);
  }
  const ok = violations.length === 0;
  const detail = ok
    ? "repo on expected branch, HEAD == origin/main, index empty; candidate built from committed HEAD (unstaged local changes isolated by git-archive, never overwritten/incorporated)"
    : "REFUSED — " + violations.join("; ");
  return { ok, head: s.head, branch: s.branch, detail, violations };
}

module.exports = { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY };
