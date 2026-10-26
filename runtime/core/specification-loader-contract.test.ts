#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * SPECIFICATION-LOADER CONTRACT (ZERO-JS L-iii) — runtime/core/specification-loader.ts is now the SOLE port.
 * Replaces the dual-port equivalence bench. loadSpecification(mission) reads the CWD-relative path
 * runtime/specifications/<mission>.md and returns { found, path, content }; both the found and missing
 * branches are exercised deterministically in a seeded temp cwd.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const m = require(path.join(__dirname, "specification-loader.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("exports loadSpecification", typeof m.loadSpecification === "function");

const origCwd = process.cwd();
const sb = fs.mkdtempSync(path.join(os.tmpdir(), "spec-"));
try {
  fs.mkdirSync(path.join(sb, "runtime", "specifications"), { recursive: true });
  const BODY = "# Mission Alpha\n\nDeliver X.\n";
  fs.writeFileSync(path.join(sb, "runtime", "specifications", "MISSION_ALPHA.md"), BODY);
  process.chdir(sb);

  const found = m.loadSpecification("MISSION_ALPHA");
  ok("found branch: {found:true, cwd-relative path, exact content}",
    found.found === true && found.content === BODY && found.path === path.join("runtime", "specifications", "MISSION_ALPHA.md"));

  const missing = m.loadSpecification("NOPE_MISSING");
  ok("missing branch: {found:false, path set, content null}",
    missing.found === false && missing.content === null && missing.path === path.join("runtime", "specifications", "NOPE_MISSING.md"));
} finally {
  process.chdir(origCwd);
  fs.rmSync(sb, { recursive: true, force: true });
}

console.log(`\nSPECIFICATION-LOADER CONTRACT — ${passed} assertions passed.`);
