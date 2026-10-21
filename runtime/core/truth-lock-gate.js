#!/usr/bin/env node
/*
 * Truth-Lock PRE-EXECUTION GATE (ODG_RUNTIME=js rollback twin of truth-lock-gate.ts; parity-maintained).
 * Wires the canonical IDENTITY policy (runtime/core/truth-lock.evaluateTruthLock) into the odg-run path BEFORE
 * any stage runs. Checks: repo / expected branch / HEAD==origin/main / empty index (unstaged worktree NOT
 * blocked — isolation design). Mutating mission + failing verdict ⇒ BLOCKED; read-only ⇒ RECORDED only.
 */
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const { evaluateTruthLock } = require("./truth-lock");

function gatherGitState(exec) {
  const run = typeof exec === "function"
    ? exec
    : (args) => { try { return String(cp.execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } };
  const isRepo = run(["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) return { isRepo: false, branch: "", head: "", originMain: null, staged: 0 };
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]) || "";
  const head = run(["rev-parse", "HEAD"]) || "";
  const originMain = run(["rev-parse", "origin/main"]) || null;
  const stagedRaw = run(["diff", "--cached", "--name-only"]);
  const staged = typeof stagedRaw === "string" && stagedRaw.length ? stagedRaw.split("\n").filter(Boolean).length : 0;
  return { isRepo, branch, head, originMain, staged };
}

function missionIsMutating(mission, opts) {
  opts = opts || {};
  const io = opts.fs || fs;
  const dir = opts.missionsDir || path.join("runtime", "missions");
  let def = null;
  try { def = JSON.parse(io.readFileSync(path.join(dir, `${mission}.json`), "utf8")); } catch { def = null; }
  if (!def) return { mutating: false, basis: "no mission definition file — record-only (indeterminate)" };
  const mode = String(def.mode || "").toUpperCase();
  if (def.requiresEngineering === true || def.requires_engineering === true) return { mutating: true, basis: "requiresEngineering=true" };
  if (["AUDIT", "ANALYZE", "READ_ONLY", "OBSERVE"].includes(mode)) return { mutating: false, basis: `read-only mode ${mode}` };
  if (mode === "ENGINEERING") return { mutating: true, basis: "mode=ENGINEERING" };
  return { mutating: false, basis: "no engineering signal — record-only" };
}

// ENFORCEMENT IS OPT-IN (`enforce`): the gate always runs+records; only a deployment/campaign context that opts
// in (ODG_TRUTH_LOCK_ENFORCE=1) actually BLOCKS. Sandbox/test fixtures (no flag) are never blocked. (Mirror of .ts.)
function truthLockGate(opts) {
  opts = opts || {};
  const gitState = opts.gitState || gatherGitState(opts.exec);
  const verdict = evaluateTruthLock(gitState, opts.policy);
  const mutating = opts.mutating === true;
  const enforce = opts.enforce === true;
  const blocked = enforce && mutating && !verdict.ok;
  const status = verdict.ok ? "PASS" : (blocked ? "BLOCKED" : "RECORDED");
  return { status, ok: verdict.ok, blocked, mutating, enforce, mission: opts.mission || null, gitState, verdict, checkedAt: opts.now || null };
}

module.exports = { gatherGitState, missionIsMutating, truthLockGate };
