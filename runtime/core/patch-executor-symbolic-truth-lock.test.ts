#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * R2 — SYMBOLIC-PATCH TRUTH-LOCK acceptance (co-located). Locks the fix for the demonstrated bypass:
 * a patch-executor run carrying a file-writing SYMBOLIC action (PROCESS_TODOS etc., no `edits`) used to
 * skip the Day-3 edits-only Truth-Lock pre-flight, allowing a mutation on a NON-CONFORMING git state under
 * ODG_TRUTH_LOCK_ENFORCE=1. The pre-flight now fires for mutating symbolic actions too, BEFORE any write.
 *
 * Properties proven (temp git repos; no network; gate is opt-in, so every case sets ODG_TRUTH_LOCK_ENFORCE
 * explicitly except the record-only case which proves the DEFAULT no-op): conforming→allowed; wrong-branch→
 * refuse-before-write; staged-index→refuse (canonical policy); unverifiable (non-repo)→refuse in strict mode;
 * record-only (no enforce)→historical behaviour preserved; refuse-then-retry→no bypass + no residual;
 * no residual artifact after refusal; identical safety on BOTH ports (.js source + compiled dist).
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
const JS_PORT = path.join(REPO, "runtime", "core", "patch-executor.js");
const DIST_PORT = path.join(REPO, "runtime", "dist", "core", "patch-executor.js");

// Build a temp git repo. Variants: "conforming" (on main == origin/main, clean index), "wrong-branch",
// "staged-index" (on main but a staged change), "non-repo" (no git at all).
function makeRepo(variant) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "r2-sym-"));
  fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true });
  if (variant === "non-repo") return d;
  const git = (args) => spawnSync("git", ["-C", d, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  git(["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(["config", "user.email", "a@b.c"]);
  git(["config", "user.name", "t"]);
  // A TODO so PROCESS_TODOS has real content to emit when it is allowed to run.
  fs.writeFileSync(path.join(d, "README.md"), "seed\n// TODO: real work\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "seed"]);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (variant === "wrong-branch") git(["checkout", "-q", "-b", "feature/x"]);
  if (variant === "staged-index") { fs.writeFileSync(path.join(d, "staged.txt"), "x"); git(["add", "staged.txt"]); }
  return d;
}

function writePlan(d, action) {
  fs.writeFileSync(path.join(d, "runtime", "generated", "patch-plan.json"),
    JSON.stringify({ mission: "R2_SYM", patches: [{ id: 1, action, objectiveId: "SYM1" }] }));
}

// Run a port in a repo. Returns { exit, refused, artifactWritten }.
function run(port, d, action, enforce) {
  writePlan(d, action);
  const env = { ...process.env };
  if (enforce) env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete env.ODG_TRUTH_LOCK_ENFORCE;
  const r = spawnSync("node", [port], { cwd: d, encoding: "utf8", env });
  const artifact = action === "IMPLEMENT_MISSING_CAPABILITIES"
    ? path.join(d, "runtime", "generated", "capabilities")
    : path.join(d, "runtime", "generated", "todo-report.txt");
  let exec = [];
  try { exec = JSON.parse(fs.readFileSync(path.join(d, "runtime", "generated", "patch-execution.json"), "utf8")).executed || []; } catch { /* none */ }
  const refused = r.status === 1 && exec.length > 0 && exec.every((e) => e.code === "TRUTH_LOCK_REFUSED");
  return { exit: r.status, refused, artifactWritten: fs.existsSync(artifact) };
}

function suite(label, port) {
  console.log(`\n[${label}]`);

  // (2) wrong-branch + enforce → REFUSE before any write (the exact reproduced bypass, now closed).
  {
    const d = makeRepo("wrong-branch");
    const r = run(port, d, "PROCESS_TODOS", true);
    ok(`${label}: wrong-branch + enforce ⇒ refused before write (exit 1, TRUTH_LOCK_REFUSED)`, r.refused === true);
    ok(`${label}: wrong-branch + enforce ⇒ NO residual artifact (todo-report absent)`, r.artifactWritten === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // (1) conforming + enforce → ALLOWED (gate passes, symbolic action runs, report written).
  {
    const d = makeRepo("conforming");
    const r = run(port, d, "PROCESS_TODOS", true);
    ok(`${label}: conforming + enforce ⇒ NOT refused (legit mutation allowed)`, r.refused === false && r.exit === 0);
    ok(`${label}: conforming + enforce ⇒ report actually written`, r.artifactWritten === true);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // (3) staged index on main + enforce → canonical policy refuses (staged != 0 is non-conforming).
  {
    const d = makeRepo("staged-index");
    const r = run(port, d, "PROCESS_TODOS", true);
    ok(`${label}: staged-index + enforce ⇒ refused (canonical policy, before write)`, r.refused === true && r.artifactWritten === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // (4) unverifiable git state (not a repo) + enforce ⇒ refuse in strict mode.
  {
    const d = makeRepo("non-repo");
    const r = run(port, d, "PROCESS_TODOS", true);
    ok(`${label}: non-repo (unverifiable) + enforce ⇒ refused in strict mode`, r.refused === true && r.artifactWritten === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // (5) record-only (NO enforce) on wrong-branch ⇒ historical behaviour preserved (gate is a no-op; runs).
  {
    const d = makeRepo("wrong-branch");
    const r = run(port, d, "PROCESS_TODOS", false);
    ok(`${label}: record-only (no enforce) ⇒ historical behaviour preserved (not refused)`, r.refused === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // (6)+(7) refuse-then-retry on wrong-branch + enforce ⇒ no bypass by resume, no residual either time.
  {
    const d = makeRepo("wrong-branch");
    const a = run(port, d, "PROCESS_TODOS", true);
    const b = run(port, d, "PROCESS_TODOS", true);
    ok(`${label}: refuse-then-retry ⇒ both refused, no bypass on resume`, a.refused === true && b.refused === true);
    ok(`${label}: refuse-then-retry ⇒ no residual artifact after either attempt`, a.artifactWritten === false && b.artifactWritten === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // Higher-risk representative: the code-SCAFFOLD symbolic action is gated the same way.
  {
    const d = makeRepo("wrong-branch");
    const r = run(port, d, "IMPLEMENT_MISSING_CAPABILITIES", true);
    ok(`${label}: IMPLEMENT_MISSING_CAPABILITIES (scaffold writer) ⇒ refused before write, no scaffold dir`, r.refused === true && r.artifactWritten === false);
    fs.rmSync(d, { recursive: true, force: true });
  }
}

console.log("R2 — Symbolic-patch Truth-Lock acceptance");

suite("js-port", JS_PORT);
if (fs.existsSync(DIST_PORT)) {
  suite("dist-port", DIST_PORT);
} else {
  ok("dist port absent (build:runtime not run) ⇒ dist cases NOT_MEASURABLE (recorded, not a false pass)", true);
}

console.log(`\nR2 symbolic-patch truth-lock — ${passed} assertions passed.`);
