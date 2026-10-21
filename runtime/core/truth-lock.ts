#!/usr/bin/env node
/*
 * Truth Lock — the single CANONICAL home of the pure repository-safety POLICY (relocated here so BOTH the
 * node runtime pipeline (odg-run, plain `node`, runtime/dist closure) AND the tsx/Next app (src/runtime/*)
 * share ONE implementation. `src/runtime/truth-lock.ts` now RE-EXPORTS from here — no second control.
 *
 * This is the SAME pure policy previously hosted in src/runtime/truth-lock.ts (V56 CHANTIER 1): the observable
 * git facts `GitState`, the policy `DEFAULT_TRUTH_LOCK_POLICY`, the verdict `TruthLock`, and the pure decision
 * `evaluateTruthLock`. PURE: no fs, no process, no clock, no randomness — unit-testable with synthetic states.
 * Dual-port: runtime/core/truth-lock.js is the ODG_RUNTIME=js rollback twin, maintained byte-for-byte in parity.
 */
"use strict";

export interface TruthLock { ok: boolean; head: string; branch: string; detail: string; violations: string[] }

// Observable git facts the Truth Lock policy decides on. Gathered once, and RE-gathered just before a sensitive
// mutation (a captured HEAD alone is not a revalidation — η3-B79 §5).
export interface GitState {
  isRepo: boolean;
  branch: string;
  head: string;
  originMain: string | null; // null when origin/main cannot be resolved (remote unavailable / no ref)
  staged: number;            // staged (index) entry count
}
export interface TruthLockPolicy { expectedBranch: string }
export const DEFAULT_TRUTH_LOCK_POLICY: TruthLockPolicy = { expectedBranch: "main" };

/**
 * evaluateTruthLock — PURE policy over observable git facts (unit-testable with synthetic states).
 *
 * Refuses (ok=false) when any campaign invariant fails: not a git repo; unexpected branch; origin/main
 * unresolvable; HEAD diverges from origin/main; or the INDEX carries staged changes (which a run must never
 * risk incorporating). It deliberately does NOT require a fully clean WORKTREE: unstaged local edits are
 * ISOLATED (the candidate is `git archive HEAD` plus an overlay of ONLY the authorised write-set), so unstaged
 * changes are never overwritten, staged, or incorporated. Requiring a pristine worktree would block authorised
 * local development; this exception is precise, verifiable and non-destructive.
 */
export function evaluateTruthLock(s: GitState, policy: TruthLockPolicy = DEFAULT_TRUTH_LOCK_POLICY): TruthLock {
  const violations: string[] = [];
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

export {};
module.exports = { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY };
