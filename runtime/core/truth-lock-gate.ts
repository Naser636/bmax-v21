#!/usr/bin/env node
/*
 * Truth-Lock PRE-EXECUTION GATE — wires the canonical IDENTITY policy (runtime/core/truth-lock.evaluateTruthLock)
 * into the real odg-run execution path, BEFORE any pipeline stage runs. Closes the Day-1 "IDENTITY declared-only"
 * gap: the pure policy existed but nothing in the live pipeline consulted it.
 *
 * WHAT IS CHECKED (reuses evaluateTruthLock — no second control): repo present, expected branch, HEAD==origin/main,
 * empty index. Unstaged worktree edits are NOT blocked (the canonical isolation design).
 * WHEN: once, at odg-run entry, after the governance gate and BEFORE the stage loop.
 * TRUSTED DATA: observable git facts gathered live via an injectable exec seam (default real `git`).
 * REFUSAL: a MUTATING mission (requiresEngineering) with a failing verdict ⇒ status BLOCKED (odg-run exits 1,
 *   no stage runs). A READ-ONLY mission is never blocked — the verdict is RECORDED for observability only.
 *   Indeterminate mutating-ness defaults to RECORDED (never block a workflow we cannot prove mutates).
 * CONSIGNED: the caller writes the verdict to runtime/generated/truth-lock.json (evidence).
 *
 * Dual-port: truth-lock-gate.js is the ODG_RUNTIME=js rollback twin, maintained in parity.
 */
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const { evaluateTruthLock } = require("./truth-lock");

// Gather observable git facts via an injectable exec seam (default real `git`). Each call returns a trimmed
// string or null (command failed / not resolvable). PURE given a deterministic seam (tests inject one).
function gatherGitState(exec?: any): any {
  const run = typeof exec === "function"
    ? exec
    : (args: string[]) => { try { return String(cp.execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } };
  const isRepo = run(["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) return { isRepo: false, branch: "", head: "", originMain: null, staged: 0 };
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]) || "";
  const head = run(["rev-parse", "HEAD"]) || "";
  const originMain = run(["rev-parse", "origin/main"]) || null;
  const stagedRaw = run(["diff", "--cached", "--name-only"]);
  const staged = typeof stagedRaw === "string" && stagedRaw.length ? stagedRaw.split("\n").filter(Boolean).length : 0;
  return { isRepo, branch, head, originMain, staged };
}

// Does this mission MUTATE the repo? Reads the mission DEFINITION (runtime/missions/<mission>.json) — available
// before the pipeline loads it. requiresEngineering / requires_engineering true, or an ENGINEERING mode ⇒ mutating.
// A read-only mode (AUDIT/ANALYZE/READ_ONLY) ⇒ NOT mutating. Indeterminate (no file / no signal) ⇒ false
// (record-only — never block a workflow we cannot prove mutates). Returns { mutating, basis }.
function missionIsMutating(mission: any, opts: any = {}): any {
  const io = opts.fs || fs;
  const dir = opts.missionsDir || path.join("runtime", "missions");
  let def: any = null;
  try { def = JSON.parse(io.readFileSync(path.join(dir, `${mission}.json`), "utf8")); } catch { def = null; }
  if (!def) return { mutating: false, basis: "no mission definition file — record-only (indeterminate)" };
  const mode = String(def.mode || "").toUpperCase();
  if (def.requiresEngineering === true || def.requires_engineering === true) return { mutating: true, basis: "requiresEngineering=true" };
  if (["AUDIT", "ANALYZE", "READ_ONLY", "OBSERVE"].includes(mode)) return { mutating: false, basis: `read-only mode ${mode}` };
  if (mode === "ENGINEERING") return { mutating: true, basis: "mode=ENGINEERING" };
  return { mutating: false, basis: "no engineering signal — record-only" };
}

// PURE gate decision. status: PASS (ok) | BLOCKED (enforce && mutating && !ok) | RECORDED (!ok but not an
// enforced block). ENFORCEMENT IS OPT-IN (`enforce`): the gate ALWAYS runs + records the verdict (observability
// wired on every run), but only a deployment/campaign context that opts in actually BLOCKS. This is deliberate:
// sandbox/test/CI fixtures legitimately run mutating missions in throwaway git repos that lack origin/main or a
// clean index; blocking those by default would break legitimate workflows (and cross-runtime parity). A real
// run sets ODG_TRUTH_LOCK_ENFORCE=1 (threaded in by the caller) to make the refusal binding.
function truthLockGate(opts: any = {}): any {
  const gitState = opts.gitState || gatherGitState(opts.exec);
  const verdict = evaluateTruthLock(gitState, opts.policy);
  const mutating = opts.mutating === true;
  const enforce = opts.enforce === true;
  const blocked = enforce && mutating && !verdict.ok;
  const status = verdict.ok ? "PASS" : (blocked ? "BLOCKED" : "RECORDED");
  return { status, ok: verdict.ok, blocked, mutating, enforce, mission: opts.mission || null, gitState, verdict, checkedAt: opts.now || null };
}

export {};
module.exports = { gatherGitState, missionIsMutating, truthLockGate };
