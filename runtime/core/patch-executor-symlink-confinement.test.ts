#!/usr/bin/env node
// @ts-nocheck — behavioural test (runs under tsx / as compiled JS unchanged); suppresses tsc typechecking only.

/*
 * Patch Executor — SYMLINK / REAL-PATH WRITE CONFINEMENT (Phase 2C adversarial fixture).
 *
 * Black-box: runs the REAL runtime/dist/core/patch-executor.js as a subprocess in a throwaway cwd, so no
 * real tree is touched and no logic is duplicated. Proves that an edit whose `target` passes the lexical
 * authorized_paths check STILL cannot write outside the repo via a symlink / real-path escape:
 *
 *   1. symlinked EXISTING scope dir     — runtime/app -> /outside ; target runtime/app/x.txt
 *                                         ⇒ ancestor real-path escape REFUSED, nothing written outside.
 *   2. dangling FINAL-component symlink — runtime/app/link.txt -> /outside/t.txt (target does not exist)
 *                                         ⇒ O_NOFOLLOW refuses to follow the link, nothing written outside.
 *   3. existing FINAL-component symlink — runtime/app/link.txt -> /outside/t.txt (target file EXISTS)
 *                                         ⇒ replacement-through-symlink refused; outside file UNCHANGED.
 *   4. lexical traversal                — target runtime/app/../../outside/x.txt
 *                                         ⇒ already refused by authorized_paths (defense-in-depth, unchanged).
 *   5. legit in-scope write             — real runtime/app dir, target runtime/app/ok.txt
 *                                         ⇒ APPLIED, file present in-scope (confinement does not over-block).
 *
 * Hermetic: each case uses its OWN os.tmpdir() mkdtemp cwd + a separate "outside" mkdtemp; paths are computed
 * (path.join), never literal "runtime/..." strings, so the suite is safe in the phase-2 parallel pool.
 * Deterministic. No network / provider / autonomy flows.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PATCH_EXECUTOR = path.join(REPO, "runtime", "dist", "core", "patch-executor.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Build a throwaway repo cwd + an outside dir, write a patch plan, run the executor, return { report, dir, outside }.
function run(edits, setup) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ple-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "OUT-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  setup(dir, outside);
  fs.writeFileSync(
    path.join(dir, "runtime", "generated", "patch-plan.json"),
    JSON.stringify({ mission: "M-sym", authorizedPaths: ["runtime/app"], patches: [{ action: "a", objectiveId: "a", edits }] }),
  );
  spawnSync("node", [PATCH_EXECUTOR], { cwd: dir, encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8")); } catch { /* none */ }
  const status = report && report.executed && report.executed[0] && report.executed[0].status;
  return { report, status, dir, outside };
}
function cleanup(r) { for (const p of [r.dir, r.outside]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best-effort */ } } }

console.log("Patch Executor — symlink / real-path write confinement");

// 1. symlinked existing scope dir -> outside.
{
  const r = run([{ target: "runtime/app/escaped.txt", content: "PWNED" }],
    (dir, outside) => { fs.symlinkSync(outside, path.join(dir, "runtime", "app")); });
  ok("1 symlinked-scope-dir: NOT written outside", !fs.existsSync(path.join(r.outside, "escaped.txt")));
  ok("1 symlinked-scope-dir: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 2. dangling final-component symlink -> outside (target file does not exist yet).
{
  const r = run([{ target: "runtime/app/link.txt", content: "PWNED" }],
    (dir, outside) => {
      fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true });
      fs.symlinkSync(path.join(outside, "t.txt"), path.join(dir, "runtime", "app", "link.txt"));
    });
  ok("2 dangling-final-symlink: NOT written outside", !fs.existsSync(path.join(r.outside, "t.txt")));
  ok("2 dangling-final-symlink: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 3. existing final-component symlink -> an EXISTING outside file (replacement-through-symlink).
{
  const r = run([{ target: "runtime/app/link.txt", content: "PWNED" }],
    (dir, outside) => {
      fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true });
      fs.writeFileSync(path.join(outside, "t.txt"), "ORIGINAL");
      fs.symlinkSync(path.join(outside, "t.txt"), path.join(dir, "runtime", "app", "link.txt"));
    });
  ok("3 replace-through-symlink: outside file UNCHANGED", fs.readFileSync(path.join(r.outside, "t.txt"), "utf8") === "ORIGINAL");
  ok("3 replace-through-symlink: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 4. lexical traversal — already refused by authorized_paths (defense-in-depth, unchanged).
{
  const r = run([{ target: "runtime/app/../../outside/x.txt", content: "PWNED" }],
    (dir, outside) => { fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true }); });
  ok("4 lexical-traversal: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 5. legit in-scope write — confinement must NOT over-block.
{
  const r = run([{ target: "runtime/app/ok.txt", content: "OK" }],
    (dir) => { fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true }); });
  ok("5 legit-in-scope: file written in-scope", fs.existsSync(path.join(r.dir, "runtime", "app", "ok.txt")));
  ok("5 legit-in-scope: edit status APPLIED", r.status === "APPLIED");
  cleanup(r);
}

// 6. AUDIT-FOUND lexical-cancellation escape: symlinked dir foo -> outside, target "runtime/app/foo/../evil.txt".
//    path.normalize/path.resolve lexically cancel "foo/.." BEFORE inspecting foo, but the kernel substitutes the
//    symlink first on the raw write path and applies ".." to its real target ⇒ writes OUTSIDE cwd. Must be REFUSED.
{
  const r = run([{ target: "runtime/app/foo/../evil.txt", content: "PWNED" }],
    (dir, outside) => { fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true }); fs.symlinkSync(outside, path.join(dir, "runtime", "app", "foo")); });
  // the escape target lands in the PARENT of `outside` (dirname(r.outside)) — assert neither location got a file.
  ok("6 symlink+.. (content): NOT written to outside-parent", !fs.existsSync(path.join(path.dirname(r.outside), "evil.txt")));
  ok("6 symlink+.. (content): NOT written to outside", !fs.existsSync(path.join(r.outside, "evil.txt")));
  ok("6 symlink+.. (content): edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 7. same lexical-cancellation escape in DIFF mode — must neither read-leak the outside file nor overwrite it.
{
  const outsideFile = "SECRET-ORIGINAL";
  const r = run([{ target: "runtime/app/foo/../t.txt", diff: "@@ -1 +1 @@\n-SECRET-ORIGINAL\n+TAMPERED\n" }],
    (dir, outside) => {
      fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true });
      fs.writeFileSync(path.join(path.dirname(outside), "t.txt"), outsideFile + "\n");
      fs.symlinkSync(outside, path.join(dir, "runtime", "app", "foo"));
    });
  ok("7 symlink+.. (diff): outside file UNCHANGED", fs.readFileSync(path.join(path.dirname(r.outside), "t.txt"), "utf8") === outsideFile + "\n");
  ok("7 symlink+.. (diff): edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 8. bare ".." segment with no symlink — refused up front (defense-in-depth; no legit target carries "..").
{
  const r = run([{ target: "runtime/app/sub/../../../x.txt", content: "PWNED" }],
    (dir) => { fs.mkdirSync(path.join(dir, "runtime", "app", "sub"), { recursive: true }); });
  ok("8 bare-dotdot: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 9. AUDIT-FOUND hardlink escape: a hard link to an OUTSIDE file, pre-placed at an in-scope path, shares the inode;
//    O_NOFOLLOW cannot see it (a hard link is not a symlink) and the path itself is in-scope. The write-time nlink>1
//    refusal (BEFORE truncation) must leave the outside file byte-identical and not report APPLIED.
{
  const r = run([{ target: "runtime/app/x.txt", content: "PWNED-HARDLINK" }],
    (dir, outside) => {
      fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true });
      const secret = path.join(outside, "secret");
      fs.writeFileSync(secret, "OUTSIDE-SECRET");
      fs.linkSync(secret, path.join(dir, "runtime", "app", "x.txt")); // hard link into authorized scope
    });
  ok("9 hardlink-into-scope: outside file UNCHANGED", fs.readFileSync(path.join(r.outside, "secret"), "utf8") === "OUTSIDE-SECRET");
  ok("9 hardlink-into-scope: edit status is not APPLIED", r.status !== "APPLIED");
  cleanup(r);
}

// 10. legit overwrite of an EXISTING single-link in-scope file — nlink==1, must still apply (no over-block).
{
  const r = run([{ target: "runtime/app/ok.txt", content: "NEW" }],
    (dir) => { fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true }); fs.writeFileSync(path.join(dir, "runtime", "app", "ok.txt"), "OLD"); });
  ok("10 legit-overwrite: content replaced in-scope", fs.readFileSync(path.join(r.dir, "runtime", "app", "ok.txt"), "utf8") === "NEW");
  ok("10 legit-overwrite: edit status APPLIED", r.status === "APPLIED");
  cleanup(r);
}

console.log(`Patch Executor symlink confinement — ${passed} assertions passed.`);
