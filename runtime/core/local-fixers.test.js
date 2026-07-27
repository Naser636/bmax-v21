#!/usr/bin/env node

/* P2 — Local Deterministic Fixer Library: behavioural test. Deterministic, no wall-clock. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const F = require("./local-fixers");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Case 1 — each fixer transforms correctly");
ok("stripTrailingWhitespace removes trailing spaces", F.stripTrailingWhitespace("a  \nb\t\n") === "a\nb\n");
ok("ensureFinalNewline adds a missing newline", F.ensureFinalNewline("a") === "a\n");
ok("ensureFinalNewline collapses a doubled tail", F.ensureFinalNewline("a\n\n\n") === "a\n");
ok("collapseBlankLines caps runs at one blank", F.collapseBlankLines("a\n\n\n\nb") === "a\n\nb");
ok("removeUnusedNamedImports drops the unused specifier",
    F.removeUnusedNamedImports('import { a, b } from "x";', ["b"]) === 'import { a } from "x";');
ok("removeUnusedNamedImports drops the whole line when all unused",
    F.removeUnusedNamedImports('import { a } from "x";\nconst z=1;', ["a"]) === "const z=1;");

console.log("Case 2 — fixers are idempotent");
const once = F.run("a  \n\n\n\nb   ", ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]);
const twice = F.run(once, ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]);
ok("applying twice equals applying once", once === twice);
ok("unknown fixer throws", (() => { try { F.run("x", ["nope"]); return false; } catch { return true; } })());

console.log("Case 3 — applyFixers writes only on real change");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-test-"));
const file = path.join(dir, "f.txt");
fs.writeFileSync(file, "clean\n");
ok("no-op leaves file unchanged", F.applyFixers(file, ["ensureFinalNewline"]).changed === false);
fs.writeFileSync(file, "dirty   \nx");
ok("real fix reports changed=true", F.applyFixers(file, ["stripTrailingWhitespace", "ensureFinalNewline"]).changed === true);
ok("file content actually fixed", fs.readFileSync(file, "utf8") === "dirty\nx\n");
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\nLOCAL FIXERS — ${passed} assertions passed.`);
