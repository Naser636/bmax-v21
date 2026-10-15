#!/usr/bin/env node
"use strict";

/*
 * Governed Git Branch Integration (TypeScript port; parity with runtime/core/git-branch-integration.js).
 *
 * A governed, LOCAL-ONLY, FAST-FORWARD-ONLY integration of a source ref into a target branch, recorded as
 * a C03 state_transition (state-transition, already TS, co-located in dist; deps=1). Guarantees preserved
 * EXACTLY: local only (a `push` arg is REFUSED by the git wrapper; no remote contacted); no merge commit
 * (verified after the fact); worktree verified (dirty/conflicted ⇒ REJECTED); target must be a local
 * branch; protected-branch integration needs explicit authority; DRY-RUN is the hard default (execute!==
 * true ⇒ ZERO git mutation). The git runner is INJECTABLE (opts.git) so this is fully offline-testable.
 * Strict port: all exports (run, classify, captureState, makeGit, resolveRef, resolveBranch, isAncestor,
 * OUTCOME, DEFAULT_PROTECTED, GovernedGitError), the classify verdict order, the DRY_RUN/LIVE branches,
 * the EXPECTED-vs-OBSERVED divergence check, the C03 record and all reasons are preserved EXACTLY. The
 * historical .js remains the behavioural reference.
 */

const { spawnSync } = require("child_process");
const {
  computeDifference,
  validateStateTransition,
  VERIFICATION_STATUS,
} = require("./state-transition");

// Branches PROTECTED by default: integrating INTO one requires explicit elevated authority.
const DEFAULT_PROTECTED = Object.freeze(["main", "master", "release", "production"]);

const OUTCOME = Object.freeze({
  INTEGRATED: "INTEGRATED",
  ALREADY_UP_TO_DATE: "ALREADY_UP_TO_DATE",
  DRY_RUN: "DRY_RUN",
  BLOCKED: "BLOCKED",
  HUMAN_APPROVAL_REQUIRED: "HUMAN_APPROVAL_REQUIRED",
});

class GovernedGitError extends Error {
  outcome: any;
  reason: any;
  evidence: any;
  constructor(outcome: any, reason: any, evidence?: any) {
    super(`${outcome}: ${reason}`);
    this.name = "GovernedGitError";
    this.outcome = outcome;
    this.reason = reason;
    this.evidence = evidence || null;
  }
}

// Build the injectable git runner. Local-only is enforced here: a `push` invocation is REFUSED.
function makeGit(cwd: any): any {
  return function git(args: any, opts?: any): any {
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

function captureState(git: any): any {
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

// Resolve a ref to a full sha (null if it does not resolve).
function resolveRef(git: any, ref: any): any {
  const r = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true });
  return r.status === 0 && r.stdout ? r.stdout : null;
}
function resolveBranch(git: any, name: any): any {
  const r = git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`], { allowFail: true });
  return r.status === 0 && r.stdout ? r.stdout : null;
}
function isAncestor(git: any, a: any, b: any): boolean {
  return git(["merge-base", "--is-ancestor", a, b], { allowFail: true }).status === 0;
}
function commitsAhead(git: any, fromSha: any, toSha: any): any {
  const r = git(["rev-list", "--count", `${fromSha}..${toSha}`], { allowFail: true });
  const n = r.status === 0 ? parseInt(r.stdout, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * classify — the SINGLE source of truth for the predicted/applicable outcome. Pure w.r.t. its arguments.
 */
function classify(state: any, ctx: any): any {
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

function baseEvidence(request: any, state: any, ctx: any, extra: any): any {
  return Object.assign(
    {
      capability: "Governed Git Branch Integration",
      objective: request.objectiveId || null,
      target: ctx.target,
      source: ctx.source,
      protectedTarget: ctx.protectedTarget,
      authorized: ctx.authorized,
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
 * run(request, opts) — the governed capability entry point. opts.git is injectable (default: real git).
 */
function run(request: any, opts?: any): any {
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
    ? DEFAULT_PROTECTED.concat(req.protectedBranches.filter((b: any) => typeof b === "string"))
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

  // -- DRY-RUN (hard default): ZERO git mutation.
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
      state_after: state,
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
    git(["merge", "--ff-only", ctx.sourceSha]);
  } else {
    git(["update-ref", `refs/heads/${target}`, ctx.sourceSha, ctx.targetSha]);
  }

  // -- OBSERVED_EFFECT + verification: re-read reality and compare to the expected effect.
  const afterState = captureState(git);
  const observedTo = resolveBranch(git, target);
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
    evidence_refs: ["git-branch-integration"],
    verification_status: VERIFICATION_STATUS.VERIFIED,
  };
  const validation = validateStateTransition(transition);
  if (!validation.ok) {
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (makeGit,
// captureState, classify, baseEvidence, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
