// @ts-nocheck
/*
 * EXECUTION-OF-RECORD LOCK (η3-B136).
 *
 * Locks the explicit, CTO-decided execution-of-record: the COMPILED TypeScript runtime is the DEFAULT;
 * the JavaScript runtime is an EXPLICIT rollback (ODG_RUNTIME=js). This is a SOURCE-INVARIANT +
 * DOCUMENTARY lock, by design: the runtime-mode selectors in autonomy-runtime-adapter.ts
 * (resolveRuntimeMode / resolvePipelineEntry) are intentionally MODULE-PRIVATE (not exported), and this
 * lot is comment-only on that file — exporting them to call them directly would be an out-of-scope code
 * change. So the lock asserts the IMPLEMENTED selector expressions and the front-door-A default verbatim
 * from the real source files, plus the ABSENCE of any comment claiming a JavaScript default. A silent
 * flip of the default to "js", or the reappearance of a "default is JavaScript" comment, turns this red.
 *
 * Reads files only — mutates NO environment and NO global test state (nothing to restore). Deterministic.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO = process.cwd();
const ADAPTER = path.join(REPO, "src", "runtime", "autonomy-runtime-adapter.ts");
const FRONT_DOOR_A = path.join(REPO, "runtime", "bin", "odg-local-pipeline.sh");
const adapter = fs.readFileSync(ADAPTER, "utf8");
const shell = fs.readFileSync(FRONT_DOOR_A, "utf8");
// Normalize whitespace so the assertions are robust to reformatting of the (single) selector lines.
const ws = (s) => s.replace(/\s+/g, " ");
const adapterWs = ws(adapter);

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok - " + name); passed += 1; }

console.log("EXECUTION-OF-RECORD LOCK (B136)");

// 1. ZERO-JS: the runtime is pinned to compiled TypeScript — resolveRuntimeMode is a constant "ts"
//    (the ODG_RUNTIME=js JavaScript rollback is retired). The former ternary is gone by design.
ok("resolveRuntimeMode is pinned to ts (ODG_RUNTIME=js rollback retired)",
  /function resolveRuntimeMode\(\): *"ts" *\| *"js" *\{[\s\S]*?return *"ts";[\s\S]*?\}/.test(adapterWs) &&
  !/=== *"js" *\? *"js" *: *"ts"/.test(adapterWs));
ok("resolveRuntimeMode signature returns the ts|js union",
  /function resolveRuntimeMode\(\): *"ts" *\| *"js"/.test(adapterWs));

// 2. ODG_RUNTIME_ENTRY prevails — the override branch returns BEFORE the mode check.
const entryFn = adapterWs.slice(adapterWs.indexOf("function resolvePipelineEntry"));
const overrideIdx = entryFn.indexOf("ODG_RUNTIME_ENTRY");
const modeCheckIdx = entryFn.indexOf('resolveRuntimeMode() === "ts"');
ok("resolvePipelineEntry reads ODG_RUNTIME_ENTRY and it wins (before the mode check)",
  overrideIdx !== -1 && modeCheckIdx !== -1 && overrideIdx < modeCheckIdx &&
  /const override = process\.env\.ODG_RUNTIME_ENTRY;/.test(adapterWs) &&
  /if *\( *typeof override === "string" && override\.trim\(\)\.length > 0 *\) *return override\.trim\(\);/.test(adapterWs));
// 3. ts ⇒ compiled entry; js ⇒ legacy JS entry (rollback).
ok("ts resolves to the COMPILED pipeline, js to the legacy JS pipeline",
  /if *\( *resolveRuntimeMode\(\) === "ts" *\) *return COMPILED_PIPELINE;/.test(adapterWs) &&
  /const COMPILED_PIPELINE = "runtime\/dist\/bin\/odg-run\.js";/.test(adapterWs) &&
  /const PIPELINE = "runtime\/bin\/odg-run\.js";/.test(adapterWs));

// 4. Front door A (shell) is unconditionally compiled-TS (ZERO-JS: the ODG_RUNTIME=js branch is retired).
ok("front door A (odg-local-pipeline.sh) ensures + runs the compiled TS runtime with no JS branch",
  /odg-ensure-ts-runtime\.sh/.test(shell) && /runtime\/dist\/bin\/odg-run\.js/.test(shell) && !/if \[ "\$\{ODG_RUNTIME:-ts\}" = "ts" \]; then/.test(shell));

// 5. DOCUMENTARY lock — no comment may claim the default is JavaScript.
const FORBIDDEN = [
  "default is UNCHANGED (JavaScript)",
  "Historical DEFAULT is the legacy JavaScript",
  "Unset/`js` keeps the historical JS entry",
];
for (const phrase of FORBIDDEN) {
  ok(`no stale comment claims a JavaScript default: ${JSON.stringify(phrase)}`, !adapter.includes(phrase));
}
// And a positive statement of the TS default must be present.
ok("adapter states the compiled-TypeScript default explicitly",
  /default (is|FLIPPED to) .*(compiled TypeScript|TypeScript)/i.test(adapter) || /resolves to the compiled runtime/.test(adapter));

console.log(`\nEXECUTION-OF-RECORD LOCK — ${passed} assertions passed.`);
