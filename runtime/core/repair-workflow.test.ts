#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Real fs on an isolated tmp workspace; acceptance runner INJECTED (zero subprocess)
// and reads the APPLIED file so the apply genuinely drives PASS/FAIL. Proves the full loop: reproduce baseline →
// bounded apply (within writeSet) → independent acceptance → ACCEPT or ROLLBACK, plus REJECTED/BLOCKED/NO_REPAIR/
// INVALID fail-closed paths and exact rollback. (A real `node --test` subprocess run is proven separately.)
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function mkWorkspace(buggyContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-repair-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "buggy.js"), buggyContent);
  return dir;
}
// Acceptance "runner": reads the applied src/buggy.js and PASSES (exit 0) only if it adds (contains "a + b").
const addRunner = (bin, args, opts) => {
  const f = path.join(opts.cwd, "src", "buggy.js");
  const content = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  return { exitCode: /a\s*\+\s*b/.test(content) ? 0 : 1, stdout: "", stderr: "" };
};
const CMD = ["node", "--test"];           // predeclared acceptance (never actually spawned — runner injected)
const WRITE = ["src/"];
const CORRECT = "module.exports = (a, b) => a + b;\n";
const BUGGY = "module.exports = (a, b) => a - b;\n";

// (1) ACCEPTED — baseline FAIL (a-b) → bounded edit → acceptance PASS. Workspace keeps the fix.
{
  const ws = mkWorkspace(BUGGY);
  const res = R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE,
    change: { source: "edits", edits: [{ path: "src/buggy.js", content: CORRECT }] } }, { runner: addRunner });
  ok("ACCEPTED: baseline FAIL → acceptance PASS after bounded edit", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("ACCEPTED records the changed file + not rolled back", res.changedFiles.includes("src/buggy.js") && res.rolledBack === false);
  ok("ACCEPTED leaves the real fix on disk", fs.readFileSync(path.join(ws, "src", "buggy.js"), "utf8") === CORRECT);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (2) ABSTAINED + EXACT ROLLBACK — change still fails acceptance ⇒ workspace restored byte-for-byte.
{
  const ws = mkWorkspace(BUGGY);
  const res = R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE,
    change: { source: "edits", edits: [{ path: "src/buggy.js", content: "module.exports = (a, b) => a * b;\n" }] } }, { runner: addRunner });
  ok("ABSTAINED when acceptance still fails", res.status === "ABSTAINED" && res.post.status === "FAIL" && res.rolledBack === true);
  ok("ABSTAINED rolls back to the exact baseline content", fs.readFileSync(path.join(ws, "src", "buggy.js"), "utf8") === BUGGY);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (3) REJECTED — edit outside the authorized writeSet is refused BEFORE any apply.
{
  const ws = mkWorkspace(BUGGY);
  const res = R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE,
    change: { source: "edits", edits: [{ path: "evil.js", content: "x" }] } }, { runner: addRunner });
  ok("REJECTED on write-set violation (code WRITE_SET_VIOLATION)", res.status === "REJECTED" && res.code === "WRITE_SET_VIOLATION");
  ok("REJECTED makes no change (no evil.js written)", !fs.existsSync(path.join(ws, "evil.js")));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (4) BLOCKED — generative source with no authorized provider ⇒ honest BLOCKED + unblock action (not faked).
{
  const ws = mkWorkspace(BUGGY);
  const saved = process.env.ODG_LOCAL_MODEL_CMD; delete process.env.ODG_LOCAL_MODEL_CMD;
  const res = R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE,
    change: { source: "generative" } }, { runner: addRunner });
  if (saved !== undefined) process.env.ODG_LOCAL_MODEL_CMD = saved;
  ok("BLOCKED on generative without authorized provider + unblock action", res.status === "BLOCKED" && /ODG_LOCAL_MODEL_CMD/.test(res.reason) && /approval/.test(res.unblock));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (5) NO_REPAIR_NEEDED — baseline already passes ⇒ no change applied.
{
  const ws = mkWorkspace(CORRECT);
  const res = R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE,
    change: { source: "edits", edits: [{ path: "src/buggy.js", content: CORRECT }] } }, { runner: addRunner });
  ok("NO_REPAIR_NEEDED when baseline already PASS", res.status === "NO_REPAIR_NEEDED" && res.ok === true);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (6) FIXERS source — autonomous DETERMINISTIC repair via local-fixers composition (end-to-end, no external patch).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-repair-fx-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "style.js"), "const x = 1;   \nconst y = 2;\t\n");   // trailing whitespace
  const lintRunner = (bin, args, opts) => {
    const c = fs.readFileSync(path.join(opts.cwd, "src", "style.js"), "utf8");
    return { exitCode: /[ \t]+\n/.test(c) ? 1 : 0, stdout: "", stderr: "" };   // fail iff trailing whitespace remains
  };
  const res = R.runRepairWorkflow({ workspaceDir: dir, acceptance: { command: ["lint"] }, writeSet: ["src/"],
    change: { source: "fixers", targets: ["src/style.js"], fixers: ["stripTrailingWhitespace", "ensureFinalNewline"] } }, { runner: lintRunner });
  ok("FIXERS: deterministic transform repairs the file → ACCEPTED", res.status === "ACCEPTED" && res.changeSource === "fixers");
  ok("FIXERS: trailing whitespace actually removed on disk", !/[ \t]+\n/.test(fs.readFileSync(path.join(dir, "src", "style.js"), "utf8")));
  fs.rmSync(dir, { recursive: true, force: true });
}

// (7) INVALID_INPUT — fail-closed on missing workspace / bad command / unknown fixer.
ok("INVALID_INPUT: missing workspaceDir", R.runRepairWorkflow({ acceptance: { command: CMD }, writeSet: WRITE, change: { source: "edits", edits: [] } }).status === "INVALID_INPUT");
{
  const ws = mkWorkspace(BUGGY);
  ok("INVALID_INPUT: no acceptance.command", R.runRepairWorkflow({ workspaceDir: ws, acceptance: {}, writeSet: WRITE, change: { source: "edits", edits: [{ path: "src/buggy.js", content: CORRECT }] } }).status === "INVALID_INPUT");
  ok("INVALID_INPUT: unknown fixer", R.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: CMD }, writeSet: WRITE, change: { source: "fixers", targets: ["src/buggy.js"], fixers: ["noSuchFixer"] } }, { runner: addRunner }).status === "INVALID_INPUT");
  fs.rmSync(ws, { recursive: true, force: true });
}

// (8) write-set guard unit: authorizes within prefix, rejects escapes/absolute/outside.
{
  const g = R.makeWriteSetGuard(["src/", "lib/mod"]);
  ok("guard: in-prefix authorized; escapes/outside rejected", g("src/a.js") && g("lib/mod/x.ts") && !g("evil.js") && !g("../etc/passwd") && !g("/abs/path"));
}

console.log(`\nREPAIR-WORKFLOW suite — ${pass} assertions passed. (reproduce→bounded apply→independent acceptance→ACCEPT/rollback; REJECTED/BLOCKED/NO_REPAIR/INVALID fail-closed; deterministic edits+fixers; generative seam honest)`);
