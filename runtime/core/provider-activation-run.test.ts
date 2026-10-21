#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Day-2 (gap #4) — Provider Activation EXECUTOR run() dispatch test. The run() path was previously NEVER
 * exercised (it spawns a subprocess; the dispatch-authorization invariant deliberately excludes it). Here we
 * drive resolve(...).run() through the INJECTABLE spawn seam (__setExecutorSeams) so NO real subprocess and NO
 * external/provider effect occurs — the fake spawn writes a synthetic orchestration report to the evidence
 * path and returns a status. Proves: (success) run() returns the capability result + the evidence satisfies
 * the `provider-activation-orchestrated` probe; (fail-closed) a non-zero spawn or missing evidence ⇒ run()
 * throws before claiming success. Fully isolated in a throwaway cwd; the real repo is untouched.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const EXEC = path.join(__dirname, "capability-executors.js");
const PROBES_MOD = path.join(__dirname, "capability-probes.js");

function inTempCwd(fn) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provact-run-"));
  process.chdir(dir);
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  try { fn(dir); } finally { process.chdir(prev); }
}

// A valid Provider Activation orchestration report (shape the executor reads + the probe verifies).
function validReport() {
  return { orchestration: { decision: "REFUSED", selectedProvider: null }, execution: { classification: "consequential" } };
}

const cap = require(EXEC);
const probes = require(PROBES_MOD);
const PATCH = { objectiveId: "X", action: "activate provider", goal: "activate the provider" };

console.log("Provider Activation — EXECUTOR run() dispatch (spawn-seam isolated)");

// 0 — routing sanity: the patch resolves to Provider Activation.
ok("resolve routes to Provider Activation", cap.resolve(PATCH).capability === "Provider Activation");

// 1 — SUCCESS glue: injected spawn writes a valid report to the evidence path (args[3]) + returns status 0.
inTempCwd(() => {
  let spawnedCmd = null, realSubprocess = false;
  cap.__setExecutorSeams({
    spawn(file, args) {
      spawnedCmd = file;
      // The real run() invokes: _seams.spawn(process.execPath, [TSX_CLI, ENTRY, missionFile, out], ...)
      const out = args && args[args.length - 1];
      try { fs.writeFileSync(out, JSON.stringify(validReport())); } catch { /* ignore */ }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  try {
    const r = cap.resolve(PATCH).run();
    ok("run() returns the Provider Activation capability result", r && r.capability === "Provider Activation");
    ok("run() surfaces the orchestration summary from the report", r.summary && r.summary.decision === "REFUSED" && r.summary.classification === "consequential");
    ok("run() wrote the evidence artifact", fs.existsSync("runtime/generated/provider-activation.json"));
    // the written evidence satisfies the Day-2 semantic probe (end-to-end run → evidence → probe).
    ok("evidence satisfies provider-activation-orchestrated probe", probes.runProbe("provider-activation-orchestrated", {}).ok === true);
    ok("no real subprocess entry was executed (seam intercepted)", spawnedCmd === process.execPath && realSubprocess === false);
  } finally { cap.__resetExecutorSeams(); }
});

// 2 — FAIL-CLOSED glue: spawn returns non-zero AND writes no evidence ⇒ run() THROWS (never a false success).
inTempCwd(() => {
  cap.__setExecutorSeams({ spawn() { return { status: 1, stdout: "", stderr: "provider entry failed" }; } });
  try {
    let threw = false;
    try { cap.resolve(PATCH).run(); } catch { threw = true; }
    ok("run() throws when the subprocess fails + no evidence (fail-closed)", threw === true);
    ok("no evidence artifact left behind as a false proof", !fs.existsSync("runtime/generated/provider-activation.json") || probes.runProbe("provider-activation-orchestrated", {}).ok === false);
  } finally { cap.__resetExecutorSeams(); }
});

// 3 — FAIL-CLOSED: spawn returns status 0 but writes NO evidence ⇒ run() still throws (evidence is mandatory).
inTempCwd(() => {
  cap.__setExecutorSeams({ spawn() { return { status: 0, stdout: "", stderr: "" }; } }); // no file written
  try {
    let threw = false;
    try { cap.resolve(PATCH).run(); } catch { threw = true; }
    ok("run() throws when status 0 but evidence missing (evidence mandatory)", threw === true);
  } finally { cap.__resetExecutorSeams(); }
});

console.log(`\nProvider Activation run() — ${passed} assertions passed.`);
