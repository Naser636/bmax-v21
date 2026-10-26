#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * PROVIDER-REUSE-CANDIDATE CONTRACT (ZERO-JS L-iii) — strict TypeScript canonical provider-reuse-candidate.ts
 * is now the SOLE port. Replaces the dual-port parity suite: proves the API + parseSignature across
 * representative/edge cases + buildCandidates fail-closed paths (never throws, always returns an array).
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "provider-reuse-candidate.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("exports parseSignature + buildCandidates", typeof m.parseSignature === "function" && typeof m.buildCandidates === "function");

// parseSignature never throws across representative + malformed inputs and returns a stable shape.
const sigs = ["rc|OBJ|runtime/core/foo.js", "", "only", "a|b", "a|b|c|d|e", null, undefined, "x||z"];
for (let i = 0; i < sigs.length; i++) {
  let threw = false, v;
  try { v = m.parseSignature(sigs[i]); } catch { threw = true; }
  ok(`parseSignature never throws + returns object/null case#${i}`, !threw && (v === null || typeof v === "object"));
}

// buildCandidates fail-closed paths — never throws, always an array.
const scen = [
  [undefined, undefined],
  [[], { cwd: process.cwd(), authorizedPaths: ["runtime/core/"] }],
  [[{ id: "X" }], { cwd: process.cwd(), authorizedPaths: [] }],
  [[{ id: "X" }], { cwd: process.cwd(), authorizedPaths: ["runtime/core/"] }],
  [[{ id: "NOPE_NONEXISTENT_OBJECTIVE" }], { cwd: process.cwd(), authorizedPaths: ["no/such/scope/"] }],
  ["not-an-array", { authorizedPaths: 42 }],
];
for (let i = 0; i < scen.length; i++) {
  const [objs, opts] = scen[i];
  let threw = false, out;
  try { out = m.buildCandidates(objs, opts); } catch { threw = true; }
  ok(`buildCandidates never-throws + returns array scen#${i}`, !threw && Array.isArray(out));
}
// The empty-objective and no-authorizedPaths paths yield an empty candidate set (fail-closed).
ok("no objectives ⇒ []", m.buildCandidates(undefined, undefined).length === 0);
ok("no authorizedPaths ⇒ []", m.buildCandidates([{ id: "X" }], { cwd: process.cwd(), authorizedPaths: [] }).length === 0);

console.log(`\nPROVIDER-REUSE-CANDIDATE CONTRACT — ${passed} assertions passed.`);
