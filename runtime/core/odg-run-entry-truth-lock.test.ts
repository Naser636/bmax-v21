#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * ODG-RUN ENTRY-GATE Truth-Lock — real-binary refusal proof (hermetic, temp repos).
 *
 * The mission-runtime ENTRY `runtime/bin/odg-run.js` carries the IDENTITY/Truth-Lock pre-execution gate
 * (after governance, BEFORE any stage). This spawns the REAL entry binary against THROWAWAY git repos and
 * proves, at the true entry point (not a unit of the gate), that under ODG_TRUTH_LOCK_ENFORCE=1:
 *   - a NON-CONFORMING repo + a mutating (engineering) mission is REFUSED before the first stage runs,
 *     with exit 1, a canonical truth-lock.json BLOCKED verdict, and NO effect (no target file, no commit,
 *     no stage logs);
 *   - a CONFORMING repo passes the gate (legitimate operation permitted);
 *   - enforce OFF ⇒ record-only (never blocked) — historical behaviour preserved.
 *
 * The real work repo is NEVER made non-conforming: each case is an isolated temp git repo. Core is resolved
 * from the installed repo (ODG_RUNTIME=js ⇒ the source port's __dirname-relative requires); only git facts,
 * the mission definition, and governance inputs are read from the temp cwd. (The compiled dist entry shares
 * the identical gate — wired in lockstep — and is additionally evidenced out-of-band in §7.13.)
 *
 * Run: node_modules/.bin/tsx runtime/core/odg-run-entry-truth-lock.test.ts
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const ENTRY = path.join(REPO, "runtime", "dist", "bin", "odg-run.js");
const GOV = [
  ["runtime/constitution", "runtime-constitution.json"],
  ["runtime/policies", "runtime-policies.json"],
  ["runtime/governance", "state-machine.json"],
];

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
function git(dir, args) { spawnSync("git", ["-C", dir, ...args], { stdio: "ignore" }); }

// state: conforming | wrong-branch | staged-index
function makeRepo(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odgrun-entry-"));
  for (const [d] of GOV) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "app"), { recursive: true });
  for (const [d, f] of GOV) fs.copyFileSync(path.join(REPO, d, f), path.join(dir, d, f));
  // A mutating (engineering) mission ⇒ missionIsMutating()=true ⇒ the gate enforces under ENFORCE.
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"),
    JSON.stringify({ mission: "M", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["src/app"], objectives: [{ id: "e1", goal: "x", done_when: ["ok"] }] }));
  git(dir, ["init", "-q"]); git(dir, ["config", "user.email", "t@t.t"]); git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n"); git(dir, ["add", "README.md"]); git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  git(dir, ["branch", "-m", "main"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (state === "wrong-branch") git(dir, ["checkout", "-q", "-b", "feature/x"]);
  else if (state === "staged-index") { fs.writeFileSync(path.join(dir, "staged.txt"), "x"); git(dir, ["add", "staged.txt"]); }
  return dir;
}

function run(dir, enforce) {
  const env = { ...process.env, ODG_RUNTIME: "js" };
  if (enforce) env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete env.ODG_TRUTH_LOCK_ENFORCE;
  const r = spawnSync("node", [ENTRY, "M"], { cwd: dir, encoding: "utf8", env });
  const out = (r.stdout || "") + (r.stderr || "");
  let verdict = null;
  try { verdict = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "truth-lock.json"), "utf8")); } catch { /* none */ }
  const commits = (spawnSync("git", ["-C", dir, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).stdout || "").trim();
  const logsDir = path.join(dir, "runtime", "generated", "logs");
  return {
    exit: r.status,
    refused: /REFUSED a mutating mission before any stage ran/.test(out),
    gateLine: (out.match(/Truth Lock : .*/) || [""])[0],
    ranAStage: /^>>> /m.test(out) || /PIPELINE SUCCESS/.test(out),
    reachedPipeline: /ODG RUNTIME PIPELINE/.test(out),
    verdict,
    targetFiles: fs.existsSync(path.join(dir, "src", "app")) ? fs.readdirSync(path.join(dir, "src", "app")).length : 0,
    commits,
    stageLogs: fs.existsSync(logsDir) ? fs.readdirSync(logsDir).length : 0,
  };
}

console.log("ODG-RUN ENTRY-GATE Truth-Lock (real binary, temp repos)");

// 1 — NON-CONFORMING (wrong branch) + mutating + ENFORCE ⇒ REFUSED before any stage, no effect.
{
  const dir = makeRepo("wrong-branch");
  const r = run(dir, true);
  ok("wrong-branch + mutating + ENFORCE ⇒ gate BLOCKED (mutating=true, ENFORCE)", /BLOCKED \(mutating=true, ENFORCE\)/.test(r.gateLine));
  ok("wrong-branch + ENFORCE ⇒ REFUSED before any stage ran (exit 1)", r.refused && r.exit === 1);
  ok("wrong-branch + ENFORCE ⇒ canonical truth-lock.json verdict blocked=true", r.verdict && r.verdict.blocked === true && r.verdict.status === "BLOCKED");
  ok("wrong-branch + ENFORCE ⇒ NO stage ran (no pipeline, no stage logs)", r.ranAStage === false && r.stageLogs === 0);
  ok("wrong-branch + ENFORCE ⇒ NO residual effect (no target file, no new commit)", r.targetFiles === 0 && r.commits === "1");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2 — CONFORMING + mutating + ENFORCE ⇒ gate PASSES (legitimate operation permitted past the gate).
{
  const dir = makeRepo("conforming");
  const r = run(dir, true);
  ok("conforming + mutating + ENFORCE ⇒ gate PASS (not refused)", /PASS \(mutating=true, ENFORCE\)/.test(r.gateLine) && r.refused === false);
  ok("conforming + mutating + ENFORCE ⇒ passed the gate into the pipeline", r.reachedPipeline === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3 — NON-CONFORMING + mutating + enforce OFF ⇒ record-only (never blocked) — historical behaviour.
{
  const dir = makeRepo("wrong-branch");
  const r = run(dir, false);
  ok("wrong-branch + enforce OFF ⇒ record-only (not refused, reaches pipeline)", r.refused === false && /record-only/.test(r.gateLine) && r.reachedPipeline === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4 — STAGED INDEX (on main) + mutating + ENFORCE ⇒ REFUSED (canonical policy: staged index != 0).
{
  const dir = makeRepo("staged-index");
  const r = run(dir, true);
  ok("staged-index + mutating + ENFORCE ⇒ REFUSED before any stage, no effect", r.refused && r.exit === 1 && r.ranAStage === false && r.targetFiles === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nodg-run entry-gate truth-lock — ${passed} assertions passed.`);
