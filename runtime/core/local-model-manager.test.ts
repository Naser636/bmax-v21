#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/* P9 — Local Model Manager: behavioural test (sandbox-hardened, η3-B124).
 * No real provider/model call: Case 2 drives complete() through an INJECTED sandbox runner that
 * asserts the execution is argv-only and isolated, then returns a canned completion. */

"use strict";

const assert = require("assert");
const mm = require("./local-model-manager");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const saved = process.env.ODG_LOCAL_MODEL_CMD;

console.log("Case 1 — unconfigured ⇒ unavailable, complete() explains why (NON-REGRESSION)");
delete process.env.ODG_LOCAL_MODEL_CMD;
ok("isAvailable false with no config", mm.isAvailable() === false);
const miss = mm.complete("hello");
ok("complete not ok", miss.ok === false);
ok("reason mentions configuration", /configured/.test(miss.reason));

console.log("Case 2 — configured model runs ONLY through the sandbox (injected runner)");
process.env.ODG_LOCAL_MODEL_CMD = "tr '[:lower:]' '[:upper:]'"; // stand-in: uppercases the prompt
ok("isAvailable true when configured", mm.isAvailable() === true);

let seen = null;
const sandboxRunner = (bwrapArgs, io) => {
  seen = { bwrapArgs, io };
  // simulate the sandboxed `tr` (uppercase), proving complete() pipes the prompt via stdin.
  return { launched: true, status: 0, stdout: String(io.input).toUpperCase() };
};
const hit = mm.complete("hello world", { sandboxRunner });
ok("complete ok", hit.ok === true);
ok("sandboxed model transformed the prompt", hit.text === "HELLO WORLD");
ok("describe reflects availability", mm.describe().available === true);
// the runner received a sandboxed, argv-only invocation (no shell string):
ok("bwrap isolation flags present", seen.bwrapArgs.includes("--unshare-all") && seen.bwrapArgs.includes("--clearenv"));
ok("NO whole-FS ro-bind", (() => { for (let i = 0; i < seen.bwrapArgs.length - 2; i++) if (seen.bwrapArgs[i] === "--ro-bind" && seen.bwrapArgs[i + 1] === "/" && seen.bwrapArgs[i + 2] === "/") return false; return true; })());
ok("command parsed to argv (no shell)", (() => { const d = seen.bwrapArgs.indexOf("--"); return d !== -1 && seen.bwrapArgs[d + 1] === "tr" && seen.bwrapArgs[d + 2] === "[:lower:]"; })());

console.log("Case 3 — sandbox refusal surfaces (no unsandboxed fallback)");
const refused = mm.complete("x", { spawn: () => ({ status: 1, stdout: "" }) }); // bwrap probe fails
ok("refused when sandbox unavailable", refused.ok === false && refused.refused === true);
ok("no text produced on refusal", refused.text === undefined);

if (saved === undefined) delete process.env.ODG_LOCAL_MODEL_CMD;
else process.env.ODG_LOCAL_MODEL_CMD = saved;

console.log(`\nLOCAL MODEL MANAGER — ${passed} assertions passed.`);
