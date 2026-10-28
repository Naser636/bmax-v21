#!/usr/bin/env node
// @ts-nocheck — runs under tsx. 4th task family: deterministic broken-require repair. Pure detection/rewrite tested
// directly; orchestration via runRepairWorkflow with an INJECTED runner (zero subprocess) simulating a test that
// fails until the require points at the existing module. Proves ACCEPT on a safe fix, UNSUPPORTED (no candidate) and
// BLOCKED (ambiguous) with no guessing, positive/negative/out-of-scope + rollback.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./task-fix-require.js");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) relativeSpecifiers + findCorrectSpecifier + rewrite (pure).
const src = 'const u = require("./util");\nmodule.exports = () => u.go();\n';
ok("relativeSpecifiers finds './util'", T.relativeSpecifiers(src).includes("./util"));
const found = T.findCorrectSpecifier("src/index.js", "./util", ["src/lib/util.js"]);
ok("findCorrectSpecifier: single candidate ⇒ corrected './lib/util'", found.count === 1 && found.corrected === "./lib/util");
ok("rewriteSpecifier replaces the specifier", /require\("\.\/lib\/util"\)/.test(T.rewriteSpecifier(src, "./util", "./lib/util")));
ok("findCorrectSpecifier: zero candidates ⇒ count 0", T.findCorrectSpecifier("src/index.js", "./util", []).count === 0);
ok("findCorrectSpecifier: ambiguous ⇒ count 2", T.findCorrectSpecifier("src/index.js", "./util", ["a/util.js", "b/util.js"]).count === 2);

// (2) build fail-closed: no candidate ⇒ UNSUPPORTED (no invention); ambiguous ⇒ BLOCKED (no guess); already-fine ⇒ UNSUPPORTED.
ok("UNSUPPORTED when no candidate", T.buildFixRequireTask({ workspaceDir: "/w", modulePath: "src/index.js", source: src, badSpecifier: "./util", candidates: [], acceptanceCommand: ["node", "--test"] }).code === "UNSUPPORTED");
ok("BLOCKED when ambiguous", T.buildFixRequireTask({ workspaceDir: "/w", modulePath: "src/index.js", source: src, badSpecifier: "./util", candidates: ["a/util.js", "b/util.js"], acceptanceCommand: ["node", "--test"] }).code === "BLOCKED");
ok("UNSUPPORTED when badSpecifier not present", T.buildFixRequireTask({ workspaceDir: "/w", modulePath: "src/index.js", source: src, badSpecifier: "./ghost", candidates: ["src/ghost.js"], acceptanceCommand: ["node"] }).code === "UNSUPPORTED");

// Repo + runner: PASS iff src/index.js requires an existing module path.
function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fixreq-"));
  fs.mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "lib", "util.js"), "module.exports = { go: () => 42 };\n");
  fs.writeFileSync(path.join(dir, "src", "index.js"), src);   // broken: requires "./util" (should be "./lib/util")
  return dir;
}
const resolveRunner = (bin, args, opts) => {
  const s = fs.readFileSync(path.join(opts.cwd, "src", "index.js"), "utf8");
  return { exitCode: /require\("\.\/lib\/util"\)/.test(s) ? 0 : 1, stdout: "", stderr: /lib\/util/.test(s) ? "" : "Error: Cannot find module './util'" };
};

// (3) ACCEPTED — baseline FAIL (bad require) → rewritten to the single candidate → PASS, fix on disk.
{
  const ws = mkRepo();
  const b = T.buildFixRequireTask({ workspaceDir: ws, modulePath: "src/index.js", source: src, badSpecifier: "./util", candidates: ["src/lib/util.js"], acceptanceCommand: ["node", "--test"] });
  ok("buildFixRequireTask ok (single candidate) ⇒ corrected ./lib/util", b.ok && b.corrected === "./lib/util");
  const res = R.runRepairWorkflow(b.task, { runner: resolveRunner });
  ok("ACCEPTED: broken require repaired ⇒ failing test passes", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("ACCEPTED: corrected require on disk", /require\("\.\/lib\/util"\)/.test(fs.readFileSync(path.join(ws, "src", "index.js"), "utf8")));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (4) ABSTAINED + rollback — runner that never passes ⇒ exact rollback.
{
  const ws = mkRepo();
  const b = T.buildFixRequireTask({ workspaceDir: ws, modulePath: "src/index.js", source: src, badSpecifier: "./util", candidates: ["src/lib/util.js"], acceptanceCommand: ["node", "--test"] });
  const res = R.runRepairWorkflow(b.task, { runner: () => ({ exitCode: 1, stdout: "", stderr: "unrelated" }) });
  ok("ABSTAINED + exact rollback when acceptance still fails", res.status === "ABSTAINED" && res.rolledBack === true && fs.readFileSync(path.join(ws, "src", "index.js"), "utf8") === src);
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nTASK-FIX-REQUIRE suite — ${pass} assertions passed. (deterministic broken-require repair; ACCEPT single-candidate / UNSUPPORTED none / BLOCKED ambiguous; ABSTAIN+rollback; composes with repair-workflow)`);
