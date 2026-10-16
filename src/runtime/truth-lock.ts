#!/usr/bin/env node
/*
 * Truth Lock — the single CANONICAL source of the repository-safety policy (V56 CHANTIER 1 extraction).
 *
 * WHY THIS MODULE EXISTS. The pure Truth-Lock primitives (the observable git facts `GitState`, the policy
 * `TruthLockPolicy`/`DEFAULT_TRUTH_LOCK_POLICY`, the verdict `TruthLock`, and the pure decision function
 * `evaluateTruthLock`) were historically defined inside `migrate-ts-cli.ts`. `validation-orchestrator.ts`
 * (which owns `runGates`) imported them FROM `migrate-ts-cli`, so `migrate-ts-cli` could not in turn import
 * `runGates` without a CIRCULAR dependency — which blocked the `runMigrateTs → runGates` unification
 * (V54/V55 finding). Moving these PURE primitives into this dependency-free leaf module breaks the cycle and
 * gives the Truth Lock ONE canonical home. It is NOT a second source of truth: `migrate-ts-cli.ts`
 * re-exports these same symbols for backward compatibility, so every historical importer is unchanged.
 *
 * PURE: no fs, no process, no clock, no randomness. Unit-testable with synthetic GitState values.
 */

"use strict";

export interface TruthLock { ok: boolean; head: string; branch: string; detail: string; violations: string[] }

// Observable git facts the Truth Lock policy decides on. Gathered once by realSeams and RE-gathered just
// before the sensitive git-archive (a captured HEAD alone is not a revalidation — η3-B79 §5).
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
 * Refuses (ok=false, no migration) when any campaign invariant fails: not a git repo; unexpected branch;
 * origin/main unresolvable; HEAD diverges from origin/main; or the INDEX carries staged changes (which a
 * run must never risk incorporating). It deliberately does NOT require a fully clean WORKTREE: unstaged
 * local edits (A2/A3/B49, the B78/B79 slice) are ISOLATED — the candidate is `git archive HEAD` (committed)
 * plus an overlay of ONLY the authorised write-set, so unstaged changes are never overwritten, staged, or
 * incorporated (proven η3-B79 §D). Requiring a pristine worktree would block authorised local development;
 * this exception is precise, verifiable and non-destructive.
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
