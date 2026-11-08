#!/usr/bin/env node
"use strict";
const assert = require("assert");
const FS = require("./fleet-stage");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("FLEET-STAGE resolveConfig (direct unit coverage)");

const saved = process.env.ODG_FLEET;
try {
  // default shape: enabled boolean, failOpen default true, deterministic false.
  {
    delete process.env.ODG_FLEET;
    const c = FS.resolveConfig();
    check(typeof c.enabled === "boolean" && typeof c.failOpen === "boolean" && typeof c.deterministic === "boolean", "resolveConfig returns a well-typed config");
    check(c.failOpen === true, "failOpen defaults to true (fail-open when no config says otherwise)");
    check(c.deterministic === false, "deterministic defaults to false");
  }
  // env override: ODG_FLEET truthy ⇒ enabled true; falsy ⇒ enabled false.
  {
    process.env.ODG_FLEET = "1";
    check(FS.resolveConfig().enabled === true, "ODG_FLEET=1 ⇒ enabled true (env override)");
    process.env.ODG_FLEET = "0";
    check(FS.resolveConfig().enabled === false, "ODG_FLEET=0 ⇒ enabled false (env override)");
  }
} finally {
  if (saved === undefined) delete process.env.ODG_FLEET; else process.env.ODG_FLEET = saved;
}

console.log(failures === 0 ? "ALL PASS — FLEET-STAGE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
