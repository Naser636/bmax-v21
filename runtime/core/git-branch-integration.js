#!/usr/bin/env node

"use strict";

/*
 * Governed Git Branch Integration — the minimum governed contract for GOVERNED_GIT_BRANCH_INTEGRATION.
 *
 * This is the capability that was the previously-established PRIORITY GAP: a LOCAL, FAST-FORWARD-ONLY
 * integration of a source ref into a target branch, performed under governance and recorded as a C03
 * state transition. It is NOT a new primitive, registry, executor, evidence, authority or policy system
 * — it is a focused capability IMPLEMENTATION that the single existing capability-executor registry
 * (capability-executors.js) routes an objective to, exactly like the Connectivity Audit / External
 * Research / Provider Activation capabilities. The C03 record is built with and validated by the
 * EXISTING state-transition.js contract (no second state model).
 *
 * THE GOVERNED CONTRACT (per the mission's minimum requirement):
 *   STATE_BEFORE -> ACTION -> OBSERVED_EFFECT -> STATE_AFTER
 * with:
 *   - local only (a remote is never contacted; a `push` argument is REFUSED by the git wrapper);
 *   - fast-forward only (ancestry verified: target tip MUST be an ancestor of the source ref);
 *   - no merge commit (FF never creates a second-parent commit — verified after the fact);
 *   - worktree verified (a dirty / conflicted / stale worktree is REJECTED — no integration on it);
 *   - target branch verified (the target MUST be an existing local branch ref; source MUST resolve);
 *   - protected-branch rules respected (integrating INTO a protected branch needs explicit authority;
 *     without it the outcome is HUMAN_APPROVAL_REQUIRED and NOTHING is mutated);
 *   - evidence required + verification required (the observed HEAD is re-read and compared to expected);
 *   - stale / conflicted / non-fast-forward state rejected (fail-closed);
 *   - DRY-RUN is the hard default: execute!==true performs ZERO git mutation and never pushes.
 *
 * Determinism / testability: all git access goes through an injectable runner (opts.git) against an
 * injectable working directory (opts.cwd). The tests drive REAL git on REAL throwaway fixture repos
 * (not mocks), so the fast-forward / already-up-to-date / non-fast-forward / dirty / protected cases
 * are exercised end-to-end through actual git plumbing.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  computeDifference,
  validateStateTransition,
  VERIFICATION_STATUS,
} = require("./state-transition");

// Branches that are PROTECTED by default: integrating INTO one requires explicit elevated authority.
// This is a conservative, additive default list; a request may extend it via protectedBranches.
const DEFAULT_PROTECTED = Object.freeze(["main", "master", "release", "production"]);

// Frozen outcome vocabulary. INTEGRATED / ALREADY_UP_TO_DATE / DRY_RUN are non-fault outcomes; BLOCKED
// and HUMAN_APPROVAL_REQUIRED are stop outcomes that, on a LIVE run, fail closed (the executor throws
// after writing honest evidence, so the mission is never falsely marked done).
const OUTCOME = Object.freeze({
  INTEGRATED: "INTEGRATED",
  ALREADY_UP_TO_DATE: "ALREADY_UP_TO_DATE",
  DRY_RUN: "DRY_RUN",
  BLOCKED: "BLOCKED",
  HUMAN_APPROVAL_REQUIRED: "HUMAN_APPROVAL_REQUIRED",
});

// A BLOCKED/HUMAN_APPROVAL outcome on a LIVE run is raised as this error so the caller (and the Patch
// Executor's outer catch) can record it FAILED with the structured governed outcome attached.
class GovernedGitError extends Error {
  constructor(outcome, reason, evidence) {
    super(`${outcome}: ${reason}`);
    this.name = "GovernedGitError";
    this.outcome = outcome;
    this.reason = reason;
    this.evidence = evidence || null;
  }
}

// Build the injectable git runner. Local-only is enforced here: a `push` (or any obvious remote-write)
// invocation is REFUSED, which is what makes "push absence" a property of the capability, not a habit.
function makeGit(cwd) {
  return function git(args, opts) {
    const options = opts || {};
    if (!Array.isArray(args) || args.length === 0) throw new Error("git: args must be a non-empty array");
    if (args[0] === "push") {
      throw new GovernedGitError(OUTCOME.BLOCKED, "network push is forbidden by Governed Git Branch Integration (local-only)");
    }
    const res = spawnSync("git", args, { cwd: cwd || process.cwd(), encoding: "utf8" });
    const out = { status: res.status, stdout: String(res.stdout || "").trim(), stderr: String(res.stderr || "").trim() };
    if (!options.allowFail && out.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed (status=${out.status}): ${out.stderr}`);
    }
    return out;
  };
}

function captureState(git) {
  const insideRes = git(["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  const isRepo = insideRes.status === 0 && insideRes.stdout === "true";
  if (!isRepo) {
    return { isRepo: false, head: null, currentBranch: null, worktreeClean: false, dirtyEntries: [] };
  }
  const head = git(["rev-parse", "HEAD"], { allowFail: true });
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true });
  const porcelain = git(["status", "--porcelain"], { allowFail: true });
  const dirtyEntries = porcelain.stdout ? porcelain.stdout.split(/\r?\n/).filter(Boolean) : [];
  return {
    isRepo: true,
    head: head.status === 0 ? head.stdout : null,
    currentBranch: branch.status === 0 ? branch.stdout : null,
    worktreeClean: dirtyEntries.length === 0,
    dirtyEntries,
  };
}

// Resolve a ref to a full sha (null if it does not resolve). Used for both the source ref and the
// target BRANCH ref (the target must be a local branch: refs/heads/<name>).
function resolveRef(git, ref) {
  const r = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true });
  return r.status === 0 && r.stdout ? r.stdout : null;
}
function resolveBranch(git, name) {
  const r = git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`], { allowFail: true });
  return r.status === 0 && r.stdout ? r.stdout : null;
}
function isAncestor(git, a, b) {
  return git(["merge-base", "--is-ancestor", a, b], { allowFail: true }).status === 0;
}
function commitsAhead(git, fromSha, toSha) {
  const r = git(["rev-list", "--count", `${fromSha}..${toSha}`], { allowFail: true });
  const n = r.status === 0 ? parseInt(r.stdout, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * classify — the SINGLE source of truth for the predicted/applicable outcome, given the captured
 * state and the resolved shas. Pure w.r.t. its arguments. Both the dry-run plan and the live execution
 * branch on this, so a dry-run predicts EXACTLY what a live run would do.
 */
function classify(state, ctx) {
  if (!state.isRepo) return { outcome: OUTCOME.BLOCKED, reason: "not a git repository" };
  if (ctx.targetSha === null) return { outcome: OUTCOME.BLOCKED, reason: `target branch "${ctx.target}" does not exist (must be a local branch)` };
  if (ctx.sourceSha === null) return { outcome: OUTCOME.BLOCKED, reason: `source ref "${ctx.source}" does not resolve` };
  if (!state.worktreeClean) return { outcome: OUTCOME.BLOCKED, reason: `worktree not clean (${state.dirtyEntries.length} entr${state.dirtyEntries.length === 1 ? "y" : "ies"}) — stale/conflicted/dirty state rejected` };
  if (ctx.protectedTarget && !ctx.authorized) {
    return { outcome: OUTCOME.HUMAN_APPROVAL_REQUIRED, reason: `target "${ctx.target}" is a protected branch and no explicit authority (authorization.allow_protected) was granted` };
  }
  if (ctx.targetSha === ctx.sourceSha) return { outcome: OUTCOME.ALREADY_UP_TO_DATE, reason: "target already at source (nothing to integrate)" };
  if (!isAncestor(ctx.git, ctx.targetSha, ctx.sourceSha)) {
    return { outcome: OUTCOME.BLOCKED, reason: "non-fast-forward: target is not an ancestor of source (branches diverged) — fast-forward only, no merge commit" };
  }
  return { outcome: OUTCOME.INTEGRATED, reason: "fast-forwardable" };
}

function baseEvidence(request, state, ctx, extra) {
  return Object.assign(
    {
      capability: "Governed Git Branch Integration",
      objective: request.objectiveId || null,
      target: ctx.target,
      source: ctx.source,
      protectedTarget: ctx.protectedTarget,
      authorized: ctx.authorized,
      // Local-only guarantees — surfaced as explicit, machine-checkable facts.
      pushed: false,
      network: false,
      remote_contacted: false,
      merge_commit: false,
      fast_forward_only: true,
      state_before: {
        isRepo: state.isRepo,
        head: state.head,
        currentBranch: state.currentBranch,
        worktreeClean: state.worktreeClean,
        targetBranch: ctx.target,
        targetSha: ctx.targetSha,
        sourceRef: ctx.source,
        sourceSha: ctx.sourceSha,
      },
    },
    extra || {},
  );
}

/**
 * run(request, opts) — the governed capability entry point.
 *   request: { target, source, objectiveId?, execute?, authorization?: { allow_protected?: boolean },
 *              protectedBranches?: string[] }
 *   opts:    { cwd?, git? }  (both injectable for tests; defaults use real git in process.cwd()).
 *
 * Returns the evidence object on every NON-FAULT outcome (DRY_RUN / INTEGRATED / ALREADY_UP_TO_DATE).
 * On a LIVE BLOCKED or HUMAN_APPROVAL_REQUIRED outcome it throws a GovernedGitError (with the honest
 * evidence attached) so the mission fails closed and is never falsely marked done.
 */
function run(request, opts) {
  const req = request && typeof request === "object" ? request : {};
  const options = opts || {};
  const cwd = options.cwd || process.cwd();
  const git = typeof options.git === "function" ? options.git : makeGit(cwd);

  const target = typeof req.target === "string" ? req.target.trim() : "";
  const source = typeof req.source === "string" ? req.source.trim() : "";
  if (!target || !source) {
    throw new GovernedGitError(OUTCOME.BLOCKED, "request requires non-empty target and source refs");
  }
  const execute = req.execute === true;
  const protectedBranches = Array.isArray(req.protectedBranches)
    ? DEFAULT_PROTECTED.concat(req.protectedBranches.filter((b) => typeof b === "string"))
    : DEFAULT_PROTECTED.slice();
  const protectedTarget = protectedBranches.includes(target);
  const authorized = !!(req.authorization && req.authorization.allow_protected === true);

  const state = captureState(git);
  const ctx = {
    git,
    target,
    source,
    protectedTarget,
    authorized,
    targetSha: state.isRepo ? resolveBranch(git, target) : null,
    sourceSha: state.isRepo ? resolveRef(git, source) : null,
  };

  const verdict = classify(state, ctx);
  const ahead =
    verdict.outcome === OUTCOME.INTEGRATED ? commitsAhead(git, ctx.targetSha, ctx.sourceSha) : 0;

  // -- DRY-RUN (hard default): ZERO git mutation. Report the PREDICTED outcome honestly. A dry-run is
  //    never a fault (it is a plan, not a transition), so it always returns evidence successfully.
  if (!execute) {
    return baseEvidence(req, state, ctx, {
      mode: "DRY_RUN",
      outcome: OUTCOME.DRY_RUN,
      integrated: false,
      predicted_outcome: verdict.outcome,
      predicted_reason: verdict.reason,
      fast_forwardable: verdict.outcome === OUTCOME.INTEGRATED,
      commits_ahead: verdict.outcome === OUTCOME.INTEGRATED ? ahead : 0,
      state_after: null,
      state_transition: null,
      verification_status: VERIFICATION_STATUS.RECORDED,
      note: "Dry-run default: no git mutation performed, no remote contacted. A live integration requires execute=true and all governed preconditions to pass.",
    });
  }

  // -- LIVE path. Preconditions are now ENFORCED. BLOCKED / HUMAN_APPROVAL_REQUIRED fail closed.
  if (verdict.outcome === OUTCOME.BLOCKED || verdict.outcome === OUTCOME.HUMAN_APPROVAL_REQUIRED) {
    const evidence = baseEvidence(req, state, ctx, {
      mode: "LIVE",
      outcome: verdict.outcome,
      integrated: false,
      reason: verdict.reason,
      state_after: state, // unchanged — nothing was mutated
      state_transition: null,
      verification_status: VERIFICATION_STATUS.RECORDED,
    });
    throw new GovernedGitError(verdict.outcome, verdict.reason, evidence);
  }

  if (verdict.outcome === OUTCOME.ALREADY_UP_TO_DATE) {
    return baseEvidence(req, state, ctx, {
      mode: "LIVE",
      outcome: OUTCOME.ALREADY_UP_TO_DATE,
      integrated: false,
      reason: verdict.reason,
      state_after: {
        head: state.head,
        currentBranch: state.currentBranch,
        targetSha: ctx.targetSha,
        worktreeClean: state.worktreeClean,
      },
      state_transition: null,
      verification_status: VERIFICATION_STATUS.RECORDED,
      note: "Target already contains source; nothing to integrate (a no-op is an honest success, not a change).",
    });
  }

  // -- INTEGRATED: perform the fast-forward. EXPECTED_EFFECT: the target branch tip becomes sourceSha.
  const expectedTo = ctx.sourceSha;
  if (target === state.currentBranch) {
    // The target is the checked-out branch: `merge --ff-only` advances the ref AND the worktree/index.
    git(["merge", "--ff-only", ctx.sourceSha]);
  } else {
    // The target is NOT checked out: atomically advance the branch ref with a CAS old-value guard
    // (refuses if the ref moved concurrently). The worktree is untouched (target not checked out).
    git(["update-ref", `refs/heads/${target}`, ctx.sourceSha, ctx.targetSha]);
  }

  // -- OBSERVED_EFFECT + verification: re-read reality and compare to the expected effect.
  const afterState = captureState(git);
  const observedTo = resolveBranch(git, target);
  // A fast-forward NEVER creates a merge commit: the new tip must have no second parent.
  const secondParent = git(["rev-parse", "--verify", "--quiet", `${observedTo}^2`], { allowFail: true });
  const mergeCommitCreated = secondParent.status === 0;

  const divergence = observedTo !== expectedTo || mergeCommitCreated || !afterState.worktreeClean;
  if (divergence) {
    const evidence = baseEvidence(req, state, ctx, {
      mode: "LIVE",
      outcome: OUTCOME.BLOCKED,
      integrated: false,
      reason: `EXPECTED vs OBSERVED divergence: expected target->${expectedTo} (ff, no merge, clean), observed ->${observedTo} (mergeCommit=${mergeCommitCreated}, clean=${afterState.worktreeClean})`,
      expected_effect: { target_tip: expectedTo, merge_commit: false, worktree_clean: true },
      observed_effect: { target_tip: observedTo, merge_commit: mergeCommitCreated, worktree_clean: afterState.worktreeClean },
      state_after: afterState,
      state_transition: null,
      verification_status: VERIFICATION_STATUS.REJECTED,
    });
    throw new GovernedGitError(OUTCOME.BLOCKED, evidence.reason, evidence);
  }

  // Build the C03 state-transition record with the EXISTING contract and validate it.
  const stateBeforeObj = {
    target,
    targetSha: ctx.targetSha,
    head: state.head,
    currentBranch: state.currentBranch,
  };
  const stateAfterObj = {
    target,
    targetSha: observedTo,
    head: afterState.head,
    currentBranch: afterState.currentBranch,
  };
  const transition = {
    state_before: stateBeforeObj,
    action: { kind: "git_branch_integration", mode: "fast-forward-only", target, source, local_only: true, push: false },
    observed_effect: {
      fast_forwarded: true,
      from: ctx.targetSha,
      to: observedTo,
      commits_advanced: ahead,
      merge_commit: false,
      pushed: false,
    },
    state_after: stateAfterObj,
    state_version_before: 0,
    state_version_after: ahead > 0 ? ahead : 1,
    difference: computeDifference(stateBeforeObj, stateAfterObj),
    // The evidence_ref is filled by the executor (it owns the artifact path); a non-empty placeholder
    // keeps the record self-consistent for the engine's own validation, then the executor overwrites it.
    evidence_refs: ["git-branch-integration"],
    verification_status: VERIFICATION_STATUS.VERIFIED,
  };
  const validation = validateStateTransition(transition);
  if (!validation.ok) {
    // The engine's own C03 self-check must pass; if not, fail closed (never emit an invalid transition).
    throw new GovernedGitError(OUTCOME.BLOCKED, `C03 self-validation failed: ${validation.errors.join("; ")}`);
  }

  return baseEvidence(req, state, ctx, {
    mode: "LIVE",
    outcome: OUTCOME.INTEGRATED,
    integrated: true,
    commits_advanced: ahead,
    expected_effect: { target_tip: expectedTo, merge_commit: false, worktree_clean: true },
    observed_effect: transition.observed_effect,
    state_after: stateAfterObj,
    state_transition: transition,
    verification_status: VERIFICATION_STATUS.VERIFIED,
  });
}

module.exports = {
  run,
  classify,
  captureState,
  makeGit,
  resolveRef,
  resolveBranch,
  isAncestor,
  OUTCOME,
  DEFAULT_PROTECTED,
  GovernedGitError,
};

// Read-only CLI: print the governed contract descriptor; mutates nothing, contacts no network.
if (require.main === module) {
  process.stdout.write(
    JSON.stringify(
      {
        capability: "Governed Git Branch Integration",
        contract: "STATE_before -> ACTION -> OBSERVED_EFFECT -> STATE_after",
        guarantees: ["local-only", "fast-forward-only", "no-merge-commit", "no-push", "worktree-verified", "ancestry-verified", "target-verified", "protected-branch-governed", "dry-run-default", "evidence-required", "C03-validated"],
        outcomes: Object.values(OUTCOME),
        protectedByDefault: DEFAULT_PROTECTED,
      },
      null,
      2,
    ) + "\n",
  );
}
