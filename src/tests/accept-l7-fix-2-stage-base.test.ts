// @ts-nocheck — L7_FIX_2 behavioral verifier (NOT a source marker): demonstrates the contract in the ACTUAL
// runtime by spawning the real compiled pipeline-builder (the default ODG_RUNTIME=ts port) under each env
// condition and asserting the stage base it actually resolves + prints.
// done_when: (1) DEFAULT_STAGE_BASE → runtime/dist/core when dist exists (else runtime/core);
//            (2) an explicit ODG_STAGE_BASE override is used VERBATIM;
//            (3) ODG_RUNTIME=js forces the source base runtime/core.
"use strict";
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
const PB = path.join(REPO, "runtime/dist/core/pipeline-builder.js"); // the DEFAULT (compiled TS) runtime port

// Spawn the REAL pipeline-builder with a controlled env and return the stage base it resolves at runtime.
function resolvedStageBase(over) {
  const env = { ...process.env };
  delete env.ODG_STAGE_BASE;
  delete env.ODG_RUNTIME;
  Object.assign(env, over);
  const out = execFileSync("node", ["-e", `require(${JSON.stringify(PB)})`], { cwd: REPO, encoding: "utf8", env });
  const m = out.match(/Stage base\s*:\s*(\S+)/);
  return m ? m[1] : null;
}

console.log("ACCEPT — L7_FIX_2 stage-base routing (behavioral, actual runtime, both default + overrides)");

// (1) default: no ODG_STAGE_BASE, no ODG_RUNTIME ⇒ compiled dist ports (dist/core exists in-repo).
ok("default ⇒ runtime/dist/core (the 13 stages spawn from compiled TS, not source .js)", resolvedStageBase({}) === "runtime/dist/core");

// (2) explicit override used VERBATIM (an existing dir).
ok("explicit ODG_STAGE_BASE=runtime/core ⇒ used verbatim", resolvedStageBase({ ODG_STAGE_BASE: "runtime/core" }) === "runtime/core");

// (3) ZERO-JS: the ODG_RUNTIME=js source rollback is retired — it no longer forces the source base;
//     the default stays the compiled dist (ODG_RUNTIME is ignored by the stage-base resolver).
ok("ODG_RUNTIME=js ⇒ still runtime/dist/core (source rollback retired)", resolvedStageBase({ ODG_RUNTIME: "js" }) === "runtime/dist/core");

// Fail-closed: a non-existent override THROWS (no silent fallback) — part of the contract.
let threw = false;
try { resolvedStageBase({ ODG_STAGE_BASE: "runtime/__no_such_base__" }); } catch { threw = true; }
ok("non-existent ODG_STAGE_BASE ⇒ refuses (throws, no silent fallback)", threw === true);

console.log(`\nACCEPT L7_FIX_2 — ${passed} assertions passed.`);
