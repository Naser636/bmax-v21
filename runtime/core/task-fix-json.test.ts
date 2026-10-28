#!/usr/bin/env node
// @ts-nocheck — runs under tsx. 5th family: deterministic trailing-comma JSON repair. Pure strip/detect tested
// directly (incl. string-safety); orchestration via runRepairWorkflow with an INJECTED runner (parses the file).
// Proves ACCEPT on a proven-safe fix, UNSUPPORTED on other defects (no guessing), string-preservation, rollback.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./task-fix-json.js");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) stripTrailingCommas: removes trailing commas before } and ].
ok("strip removes trailing comma before }", T.stripTrailingCommas('{"a":1,}') === '{"a":1}');
ok("strip removes trailing comma before ] (with whitespace/newline)", T.stripTrailingCommas('[1,2,\n]') === '[1,2\n]');
ok("strip is idempotent", T.stripTrailingCommas(T.stripTrailingCommas('{"a":1,}')) === '{"a":1}');
// (2) STRING-SAFE: a comma inside a string value before a brace char is NOT touched.
ok("strip preserves commas inside strings", T.stripTrailingCommas('{"x":"a,}b"}') === '{"x":"a,}b"}');
ok("strip preserves a string that looks like a trailing comma", T.stripTrailingCommas('{"x":"v,",}') === '{"x":"v,"}');

// (3) detectJsonDefect.
ok("detect: valid JSON ⇒ NOT_DEFECT", T.detectJsonDefect('{"a":1}').kind === "NOT_DEFECT");
ok("detect: trailing comma ⇒ TRAILING_COMMA + fixed parses", (() => { const d = T.detectJsonDefect('{"a":1,}'); return d.kind === "TRAILING_COMMA" && JSON.parse(d.fixed).a === 1; })());
ok("detect: other defect (missing quote) ⇒ UNSUPPORTED", T.detectJsonDefect('{a:1}').kind === "UNSUPPORTED");

// (4) build fail-closed.
ok("UNSUPPORTED when already valid", T.buildFixJsonTask({ workspaceDir: "/w", modulePath: "c.json", source: '{"a":1}', acceptanceCommand: ["node"] }).code === "UNSUPPORTED");
ok("UNSUPPORTED on non-trailing-comma defect", T.buildFixJsonTask({ workspaceDir: "/w", modulePath: "c.json", source: '{a:1}', acceptanceCommand: ["node"] }).code === "UNSUPPORTED");
ok("INVALID when modulePath not .json", T.buildFixJsonTask({ workspaceDir: "/w", modulePath: "c.txt", source: "{,}", acceptanceCommand: ["node"] }).code === "INVALID_INPUT");

// Repo + runner: PASS iff config.json parses.
function mkRepo(src) { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fixjson-")); fs.writeFileSync(path.join(d, "config.json"), src); return d; }
const parseRunner = (bin, args, opts) => { try { JSON.parse(fs.readFileSync(path.join(opts.cwd, "config.json"), "utf8")); return { exitCode: 0, stdout: "", stderr: "" }; } catch { return { exitCode: 1, stdout: "", stderr: "parse error" }; } };
const BAD = '{\n  "name": "svc",\n  "ports": [80, 443,],\n}\n';

// (5) ACCEPTED — invalid JSON parses after the fix.
{
  const ws = mkRepo(BAD);
  const b = T.buildFixJsonTask({ workspaceDir: ws, modulePath: "config.json", source: BAD, acceptanceCommand: ["node", "--test"] });
  ok("buildFixJsonTask ok (trailing comma)", b.ok && b.kind === "TRAILING_COMMA");
  const res = R.runRepairWorkflow(b.task, { runner: parseRunner });
  ok("ACCEPTED: trailing-comma JSON repaired ⇒ parses", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("ACCEPTED: file now valid JSON on disk", (() => { const o = JSON.parse(fs.readFileSync(path.join(ws, "config.json"), "utf8")); return o.name === "svc" && o.ports.length === 2; })());
  fs.rmSync(ws, { recursive: true, force: true });
}

// (6) ABSTAINED + rollback — runner never passes ⇒ exact rollback to the original bytes.
{
  const ws = mkRepo(BAD);
  const b = T.buildFixJsonTask({ workspaceDir: ws, modulePath: "config.json", source: BAD, acceptanceCommand: ["node", "--test"] });
  const res = R.runRepairWorkflow(b.task, { runner: () => ({ exitCode: 1, stdout: "", stderr: "x" }) });
  ok("ABSTAINED + exact rollback", res.status === "ABSTAINED" && res.rolledBack === true && fs.readFileSync(path.join(ws, "config.json"), "utf8") === BAD);
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nTASK-FIX-JSON suite — ${pass} assertions passed. (deterministic trailing-comma repair, string-safe; ACCEPT proven-safe / UNSUPPORTED other defects; ABSTAIN+rollback; composes with repair-workflow)`);
