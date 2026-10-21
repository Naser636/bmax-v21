#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Day-3 (Priority A) — Truth-Lock CHOKEPOINT at capability-executors.resolve(). Proves the opt-in repo-safety
 * gate covers DIRECT capability dispatches (the ones that bypass the odg-run entry gate), is class-aware
 * (CONSEQUENTIAL only — observational never gated), refuses BEFORE the effect runs, and is a byte-identical
 * no-op when enforcement is off (so tests/parity/sandbox and read-only dispatches are unaffected). The git
 * facts are injected via the _seams.gitExec seam, so no real git/branch state is required.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cap = require("./capability-executors.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Injected git-fact seams: a BAD state (wrong branch) ⇒ Truth-Lock fails; a GOOD state ⇒ passes.
const badExec = (args) => {
  const k = args.join(" ");
  if (k === "rev-parse --is-inside-work-tree") return "true";
  if (k === "rev-parse --abbrev-ref HEAD") return "feature/x"; // unexpected branch ⇒ violation
  if (k === "rev-parse HEAD") return "aaaaaaa";
  if (k === "rev-parse origin/main") return "aaaaaaa";
  if (k === "diff --cached --name-only") return "";
  return null;
};

function dispatch(objectiveId, { enforce, gitExec }) {
  const prevEnv = process.env.ODG_TRUTH_LOCK_ENFORCE;
  const prevCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tl-choke-"));
  process.chdir(dir);
  if (enforce) process.env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete process.env.ODG_TRUTH_LOCK_ENFORCE;
  cap.__setExecutorSeams({ gitExec });
  let threw = false, msg = "";
  try { cap.resolve({ objectiveId }).run(); } catch (e) { threw = true; msg = String(e && e.message || e); }
  finally {
    cap.__resetExecutorSeams();
    if (prevEnv === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prevEnv;
    process.chdir(prevCwd);
  }
  return { threw, msg };
}

console.log("Truth-Lock CHOKEPOINT (capability-executors.resolve)");

// 1 — CONSEQUENTIAL dispatch + ENFORCE + bad repo state ⇒ REFUSED by Truth-Lock BEFORE any effect.
{
  const r = dispatch("ODG_WRITE_x", { enforce: true, gitExec: badExec });
  ok("consequential (ODG_WRITE_) + enforce + bad state ⇒ run() throws a Truth-Lock refusal", r.threw && /Truth-Lock \(repo-safety\)/.test(r.msg));
}
// 2 — SAME dispatch + enforce OFF ⇒ NOT a Truth-Lock refusal (no-op; the executor's own path runs/fails, but
//     the repo-safety gate did not fire — default byte-identical behavior).
{
  const r = dispatch("ODG_WRITE_x", { enforce: false, gitExec: badExec });
  ok("consequential + enforce OFF ⇒ NOT blocked by Truth-Lock (no-op by default)", !/Truth-Lock \(repo-safety\)/.test(r.msg));
}
// 3 — OBSERVATIONAL dispatch (Clean Workspace scan) + ENFORCE + bad state ⇒ NOT gated (read-only never blocked).
{
  const r = dispatch("CLEAN_WORKSPACE_1", { enforce: true, gitExec: badExec });
  ok("observational (CLEAN_WORKSPACE_) + enforce + bad state ⇒ NOT a Truth-Lock refusal (class-aware)", !/Truth-Lock \(repo-safety\)/.test(r.msg));
}
// 4 — CONSEQUENTIAL dispatch + ENFORCE + GOOD state ⇒ Truth-Lock does NOT refuse (lets the dispatch proceed;
//     any later error is the executor's own, never the repo-safety gate).
{
  const goodExec = (args) => {
    const k = args.join(" ");
    if (k === "rev-parse --is-inside-work-tree") return "true";
    if (k === "rev-parse --abbrev-ref HEAD") return "main";
    if (k === "rev-parse HEAD") return "bbbbbbb";
    if (k === "rev-parse origin/main") return "bbbbbbb";
    if (k === "diff --cached --name-only") return "";
    return null;
  };
  const r = dispatch("ODG_WRITE_x", { enforce: true, gitExec: goodExec });
  ok("consequential + enforce + GOOD state ⇒ NOT a Truth-Lock refusal (gate passes, dispatch proceeds)", !/Truth-Lock \(repo-safety\)/.test(r.msg));
}
// (deny-by-default for an unregistered capability is covered by dispatch-authorization-invariant.test.ts.)

console.log(`\ntruth-lock-chokepoint — ${passed} assertions passed.`);
