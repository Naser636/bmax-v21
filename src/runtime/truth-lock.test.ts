#!/usr/bin/env node
/*
 * Truth Lock (IDENTITY primitive) — dedicated unit test for the PURE policy `evaluateTruthLock`.
 *
 * Day-1 autonomy-campaign gap closure: the IDENTITY primitive (src/runtime/truth-lock.ts) was a permanent
 * primitive with NO dedicated test. This locks the repository-safety policy: refuse (ok=false) on not-a-repo,
 * wrong branch, unresolvable origin/main, HEAD divergence, or a non-empty index (staged changes); allow
 * (ok=true) only a clean-index state on the expected branch at origin/main — while deliberately NOT requiring
 * a pristine WORKTREE (unstaged local edits are isolated by git-archive, never incorporated). Pure + deterministic.
 */
"use strict";

import assert from "node:assert";
import { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY } from "./truth-lock";
import type { GitState } from "./truth-lock";

let passed = 0;
function ok(name: string, cond: boolean): void { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const CLEAN: GitState = { isRepo: true, branch: "main", head: "abc123", originMain: "abc123", staged: 0 };

// 1 — the only fully-safe state: repo, expected branch, HEAD==origin/main, empty index ⇒ ok.
{
  const v = evaluateTruthLock(CLEAN);
  ok("clean index on main at origin/main ⇒ ok=true, no violations", v.ok === true && v.violations.length === 0);
}
// 2 — not a git repo ⇒ refuse.
{
  const v = evaluateTruthLock({ ...CLEAN, isRepo: false });
  ok("not a repo ⇒ ok=false", v.ok === false && v.violations.some((x) => /not a git repository/.test(x)));
}
// 3 — unexpected branch ⇒ refuse (and the default policy expects 'main').
{
  const v = evaluateTruthLock({ ...CLEAN, branch: "feature/x" });
  ok("wrong branch ⇒ ok=false + names the branch", v.ok === false && v.violations.some((x) => /unexpected branch/.test(x)));
  ok("DEFAULT policy expects main", DEFAULT_TRUTH_LOCK_POLICY.expectedBranch === "main");
}
// 4 — origin/main unresolvable ⇒ refuse (cannot confirm the published reference).
{
  const v = evaluateTruthLock({ ...CLEAN, originMain: null });
  ok("origin/main null ⇒ ok=false", v.ok === false && v.violations.some((x) => /origin\/main unavailable/.test(x)));
}
// 5 — HEAD diverges from origin/main ⇒ refuse.
{
  const v = evaluateTruthLock({ ...CLEAN, head: "newHEAD99", originMain: "oldORIGIN1" });
  ok("HEAD != origin/main ⇒ ok=false (divergence)", v.ok === false && v.violations.some((x) => /diverges from origin\/main/.test(x)));
}
// 6 — staged changes in the index ⇒ refuse (never risk incorporating/committing them).
{
  const v = evaluateTruthLock({ ...CLEAN, staged: 3 });
  ok("staged>0 ⇒ ok=false (index not empty)", v.ok === false && v.violations.some((x) => /staged change/.test(x)));
}
// 7 — DESIGN INVARIANT: a clean INDEX is sufficient; a dirty WORKTREE is NOT modelled/required. GitState has
//     no worktree field, so unstaged local edits never block the Truth Lock (git-archive isolates them).
{
  const v = evaluateTruthLock(CLEAN); // staged:0, no worktree concept
  ok("clean index passes regardless of (unmodelled) unstaged worktree edits — isolation by design", v.ok === true);
}
// 8 — violations ACCUMULATE (not short-circuited) so the report lists every failed invariant.
{
  const v = evaluateTruthLock({ isRepo: true, branch: "dev", head: "h1", originMain: "h2", staged: 2 });
  ok("multiple violations accumulate (branch + divergence + staged)", v.ok === false && v.violations.length === 3);
}
// 9 — a custom policy branch is honoured.
{
  const v = evaluateTruthLock({ ...CLEAN, branch: "release" }, { expectedBranch: "release" });
  ok("custom expectedBranch honoured ⇒ ok=true on that branch", v.ok === true);
}
// 10 — verdict carries head/branch for the report; detail explains the refusal.
{
  const v = evaluateTruthLock({ ...CLEAN, staged: 1 });
  ok("verdict surfaces head+branch and a REFUSED detail", v.head === "abc123" && v.branch === "main" && /REFUSED/.test(v.detail));
}

console.log(`\ntruth-lock (IDENTITY primitive) — ${passed} assertions passed.`);
