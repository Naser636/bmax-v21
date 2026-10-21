#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Day-3 reprise (Gate B) — Truth-Lock PRE-WRITE gate in the patch-executor edits branch (the primary
 * file-mutation path that bypasses resolve() and, when spawned directly, the odg-run entry gate). Proves, by
 * spawning the REAL patch-executor.js in a throwaway git repo with controlled state (no seams, no network, no
 * external effect): BAD repo state + enforce ⇒ REFUSED, NO file written (bypass closed); CLEAN state + enforce
 * ⇒ writes normally (legitimate preserved); BAD state + enforce OFF ⇒ writes (default no-op, byte-identical).
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = path.resolve(__dirname, "..", "..");
const PATCH_EXECUTOR = path.join(REPO, "runtime", "core", "patch-executor.js");
const TARGET_REL = path.join("runtime", "generated", "tl-probe.txt");

function git(dir, args) { return spawnSync("git", args, { cwd: dir, encoding: "utf8" }); }

// Build a throwaway repo with a committed seed on `main` and a patch-plan carrying ONE edits patch.
function sandbox({ cleanState }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pe-tl-"));
  git(dir, ["init", "-q"]);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(dir, ["config", "user.email", "a@b.c"]);
  git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  if (cleanState) {
    // origin/main == HEAD on branch main, index empty ⇒ Truth-Lock PASS.
    git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  } else {
    // Unexpected branch ⇒ Truth-Lock REFUSES (also no origin/main). A BAD repo state.
    git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", "feature/x"]);
  }
  const gen = path.join(dir, "runtime", "generated");
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, "patch-plan.json"), JSON.stringify({
    mission: "TL_PROBE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/generated"],
    patches: [{ id: 1, action: "write tl-probe", objectiveId: "ODG_WRITE_TLPROBE", authoredBy: "CONTRACT",
      edits: [{ target: TARGET_REL, content: "truth-lock-probe\n" }] }],
  }));
  return dir;
}

function run(dir, { enforce }) {
  const env = { ...process.env };
  if (enforce) env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete env.ODG_TRUTH_LOCK_ENFORCE;
  const r = spawnSync("node", [PATCH_EXECUTOR], { cwd: dir, encoding: "utf8", env });
  let report = null;
  try { report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8")); } catch { /* none */ }
  return { exit: r.status, wrote: fs.existsSync(path.join(dir, TARGET_REL)), report };
}

console.log("patch-executor Truth-Lock PRE-WRITE gate");

// 1 — BYPASS CLOSED: bad repo state (wrong branch) + enforce ⇒ REFUSED, and the target file is NEVER written.
{
  const dir = sandbox({ cleanState: false });
  const r = run(dir, { enforce: true });
  ok("bad state + enforce ⇒ exit non-zero (refused)", r.exit !== 0);
  ok("bad state + enforce ⇒ NO file written (mutation blocked before any write)", r.wrote === false);
  ok("bad state + enforce ⇒ patch-execution records TRUTH_LOCK_REFUSED (honest FAILED, not success)",
    r.report && Array.isArray(r.report.executed) && r.report.executed.some((e) => e.status === "FAILED" && e.code === "TRUTH_LOCK_REFUSED"));
}
// 2 — LEGITIMATE preserved: clean state + enforce ⇒ the edit is applied (file written), exit 0.
{
  const dir = sandbox({ cleanState: true });
  const r = run(dir, { enforce: true });
  ok("clean state + enforce ⇒ file IS written (legitimate run not over-blocked)", r.wrote === true);
  ok("clean state + enforce ⇒ exit 0", r.exit === 0);
}
// 3 — DEFAULT no-op: bad state + enforce OFF ⇒ the edit is applied (record-only default is byte-identical).
{
  const dir = sandbox({ cleanState: false });
  const r = run(dir, { enforce: false });
  ok("bad state + enforce OFF ⇒ file written (default record-only, no behavior change)", r.wrote === true);
}

console.log(`\npatch-executor-truth-lock — ${passed} assertions passed.`);
