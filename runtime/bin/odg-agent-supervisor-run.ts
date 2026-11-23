#!/usr/bin/env node
"use strict";

/*
 * V155 — ODG AGENT SUPERVISOR snapshot (READ-ONLY). Collects the REAL current evidence of this repo (git worktrees,
 * branches vs origin/main, uncommitted changes, live process cwds inside worktrees, heartbeat files, fleet-bridge claims,
 * Claude Code task-output STRUCTURE) plus an optional injected `gh pr list` JSON, classifies every agent with
 * runtime/core/odg-agent-supervisor, and prints the snapshot JSON. Never writes the repo, never calls the network,
 * never deletes anything, never ingests task-output content.
 *
 * Run: tsx runtime/bin/odg-agent-supervisor-run.ts [--repo DIR] [--prs gh-prs.json] [--tasks-root DIR]
 *        [--heartbeat-dir DIR] [--locks-dir DIR] [--task-window-h N] [--out FILE]
 *   gh-prs.json = output of: gh pr list --state all --limit 200 --json number,headRefName,state,headRefOid,mergeCommit,statusCheckRollup
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const S = require("../core/odg-agent-supervisor.js");

function arg(name: string, def: any = null): any { const i = process.argv.indexOf(name); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def; }

function mainRepoOf(dir: string): string {
  const r = cp.spawnSync("git", ["-C", dir, "worktree", "list", "--porcelain"], { encoding: "utf8" });
  const first = r.status === 0 ? S.parseWorktreePorcelain(r.stdout)[0] : null;
  return first ? first.path : path.resolve(dir);
}

function main(): void {
  const repo = mainRepoOf(path.resolve(arg("--repo", process.cwd())));
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const tasksRoot = arg("--tasks-root", path.join("/tmp", "claude-" + uid, repo.replace(/[\/.]/g, "-")));
  const prsFile = arg("--prs");
  const prs = prsFile ? S.normalizePrs(JSON.parse(fs.readFileSync(prsFile, "utf8"))) : null;
  const ev = S.collectEvidence({
    repo, prs, tasksRoot,
    heartbeatDir: arg("--heartbeat-dir", path.join(repo, "runtime", "generated", "agent-supervisor", "heartbeats")),
    locksDir: arg("--locks-dir", path.join(repo, "runtime", "generated", "fleet", "locks")),
    taskWindowMs: Number(arg("--task-window-h", 72)) * 3600 * 1000,
  });
  const snap = S.snapshot(ev);
  const text = JSON.stringify(snap, null, 2) + "\n";
  const out = arg("--out");
  if (out) fs.writeFileSync(out, text);
  process.stdout.write(text);
}

main();
export {};
