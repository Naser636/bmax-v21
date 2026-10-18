#!/usr/bin/env node
/*
 * odg freeze (TS port → runtime/dist/bin/odg-freeze.js, DEFAULT; runtime/bin/odg-freeze.js =
 * ODG_RUNTIME=js rollback). Writes runtime/generated/runtime-freeze.json (cwd-relative) marking the
 * current runtime artifacts FROZEN, then prints "FREEZE READY". Behavioural parity with the JS rollback.
 */
const fs = require("fs");

const freeze = {
  generatedAt: new Date().toISOString(),
  status: "FROZEN",
  artifacts: [
    "runtime-report.json",
    "runtime-status.json",
    "runtime-verify.json",
  ],
};

fs.writeFileSync("runtime/generated/runtime-freeze.json", JSON.stringify(freeze, null, 2));

console.log("FREEZE READY");

export {};
